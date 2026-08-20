import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { readAccessGuardSessions, type AccessGuardGroup } from '@/api/accessGuard'
import {
  addSampleBlocks,
  applyCurrentParametersFromIndex as applyCurrentParametersFromIndexApi,
  createLabSheetEventSource,
  createSampleRetests as createSampleRetestsApi,
  deleteSampleRetest as deleteSampleRetestApi,
  getCurrentLabSheet,
  getLabSheetByDate,
  getLabSheetClientId,
  saveSampleBlock,
  saveSampleRetest,
  voidSampleRetest as voidSampleRetestApi,
  updateCurrentParameters
} from '@/api/labSheet'
import type { LabSheetRealtimeEvent } from '@/api/labSheet'
import {
  sampleRetestInputFields,
  type LabChangeLogField,
  type LabParameter,
  type LabSampleInput,
  type LabSheet,
  type SampleBlock,
  type SampleBlockSavePayload,
  type SampleRetest,
  type SampleRetestInput,
  type SampleRetestInputField,
  type SaveSampleRetestPayload
} from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { hasLabDetectionInput } from '@/utils/sampleReport'
import { isPositiveInteger } from '@/utils/validators'
import { useAccessGuardStore } from './accessGuard'

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

type PreparedBlockSaveState = {
  signature: string
  idempotencyKey: string
  prepared?: PreparedBlockSave
}

type DirtyRetestField = {
  field: SampleRetestInputField
  baseValue: unknown
  revision: number
}

type SavedRetestFieldSnapshot = {
  field: SampleRetestInputField
  revision: number
  value: unknown
}

type PreparedRetestSave = {
  payload: SaveSampleRetestPayload
  fields: SavedRetestFieldSnapshot[]
}

type PreparedRetestSaveState = {
  signature: string
  idempotencyKey: string
  prepared?: PreparedRetestSave
}

type CreateRetestsPayload = {
  sampleBlockIds: string[]
  idempotencyKey: string
}

