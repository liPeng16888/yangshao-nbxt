import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  addSampleBlocks,
  createLabSheetEventSource,
  getCurrentLabSheet,
  getLabSheetByDate,
  getLabSheetClientId,
  saveSampleBlock,
  updateCurrentParameters
} from '@/api/labSheet'
import type { LabSheetRealtimeEvent } from '@/api/labSheet'
import type { LabChangeLogField, LabParameter, LabSampleInput, LabSheet, SampleBlock, SampleBlockSavePayload } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { hasLabDetectionInput } from '@/utils/sampleReport'
import { isPositiveInteger } from '@/utils/validators'

type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
type DirtyField = {
  field: keyof LabSampleInput
  baseValue: unknown
}

const AUTO_SAVE_DELAY_MS = 900
const REALTIME_RECONNECT_DELAY_MS = 3000
const REALTIME_HEARTBEAT_TIMEOUT_MS = 60000

export const useLabSheetStore = defineStore('labSheet', () => {
  const sheet = ref<LabSheet | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const adding = ref(false)
  const autoSaving = ref(false)
  const autoSaveStatus = ref<AutoSaveStatus>('idle')
  const lastAutoSavedAt = ref('')
  const autoSaveError = ref('')
  const pendingAutoSaveCount = ref(0)
  const realtimeConnected = ref(false)
  const realtimeError = ref('')

  const autoSaveTimers = new Map<string, number>()
  const pendingBlockIds = new Set<string>()
  const blockVersions = new Map<string, number>()
  const pendingDirtyFields = new Map<string, Map<keyof LabSampleInput, DirtyField>>()
  const pendingChangeLogFields = new Map<string, Map<keyof LabSampleInput, LabChangeLogField>>()
  const activeAutoSavePromises = new Set<Promise<void>>()
  const activeSavingBlockIds = new Set<string>()
  const blockSaveChains = new Map<string, Promise<void>>()
  let activeAutoSaveCount = 0
  let realtimeSource: EventSource | null = null
  let realtimeDate = ''
  let realtimeReconnectTimer: number | undefined
  let realtimeHeartbeatTimer: number | undefined
  let recoveryListenersBound = false
  const clientId = getLabSheetClientId()

  const currentParameters = computed(() => sheet.value?.parameters || null)
  const sampleBlocks = computed(() => sheet.value?.sampleBlocks || [])

  async function loadCurrentSheet() {
    await persistBeforeSheetChange()
    disconnectRealtime()
    loading.value = true
    try {
      sheet.value = await getCurrentLabSheet()
      resetLocalSaveState()
      syncRealtimeForLoadedSheet()
    } finally {
      loading.value = false
    }
  }

  async function loadSheetByDate(date: string) {
    await persistBeforeSheetChange()
    disconnectRealtime()
    loading.value = true
    try {
      sheet.value = await getLabSheetByDate(date)
      resetLocalSaveState()
      syncRealtimeForLoadedSheet()
    } finally {
      loading.value = false
    }
  }

  async function saveParameters(parameters: LabParameter) {
    if (!sheet.value) return
    if (sheet.value.readonly) {
      ElMessage.warning('历史日期表格仅支持查看，不能修改')
      return
    }
    saving.value = true
    try {
      const saved = await updateCurrentParameters(parameters)
      sheet.value.parameters = saved
      ElMessage.success('参数已保存')
    } finally {
      saving.value = false
    }
  }

  function patchBlock(blockId: string, patch: Partial<LabSampleInput>) {
    if (!sheet.value) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly || sheet.value.readonly) return
    const dirtyState = trackDirtyFields(block, patch)
    if (!dirtyState.changed) return
    const hadDetectionInput = hasLabDetectionInput(block.inputs)
    block.inputs = { ...block.inputs, ...patch }
    if (!hadDetectionInput && hasLabDetectionInput(block.inputs)) {
      block.parameterSnapshot = sheet.value.parameters
    }
    block.results = calculateSampleResults(block.inputs, block.parameterSnapshot)
    const nextVersion = (blockVersions.get(blockId) || 0) + 1
    blockVersions.set(blockId, nextVersion)
    if (dirtyState.hasDirty) scheduleBlockAutoSave(blockId, nextVersion)
    else {
      const currentTimer = autoSaveTimers.get(blockId)
      if (currentTimer) window.clearTimeout(currentTimer)
      autoSaveTimers.delete(blockId)
      pendingBlockIds.delete(blockId)
      syncAutoSaveStatus()
    }
  }

  function commitBlockFieldChange(blockId: string, field: keyof LabSampleInput, oldValue: unknown, newValue: unknown) {
    if (!sheet.value || sheet.value.readonly) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly) return
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) return
    const fields = pendingChangeLogFields.get(blockId) || new Map<keyof LabSampleInput, LabChangeLogField>()
    fields.set(field, { field, oldValue: oldValue ?? null, newValue: newValue ?? null })
    pendingChangeLogFields.set(blockId, fields)
    if (pendingDirtyFields.has(blockId)) {
      const nextVersion = (blockVersions.get(blockId) || 0) + 1
      blockVersions.set(blockId, nextVersion)
      scheduleBlockAutoSave(blockId, nextVersion)
    }
  }

  async function persistBlock(block: SampleBlock) {
    if (!sheet.value || sheet.value.readonly || block.readonly) return
    saving.value = true
    activeSavingBlockIds.add(block.id)
    try {
      const saved = await saveSampleBlock(sheet.value.id, buildBlockSavePayload(block) || fullBlockSavePayload(block))
      const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
      if (index >= 0) sheet.value.sampleBlocks[index] = saved
      pendingChangeLogFields.delete(block.id)
      pendingDirtyFields.delete(block.id)
      pendingBlockIds.delete(block.id)
    } finally {
      activeSavingBlockIds.delete(block.id)
      saving.value = false
    }
  }

  async function persistAllBlocks(options: { silent?: boolean } = {}) {
    if (!sheet.value) return
    if (sheet.value.readonly) {
      resetLocalSaveState()
      return
    }
    cancelAutoSaveTimers()
    if (activeAutoSavePromises.size) {
      await Promise.allSettled(Array.from(activeAutoSavePromises))
    }
    const dirtyBlockIds = Array.from(pendingDirtyFields.keys())
    if (!dirtyBlockIds.length) {
      syncAutoSaveStatus()
      return
    }
    saving.value = true
    autoSaveStatus.value = 'saving'
    try {
      await Promise.allSettled(dirtyBlockIds.map((blockId) => runAutoSave(blockId, blockVersions.get(blockId) || 0)))
      lastAutoSavedAt.value = new Date().toISOString()
      autoSaveError.value = ''
      syncAutoSaveStatus(true)
      if (!options.silent) ElMessage.success('当前表格已保存')
    } catch (error) {
      autoSaveStatus.value = 'error'
      autoSaveError.value = error instanceof Error ? error.message : '保存失败'
      if (!options.silent) ElMessage.error('保存失败，请检查内网接口后重试')
    } finally {
      saving.value = false
    }
  }

  async function appendSampleBlocks(countValue: string | number) {
    if (!sheet.value || !isPositiveInteger(countValue)) {
      throw new Error('新增数量必须是正整数')
    }
    if (sheet.value.readonly) {
      throw new Error('历史日期表格仅支持查看，不能修改')
    }
    await persistAllBlocks({ silent: true })
    if (!sheet.value) return
    adding.value = true
    try {
      sheet.value = await addSampleBlocks(sheet.value.id, Number(countValue))
      resetLocalSaveState()
      ElMessage.success(`已新增 ${countValue} 个样品计算格`)
    } finally {
      adding.value = false
    }
  }

  function scheduleBlockAutoSave(blockId: string, version: number) {
    if (!sheet.value || sheet.value.readonly) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly) return

    const currentTimer = autoSaveTimers.get(blockId)
    if (currentTimer) window.clearTimeout(currentTimer)

    pendingBlockIds.add(blockId)
    autoSaveError.value = ''
    autoSaveStatus.value = 'pending'
    syncAutoSaveStatus()

    const timer = window.setTimeout(() => {
      autoSaveTimers.delete(blockId)
      pendingBlockIds.delete(blockId)
      void runAutoSave(blockId, version)
    }, AUTO_SAVE_DELAY_MS)
    autoSaveTimers.set(blockId, timer)
  }

  function runAutoSave(blockId: string, version: number) {
    const previous = blockSaveChains.get(blockId) || Promise.resolve()
    const promise = previous.catch(() => undefined).then(() => persistQueuedBlock(blockId, version))
    const chain = promise.finally(() => {
      if (blockSaveChains.get(blockId) === chain) blockSaveChains.delete(blockId)
    })
    blockSaveChains.set(blockId, chain)
    activeAutoSavePromises.add(promise)
    void promise.finally(() => {
      activeAutoSavePromises.delete(promise)
    })
    return promise
  }

  async function persistQueuedBlock(blockId: string, version: number) {
    const currentSheet = sheet.value
    const block = currentSheet?.sampleBlocks.find((item) => item.id === blockId)
    if (!currentSheet || !block || currentSheet.readonly || block.readonly) {
      pendingBlockIds.delete(blockId)
      syncAutoSaveStatus()
      return
    }

    const sheetId = currentSheet.id
    const payload = buildBlockSavePayload(block)
    if (!payload) {
      pendingBlockIds.delete(blockId)
      syncAutoSaveStatus()
      return
    }
    const savedFieldNames = Object.keys(payload.changedFields || {}) as Array<keyof LabSampleInput>
    let succeeded = false
    pendingBlockIds.delete(blockId)
    activeAutoSaveCount += 1
    activeSavingBlockIds.add(blockId)
    syncAutoSaveStatus()

    try {
      const saved = await saveSampleBlock(sheetId, payload)
      succeeded = true
      if (sheet.value?.id === sheetId && blockVersions.get(blockId) === version) {
        const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
        if (index >= 0) sheet.value.sampleBlocks[index] = saved
        clearSavedBlockFields(blockId, savedFieldNames)
      }
      lastAutoSavedAt.value = new Date().toISOString()
      autoSaveError.value = ''
    } catch (error) {
      autoSaveStatus.value = 'error'
      autoSaveError.value = error instanceof Error ? error.message : '自动保存失败'
      const conflictBlock = getConflictBlock(error)
      if (conflictBlock) {
        mergeConflictBlock(conflictBlock)
        ElMessage.error('该样品格已被另一台设备修改，请确认后再保存')
      } else {
        ElMessage.error('自动保存失败，请点击保存当前表格重试')
      }
    } finally {
      activeSavingBlockIds.delete(blockId)
      activeAutoSaveCount = Math.max(0, activeAutoSaveCount - 1)
      if (!succeeded && autoSaveStatus.value === 'error') {
        pendingAutoSaveCount.value = pendingBlockIds.size
        autoSaving.value = activeAutoSaveCount > 0
        if (pendingBlockIds.size) autoSaveStatus.value = 'pending'
        else if (activeAutoSaveCount > 0) autoSaveStatus.value = 'saving'
        return
      }
      syncAutoSaveStatus(succeeded)
    }
  }

  function cancelAutoSaveTimers() {
    autoSaveTimers.forEach((timer) => window.clearTimeout(timer))
    autoSaveTimers.clear()
  }

  function resetLocalSaveState() {
    cancelAutoSaveTimers()
    pendingBlockIds.clear()
    pendingDirtyFields.clear()
    pendingChangeLogFields.clear()
    syncAutoSaveStatus()
  }

  async function persistBeforeSheetChange() {
    if (!sheet.value) {
      resetLocalSaveState()
      return
    }
    if (sheet.value.readonly) {
      resetLocalSaveState()
      return
    }
    if (pendingBlockIds.size || pendingDirtyFields.size || activeAutoSavePromises.size) {
      await persistAllBlocks({ silent: true })
    } else {
      cancelAutoSaveTimers()
      syncAutoSaveStatus()
    }
  }

  function syncAutoSaveStatus(saved = false) {
    pendingAutoSaveCount.value = new Set([...pendingBlockIds, ...pendingDirtyFields.keys()]).size
    autoSaving.value = activeAutoSaveCount > 0
    if (pendingBlockIds.size) {
      autoSaveStatus.value = 'pending'
      return
    }
    if (activeAutoSaveCount > 0) {
      autoSaveStatus.value = 'saving'
      return
    }
    if (saved || lastAutoSavedAt.value) {
      autoSaveStatus.value = 'saved'
      return
    }
    autoSaveStatus.value = 'idle'
  }

  function cloneBlock(block: SampleBlock): SampleBlock {
    return JSON.parse(JSON.stringify(block)) as SampleBlock
  }

  function cloneValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value ?? null)) as T
  }

  function isSameValue(left: unknown, right: unknown) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
  }

  function trackDirtyFields(block: SampleBlock, patch: Partial<LabSampleInput>) {
    let fields = pendingDirtyFields.get(block.id)
    let changed = false
    Object.entries(patch).forEach(([key, value]) => {
      const field = key as keyof LabSampleInput
      const oldValue = block.inputs[field] ?? null
      const nextValue = value ?? null
      if (isSameValue(oldValue, nextValue)) return
      if (!fields) fields = new Map<keyof LabSampleInput, DirtyField>()
      const existing = fields.get(field)
      const baseValue = existing ? existing.baseValue : cloneValue(oldValue)
      if (isSameValue(baseValue, nextValue)) {
        fields.delete(field)
      } else {
        fields.set(field, { field, baseValue })
      }
      changed = true
    })
    const hasDirty = Boolean(fields?.size)
    if (hasDirty) pendingDirtyFields.set(block.id, fields!)
    else pendingDirtyFields.delete(block.id)
    return { changed, hasDirty }
  }

  function buildBlockSavePayload(block: SampleBlock): SampleBlockSavePayload | null {
    const fields = pendingDirtyFields.get(block.id)
    if (!fields?.size) return null
    const changedFields: Partial<LabSampleInput> = {}
    const baseInputs: Partial<LabSampleInput> = {}
    fields.forEach((dirty, field) => {
      changedFields[field] = cloneValue(block.inputs[field]) as never
      baseInputs[field] = cloneValue(dirty.baseValue) as never
    })
    return {
      id: block.id,
      baseUpdatedAt: block.updatedAt,
      baseInputs,
      changedFields,
      changeLogFields: Array.from(pendingChangeLogFields.get(block.id)?.values() || [])
    }
  }

  function fullBlockSavePayload(block: SampleBlock): SampleBlockSavePayload {
    return {
      id: block.id,
      baseUpdatedAt: block.updatedAt,
      baseInputs: cloneValue(block.inputs),
      changedFields: cloneValue(block.inputs),
      inputs: cloneValue(block.inputs),
      changeLogFields: Array.from(pendingChangeLogFields.get(block.id)?.values() || [])
    }
  }

  function clearSavedBlockFields(blockId: string, fields: Array<keyof LabSampleInput>) {
    const dirtyFields = pendingDirtyFields.get(blockId)
    fields.forEach((field) => dirtyFields?.delete(field))
    if (!dirtyFields?.size) {
      pendingDirtyFields.delete(blockId)
      pendingBlockIds.delete(blockId)
      pendingChangeLogFields.delete(blockId)
      return
    }
    pendingDirtyFields.set(blockId, dirtyFields)
  }

  function cloneSheet(value: LabSheet): LabSheet {
    return JSON.parse(JSON.stringify(value)) as LabSheet
  }

  function isBlockLocallyDirty(blockId: string) {
    return pendingBlockIds.has(blockId) || pendingDirtyFields.has(blockId) || activeSavingBlockIds.has(blockId)
  }

  function syncRealtimeForLoadedSheet() {
    if (!sheet.value || sheet.value.readonly) {
      disconnectRealtime()
      return
    }
    connectRealtime(sheet.value.date)
  }

  function connectRealtime(date: string) {
    if (realtimeSource && realtimeDate === date) return
    disconnectRealtime()
    ensureRealtimeRecoveryListeners()
    realtimeDate = date
    const source = createLabSheetEventSource(date)
    if (!source) {
      realtimeConnected.value = false
      return
    }
    realtimeSource = source
    source.onopen = () => {
      realtimeConnected.value = true
      realtimeError.value = ''
      markRealtimeMessageReceived(date)
      void refreshLoadedSheetFromServer()
    }
    source.onmessage = (event) => {
      markRealtimeMessageReceived(date)
      handleRealtimeMessage(event.data)
    }
    source.onerror = () => {
      realtimeConnected.value = false
      realtimeError.value = '实时同步连接中断，正在重连'
      clearRealtimeHeartbeatTimer()
      source.close()
      if (realtimeSource === source) realtimeSource = null
      scheduleRealtimeReconnect(date)
    }
  }

  function scheduleRealtimeReconnect(date: string) {
    if (realtimeReconnectTimer) window.clearTimeout(realtimeReconnectTimer)
    realtimeReconnectTimer = window.setTimeout(() => {
      realtimeReconnectTimer = undefined
      if (sheet.value?.date === date && !sheet.value.readonly) connectRealtime(date)
    }, REALTIME_RECONNECT_DELAY_MS)
  }

  function disconnectRealtime() {
    if (realtimeReconnectTimer) {
      window.clearTimeout(realtimeReconnectTimer)
      realtimeReconnectTimer = undefined
    }
    clearRealtimeHeartbeatTimer()
    if (realtimeSource) {
      realtimeSource.close()
      realtimeSource = null
    }
    realtimeDate = ''
    realtimeConnected.value = false
    realtimeError.value = ''
    removeRealtimeRecoveryListeners()
  }

  function markRealtimeMessageReceived(date: string) {
    clearRealtimeHeartbeatTimer()
    realtimeHeartbeatTimer = window.setTimeout(() => {
      if (sheet.value?.date !== date || sheet.value.readonly) return
      realtimeConnected.value = false
      realtimeError.value = '实时同步心跳超时，正在重连'
      if (realtimeSource) {
        realtimeSource.close()
        realtimeSource = null
      }
      scheduleRealtimeReconnect(date)
    }, REALTIME_HEARTBEAT_TIMEOUT_MS)
  }

  function clearRealtimeHeartbeatTimer() {
    if (!realtimeHeartbeatTimer) return
    window.clearTimeout(realtimeHeartbeatTimer)
    realtimeHeartbeatTimer = undefined
  }

  async function refreshLoadedSheetFromServer() {
    const current = sheet.value
    if (!current || current.readonly) return
    try {
      const remoteSheet = await getLabSheetByDate(current.date)
      if (sheet.value?.id === current.id && sheet.value.date === current.date) {
        applyRemoteSheet(remoteSheet)
        realtimeError.value = ''
      }
    } catch {
      realtimeError.value = '实时同步补拉失败，请检查网络'
    }
  }

  function ensureRealtimeRecoveryListeners() {
    if (recoveryListenersBound || typeof window === 'undefined' || typeof document === 'undefined') return
    window.addEventListener('online', handleRealtimeRecovery)
    document.addEventListener('visibilitychange', handleVisibilityRecovery)
    window.addEventListener('focus', handleRealtimeRecovery)
    recoveryListenersBound = true
  }

  function removeRealtimeRecoveryListeners() {
    if (!recoveryListenersBound || typeof window === 'undefined' || typeof document === 'undefined') return
    window.removeEventListener('online', handleRealtimeRecovery)
    document.removeEventListener('visibilitychange', handleVisibilityRecovery)
    window.removeEventListener('focus', handleRealtimeRecovery)
    recoveryListenersBound = false
  }

  function handleVisibilityRecovery() {
    if (document.visibilityState === 'visible') void refreshLoadedSheetFromServer()
  }

  function handleRealtimeRecovery() {
    void refreshLoadedSheetFromServer()
  }

  function handleRealtimeMessage(rawData: string) {
    let payload: LabSheetRealtimeEvent
    try {
      payload = JSON.parse(rawData) as LabSheetRealtimeEvent
    } catch {
      return
    }
    if (payload.type === 'connected') {
      void refreshLoadedSheetFromServer()
      return
    }
    if (payload.type === 'heartbeat') return
    if (payload.sourceClientId === clientId) return
    if (!sheet.value || payload.sheetId !== sheet.value.id || payload.date !== sheet.value.date) return

    if (payload.type === 'block-saved') {
      applyRemoteBlock(payload.block)
      return
    }
    if (payload.type === 'parameters-updated') {
      applyRemoteParameters(payload.parameters)
      return
    }
    if (payload.type === 'sheet-reloaded') {
      applyRemoteSheet(payload.sheet)
    }
  }

  function applyRemoteBlock(block: SampleBlock) {
    if (!sheet.value || isBlockLocallyDirty(block.id)) return
    const nextBlock = cloneBlock(block)
    const index = sheet.value.sampleBlocks.findIndex((item) => item.id === nextBlock.id)
    if (index >= 0) {
      sheet.value.sampleBlocks[index] = nextBlock
    } else {
      sheet.value.sampleBlocks.push(nextBlock)
      sheet.value.sampleBlocks.sort((a, b) => a.index - b.index)
    }
  }

  function applyRemoteParameters(parameters: LabParameter) {
    if (!sheet.value) return
    sheet.value.parameters = parameters
  }

  function applyRemoteSheet(remoteSheet: LabSheet) {
    if (!sheet.value) return
    const dirtyBlocks = new Map(sheet.value.sampleBlocks.filter((block) => isBlockLocallyDirty(block.id)).map((block) => [block.id, cloneBlock(block)]))
    const nextSheet = cloneSheet(remoteSheet)
    dirtyBlocks.forEach((localBlock, blockId) => {
      const index = nextSheet.sampleBlocks.findIndex((block) => block.id === blockId)
      if (index >= 0) nextSheet.sampleBlocks[index] = localBlock
      else nextSheet.sampleBlocks.push(localBlock)
    })
    nextSheet.sampleBlocks.sort((a, b) => a.index - b.index)
    sheet.value = nextSheet
  }

  function mergeConflictBlock(remoteBlock: SampleBlock) {
    if (!sheet.value) return
    const index = sheet.value.sampleBlocks.findIndex((block) => block.id === remoteBlock.id)
    if (index < 0) return
    const localBlock = sheet.value.sampleBlocks[index]
    const dirtyFields = pendingDirtyFields.get(remoteBlock.id)
    if (!dirtyFields?.size) {
      sheet.value.sampleBlocks[index] = cloneBlock(remoteBlock)
      return
    }
    const merged = cloneBlock(remoteBlock)
    dirtyFields.forEach((dirty, field) => {
      merged.inputs[field] = cloneValue(localBlock.inputs[field]) as never
      dirty.baseValue = cloneValue(remoteBlock.inputs[field] ?? null)
    })
    merged.results = calculateSampleResults(merged.inputs, merged.parameterSnapshot)
    pendingDirtyFields.set(remoteBlock.id, dirtyFields)
    sheet.value.sampleBlocks[index] = merged
  }

  function getConflictBlock(error: unknown): SampleBlock | null {
    const data = (error as { response?: { data?: { block?: SampleBlock; message?: { block?: SampleBlock } } } })?.response?.data
    return data?.block || data?.message?.block || null
  }

  return {
    sheet,
    loading,
    saving,
    adding,
    autoSaving,
    autoSaveStatus,
    lastAutoSavedAt,
    autoSaveError,
    pendingAutoSaveCount,
    realtimeConnected,
    realtimeError,
    currentParameters,
    sampleBlocks,
    loadCurrentSheet,
    loadSheetByDate,
    saveParameters,
    patchBlock,
    commitBlockFieldChange,
    persistBlock,
    persistAllBlocks,
    appendSampleBlocks,
    disconnectRealtime
  }
})
