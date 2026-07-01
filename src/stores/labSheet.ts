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

const AUTO_SAVE_DELAY_MS = 900

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
  const pendingChangeLogFields = new Map<string, Map<keyof LabSampleInput, LabChangeLogField>>()
  const activeAutoSavePromises = new Set<Promise<void>>()
  const activeSavingBlockIds = new Set<string>()
  let activeAutoSaveCount = 0
  let realtimeSource: EventSource | null = null
  let realtimeDate = ''
  let realtimeReconnectTimer: number | undefined
  const clientId = getLabSheetClientId()

  const currentParameters = computed(() => sheet.value?.parameters || null)
  const sampleBlocks = computed(() => sheet.value?.sampleBlocks || [])

  async function loadCurrentSheet() {
    await persistBeforeSheetChange()
    disconnectRealtime()
    loading.value = true
    try {
      sheet.value = await getCurrentLabSheet()
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
      syncRealtimeForLoadedSheet()
    } finally {
      loading.value = false
    }
  }

  async function saveParameters(parameters: LabParameter) {
    if (!sheet.value) return
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
    const hadDetectionInput = hasLabDetectionInput(block.inputs)
    block.inputs = { ...block.inputs, ...patch }
    if (!hadDetectionInput && hasLabDetectionInput(block.inputs)) {
      block.parameterSnapshot = sheet.value.parameters
    }
    block.results = calculateSampleResults(block.inputs, block.parameterSnapshot)
    const nextVersion = (blockVersions.get(blockId) || 0) + 1
    blockVersions.set(blockId, nextVersion)
    scheduleBlockAutoSave(blockId, nextVersion)
  }

  function commitBlockFieldChange(blockId: string, field: keyof LabSampleInput, oldValue: unknown, newValue: unknown) {
    if (!sheet.value || sheet.value.readonly) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly) return
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) return
    const fields = pendingChangeLogFields.get(blockId) || new Map<keyof LabSampleInput, LabChangeLogField>()
    fields.set(field, { field, oldValue: oldValue ?? null, newValue: newValue ?? null })
    pendingChangeLogFields.set(blockId, fields)
    const nextVersion = (blockVersions.get(blockId) || 0) + 1
    blockVersions.set(blockId, nextVersion)
    scheduleBlockAutoSave(blockId, nextVersion)
  }

  async function persistBlock(block: SampleBlock) {
    if (!sheet.value) return
    saving.value = true
    activeSavingBlockIds.add(block.id)
    try {
      const saved = await saveSampleBlock(sheet.value.id, blockWithPendingChangeLogs(block))
      const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
      if (index >= 0) sheet.value.sampleBlocks[index] = saved
      pendingChangeLogFields.delete(block.id)
    } finally {
      activeSavingBlockIds.delete(block.id)
      saving.value = false
    }
  }

  async function persistAllBlocks(options: { silent?: boolean } = {}) {
    if (!sheet.value) return
    clearAutoSaveTimers()
    if (activeAutoSavePromises.size) {
      await Promise.allSettled(Array.from(activeAutoSavePromises))
    }
    saving.value = true
    autoSaveStatus.value = 'saving'
    try {
      const currentSheet = sheet.value
      const savedBlocks: SampleBlock[] = []
      for (const block of currentSheet.sampleBlocks) {
        activeSavingBlockIds.add(block.id)
        try {
          savedBlocks.push(await saveSampleBlock(currentSheet.id, blockWithPendingChangeLogs(block)))
          pendingChangeLogFields.delete(block.id)
        } finally {
          activeSavingBlockIds.delete(block.id)
        }
      }
      if (sheet.value?.id === currentSheet.id) {
        savedBlocks.forEach((saved) => {
          const index = sheet.value!.sampleBlocks.findIndex((item) => item.id === saved.id)
          if (index >= 0) sheet.value!.sampleBlocks[index] = saved
        })
      }
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
    await persistAllBlocks({ silent: true })
    if (!sheet.value) return
    adding.value = true
    try {
      sheet.value = await addSampleBlocks(sheet.value.id, Number(countValue))
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
    const promise = persistQueuedBlock(blockId, version)
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
    const snapshot = blockWithPendingChangeLogs(block)
    let succeeded = false
    activeAutoSaveCount += 1
    activeSavingBlockIds.add(blockId)
    syncAutoSaveStatus()

    try {
      const saved = await saveSampleBlock(sheetId, snapshot)
      succeeded = true
      if (sheet.value?.id === sheetId && blockVersions.get(blockId) === version) {
        const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
        if (index >= 0) sheet.value.sampleBlocks[index] = saved
        pendingChangeLogFields.delete(blockId)
      }
      lastAutoSavedAt.value = new Date().toISOString()
      autoSaveError.value = ''
    } catch (error) {
      autoSaveStatus.value = 'error'
      autoSaveError.value = error instanceof Error ? error.message : '自动保存失败'
      ElMessage.error('自动保存失败，请点击保存当前表格重试')
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

  function clearAutoSaveTimers() {
    autoSaveTimers.forEach((timer) => window.clearTimeout(timer))
    autoSaveTimers.clear()
    pendingBlockIds.clear()
    syncAutoSaveStatus()
  }

  async function persistBeforeSheetChange() {
    if (!sheet.value) {
      clearAutoSaveTimers()
      return
    }
    if (sheet.value.readonly) {
      clearAutoSaveTimers()
      return
    }
    if (pendingBlockIds.size || activeAutoSavePromises.size) {
      await persistAllBlocks({ silent: true })
    } else {
      clearAutoSaveTimers()
    }
  }

  function syncAutoSaveStatus(saved = false) {
    pendingAutoSaveCount.value = pendingBlockIds.size
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

  function blockWithPendingChangeLogs(block: SampleBlock): SampleBlockSavePayload {
    const snapshot = cloneBlock(block) as SampleBlockSavePayload
    snapshot.changeLogFields = Array.from(pendingChangeLogFields.get(block.id)?.values() || [])
    return snapshot
  }

  function cloneSheet(value: LabSheet): LabSheet {
    return JSON.parse(JSON.stringify(value)) as LabSheet
  }

  function isBlockLocallyDirty(blockId: string) {
    return pendingBlockIds.has(blockId) || activeSavingBlockIds.has(blockId)
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
    }
    source.onmessage = (event) => {
      handleRealtimeMessage(event.data)
    }
    source.onerror = () => {
      realtimeConnected.value = false
      realtimeError.value = '实时同步连接中断，正在重连'
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
    }, 3000)
  }

  function disconnectRealtime() {
    if (realtimeReconnectTimer) {
      window.clearTimeout(realtimeReconnectTimer)
      realtimeReconnectTimer = undefined
    }
    if (realtimeSource) {
      realtimeSource.close()
      realtimeSource = null
    }
    realtimeDate = ''
    realtimeConnected.value = false
    realtimeError.value = ''
  }

  function handleRealtimeMessage(rawData: string) {
    let payload: LabSheetRealtimeEvent
    try {
      payload = JSON.parse(rawData) as LabSheetRealtimeEvent
    } catch {
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
