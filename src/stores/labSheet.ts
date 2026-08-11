import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  addSampleBlocks,
  applyCurrentParametersFromIndex as applyCurrentParametersFromIndexApi,
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

type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'retrying' | 'saved' | 'error' | 'conflict'
type DirtyField = {
  field: keyof LabSampleInput
  baseValue: unknown
  revision: number
}

type SavedFieldSnapshot = {
  field: keyof LabSampleInput
  revision: number
  value: unknown
}

type PreparedBlockSave = {
  payload: SampleBlockSavePayload
  fields: SavedFieldSnapshot[]
}

export type PersistAllBlocksResult = {
  success: boolean
  failedBlockIds: string[]
  conflictBlockIds: string[]
}

type BlockSaveResult = {
  blockId: string
  success: boolean
  conflict: boolean
}

type StoredLabDraft = {
  version: 1
  owner: string
  sheetId: string
  date: string
  expiresAt: number
  blocks: Record<
    string,
    {
      updatedAt?: string
      fields: Partial<Record<keyof LabSampleInput, { baseValue: unknown; value: unknown; revision: number }>>
      changeLogFields: LabChangeLogField[]
    }
  >
}

const AUTO_SAVE_DELAY_MS = 900
const AUTO_SAVE_RETRY_DELAYS_MS = [1000, 3000, 8000]
const REALTIME_RECONNECT_DELAY_MS = 3000
const REALTIME_HEARTBEAT_TIMEOUT_MS = 60000
const DRAFT_STORAGE_PREFIX = 'ys_lab_draft:v1:'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const useLabSheetStore = defineStore('labSheet', () => {
  const sheet = ref<LabSheet | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const applyingParameters = ref(false)
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
  const activeAutoSavePromises = new Set<Promise<BlockSaveResult>>()
  const activeSavingBlockIds = new Set<string>()
  const retryingBlockIds = new Set<string>()
  const conflictFieldsByBlock = new Map<string, Set<keyof LabSampleInput>>()
  const blockSaveChains = new Map<string, Promise<BlockSaveResult>>()
  let activeAutoSaveCount = 0
  let realtimeSource: EventSource | null = null
  let realtimeDate = ''
  let realtimeReconnectTimer: number | undefined
  let realtimeHeartbeatTimer: number | undefined
  let recoveryListenersBound = false
  let draftStorageErrorShown = false
  const clientId = getLabSheetClientId()

  const currentParameters = computed(() => sheet.value?.parameters || null)
  const sampleBlocks = computed(() => sheet.value?.sampleBlocks || [])
  const conflictBlockIds = computed(() => Array.from(conflictFieldsByBlock.keys()))

  async function loadCurrentSheet() {
    const flushed = await persistBeforeSheetChange()
    if (!flushed.success) return false
    disconnectRealtime()
    loading.value = true
    try {
      sheet.value = await getCurrentLabSheet()
      resetLocalSaveState()
      restoreLocalDraft()
      syncRealtimeForLoadedSheet()
      return true
    } finally {
      loading.value = false
    }
  }

  async function loadSheetByDate(date: string) {
    const flushed = await persistBeforeSheetChange()
    if (!flushed.success) return false
    disconnectRealtime()
    loading.value = true
    try {
      sheet.value = await getLabSheetByDate(date)
      resetLocalSaveState()
      restoreLocalDraft()
      syncRealtimeForLoadedSheet()
      return true
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

  async function applyParametersFromIndex(parameters: LabParameter, startIndex: number) {
    if (!sheet.value || sheet.value.readonly || applyingParameters.value) return false
    const targetSheetId = sheet.value.id
    applyingParameters.value = true
    try {
      const persisted = await persistAllBlocks()
      if (!persisted.success) return false
      saving.value = true
      const response = await applyCurrentParametersFromIndexApi(parameters, startIndex)
      if (sheet.value?.id !== targetSheetId) return false
      applyRemoteSheet(response)
      syncRealtimeForLoadedSheet()
      return true
    } finally {
      saving.value = false
      applyingParameters.value = false
    }
  }

  function patchBlock(blockId: string, patch: Partial<LabSampleInput>) {
    if (!sheet.value || applyingParameters.value) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly || sheet.value.readonly) return
    const nextVersion = (blockVersions.get(blockId) || 0) + 1
    const dirtyState = trackDirtyFields(block, patch, nextVersion)
    if (!dirtyState.changed) return
    const hadDetectionInput = hasLabDetectionInput(block.inputs)
    block.inputs = { ...block.inputs, ...patch }
    if (!hadDetectionInput && hasLabDetectionInput(block.inputs) && !block.parameterSnapshot.segmentedApplication) {
      block.parameterSnapshot = { ...sheet.value.parameters }
    }
    block.results = calculateSampleResults(block.inputs, block.parameterSnapshot)
    blockVersions.set(blockId, nextVersion)
    if (dirtyState.hasDirty) {
      persistLocalDraft()
      scheduleBlockAutoSave(blockId)
    }
    else {
      const currentTimer = autoSaveTimers.get(blockId)
      if (currentTimer) window.clearTimeout(currentTimer)
      autoSaveTimers.delete(blockId)
      pendingBlockIds.delete(blockId)
      persistLocalDraft()
      syncAutoSaveStatus()
    }
  }

  function commitBlockFieldChange(blockId: string, field: keyof LabSampleInput, oldValue: unknown, newValue: unknown) {
    if (!sheet.value || sheet.value.readonly || applyingParameters.value) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly) return
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) return
    const fields = pendingChangeLogFields.get(blockId) || new Map<keyof LabSampleInput, LabChangeLogField>()
    fields.set(field, { field, oldValue: oldValue ?? null, newValue: newValue ?? null })
    pendingChangeLogFields.set(blockId, fields)
    persistLocalDraft()
    if (pendingDirtyFields.has(blockId)) {
      scheduleBlockAutoSave(blockId)
    }
  }

  async function persistBlock(block: SampleBlock) {
    if (!sheet.value || sheet.value.readonly || block.readonly) return
    await runAutoSave(block.id)
  }

  async function persistAllBlocks(options: { silent?: boolean } = {}): Promise<PersistAllBlocksResult> {
    if (!sheet.value) return successfulPersistResult()
    if (sheet.value.readonly) {
      resetLocalSaveState()
      return successfulPersistResult()
    }
    cancelAutoSaveTimers()
    if (activeAutoSavePromises.size) {
      await Promise.allSettled(Array.from(activeAutoSavePromises))
    }
    const dirtyBlockIds = Array.from(pendingDirtyFields.keys())
    if (!dirtyBlockIds.length) {
      syncAutoSaveStatus()
      return successfulPersistResult()
    }
    saving.value = true
    autoSaveStatus.value = 'saving'
    try {
      const results = await Promise.all(dirtyBlockIds.map((blockId) => runAutoSave(blockId)))
      const failedBlockIds = Array.from(new Set(results.filter((item) => !item.success).map((item) => item.blockId)))
      const conflictBlockIds = Array.from(conflictFieldsByBlock.keys())
      const success = failedBlockIds.length === 0 && pendingDirtyFields.size === 0 && conflictBlockIds.length === 0
      if (success) {
        lastAutoSavedAt.value = new Date().toISOString()
        autoSaveError.value = ''
        syncAutoSaveStatus(true)
        if (!options.silent) ElMessage.success('当前表格已保存')
      } else {
        syncAutoSaveStatus()
        if (!options.silent && !conflictBlockIds.length) ElMessage.error('仍有数据未保存，请重试')
      }
      return { success, failedBlockIds, conflictBlockIds }
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
    const flushed = await persistAllBlocks({ silent: true })
    if (!flushed.success) throw new Error('仍有样品数据未保存，请先重试保存')
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

  function scheduleBlockAutoSave(blockId: string, delayMs = AUTO_SAVE_DELAY_MS) {
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
      void runAutoSave(blockId)
    }, delayMs)
    autoSaveTimers.set(blockId, timer)
  }

  function runAutoSave(blockId: string): Promise<BlockSaveResult> {
    const previous = blockSaveChains.get(blockId) || Promise.resolve({ blockId, success: true, conflict: false })
    const promise = previous.catch(() => ({ blockId, success: false, conflict: false })).then(() => persistQueuedBlock(blockId))
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

  async function persistQueuedBlock(blockId: string): Promise<BlockSaveResult> {
    const currentSheet = sheet.value
    const block = currentSheet?.sampleBlocks.find((item) => item.id === blockId)
    if (!currentSheet || !block || currentSheet.readonly || block.readonly) {
      pendingBlockIds.delete(blockId)
      syncAutoSaveStatus()
      return { blockId, success: true, conflict: false }
    }
    if (conflictFieldsByBlock.has(blockId)) {
      syncAutoSaveStatus()
      return { blockId, success: false, conflict: true }
    }

    const sheetId = currentSheet.id
    const prepared = prepareBlockSave(block)
    if (!prepared) {
      pendingBlockIds.delete(blockId)
      syncAutoSaveStatus()
      return { blockId, success: true, conflict: false }
    }
    let succeeded = false
    pendingBlockIds.delete(blockId)
    activeAutoSaveCount += 1
    activeSavingBlockIds.add(blockId)
    syncAutoSaveStatus()

    try {
      const saved = await saveBlockWithRetry(sheetId, prepared.payload, blockId)
      succeeded = true
      mergeSavedBlock(saved, prepared.fields, sheetId)
      lastAutoSavedAt.value = new Date().toISOString()
      autoSaveError.value = ''
      persistLocalDraft()
    } catch (error) {
      const conflictBlock = getConflictBlock(error)
      if (conflictBlock) {
        mergeConflictBlock(conflictBlock)
        autoSaveStatus.value = 'conflict'
        autoSaveError.value = '该样品格已被另一台设备修改'
        ElMessage.error('该样品格存在修改冲突，已保留本机内容')
      } else {
        autoSaveStatus.value = 'error'
        autoSaveError.value = error instanceof Error ? error.message : '自动保存失败'
        ElMessage.error('自动保存失败，数据已保存在本机草稿中')
      }
      persistLocalDraft()
    } finally {
      retryingBlockIds.delete(blockId)
      activeSavingBlockIds.delete(blockId)
      activeAutoSaveCount = Math.max(0, activeAutoSaveCount - 1)
      if (!succeeded && autoSaveStatus.value === 'error') {
        syncAutoSaveStatus()
        return { blockId, success: false, conflict: conflictFieldsByBlock.has(blockId) }
      }
      syncAutoSaveStatus(succeeded)
    }
    if (succeeded && pendingDirtyFields.has(blockId) && !autoSaveTimers.has(blockId)) {
      scheduleBlockAutoSave(blockId, 0)
    }
    return { blockId, success: succeeded, conflict: false }
  }

  async function saveBlockWithRetry(sheetId: string, payload: SampleBlockSavePayload, blockId: string) {
    let lastError: unknown
    for (let attempt = 0; attempt <= AUTO_SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await saveSampleBlock(sheetId, payload)
      } catch (error) {
        lastError = error
        if (!isTransientSaveError(error) || attempt === AUTO_SAVE_RETRY_DELAYS_MS.length) throw error
        retryingBlockIds.add(blockId)
        autoSaveStatus.value = 'retrying'
        autoSaveError.value = '网络不稳定，正在重试保存'
        await wait(AUTO_SAVE_RETRY_DELAYS_MS[attempt])
      }
    }
    throw lastError
  }

  function wait(delayMs: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
  }

  function isTransientSaveError(error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (!status) return true
    return status === 408 || status === 425 || status === 429 || status >= 500
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
    blockVersions.clear()
    retryingBlockIds.clear()
    conflictFieldsByBlock.clear()
    autoSaveError.value = ''
    syncAutoSaveStatus()
  }

  async function persistBeforeSheetChange(): Promise<PersistAllBlocksResult> {
    if (!sheet.value) {
      resetLocalSaveState()
      return successfulPersistResult()
    }
    if (sheet.value.readonly) {
      resetLocalSaveState()
      return successfulPersistResult()
    }
    if (pendingBlockIds.size || pendingDirtyFields.size || activeAutoSavePromises.size) {
      return persistAllBlocks({ silent: true })
    } else {
      cancelAutoSaveTimers()
      syncAutoSaveStatus()
      return successfulPersistResult()
    }
  }

  function successfulPersistResult(): PersistAllBlocksResult {
    return { success: true, failedBlockIds: [], conflictBlockIds: [] }
  }

  function syncAutoSaveStatus(saved = false) {
    pendingAutoSaveCount.value = new Set([...pendingBlockIds, ...pendingDirtyFields.keys()]).size
    autoSaving.value = activeAutoSaveCount > 0
    if (conflictFieldsByBlock.size) {
      autoSaveStatus.value = 'conflict'
      return
    }
    if (retryingBlockIds.size) {
      autoSaveStatus.value = 'retrying'
      return
    }
    if (pendingBlockIds.size) {
      autoSaveStatus.value = 'pending'
      return
    }
    if (autoSaveError.value && pendingDirtyFields.size) {
      autoSaveStatus.value = 'error'
      return
    }
    if (pendingDirtyFields.size) {
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

  function trackDirtyFields(block: SampleBlock, patch: Partial<LabSampleInput>, revision: number) {
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
        fields.set(field, { field, baseValue, revision })
      }
      changed = true
    })
    const hasDirty = Boolean(fields?.size)
    if (hasDirty) pendingDirtyFields.set(block.id, fields!)
    else pendingDirtyFields.delete(block.id)
    return { changed, hasDirty }
  }

  function prepareBlockSave(block: SampleBlock): PreparedBlockSave | null {
    const fields = pendingDirtyFields.get(block.id)
    if (!fields?.size) return null
    const changedFields: Partial<LabSampleInput> = {}
    const baseInputs: Partial<LabSampleInput> = {}
    const savedFields: SavedFieldSnapshot[] = []
    fields.forEach((dirty, field) => {
      const value = cloneValue(block.inputs[field])
      changedFields[field] = value as never
      baseInputs[field] = cloneValue(dirty.baseValue) as never
      savedFields.push({ field, revision: dirty.revision, value })
    })
    return {
      payload: {
        id: block.id,
        baseUpdatedAt: block.updatedAt,
        baseInputs,
        changedFields,
        changeLogFields: Array.from(pendingChangeLogFields.get(block.id)?.values() || [])
      },
      fields: savedFields
    }
  }

  function mergeSavedBlock(saved: SampleBlock, sentFields: SavedFieldSnapshot[], sheetId: string) {
    if (sheet.value?.id !== sheetId) return
    const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
    if (index < 0) return
    const localBlock = sheet.value.sampleBlocks[index]
    const dirtyFields = pendingDirtyFields.get(saved.id)
    const changeLogFields = pendingChangeLogFields.get(saved.id)
    const merged = cloneBlock(saved)
    dirtyFields?.forEach((dirty, field) => {
      const sent = sentFields.find((item) => item.field === field)
      const localValue = cloneValue(localBlock.inputs[field])
      const savedValue = cloneValue(saved.inputs[field])
      if (sent && dirty.revision === sent.revision && isSameValue(localValue, sent.value)) {
        dirtyFields.delete(field)
        changeLogFields?.delete(field)
        conflictFieldsByBlock.get(saved.id)?.delete(field)
        return
      }
      merged.inputs[field] = localValue as never
      dirty.baseValue = savedValue
    })
    merged.results = calculateSampleResults(merged.inputs, merged.parameterSnapshot)
    sheet.value.sampleBlocks[index] = merged
    if (!dirtyFields?.size) {
      pendingDirtyFields.delete(saved.id)
      pendingBlockIds.delete(saved.id)
      pendingChangeLogFields.delete(saved.id)
      conflictFieldsByBlock.delete(saved.id)
      return
    }
    if (changeLogFields?.size) pendingChangeLogFields.set(saved.id, changeLogFields)
    else pendingChangeLogFields.delete(saved.id)
    const conflicts = conflictFieldsByBlock.get(saved.id)
    if (conflicts && !conflicts.size) conflictFieldsByBlock.delete(saved.id)
    pendingDirtyFields.set(saved.id, dirtyFields)
  }

  function cloneSheet(value: LabSheet): LabSheet {
    return JSON.parse(JSON.stringify(value)) as LabSheet
  }

  function getDraftOwner() {
    if (typeof window === 'undefined') return 'server'
    try {
      const raw = window.localStorage.getItem('ys_user')
      const user = raw ? (JSON.parse(raw) as { id?: string; account?: string; dataOwnerId?: string }) : null
      const actorId = user?.id || user?.account || 'guest'
      const ownerId = user?.dataOwnerId || actorId
      return `${ownerId}:${actorId}`
    } catch {
      return 'guest:guest'
    }
  }

  function getDraftStorageKey(target = sheet.value) {
    if (!target) return ''
    return `${DRAFT_STORAGE_PREFIX}${getDraftOwner()}:${target.date}:${target.id}`
  }

  function persistLocalDraft() {
    if (typeof window === 'undefined' || !sheet.value || sheet.value.readonly) return
    const key = getDraftStorageKey()
    if (!key) return
    try {
      const blocks: StoredLabDraft['blocks'] = {}
      pendingDirtyFields.forEach((fields, blockId) => {
        const block = sheet.value?.sampleBlocks.find((item) => item.id === blockId)
        if (!block || !fields.size) return
        const storedFields: StoredLabDraft['blocks'][string]['fields'] = {}
        fields.forEach((dirty, field) => {
          storedFields[field] = {
            baseValue: cloneValue(dirty.baseValue),
            value: cloneValue(block.inputs[field]),
            revision: dirty.revision
          }
        })
        blocks[blockId] = {
          updatedAt: block.updatedAt,
          fields: storedFields,
          changeLogFields: Array.from(pendingChangeLogFields.get(blockId)?.values() || [])
        }
      })
      if (!Object.keys(blocks).length) {
        window.localStorage.removeItem(key)
        return
      }
      const draft: StoredLabDraft = {
        version: 1,
        owner: getDraftOwner(),
        sheetId: sheet.value.id,
        date: sheet.value.date,
        expiresAt: Date.now() + DRAFT_TTL_MS,
        blocks
      }
      window.localStorage.setItem(key, JSON.stringify(draft))
      draftStorageErrorShown = false
    } catch {
      autoSaveError.value = '本机草稿保存失败，请勿刷新或关闭页面'
      autoSaveStatus.value = 'error'
      if (!draftStorageErrorShown) {
        draftStorageErrorShown = true
        ElMessage.error('本机草稿保存失败，请勿刷新或关闭页面')
      }
    }
  }

  function restoreLocalDraft() {
    if (typeof window === 'undefined' || !sheet.value || sheet.value.readonly) return
    cleanupExpiredDrafts()
    const key = getDraftStorageKey()
    if (!key) return
    let draft: StoredLabDraft | null = null
    try {
      const raw = window.localStorage.getItem(key)
      draft = raw ? (JSON.parse(raw) as StoredLabDraft) : null
    } catch {
      draft = null
    }
    if (!draft || draft.version !== 1 || draft.sheetId !== sheet.value.id || draft.date !== sheet.value.date || draft.expiresAt <= Date.now()) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // Storage can be unavailable in privacy mode; the live page still keeps edits in memory.
      }
      return
    }

    let restoredCount = 0
    Object.entries(draft.blocks).forEach(([blockId, storedBlock]) => {
      const block = sheet.value?.sampleBlocks.find((item) => item.id === blockId)
      if (!block) return
      const dirtyFields = new Map<keyof LabSampleInput, DirtyField>()
      const conflicts = new Set<keyof LabSampleInput>()
      let maxRevision = blockVersions.get(blockId) || 0
      Object.entries(storedBlock.fields).forEach(([rawField, stored]) => {
        if (!stored) return
        const field = rawField as keyof LabSampleInput
        const remoteValue = cloneValue(block.inputs[field])
        if (isSameValue(remoteValue, stored.value)) return
        block.inputs[field] = cloneValue(stored.value) as never
        const revision = Math.max(Number(stored.revision) || 0, maxRevision + 1)
        maxRevision = Math.max(maxRevision, revision)
        dirtyFields.set(field, { field, baseValue: remoteValue, revision })
        if (!isSameValue(remoteValue, stored.baseValue)) conflicts.add(field)
        restoredCount += 1
      })
      if (!dirtyFields.size) return
      blockVersions.set(blockId, maxRevision)
      pendingDirtyFields.set(blockId, dirtyFields)
      const changeLogs = new Map<keyof LabSampleInput, LabChangeLogField>()
      storedBlock.changeLogFields.forEach((item) => changeLogs.set(item.field, item))
      if (changeLogs.size) pendingChangeLogFields.set(blockId, changeLogs)
      if (conflicts.size) conflictFieldsByBlock.set(blockId, conflicts)
      block.results = calculateSampleResults(block.inputs, block.parameterSnapshot)
      if (!conflicts.size) scheduleBlockAutoSave(blockId, 0)
    })
    persistLocalDraft()
    syncAutoSaveStatus()
    if (conflictFieldsByBlock.size) {
      autoSaveError.value = '恢复的本机草稿与服务器数据存在冲突'
      autoSaveStatus.value = 'conflict'
      ElMessage.warning('已恢复本机未保存数据，其中部分内容需要确认后保存')
    } else if (restoredCount) {
      ElMessage.warning('已恢复本机未保存数据，正在重新保存')
    }
  }

  function cleanupExpiredDrafts() {
    if (typeof window === 'undefined') return
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index)
        if (!key?.startsWith(DRAFT_STORAGE_PREFIX)) continue
        const raw = window.localStorage.getItem(key)
        const draft = raw ? (JSON.parse(raw) as Partial<StoredLabDraft>) : null
        if (!draft?.expiresAt || draft.expiresAt <= Date.now()) window.localStorage.removeItem(key)
      }
    } catch {
      // Invalid or unavailable storage must not prevent the sheet from loading.
    }
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

  async function recoverRealtimeAndPendingSaves() {
    await refreshLoadedSheetFromServer()
    if (pendingDirtyFields.size && !conflictFieldsByBlock.size) await retryFailedSaves()
  }

  function handleVisibilityRecovery() {
    if (document.visibilityState === 'visible') void recoverRealtimeAndPendingSaves()
  }

  function handleRealtimeRecovery() {
    void recoverRealtimeAndPendingSaves()
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
      void refreshLoadedSheetFromServer()
      return
    }
    if (payload.type === 'parameters-updated') {
      applyRemoteParameters(payload.parameters)
      return
    }
    if (payload.type === 'sheet-reloaded') {
      void refreshLoadedSheetFromServer()
    }
  }

  function applyRemoteParameters(parameters: LabParameter) {
    if (!sheet.value) return
    sheet.value.parameters = parameters
  }

  function applyRemoteSheet(remoteSheet: LabSheet) {
    if (!sheet.value) return
    const localBlocks = new Map(sheet.value.sampleBlocks.map((block) => [block.id, block]))
    const nextSheet = cloneSheet(remoteSheet)
    nextSheet.sampleBlocks = nextSheet.sampleBlocks.map((remoteBlock) => {
      const localBlock = localBlocks.get(remoteBlock.id)
      return localBlock ? mergeRemoteBlockState(remoteBlock, localBlock) : remoteBlock
    })
    pendingDirtyFields.forEach((_fields, blockId) => {
      if (nextSheet.sampleBlocks.some((block) => block.id === blockId)) return
      const localBlock = localBlocks.get(blockId)
      if (localBlock) nextSheet.sampleBlocks.push(cloneBlock(localBlock))
    })
    nextSheet.sampleBlocks.sort((a, b) => a.index - b.index)
    sheet.value = nextSheet
    persistLocalDraft()
    syncAutoSaveStatus()
  }

  function mergeRemoteBlockState(remoteBlock: SampleBlock, localBlock: SampleBlock) {
    const dirtyFields = pendingDirtyFields.get(remoteBlock.id)
    if (!dirtyFields?.size) return cloneBlock(remoteBlock)
    const merged = cloneBlock(remoteBlock)
    const changeLogs = pendingChangeLogFields.get(remoteBlock.id)
    const conflicts = conflictFieldsByBlock.get(remoteBlock.id) || new Set<keyof LabSampleInput>()
    dirtyFields.forEach((dirty, field) => {
      const localValue = cloneValue(localBlock.inputs[field])
      const remoteValue = cloneValue(remoteBlock.inputs[field])
      if (isSameValue(localValue, remoteValue)) {
        dirtyFields.delete(field)
        changeLogs?.delete(field)
        conflicts.delete(field)
        return
      }
      merged.inputs[field] = localValue as never
      if (!isSameValue(remoteValue, dirty.baseValue)) {
        dirty.baseValue = remoteValue
        conflicts.add(field)
      }
    })
    merged.results = calculateSampleResults(merged.inputs, merged.parameterSnapshot)
    if (!dirtyFields.size) {
      pendingDirtyFields.delete(remoteBlock.id)
      pendingChangeLogFields.delete(remoteBlock.id)
      conflictFieldsByBlock.delete(remoteBlock.id)
      pendingBlockIds.delete(remoteBlock.id)
      return merged
    }
    pendingDirtyFields.set(remoteBlock.id, dirtyFields)
    if (changeLogs?.size) pendingChangeLogFields.set(remoteBlock.id, changeLogs)
    else pendingChangeLogFields.delete(remoteBlock.id)
    if (conflicts.size) conflictFieldsByBlock.set(remoteBlock.id, conflicts)
    else conflictFieldsByBlock.delete(remoteBlock.id)
    return merged
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
    const conflicts = conflictFieldsByBlock.get(remoteBlock.id) || new Set<keyof LabSampleInput>()
    dirtyFields.forEach((dirty, field) => {
      merged.inputs[field] = cloneValue(localBlock.inputs[field]) as never
      dirty.baseValue = cloneValue(remoteBlock.inputs[field] ?? null)
      conflicts.add(field)
    })
    merged.results = calculateSampleResults(merged.inputs, merged.parameterSnapshot)
    pendingDirtyFields.set(remoteBlock.id, dirtyFields)
    conflictFieldsByBlock.set(remoteBlock.id, conflicts)
    sheet.value.sampleBlocks[index] = merged
  }

  async function retryFailedSaves() {
    if (conflictFieldsByBlock.size) {
      return {
        success: false,
        failedBlockIds: Array.from(conflictFieldsByBlock.keys()),
        conflictBlockIds: Array.from(conflictFieldsByBlock.keys())
      }
    }
    autoSaveError.value = ''
    return persistAllBlocks({ silent: true })
  }

  async function confirmConflictOverwrite() {
    const blockIds = Array.from(conflictFieldsByBlock.keys())
    conflictFieldsByBlock.clear()
    autoSaveError.value = ''
    persistLocalDraft()
    const result = await persistAllBlocks({ silent: true })
    if (!result.success && blockIds.some((id) => result.failedBlockIds.includes(id))) {
      autoSaveError.value ||= '冲突数据保存失败，请重试'
    }
    return result
  }

  function getConflictBlock(error: unknown): SampleBlock | null {
    const data = (error as { response?: { data?: { block?: SampleBlock; message?: { block?: SampleBlock } } } })?.response?.data
    return data?.block || data?.message?.block || null
  }

  return {
    sheet,
    loading,
    saving,
    applyingParameters,
    adding,
    autoSaving,
    autoSaveStatus,
    lastAutoSavedAt,
    autoSaveError,
    pendingAutoSaveCount,
    realtimeConnected,
    realtimeError,
    conflictBlockIds,
    currentParameters,
    sampleBlocks,
    loadCurrentSheet,
    loadSheetByDate,
    saveParameters,
    applyParametersFromIndex,
    patchBlock,
    commitBlockFieldChange,
    persistBlock,
    persistAllBlocks,
    retryFailedSaves,
    confirmConflictOverwrite,
    appendSampleBlocks,
    disconnectRealtime
  }
})