type PreparedCreateRetestRequest = {
  owner: string
  sheetId: string
  payload: CreateRetestsPayload
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

type RetestSaveResult = {
  retestId: string
  success: boolean
  conflict: boolean
}

type RetestChangedRealtimeEvent = {
  type: 'retests-changed'
  date: string
  sheetId: string
  sourceClientId?: string
  updatedAt: string
  sampleBlockId?: string
  sampleRetestId?: string
}

type StoredDraftBlock = {
  updatedAt?: string
  fields: Partial<Record<keyof LabSampleInput, { baseValue: unknown; value: unknown; revision: number }>>
  changeLogFields: LabChangeLogField[]
  preparedSave?: { signature: string; idempotencyKey: string }
}

type StoredDraftRetest = {
  sampleBlockId: string
  updatedAt: string
  fields: Partial<Record<SampleRetestInputField, { baseValue: unknown; value: unknown; revision: number }>>
  preparedSave?: { signature: string; idempotencyKey: string }
}

type StoredLabDraft = {
  version: 1 | 2
  owner: string
  sheetId: string
  date: string
  expiresAt: number
  blocks: Record<string, StoredDraftBlock>
  retests?: Record<string, StoredDraftRetest>
}

const AUTO_SAVE_DELAY_MS = 900
const AUTO_SAVE_RETRY_DELAYS_MS = [1000, 3000, 8000]
const REALTIME_RECONNECT_DELAY_MS = 3000
const REALTIME_HEARTBEAT_TIMEOUT_MS = 60000
const DRAFT_STORAGE_PREFIX = 'ys_lab_draft:v1:'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const COMPLETED_SAMPLE_DATA_FEATURE = 'COMPLETED_SAMPLE_DATA'

type CompletedSampleAccessContext =
  | {
      mode: 'granted'
      sessionId: string
      groupId: string
      grantVersion: number
      expiresAt: number
      features: string[]
      token: string
    }
  | { mode: 'protected'; groupSignatures: string[] }
  | { mode: 'unprotected' }

function getCompletedSampleAccessContext(groups: AccessGuardGroup[], now = Date.now()): CompletedSampleAccessContext {
  const selected = Object.entries(readAccessGuardSessions()).find(([groupId, session]) =>
    session.groupId === groupId && Number.isInteger(session.grantVersion) && Number(session.grantVersion) > 0 &&
    (session.expiresAt || 0) > now && Boolean(session.token) && session.features?.includes(COMPLETED_SAMPLE_DATA_FEATURE)
  )
  const token = selected?.[1].token
  if (selected && token) {
    const [sessionId, session] = selected
    return {
      mode: 'granted',
      sessionId,
      groupId: sessionId,
      grantVersion: Number(session.grantVersion),
      expiresAt: Number(session.expiresAt),
      features: [...(session.features || [])].sort(),
      token
    }
  }
  const groupSignatures = groups
    .filter((group) => group.enabled && group.features.includes(COMPLETED_SAMPLE_DATA_FEATURE))
    .map((group) => JSON.stringify([group.id, group.grantVersion, [...group.features].sort()]))
    .sort()
  return groupSignatures.length ? { mode: 'protected', groupSignatures } : { mode: 'unprotected' }
}

function isSameCompletedSampleAccessContext(
  left: CompletedSampleAccessContext,
  right: CompletedSampleAccessContext
) {
  if (left.mode !== right.mode) return false
  if (left.mode === 'unprotected' && right.mode === 'unprotected') return true
  if (left.mode === 'protected' && right.mode === 'protected') {
    return JSON.stringify(left.groupSignatures) === JSON.stringify(right.groupSignatures)
  }
  if (left.mode !== 'granted' || right.mode !== 'granted') return false
  return (
    left.sessionId === right.sessionId && left.groupId === right.groupId &&
    left.grantVersion === right.grantVersion && left.expiresAt === right.expiresAt &&
    left.token === right.token && JSON.stringify(left.features) === JSON.stringify(right.features)
  )
}

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
  const preparedBlockSaves = new Map<string, PreparedBlockSaveState>()
  const retestAutoSaveTimers = new Map<string, number>()
  const pendingRetestIds = new Set<string>()
  const retestVersions = new Map<string, number>()
  const pendingRetestDirtyFields = new Map<string, Map<SampleRetestInputField, DirtyRetestField>>()
  const activeRetestSavePromises = new Set<Promise<RetestSaveResult>>()
  const activeSavingRetestIds = new Set<string>()
  const retryingRetestIds = new Set<string>()
  const failedRetestIds = new Set<string>()
  const conflictFieldsByRetest = new Map<string, Set<SampleRetestInputField>>()
  const retestSaveChains = new Map<string, Promise<RetestSaveResult>>()
  const preparedRetestSaves = new Map<string, PreparedRetestSaveState>()
  const activeRetestSavePromisesById = new Map<string, Set<Promise<RetestSaveResult>>>()
  const retestLifecycleGenerations = new Map<string, number>()
  const deletedRetestIds = new Set<string>()
  const activeCreateRetestRequests = new Map<string, Promise<SampleRetest[]>>()
  const preparedCreateRetestRequests = new Map<string, PreparedCreateRetestRequest>()
  let activeAutoSaveCount = 0
  let sheetStateGeneration = 0
  let remoteRefreshSequence = 0
  let latestAppliedRemoteRefreshSequence = 0
  let retestCollectionGeneration = 0
  let realtimeSource: EventSource | null = null
  let realtimeDate = ''
  let realtimeReconnectTimer: number | undefined
  let realtimeHeartbeatTimer: number | undefined
  let recoveryListenersBound = false
  let draftStorageErrorShown = false
  const clientId = getLabSheetClientId()
  const accessGuard = useAccessGuardStore()

  const currentParameters = computed(() => sheet.value?.parameters || null)
  const sampleBlocks = computed(() => sheet.value?.sampleBlocks || [])
  const conflictBlockIds = computed(() => Array.from(new Set([
    ...conflictFieldsByBlock.keys(),
    ...conflictFieldsByRetest.keys()
  ])))

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

  function patchRetest(sampleBlockId: string, retestId: string, patch: Partial<SampleRetestInput>) {
    if (!sheet.value || sheet.value.readonly || applyingParameters.value) return
    const target = findRetest(sampleBlockId, retestId)
    if (!target || target.readonly || target.status !== 'ACTIVE' || target.sensitiveFieldsHidden) return
    const nextVersion = (retestVersions.get(retestId) || 0) + 1
    const dirtyState = trackRetestDirtyFields(target, patch, nextVersion)
    if (!dirtyState.changed) return
    target.inputs = { ...target.inputs, ...patch }
    target.results = calculateSampleResults(target.inputs, target.parameterSnapshot)
    retestVersions.set(retestId, nextVersion)
    if (dirtyState.hasDirty) {
      persistLocalDraft()
      scheduleRetestAutoSave(retestId)
      return
    }
    const currentTimer = retestAutoSaveTimers.get(retestId)
    if (currentTimer) window.clearTimeout(currentTimer)
    retestAutoSaveTimers.delete(retestId)
    pendingRetestIds.delete(retestId)
    failedRetestIds.delete(retestId)
    if (!failedRetestIds.size && !pendingDirtyFields.size) autoSaveError.value = ''
    persistLocalDraft()
    syncAutoSaveStatus()
  }

  function createRetests(sampleBlockIds: string[]): Promise<SampleRetest[]> {
    if (!sheet.value || sheet.value.readonly) {
      return Promise.reject(new Error('历史日期表格仅支持查看，不能创建复样'))
    }
    const targetSheetId = sheet.value.id
    const targetOwner = getDraftOwner()
    cleanupPreparedCreateRetestRequests(targetSheetId, targetOwner)
    const requestSignature = JSON.stringify([targetOwner, targetSheetId, ...sampleBlockIds])
    const activeRequest = activeCreateRetestRequests.get(requestSignature)
    if (activeRequest) return activeRequest
    const preparedRequest = preparedCreateRetestRequests.get(requestSignature) || {
      owner: targetOwner,
      sheetId: targetSheetId,
      payload: {
        sampleBlockIds: [...sampleBlockIds],
        idempotencyKey: crypto.randomUUID()
      }
    }
    preparedCreateRetestRequests.set(requestSignature, preparedRequest)
    const request = createRetestsAfterFlush(targetSheetId, targetOwner, preparedRequest.payload)
      .then((created) => {
        if (preparedCreateRetestRequests.get(requestSignature) === preparedRequest) {
          preparedCreateRetestRequests.delete(requestSignature)
        }
        return created
      })
      .finally(() => {
        if (activeCreateRetestRequests.get(requestSignature) === request) {
          activeCreateRetestRequests.delete(requestSignature)
        }
      })
    activeCreateRetestRequests.set(requestSignature, request)
    return request
  }

  async function createRetestsAfterFlush(targetSheetId: string, targetOwner: string, payload: CreateRetestsPayload) {
    const flushed = await persistAllBlocks({ silent: true })
    if (!flushed.success) throw new Error('仍有数据未保存，请先重试保存')
    if (sheet.value?.id !== targetSheetId || sheet.value.readonly || getDraftOwner() !== targetOwner) {
      throw new Error('表格已切换，请在当前表格重新创建复样')
    }
    const created = await createSampleRetestsApi(targetSheetId, payload)
    mergeCreatedRetests(created, targetSheetId, targetOwner)
    return created
  }

  function mergeCreatedRetests(created: SampleRetest[], sheetId: string, owner: string) {
    if (sheet.value?.id !== sheetId || getDraftOwner() !== owner) return
    created.forEach((retest) => {
      if (deletedRetestIds.has(retest.id)) return
      const block = sheet.value?.sampleBlocks.find((item) => item.id === retest.sampleBlockId)
      if (!block) return
      const index = block.retests.findIndex((item) => item.id === retest.id)
      if (index >= 0) block.retests[index] = mergeRemoteRetestState(retest, block.retests[index])
      else block.retests.push(cloneRetest(retest))
      block.retests.sort((left, right) => left.sequence - right.sequence)
    })
    retestCollectionGeneration += 1
  }

  async function persistRetest(sampleBlockId: string, retestId: string) {
    if (!findRetest(sampleBlockId, retestId)) {
      return { retestId, success: true, conflict: false } satisfies RetestSaveResult
    }
    cancelRetestAutoSaveTimer(retestId)
    return runRetestAutoSave(retestId)
  }

  async function deleteRetestRecord(sampleBlockId: string, retestId: string) {
    const target = findRetest(sampleBlockId, retestId)
    if (!sheet.value || !target || sheet.value.readonly || target.readonly || target.status !== 'ACTIVE') return false
    const sheetId = sheet.value.id
    const flushed = await persistRetest(sampleBlockId, retestId)
    if (!flushed.success) throw new Error('仍有复样数据未保存，请先重试保存')
    const current = findRetest(sampleBlockId, retestId)
    if (!current || sheet.value?.id !== sheetId) return false
    await deleteSampleRetestApi(sheetId, retestId, {
      baseUpdatedAt: current.updatedAt,
      idempotencyKey: crypto.randomUUID()
    })
    if (sheet.value?.id !== sheetId) return false
    const block = sheet.value.sampleBlocks.find((item) => item.id === sampleBlockId)
    if (!block) return false
    deletedRetestIds.add(retestId)
    block.retests = block.retests.filter((item) => item.id !== retestId)
    cleanupRetestSaveState(retestId, true)
    retestCollectionGeneration += 1
    persistLocalDraft()
    syncAutoSaveStatus()
    return true
  }

  async function voidRetestRecord(sampleBlockId: string, retestId: string, reason?: string) {
    const target = findRetest(sampleBlockId, retestId)
    if (!sheet.value || !target || sheet.value.readonly || target.readonly || target.status !== 'ACTIVE') return null
    const sheetId = sheet.value.id
    const flushed = await persistRetest(sampleBlockId, retestId)
    if (!flushed.success) throw new Error('仍有复样数据未保存，请先重试保存')
    const current = findRetest(sampleBlockId, retestId)
    if (!current || sheet.value?.id !== sheetId) return null
    const payload = {
      baseUpdatedAt: current.updatedAt,
      idempotencyKey: crypto.randomUUID(),
      ...(reason?.trim() ? { reason: reason.trim() } : {})
    }
    const voided = await voidSampleRetestApi(sheetId, retestId, payload)
    if (sheet.value?.id !== sheetId) return voided
    const block = sheet.value.sampleBlocks.find((item) => item.id === sampleBlockId)
    const index = block?.retests.findIndex((item) => item.id === retestId) ?? -1
    if (block && index >= 0) block.retests[index] = cloneRetest(voided)
    cleanupRetestSaveState(retestId, true)
    retestCollectionGeneration += 1
    persistLocalDraft()
    syncAutoSaveStatus()
    return voided
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
    const hadPendingWork = Boolean(
      pendingBlockIds.size || pendingDirtyFields.size || activeAutoSavePromises.size || conflictFieldsByBlock.size ||
      pendingRetestIds.size || pendingRetestDirtyFields.size || activeRetestSavePromises.size || conflictFieldsByRetest.size
    )
    if (!hadPendingWork) {
      cancelAutoSaveTimers()
      cancelRetestAutoSaveTimers()
      syncAutoSaveStatus()
      return successfulPersistResult()
    }
    saving.value = true
    autoSaveStatus.value = 'saving'
    try {
      const [blockResult, retestResult] = await Promise.all([
        persistAllSampleBlocks(),
        persistAllRetests()
      ])
      const failedBlockIds = Array.from(new Set([...blockResult.failedBlockIds, ...retestResult.failedBlockIds]))
      const conflictBlockIds = Array.from(new Set([
        ...blockResult.conflictBlockIds,
        ...retestResult.conflictBlockIds
      ]))
      const success = blockResult.success && retestResult.success && failedBlockIds.length === 0 && conflictBlockIds.length === 0
      if (success) {
        autoSaveError.value = ''
        lastAutoSavedAt.value = new Date().toISOString()
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

  async function persistAllSampleBlocks(): Promise<PersistAllBlocksResult> {
    cancelAutoSaveTimers()
    if (activeAutoSavePromises.size) {
      await Promise.allSettled(Array.from(activeAutoSavePromises))
    }
    cancelAutoSaveTimers()
    const dirtyBlockIds = Array.from(pendingDirtyFields.keys())
    if (!dirtyBlockIds.length) {
      syncAutoSaveStatus()
      return successfulPersistResult()
    }
    const results = await Promise.all(dirtyBlockIds.map((blockId) => runAutoSave(blockId)))
    const failedBlockIds = Array.from(new Set(results.filter((item) => !item.success).map((item) => item.blockId)))
    const conflictBlockIds = Array.from(conflictFieldsByBlock.keys())
    const success = failedBlockIds.length === 0 && pendingDirtyFields.size === 0 && conflictBlockIds.length === 0
    return { success, failedBlockIds, conflictBlockIds }
  }

  async function persistAllRetests(): Promise<PersistAllBlocksResult> {
    cancelRetestAutoSaveTimers()
    if (activeRetestSavePromises.size) {
      await Promise.allSettled(Array.from(activeRetestSavePromises))
    }
    cancelRetestAutoSaveTimers()
    const dirtyRetestIds = Array.from(pendingRetestDirtyFields.keys())
    if (!dirtyRetestIds.length) {
      syncAutoSaveStatus()
      return successfulPersistResult()
    }
    const results = await Promise.all(dirtyRetestIds.map((retestId) => runRetestAutoSave(retestId)))
    const failedBlockIds = Array.from(new Set(results.filter((item) => !item.success).map((item) => item.retestId)))
    const conflictBlockIds = Array.from(conflictFieldsByRetest.keys())
    const success = failedBlockIds.length === 0 && pendingRetestDirtyFields.size === 0 && conflictBlockIds.length === 0
    return { success, failedBlockIds, conflictBlockIds }
  }

  async function appendSampleBlocks(countValue: string | number) {
    if (!sheet.value || !isPositiveInteger(countValue)) {
      throw new Error('新增数量必须是正整数')
    }
    if (sheet.value.readonly) {
      throw new Error('历史日期表格仅支持查看，不能修改')
    }
    const targetSheetId = sheet.value.id
    const targetDate = sheet.value.date
    const targetOwner = getDraftOwner()
    const targetSheetGeneration = sheetStateGeneration
    if (activeCreateRetestRequests.size) {
      await Promise.allSettled(Array.from(activeCreateRetestRequests.values()))
    }
    if (
      sheetStateGeneration !== targetSheetGeneration || sheet.value?.id !== targetSheetId ||
      sheet.value.date !== targetDate || sheet.value.readonly || getDraftOwner() !== targetOwner
    ) {
      throw new Error('表格已切换，请在当前表格重新新增样品格')
    }
    const flushed = await persistAllBlocks({ silent: true })
    if (!flushed.success) throw new Error('仍有样品数据未保存，请先重试保存')
    if (
      sheetStateGeneration !== targetSheetGeneration || sheet.value?.id !== targetSheetId ||
      sheet.value.date !== targetDate || sheet.value.readonly || getDraftOwner() !== targetOwner
    ) {
      throw new Error('表格已切换，请在当前表格重新新增样品格')
    }
    const blockVersionsAtRequest = new Map(blockVersions)
    const retestGenerationAtRequest = retestCollectionGeneration
    adding.value = true
    try {
      const appendedSheet = await addSampleBlocks(targetSheetId, Number(countValue))
      if (
        sheetStateGeneration !== targetSheetGeneration || sheet.value?.id !== targetSheetId ||
        sheet.value.date !== targetDate || sheet.value.readonly || getDraftOwner() !== targetOwner
      ) return
      const preferLocalBlockIds = new Set(
        sheet.value.sampleBlocks
          .filter((block) => (blockVersions.get(block.id) || 0) !== (blockVersionsAtRequest.get(block.id) || 0))
          .map((block) => block.id)
      )
      sheetStateGeneration += 1
      remoteRefreshSequence = 0
      latestAppliedRemoteRefreshSequence = 0
      applyRemoteSheet(appendedSheet, {
        preferLocalBlockIds,
        retainMissingRetests: retestGenerationAtRequest !== retestCollectionGeneration
      })
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
    const retestGenerationAtRequest = retestCollectionGeneration

    try {
      const saved = await saveBlockWithRetry(sheetId, prepared.payload, blockId)
      succeeded = true
      mergeSavedBlock(saved, prepared.fields, sheetId, retestGenerationAtRequest)
      if (preparedBlockSaves.get(blockId)?.prepared === prepared) preparedBlockSaves.delete(blockId)
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
        const businessConflictMessage = getBusinessConflictMessage(error)
        autoSaveStatus.value = 'error'
        autoSaveError.value = businessConflictMessage || (error instanceof Error ? error.message : '自动保存失败')
        ElMessage.error(businessConflictMessage || '自动保存失败，数据已保存在本机草稿中')
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

  function scheduleRetestAutoSave(retestId: string, delayMs = AUTO_SAVE_DELAY_MS) {
    const located = findRetestById(retestId)
    if (!sheet.value || sheet.value.readonly || !located) return
    const { retest } = located
    if (retest.readonly || retest.status !== 'ACTIVE' || retest.sensitiveFieldsHidden) return
    cancelRetestAutoSaveTimer(retestId)
    pendingRetestIds.add(retestId)
    failedRetestIds.delete(retestId)
    if (!failedRetestIds.size && !pendingDirtyFields.size) autoSaveError.value = ''
    autoSaveStatus.value = 'pending'
    syncAutoSaveStatus()
    const timer = window.setTimeout(() => {
      retestAutoSaveTimers.delete(retestId)
      pendingRetestIds.delete(retestId)
      void runRetestAutoSave(retestId)
    }, delayMs)
    retestAutoSaveTimers.set(retestId, timer)
  }

  function runRetestAutoSave(retestId: string): Promise<RetestSaveResult> {
    const previous = retestSaveChains.get(retestId) || Promise.resolve({ retestId, success: true, conflict: false })
    const promise = previous
      .catch(() => ({ retestId, success: false, conflict: false }))
      .then(() => persistQueuedRetest(retestId))
    const chain = promise.finally(() => {
      if (retestSaveChains.get(retestId) === chain) retestSaveChains.delete(retestId)
    })
    retestSaveChains.set(retestId, chain)
    activeRetestSavePromises.add(promise)
    const promisesForRetest = activeRetestSavePromisesById.get(retestId) || new Set<Promise<RetestSaveResult>>()
    promisesForRetest.add(promise)
    activeRetestSavePromisesById.set(retestId, promisesForRetest)
    void promise.finally(() => {
      activeRetestSavePromises.delete(promise)
      promisesForRetest.delete(promise)
      if (!promisesForRetest.size && activeRetestSavePromisesById.get(retestId) === promisesForRetest) {
        activeRetestSavePromisesById.delete(retestId)
      }
    })
    return promise
  }

  async function persistQueuedRetest(retestId: string): Promise<RetestSaveResult> {
    const currentSheet = sheet.value
    const located = findRetestById(retestId)
    const retest = located?.retest
    if (
      !currentSheet || !retest || currentSheet.readonly || retest.readonly ||
      retest.status !== 'ACTIVE' || retest.sensitiveFieldsHidden
    ) {
      pendingRetestIds.delete(retestId)
      syncAutoSaveStatus()
      return { retestId, success: true, conflict: false }
    }
    if (conflictFieldsByRetest.has(retestId)) {
      syncAutoSaveStatus()
      return { retestId, success: false, conflict: true }
    }
    const sheetId = currentSheet.id
    const lifecycleGeneration = getRetestLifecycleGeneration(retestId)
    const prepared = prepareRetestSave(retest)
    if (!prepared) {
      pendingRetestIds.delete(retestId)
      syncAutoSaveStatus()
      return { retestId, success: true, conflict: false }
    }
    let succeeded = false
    pendingRetestIds.delete(retestId)
    activeAutoSaveCount += 1
    activeSavingRetestIds.add(retestId)
    syncAutoSaveStatus()
    try {
      const saved = await saveRetestWithRetry(sheetId, retestId, prepared.payload, lifecycleGeneration)
      succeeded = true
      if (ownsRetestLifecycle(retestId, lifecycleGeneration)) {
        mergeSavedRetest(saved, prepared.fields, sheetId)
        if (preparedRetestSaves.get(retestId)?.prepared === prepared) preparedRetestSaves.delete(retestId)
        lastAutoSavedAt.value = new Date().toISOString()
        failedRetestIds.delete(retestId)
        if (!failedRetestIds.size && !pendingDirtyFields.size) autoSaveError.value = ''
        persistLocalDraft()
      }
    } catch (error) {
      if (!ownsRetestLifecycle(retestId, lifecycleGeneration)) {
        succeeded = true
      } else {
        const conflictRetest = getConflictRetest(error)
        if (conflictRetest && isAuthoritativeTerminalRetest(conflictRetest)) {
          adoptAuthoritativeTerminalRetest(conflictRetest)
          succeeded = true
          autoSaveError.value = ''
        } else if (conflictRetest) {
          failedRetestIds.delete(retestId)
          mergeConflictRetest(conflictRetest, getConflictRetestFields(error))
          autoSaveStatus.value = 'conflict'
          autoSaveError.value = '该复样已被另一台设备修改'
          ElMessage.error('该复样存在修改冲突，已保留本机内容')
        } else if ((error as { response?: { status?: number } })?.response?.status === 409) {
          failedRetestIds.delete(retestId)
          conflictFieldsByRetest.set(retestId, new Set(pendingRetestDirtyFields.get(retestId)?.keys() || []))
          autoSaveStatus.value = 'conflict'
          autoSaveError.value = '该复样保存请求存在冲突'
          ElMessage.error('该复样存在修改冲突，已保留本机内容')
        } else {
          failedRetestIds.add(retestId)
          autoSaveStatus.value = 'error'
          autoSaveError.value = error instanceof Error ? error.message : '复样自动保存失败'
          ElMessage.error('复样自动保存失败，数据已保存在本机草稿中')
        }
        persistLocalDraft()
      }
    } finally {
      retryingRetestIds.delete(retestId)
      if (activeSavingRetestIds.delete(retestId)) {
        activeAutoSaveCount = Math.max(0, activeAutoSaveCount - 1)
      }
      syncAutoSaveStatus(succeeded)
    }
    if (succeeded && pendingRetestDirtyFields.has(retestId) && !retestAutoSaveTimers.has(retestId)) {
      scheduleRetestAutoSave(retestId, 0)
    }
    return { retestId, success: succeeded, conflict: conflictFieldsByRetest.has(retestId) }
  }

  async function saveRetestWithRetry(
    sheetId: string,
    retestId: string,
    payload: SaveSampleRetestPayload,
    lifecycleGeneration: number
  ) {
    let lastError: unknown
    for (let attempt = 0; attempt <= AUTO_SAVE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        if (!ownsRetestLifecycle(retestId, lifecycleGeneration)) throw new Error('复样保存已由服务器新状态替代')
        return await saveSampleRetest(sheetId, retestId, payload)
      } catch (error) {
        lastError = error
        if (
          !ownsRetestLifecycle(retestId, lifecycleGeneration) ||
          !isTransientSaveError(error) || attempt === AUTO_SAVE_RETRY_DELAYS_MS.length
        ) throw error
        retryingRetestIds.add(retestId)
        autoSaveStatus.value = 'retrying'
        autoSaveError.value = '网络不稳定，正在重试保存'
        await wait(AUTO_SAVE_RETRY_DELAYS_MS[attempt])
      }
    }
    throw lastError
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

  function cancelRetestAutoSaveTimer(retestId: string) {
    const timer = retestAutoSaveTimers.get(retestId)
    if (timer) window.clearTimeout(timer)
    retestAutoSaveTimers.delete(retestId)
    pendingRetestIds.delete(retestId)
  }

  function cancelRetestAutoSaveTimers() {
    retestAutoSaveTimers.forEach((timer) => window.clearTimeout(timer))
    retestAutoSaveTimers.clear()
    pendingRetestIds.clear()
  }

  function cleanupRetestSaveState(retestId: string, retireSaveChain = false) {
    if (retireSaveChain) {
      retestLifecycleGenerations.set(retestId, getRetestLifecycleGeneration(retestId) + 1)
      activeRetestSavePromisesById.get(retestId)?.forEach((promise) => {
        activeRetestSavePromises.delete(promise)
      })
      activeRetestSavePromisesById.delete(retestId)
      retestSaveChains.delete(retestId)
      if (activeSavingRetestIds.delete(retestId)) {
        activeAutoSaveCount = Math.max(0, activeAutoSaveCount - 1)
      }
    }
    cancelRetestAutoSaveTimer(retestId)
    pendingRetestDirtyFields.delete(retestId)
    preparedRetestSaves.delete(retestId)
    retestVersions.delete(retestId)
    retryingRetestIds.delete(retestId)
    failedRetestIds.delete(retestId)
    conflictFieldsByRetest.delete(retestId)
  }

  function getRetestLifecycleGeneration(retestId: string) {
    return retestLifecycleGenerations.get(retestId) || 0
  }

  function ownsRetestLifecycle(retestId: string, generation: number) {
    return getRetestLifecycleGeneration(retestId) === generation && !deletedRetestIds.has(retestId)
  }

  function cleanupPreparedCreateRetestRequests(currentSheetId?: string, currentOwner = getDraftOwner()) {
    preparedCreateRetestRequests.forEach((prepared, signature) => {
      if (activeCreateRetestRequests.has(signature)) return
      if (prepared.sheetId !== currentSheetId || prepared.owner !== currentOwner) {
        preparedCreateRetestRequests.delete(signature)
      }
    })
  }

  function resetLocalSaveState() {
    sheetStateGeneration += 1
    remoteRefreshSequence = 0
    latestAppliedRemoteRefreshSequence = 0
    cancelAutoSaveTimers()
    cancelRetestAutoSaveTimers()
    pendingBlockIds.clear()
    pendingDirtyFields.clear()
    pendingChangeLogFields.clear()
    preparedBlockSaves.clear()
    blockVersions.clear()
    retryingBlockIds.clear()
    conflictFieldsByBlock.clear()
    pendingRetestDirtyFields.clear()
    preparedRetestSaves.clear()
    retestVersions.clear()
    retryingRetestIds.clear()
    failedRetestIds.clear()
    conflictFieldsByRetest.clear()
    activeRetestSavePromises.clear()
    activeRetestSavePromisesById.clear()
    retestSaveChains.clear()
    retestLifecycleGenerations.clear()
    deletedRetestIds.clear()
    cleanupPreparedCreateRetestRequests(sheet.value?.id)
    retestCollectionGeneration = 0
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
    if (activeCreateRetestRequests.size) {
      await Promise.allSettled(Array.from(activeCreateRetestRequests.values()))
    }
    if (
      pendingBlockIds.size || pendingDirtyFields.size || activeAutoSavePromises.size || conflictFieldsByBlock.size ||
      pendingRetestIds.size || pendingRetestDirtyFields.size || activeRetestSavePromises.size || conflictFieldsByRetest.size
    ) {
      return persistAllBlocks({ silent: true })
    } else {
      cancelAutoSaveTimers()
      cancelRetestAutoSaveTimers()
      syncAutoSaveStatus()
      return successfulPersistResult()
    }
  }

  function successfulPersistResult(): PersistAllBlocksResult {
    return { success: true, failedBlockIds: [], conflictBlockIds: [] }
  }

  function syncAutoSaveStatus(saved = false) {
    pendingAutoSaveCount.value = new Set([
      ...Array.from(pendingBlockIds, (id) => `block:${id}`),
      ...Array.from(pendingDirtyFields.keys(), (id) => `block:${id}`),
      ...Array.from(pendingRetestIds, (id) => `retest:${id}`),
      ...Array.from(pendingRetestDirtyFields.keys(), (id) => `retest:${id}`)
    ]).size
    autoSaving.value = activeAutoSaveCount > 0
    if (conflictFieldsByBlock.size || conflictFieldsByRetest.size) {
      autoSaveStatus.value = 'conflict'
      return
    }
    if (retryingBlockIds.size || retryingRetestIds.size) {
      autoSaveStatus.value = 'retrying'
      return
    }
    if (pendingBlockIds.size || pendingRetestIds.size) {
      autoSaveStatus.value = 'pending'
      return
    }
    if ((autoSaveError.value || failedRetestIds.size) && (pendingDirtyFields.size || pendingRetestDirtyFields.size)) {
      autoSaveStatus.value = 'error'
      return
    }
    if (pendingDirtyFields.size || pendingRetestDirtyFields.size) {
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

  function cloneRetest(retest: SampleRetest): SampleRetest {
    return JSON.parse(JSON.stringify(retest)) as SampleRetest
  }

  function findRetest(sampleBlockId: string, retestId: string) {
    return sheet.value?.sampleBlocks
      .find((block) => block.id === sampleBlockId)
      ?.retests.find((retest) => retest.id === retestId)
  }

  function findRetestById(retestId: string) {
    for (const block of sheet.value?.sampleBlocks || []) {
      const index = block.retests.findIndex((retest) => retest.id === retestId)
      if (index >= 0) return { block, retest: block.retests[index], index }
    }
    return null
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
    else {
      pendingDirtyFields.delete(block.id)
      preparedBlockSaves.delete(block.id)
    }
    return { changed, hasDirty }
  }

  function trackRetestDirtyFields(retest: SampleRetest, patch: Partial<SampleRetestInput>, revision: number) {
    let fields = pendingRetestDirtyFields.get(retest.id)
    let changed = false
    sampleRetestInputFields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) return
      const oldValue = retest.inputs[field] ?? null
      const nextValue = patch[field] ?? null
      if (isSameValue(oldValue, nextValue)) return
      if (!fields) fields = new Map<SampleRetestInputField, DirtyRetestField>()
      const existing = fields.get(field)
      const baseValue = existing ? existing.baseValue : cloneValue(oldValue)
      if (isSameValue(baseValue, nextValue)) fields.delete(field)
      else fields.set(field, { field, baseValue, revision })
      changed = true
    })
    const hasDirty = Boolean(fields?.size)
    if (hasDirty) pendingRetestDirtyFields.set(retest.id, fields!)
    else {
      pendingRetestDirtyFields.delete(retest.id)
      preparedRetestSaves.delete(retest.id)
      conflictFieldsByRetest.delete(retest.id)
    }
    return { changed, hasDirty }
  }

  function prepareBlockSave(block: SampleBlock): PreparedBlockSave | null {
    const candidate = buildBlockSaveCandidate(block)
    if (!candidate) return null
    const existing = preparedBlockSaves.get(block.id)
    if (existing?.signature === candidate.signature) {
      if (existing.prepared) {
        existing.prepared.fields = candidate.fields
        return existing.prepared
      }
      const prepared = {
        payload: { ...candidate.payload, idempotencyKey: existing.idempotencyKey },
        fields: candidate.fields
      }
      existing.prepared = prepared
      return prepared
    }
    const idempotencyKey = crypto.randomUUID()
    const prepared = {
      payload: { ...candidate.payload, idempotencyKey },
      fields: candidate.fields
    }
    preparedBlockSaves.set(block.id, { signature: candidate.signature, idempotencyKey, prepared })
    return prepared
  }

  function prepareRetestSave(retest: SampleRetest): PreparedRetestSave | null {
    const candidate = buildRetestSaveCandidate(retest)
    if (!candidate) return null
    const existing = preparedRetestSaves.get(retest.id)
    if (existing?.signature === candidate.signature) {
      if (existing.prepared) {
        existing.prepared.fields = candidate.fields
        return existing.prepared
      }
      const prepared = {
        payload: { ...candidate.payload, idempotencyKey: existing.idempotencyKey },
        fields: candidate.fields
      }
      existing.prepared = prepared
      return prepared
    }
    const idempotencyKey = crypto.randomUUID()
    const prepared = {
      payload: { ...candidate.payload, idempotencyKey },
      fields: candidate.fields
    }
    preparedRetestSaves.set(retest.id, { signature: candidate.signature, idempotencyKey, prepared })
    return prepared
  }

  function buildBlockSaveCandidate(block: SampleBlock) {
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
    const payload: SampleBlockSavePayload = {
      id: block.id,
      baseUpdatedAt: block.updatedAt,
      baseInputs,
      changedFields,
      changeLogFields: Array.from(pendingChangeLogFields.get(block.id)?.values() || [])
    }
    return { payload, fields: savedFields, signature: stableSaveSignature(payload) }
  }

  function buildRetestSaveCandidate(retest: SampleRetest) {
    const fields = pendingRetestDirtyFields.get(retest.id)
    if (!fields?.size) return null
    const changedFields: SampleRetestInput = {}
    const baseInputs: SampleRetestInput = {}
    const savedFields: SavedRetestFieldSnapshot[] = []
    fields.forEach((dirty, field) => {
      const value = cloneValue(retest.inputs[field])
      changedFields[field] = value as number | null
      baseInputs[field] = cloneValue(dirty.baseValue) as number | null
      savedFields.push({ field, revision: dirty.revision, value })
    })
    const payload = {
      baseUpdatedAt: retest.updatedAt,
      baseInputs,
      changedFields
    }
    return { payload, fields: savedFields, signature: stableSaveSignature(payload) }
  }

  function stableSaveSignature(payload: unknown) {
    return JSON.stringify(canonicalValue(payload))
  }

  function canonicalValue(value: unknown): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (Array.isArray(value)) return value.map((item) => canonicalValue(item === undefined ? null : item))
    if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(row).sort().flatMap((key) => row[key] === undefined ? [] : [[key, canonicalValue(row[key])]])
      )
    }
    return String(value)
  }

  function mergeSavedBlock(
    saved: SampleBlock,
    sentFields: SavedFieldSnapshot[],
    sheetId: string,
    retestGenerationAtRequest: number
  ) {
    if (sheet.value?.id !== sheetId) return
    const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
    if (index < 0) return
    const localBlock = sheet.value.sampleBlocks[index]
    const dirtyFields = pendingDirtyFields.get(saved.id)
    const changeLogFields = pendingChangeLogFields.get(saved.id)
    const merged = cloneBlock(saved)
    merged.retests = mergeRemoteRetestCollection(saved.retests, localBlock.retests, {
      retainMissingLocal: true,
      preferLocal: retestGenerationAtRequest !== retestCollectionGeneration
    })
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

  function mergeSavedRetest(saved: SampleRetest, sentFields: SavedRetestFieldSnapshot[], sheetId: string) {
    if (sheet.value?.id !== sheetId) return
    const located = findRetestById(saved.id)
    if (!located) return
    const { block, index, retest: localRetest } = located
    if (!canApplyRemoteRetest(saved, localRetest)) return
    const dirtyFields = pendingRetestDirtyFields.get(saved.id)
    const merged = cloneRetest(saved)
    dirtyFields?.forEach((dirty, field) => {
      const sent = sentFields.find((item) => item.field === field)
      const localValue = cloneValue(localRetest.inputs[field])
      const savedValue = cloneValue(saved.inputs[field])
      if (sent && dirty.revision === sent.revision && isSameValue(localValue, sent.value)) {
        dirtyFields.delete(field)
        conflictFieldsByRetest.get(saved.id)?.delete(field)
        return
      }
      merged.inputs[field] = localValue as number | null
      dirty.baseValue = savedValue
    })
    merged.results = calculateSampleResults(merged.inputs, merged.parameterSnapshot)
    block.retests[index] = merged
    retestCollectionGeneration += 1
    if (!dirtyFields?.size) {
      pendingRetestDirtyFields.delete(saved.id)
      pendingRetestIds.delete(saved.id)
      conflictFieldsByRetest.delete(saved.id)
      return
    }
    const conflicts = conflictFieldsByRetest.get(saved.id)
    if (conflicts && !conflicts.size) conflictFieldsByRetest.delete(saved.id)
    pendingRetestDirtyFields.set(saved.id, dirtyFields)
  }

  function mergeConflictRetest(remoteRetest: SampleRetest, conflictFields: SampleRetestInputField[]) {
    if (isAuthoritativeTerminalRetest(remoteRetest)) {
      adoptAuthoritativeTerminalRetest(remoteRetest)
      return
    }
    const located = findRetestById(remoteRetest.id)
    if (!located) return
    const { block, index, retest: localRetest } = located
    const dirtyFields = pendingRetestDirtyFields.get(remoteRetest.id)
    if (!dirtyFields?.size) {
      block.retests[index] = cloneRetest(remoteRetest)
      return
    }
    const merged = cloneRetest(remoteRetest)
    const conflicts = conflictFieldsByRetest.get(remoteRetest.id) || new Set<SampleRetestInputField>()
    dirtyFields.forEach((dirty, field) => {
      merged.inputs[field] = cloneValue(localRetest.inputs[field]) as number | null
      dirty.baseValue = cloneValue(remoteRetest.inputs[field] ?? null)
      if (!conflictFields.length || conflictFields.includes(field)) conflicts.add(field)
    })
    merged.results = calculateSampleResults(merged.inputs, merged.parameterSnapshot)
    pendingRetestDirtyFields.set(remoteRetest.id, dirtyFields)
    conflictFieldsByRetest.set(remoteRetest.id, conflicts)
    preparedRetestSaves.delete(remoteRetest.id)
    block.retests[index] = merged
  }

  function isAuthoritativeTerminalRetest(retest: SampleRetest) {
    return retest.status !== 'ACTIVE' || retest.readonly || retest.sensitiveFieldsHidden
  }

  function canApplyRemoteRetest(
    remoteRetest: SampleRetest,
    localRetest: SampleRetest,
    allowPresentationRestore = false
  ) {
    const remoteUpdatedAt = Date.parse(remoteRetest.updatedAt)
    const localUpdatedAt = Date.parse(localRetest.updatedAt)
    if (Number.isFinite(remoteUpdatedAt) && Number.isFinite(localUpdatedAt)) {
      if (remoteUpdatedAt < localUpdatedAt) return false
    }
    if (localRetest.status === 'VOID' && remoteRetest.status !== 'VOID') return false
    if (isAuthoritativeTerminalRetest(localRetest) && !isAuthoritativeTerminalRetest(remoteRetest)) {
      return Boolean(
        allowPresentationRestore &&
        localRetest.status === 'ACTIVE' && localRetest.sensitiveFieldsHidden &&
        remoteRetest.status === 'ACTIVE' && !remoteRetest.readonly && !remoteRetest.sensitiveFieldsHidden
      )
    }
    return true
  }

  function adoptAuthoritativeTerminalRetest(remoteRetest: SampleRetest) {
    const located = findRetestById(remoteRetest.id)
    cleanupRetestSaveState(remoteRetest.id, true)
    deletedRetestIds.delete(remoteRetest.id)
    if (located) located.block.retests[located.index] = cloneRetest(remoteRetest)
    if (!failedRetestIds.size && !pendingDirtyFields.size) autoSaveError.value = ''
    retestCollectionGeneration += 1
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
      const retests: Record<string, StoredDraftRetest> = {}
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
        const preparedSave = preparedBlockSaves.get(blockId)
        const candidate = buildBlockSaveCandidate(block)
        blocks[blockId] = {
          updatedAt: block.updatedAt,
          fields: storedFields,
          changeLogFields: Array.from(pendingChangeLogFields.get(blockId)?.values() || []),
          preparedSave: preparedSave && candidate?.signature === preparedSave.signature
            ? { signature: preparedSave.signature, idempotencyKey: preparedSave.idempotencyKey }
            : undefined
        }
      })
      pendingRetestDirtyFields.forEach((fields, retestId) => {
        const located = findRetestById(retestId)
        if (!located || !fields.size) return
        const storedFields: StoredDraftRetest['fields'] = {}
        fields.forEach((dirty, field) => {
          storedFields[field] = {
            baseValue: cloneValue(dirty.baseValue),
            value: cloneValue(located.retest.inputs[field]),
            revision: dirty.revision
          }
        })
        const preparedSave = preparedRetestSaves.get(retestId)
        const candidate = buildRetestSaveCandidate(located.retest)
        retests[retestId] = {
          sampleBlockId: located.block.id,
          updatedAt: located.retest.updatedAt,
          fields: storedFields,
          preparedSave: preparedSave && candidate?.signature === preparedSave.signature
            ? { signature: preparedSave.signature, idempotencyKey: preparedSave.idempotencyKey }
            : undefined
        }
      })
      if (!Object.keys(blocks).length && !Object.keys(retests).length) {
        window.localStorage.removeItem(key)
        return
      }
      const draft: StoredLabDraft = {
        version: 2,
        owner: getDraftOwner(),
        sheetId: sheet.value.id,
        date: sheet.value.date,
        expiresAt: Date.now() + DRAFT_TTL_MS,
        blocks,
        retests
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
    if (
      !draft || (draft.version !== 1 && draft.version !== 2) || draft.owner !== getDraftOwner() ||
      draft.sheetId !== sheet.value.id || draft.date !== sheet.value.date || draft.expiresAt <= Date.now()
    ) {
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
      const restoredPrepared = storedBlock.preparedSave
      const candidate = buildBlockSaveCandidate(block)
      if (
        restoredPrepared &&
        typeof restoredPrepared.idempotencyKey === 'string' &&
        restoredPrepared.idempotencyKey.length > 0 &&
        restoredPrepared.idempotencyKey.length <= 200 &&
        candidate?.signature === restoredPrepared.signature
      ) {
        preparedBlockSaves.set(blockId, {
          signature: restoredPrepared.signature,
          idempotencyKey: restoredPrepared.idempotencyKey
        })
      }
      if (!conflicts.size) scheduleBlockAutoSave(blockId, 0)
    })
    if (draft.version === 2) {
      Object.entries(draft.retests || {}).forEach(([retestId, storedRetest]) => {
        const retest = findRetest(storedRetest.sampleBlockId, retestId)
        if (!retest || retest.readonly || retest.status !== 'ACTIVE' || retest.sensitiveFieldsHidden) return
        const dirtyFields = new Map<SampleRetestInputField, DirtyRetestField>()
        const conflicts = new Set<SampleRetestInputField>()
        let maxRevision = retestVersions.get(retestId) || 0
        sampleRetestInputFields.forEach((field) => {
          const stored = storedRetest.fields[field]
          if (!stored) return
          const remoteValue = cloneValue(retest.inputs[field])
          if (isSameValue(remoteValue, stored.value)) return
          retest.inputs[field] = cloneValue(stored.value) as number | null
          const revision = Math.max(Number(stored.revision) || 0, maxRevision + 1)
          maxRevision = Math.max(maxRevision, revision)
          dirtyFields.set(field, { field, baseValue: remoteValue, revision })
          if (!isSameValue(remoteValue, stored.baseValue)) conflicts.add(field)
          restoredCount += 1
        })
        if (!dirtyFields.size) return
        retestVersions.set(retestId, maxRevision)
        pendingRetestDirtyFields.set(retestId, dirtyFields)
        if (conflicts.size) conflictFieldsByRetest.set(retestId, conflicts)
        retest.results = calculateSampleResults(retest.inputs, retest.parameterSnapshot)
        const restoredPrepared = storedRetest.preparedSave
        const candidate = buildRetestSaveCandidate(retest)
        if (
          restoredPrepared && typeof restoredPrepared.idempotencyKey === 'string' &&
          restoredPrepared.idempotencyKey.length > 0 && restoredPrepared.idempotencyKey.length <= 200 &&
          candidate?.signature === restoredPrepared.signature
        ) {
          preparedRetestSaves.set(retestId, {
            signature: restoredPrepared.signature,
            idempotencyKey: restoredPrepared.idempotencyKey
          })
        }
        if (!conflicts.size) scheduleRetestAutoSave(retestId, 0)
      })
    }
    persistLocalDraft()
    syncAutoSaveStatus()
    if (conflictFieldsByBlock.size || conflictFieldsByRetest.size) {
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
    const requestSheetGeneration = sheetStateGeneration
    const requestSequence = ++remoteRefreshSequence
    const requestRetestCollectionGeneration = retestCollectionGeneration
    const requestOwner = getDraftOwner()
    try {
      await accessGuard.loadGroups()
      if (
        sheetStateGeneration !== requestSheetGeneration || getDraftOwner() !== requestOwner ||
        sheet.value?.id !== current.id || sheet.value.date !== current.date
      ) return
      const requestAccessContext = getCompletedSampleAccessContext(accessGuard.groups)
      const remoteSheet = await getLabSheetByDate(current.date)
      const currentAccessContext = getCompletedSampleAccessContext(accessGuard.groups)
      if (
        sheetStateGeneration === requestSheetGeneration &&
        requestSequence > latestAppliedRemoteRefreshSequence &&
        getDraftOwner() === requestOwner &&
        isSameCompletedSampleAccessContext(requestAccessContext, currentAccessContext) &&
        sheet.value?.id === current.id && sheet.value.date === current.date
      ) {
        latestAppliedRemoteRefreshSequence = requestSequence
        applyRemoteSheet(remoteSheet, {
          allowPresentationRestore: requestAccessContext.mode !== 'protected',
          retainMissingRetests: requestRetestCollectionGeneration !== retestCollectionGeneration
        })
        realtimeError.value = ''
      }
    } catch {
      if (
        sheetStateGeneration === requestSheetGeneration &&
        requestSequence > latestAppliedRemoteRefreshSequence &&
        getDraftOwner() === requestOwner
      ) realtimeError.value = '实时同步补拉失败，请检查网络'
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
    if (
      (pendingDirtyFields.size || pendingRetestDirtyFields.size) &&
      !conflictFieldsByBlock.size && !conflictFieldsByRetest.size
    ) await retryFailedSaves()
  }

  function handleVisibilityRecovery() {
    if (document.visibilityState === 'visible') void recoverRealtimeAndPendingSaves()
  }

  function handleRealtimeRecovery() {
    void recoverRealtimeAndPendingSaves()
  }

  function handleRealtimeMessage(rawData: string) {
    let payload: LabSheetRealtimeEvent | RetestChangedRealtimeEvent
    try {
      payload = JSON.parse(rawData) as LabSheetRealtimeEvent | RetestChangedRealtimeEvent
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

    if (payload.type === 'block-saved' || payload.type === 'retests-changed') {
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

  function applyRemoteSheet(
    remoteSheet: LabSheet,
    options: {
      allowPresentationRestore?: boolean
      preferLocalBlockIds?: ReadonlySet<string>
      retainMissingRetests?: boolean
    } = {}
  ) {
    if (!sheet.value) return
    const localBlocks = new Map(sheet.value.sampleBlocks.map((block) => [block.id, block]))
    const nextSheet = cloneSheet(remoteSheet)
    nextSheet.sampleBlocks = nextSheet.sampleBlocks.map((remoteBlock) => {
      const localBlock = localBlocks.get(remoteBlock.id)
      if (!localBlock) return remoteBlock
      const mergedBlock = mergeRemoteBlockState(
        remoteBlock,
        localBlock,
        options.preferLocalBlockIds?.has(remoteBlock.id)
      )
      mergedBlock.retests = mergeRemoteRetestCollection(remoteBlock.retests, localBlock.retests, {
        allowPresentationRestore: options.allowPresentationRestore,
        retainMissingLocal: options.retainMissingRetests
      })
      return mergedBlock
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

  function mergeRemoteRetestCollection(
    remoteRetests: SampleRetest[],
    localRetests: SampleRetest[],
    options: { allowPresentationRestore?: boolean; preferLocal?: boolean; retainMissingLocal?: boolean } = {}
  ) {
    const localById = new Map(localRetests.map((retest) => [retest.id, retest]))
    const merged = remoteRetests.flatMap((remoteRetest) => {
      if (deletedRetestIds.has(remoteRetest.id)) return []
      const localRetest = localById.get(remoteRetest.id)
      if (!localRetest) {
        if (isAuthoritativeTerminalRetest(remoteRetest)) adoptAuthoritativeTerminalRetest(remoteRetest)
        return [cloneRetest(remoteRetest)]
      }
      if (options.preferLocal) return [cloneRetest(localRetest)]
      return [mergeRemoteRetestState(remoteRetest, localRetest, options.allowPresentationRestore)]
    })
    localRetests.forEach((localRetest) => {
      if (merged.some((retest) => retest.id === localRetest.id) || deletedRetestIds.has(localRetest.id)) return
      if (options.retainMissingLocal || pendingRetestDirtyFields.has(localRetest.id)) {
        merged.push(cloneRetest(localRetest))
        return
      }
      deletedRetestIds.add(localRetest.id)
      cleanupRetestSaveState(localRetest.id, true)
    })
    return merged.sort((left, right) => left.sequence - right.sequence)
  }

  function mergeRemoteRetestState(
    remoteRetest: SampleRetest,
    localRetest: SampleRetest,
    allowPresentationRestore = false
  ) {
    if (!canApplyRemoteRetest(remoteRetest, localRetest, allowPresentationRestore)) return cloneRetest(localRetest)
    if (isAuthoritativeTerminalRetest(remoteRetest)) {
      adoptAuthoritativeTerminalRetest(remoteRetest)
      return cloneRetest(remoteRetest)
    }
    const dirtyFields = pendingRetestDirtyFields.get(remoteRetest.id)
    if (!dirtyFields?.size) return cloneRetest(remoteRetest)
    const merged = cloneRetest(remoteRetest)
    const conflicts = conflictFieldsByRetest.get(remoteRetest.id) || new Set<SampleRetestInputField>()
    let rebased = false
    dirtyFields.forEach((dirty, field) => {
      const localValue = cloneValue(localRetest.inputs[field])
      const remoteValue = cloneValue(remoteRetest.inputs[field])
      if (isSameValue(localValue, remoteValue)) {
        dirtyFields.delete(field)
        conflicts.delete(field)
        rebased = true
        return
      }
      merged.inputs[field] = localValue as number | null
      if (!isSameValue(remoteValue, dirty.baseValue)) {
        dirty.baseValue = remoteValue
        conflicts.add(field)
        rebased = true
      } else if (remoteRetest.readonly || remoteRetest.status !== 'ACTIVE' || remoteRetest.sensitiveFieldsHidden) {
        conflicts.add(field)
      }
    })
    merged.results = calculateSampleResults(merged.inputs, merged.parameterSnapshot)
    if (rebased) preparedRetestSaves.delete(remoteRetest.id)
    if (!dirtyFields.size) {
      cleanupRetestSaveState(remoteRetest.id)
      return merged
    }
    pendingRetestDirtyFields.set(remoteRetest.id, dirtyFields)
    if (conflicts.size) conflictFieldsByRetest.set(remoteRetest.id, conflicts)
    else conflictFieldsByRetest.delete(remoteRetest.id)
    return merged
  }

  function mergeRemoteBlockState(remoteBlock: SampleBlock, localBlock: SampleBlock, preferLocal = false) {
    if (preferLocal) return cloneBlock(localBlock)
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
    if (conflictFieldsByBlock.size || conflictFieldsByRetest.size) {
      const conflicts = Array.from(new Set([
        ...conflictFieldsByBlock.keys(),
        ...conflictFieldsByRetest.keys()
      ]))
      return {
        success: false,
        failedBlockIds: conflicts,
        conflictBlockIds: conflicts
      }
    }
    autoSaveError.value = ''
    return persistAllBlocks({ silent: true })
  }

  async function confirmConflictOverwrite() {
    const blockIds = Array.from(new Set([
      ...conflictFieldsByBlock.keys(),
      ...conflictFieldsByRetest.keys()
    ]))
    conflictFieldsByBlock.clear()
    conflictFieldsByRetest.clear()
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

  function getConflictRetest(error: unknown): SampleRetest | null {
    const data = (error as {
      response?: { data?: { retest?: SampleRetest; message?: { retest?: SampleRetest } } }
    })?.response?.data
    return data?.retest || data?.message?.retest || null
  }

  function getConflictRetestFields(error: unknown): SampleRetestInputField[] {
    const data = (error as {
      response?: { data?: { fields?: unknown; message?: { fields?: unknown } } }
    })?.response?.data
    const fields = data?.fields || data?.message?.fields
    if (!Array.isArray(fields)) return []
    return fields.filter((field): field is SampleRetestInputField => (
      typeof field === 'string' && sampleRetestInputFields.includes(field as SampleRetestInputField)
    ))
  }

  function getBusinessConflictMessage(error: unknown): string {
    const response = (error as {
      response?: {
        status?: number
        data?: {
          message?: string | { message?: string; availableBalance?: unknown }
          availableBalance?: unknown
        }
      }
    })?.response
    if (response?.status !== 409 || !response.data) return ''
    const nested = typeof response.data.message === 'object' ? response.data.message : undefined
    const message = typeof response.data.message === 'string'
      ? response.data.message
      : nested?.message || '业务状态已变化，请刷新后重试'
    const availableBalance = response.data.availableBalance ?? nested?.availableBalance
    return availableBalance === undefined || availableBalance === null
      ? message
      : `${message}，当前可用余额：${String(availableBalance)} 元`
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
    createRetests,
    patchRetest,
    commitBlockFieldChange,
    persistBlock,
    persistRetest,
    persistAllBlocks,
    deleteRetestRecord,
    voidRetestRecord,
    retryFailedSaves,
    confirmConflictOverwrite,
    appendSampleBlocks,
    disconnectRealtime
  }
})
