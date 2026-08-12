import { defineStore } from 'pinia'
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import {
  createSharedPrepaidEventSource,
  createSharedPrepaidStreamTicket,
  isSharedPrepaidTerminalAuthError,
  type SharedPrepaidRealtimeEvent,
  type SharedPrepaidRealtimeModule
} from '@/api/sharedPrepaid'
import * as prepaidApi from '@/api/sharedPrepaid'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/types/auth'
import type {
  CreatePrepaidRechargePayload,
  PrepaidConsumptionQuery,
  PrepaidConsumptionFilterOptions,
  PrepaidConsumptionListRow,
  PrepaidConsumptionRow,
  PrepaidMemberDetail,
  PrepaidMemberQuery,
  PrepaidMemberRow,
  PrepaidPage,
  PrepaidPayableRow,
  PrepaidReasonPayload,
  PrepaidRechargeQuery,
  PrepaidRechargeRow,
  PrepaidSettlementPaymentPayload,
  PrepaidSettlementDetailRow,
  PrepaidSettlementPayableListRow,
  PrepaidSettlementPayableQuery,
  PrepaidSettlementPreview,
  PrepaidSettlementQuery,
  PrepaidSettlementRow,
  PrepaidSettlementSummaryRow
} from '@/types/sharedPrepaid'
import { prepaidNormalizePhone } from '@/utils/sharedPrepaidPresentation'

export interface SharedPrepaidRealtimeRegistration {
  isDirty: () => boolean
  refresh: () => void | Promise<void>
}

const RECONNECT_DELAY_MS = 2000
const PREPAID_PERMISSIONS = new Set([
  'PREPAID_RECHARGE',
  'PREPAID_CUSTOMERS',
  'PREPAID_CONSUMPTIONS',
  'PREPAID_SETTLEMENTS'
])

export const SHARED_PREPAID_READ_CANCELLED = 'SHARED_PREPAID_READ_CANCELLED' as const

export class SharedPrepaidReadCancelledError extends Error {
  readonly code = SHARED_PREPAID_READ_CANCELLED

  constructor() {
    super('Shared prepaid read cancelled because the authenticated session changed')
    this.name = 'SharedPrepaidReadCancelledError'
  }
}

export function isSharedPrepaidReadCancelled(error: unknown): error is SharedPrepaidReadCancelledError {
  if (error instanceof SharedPrepaidReadCancelledError) return true
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; name?: unknown }
  return candidate.code === SHARED_PREPAID_READ_CANCELLED &&
    candidate.name === 'SharedPrepaidReadCancelledError'
}

type SharedPrepaidPage = SharedPrepaidRealtimeModule
type SharedPrepaidMutation =
  | 'createRecharge'
  | `reverseRecharge:${string}`
  | `reverseConsumption:${string}`
  | 'createSettlement'
  | `submitPayment:${string}`
  | `confirmSettlement:${string}`
  | `rejectSettlement:${string}`
  | `cancelSettlement:${string}`

const emptyPage = <T>(): PrepaidPage<T> => ({ items: [], total: 0, page: 1, pageSize: 20 })
const emptyRechargeDraft = (): CreatePrepaidRechargePayload => ({
  phone: '',
  rechargeDate: '',
  paidAmount: '',
  giftAmount: '',
  isOpeningBalance: false,
  remark: ''
})

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize)
    if (item && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)])
      )
    }
    return item
  }
  return JSON.stringify(normalize(value))
}

export function sharedPrepaidAuthSessionSignature(token: string, user: AuthUser | null): string {
  return canonicalJson({
    token,
    actorUserId: user?.id ?? '',
    dataOwnerId: user?.dataOwnerId ?? user?.id ?? '',
    permissionVersion: user?.permissionVersion ?? '',
    role: user?.role ?? '',
    permissions: [...(user?.permissions ?? [])].sort()
  })
}

function canonicalMoney(value: string | number) {
  const raw = String(value).trim()
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(raw)
  if (!match || (!match[2] && !match[3])) return raw
  const whole = (match[2] || '0').replace(/^0+(?=\d)/, '')
  const fraction = (match[3] || '').replace(/0+$/, '')
  const unsigned = fraction ? `${whole}.${fraction}` : whole
  return match[1] === '-' && unsigned !== '0' ? `-${unsigned}` : unsigned
}

function canonicalDateTime(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value.trim() : parsed.toISOString()
}

export const useSharedPrepaidStore = defineStore('sharedPrepaid', () => {
  const authStore = useAuthStore()
  let mutationSessionVersion = 0
  let readSessionEpoch = 0
  const loadingCounts = reactive<Record<SharedPrepaidPage, number>>({
    recharges: 0,
    members: 0,
    consumptions: 0,
    settlements: 0
  })
  const loadingByPage = computed<Record<SharedPrepaidPage, boolean>>(() => ({
    recharges: loadingCounts.recharges > 0,
    members: loadingCounts.members > 0,
    consumptions: loadingCounts.consumptions > 0,
    settlements: loadingCounts.settlements > 0
  }))
  const dirtyByPage = reactive<Record<SharedPrepaidPage, boolean>>({
    recharges: false,
    members: false,
    consumptions: false,
    settlements: false
  })
  const errorsByPage = reactive<Record<SharedPrepaidPage, string>>({
    recharges: '',
    members: '',
    consumptions: '',
    settlements: ''
  })
  const pendingIdempotencyKeys = reactive<Partial<Record<SharedPrepaidMutation, string>>>({})
  const preparedMutationKeys = new Map<string, string>()
  const pendingMutationFingerprints = new Map<string, string>()
  const loadGenerations = new Map<string, number>()
  const mutationQueues = new Map<string, Promise<void>>()
  const inFlightMutationPromises = new Map<string, Promise<unknown>>()
  const mutationPendingCounts = new Map<string, number>()
  const mutationInvocationVersions = new Map<string, number>()
  const settlementDirtyState = reactive({ selection: false, payment: false, manual: false })
  const membersPage = ref<PrepaidPage<PrepaidMemberRow>>(emptyPage())
  const rechargesPage = ref<PrepaidPage<PrepaidRechargeRow>>(emptyPage())
  const selectedMember = ref<PrepaidMemberDetail | null>(null)
  const consumptionsPage = ref<PrepaidPage<PrepaidConsumptionListRow>>(emptyPage())
  const consumptionFilterOptions = ref<PrepaidConsumptionFilterOptions>({ sourceOwners: [], consumingOwners: [] })
  const consumptions = ref<PrepaidConsumptionRow[]>([])
  const payables = ref<PrepaidPayableRow[]>([])
  const settlementPayablesPage = ref<PrepaidPage<PrepaidSettlementPayableListRow>>(emptyPage())
  const settlementPreview = ref<PrepaidSettlementPreview | null>(null)
  const settlements = ref<PrepaidSettlementRow[]>([])
  const settlementsPage = ref<PrepaidPage<PrepaidSettlementSummaryRow>>(emptyPage())
  const selectedSettlement = ref<PrepaidSettlementDetailRow | null>(null)
  const rechargeDraft = ref<CreatePrepaidRechargePayload>(emptyRechargeDraft())
  const settlementSelection = ref<string[]>([])
  const selectedSettlementPayablesById = reactive<Record<string, PrepaidSettlementPayableListRow>>({})
  const selectedSettlementPayableRows = computed(() => (
    settlementSelection.value.map((id) => selectedSettlementPayablesById[id])
  ))
  const settlementPaymentDrafts = reactive<Record<string, PrepaidSettlementPaymentPayload>>({})
  const realtimeConnected = ref(false)
  const realtimeAuthTerminal = ref(false)
  const refreshPromptModules = ref<SharedPrepaidRealtimeModule[]>([])
  const registrations = new Map<SharedPrepaidRealtimeModule, SharedPrepaidRealtimeRegistration>()
  const refreshing = new Set<SharedPrepaidRealtimeModule>()
  const trailingRefresh = new Set<SharedPrepaidRealtimeModule>()
  let source: EventSource | null = null
  let reconnectTimer: number | undefined
  let connectionEpoch = 0
  let connectingEpoch: number | null = null

  const hasRefreshPrompt = computed(() => refreshPromptModules.value.length > 0)
  const authSessionSignature = computed(() => (
    sharedPrepaidAuthSessionSignature(authStore.token, authStore.user)
  ))

  function currentMutationScope() {
    return `${mutationSessionVersion}\u0000${authSessionSignature.value}`
  }

  function clearPreparedMutationIdentities() {
    preparedMutationKeys.clear()
    pendingMutationFingerprints.clear()
    for (const mutation of Object.keys(pendingIdempotencyKeys) as SharedPrepaidMutation[]) {
      delete pendingIdempotencyKeys[mutation]
    }
  }

  function clearAccountDerivedState() {
    membersPage.value = emptyPage()
    rechargesPage.value = emptyPage()
    selectedMember.value = null
    consumptionsPage.value = emptyPage()
    consumptionFilterOptions.value = { sourceOwners: [], consumingOwners: [] }
    consumptions.value = []
    payables.value = []
    settlementPayablesPage.value = emptyPage()
    settlementPreview.value = null
    settlements.value = []
    settlementsPage.value = emptyPage()
    selectedSettlement.value = null
    rechargeDraft.value = emptyRechargeDraft()
    settlementSelection.value = []
    for (const id of Object.keys(selectedSettlementPayablesById)) {
      delete selectedSettlementPayablesById[id]
    }
    for (const id of Object.keys(settlementPaymentDrafts)) delete settlementPaymentDrafts[id]
    settlementDirtyState.selection = false
    settlementDirtyState.payment = false
    settlementDirtyState.manual = false
    for (const page of Object.keys(dirtyByPage) as SharedPrepaidPage[]) dirtyByPage[page] = false
  }

  async function runPage<T>(
    page: SharedPrepaidPage,
    action: () => Promise<T>,
    apply?: (result: T) => void
  ): Promise<T> {
    const sessionEpoch = readSessionEpoch
    loadingCounts[page] += 1
    errorsByPage[page] = ''
    try {
      const result = await action()
      if (readSessionEpoch !== sessionEpoch) throw new SharedPrepaidReadCancelledError()
      apply?.(result)
      return result
    } catch (error) {
      if (readSessionEpoch !== sessionEpoch) throw new SharedPrepaidReadCancelledError()
      if (isSharedPrepaidReadCancelled(error)) throw error
      errorsByPage[page] = error instanceof Error ? error.message : '操作失败'
      throw error
    } finally {
      if (readSessionEpoch === sessionEpoch) loadingCounts[page] -= 1
    }
  }

  async function runLatest<T>(
    resource: string,
    page: SharedPrepaidPage,
    action: () => Promise<T>,
    apply: (result: T) => void
  ): Promise<T> {
    const sessionEpoch = readSessionEpoch
    const generation = (loadGenerations.get(resource) ?? 0) + 1
    loadGenerations.set(resource, generation)
    loadingCounts[page] += 1
    errorsByPage[page] = ''
    try {
      const result = await action()
      if (readSessionEpoch !== sessionEpoch) throw new SharedPrepaidReadCancelledError()
      if (loadGenerations.get(resource) === generation) apply(result)
      return result
    } catch (error) {
      if (readSessionEpoch !== sessionEpoch) throw new SharedPrepaidReadCancelledError()
      if (isSharedPrepaidReadCancelled(error)) throw error
      if (loadGenerations.get(resource) === generation) {
        errorsByPage[page] = error instanceof Error ? error.message : '操作失败'
      }
      throw error
    } finally {
      if (readSessionEpoch === sessionEpoch) loadingCounts[page] -= 1
    }
  }

  function syncSettlementDirty() {
    dirtyByPage.settlements = settlementDirtyState.manual ||
      settlementDirtyState.selection || settlementDirtyState.payment
  }

  function setPageDirty(page: SharedPrepaidPage, dirty = true) {
    if (page === 'settlements') {
      settlementDirtyState.manual = dirty
      syncSettlementDirty()
      return
    }
    dirtyByPage[page] = dirty
  }

  function setRechargeDraft(draft: CreatePrepaidRechargePayload) {
    rechargeDraft.value = { ...draft }
    setPageDirty('recharges')
  }

  function setSettlementSelection(ids: string[]) {
    const selectedIds = new Set(ids)
    for (const row of settlementPayablesPage.value.items) {
      if (selectedIds.has(row.id)) selectedSettlementPayablesById[row.id] = row
    }
    for (const id of Object.keys(selectedSettlementPayablesById)) {
      if (!selectedIds.has(id)) delete selectedSettlementPayablesById[id]
    }
    settlementSelection.value = [...ids]
    settlementPreview.value = null
    settlementDirtyState.selection = ids.length > 0
    syncSettlementDirty()
  }

  function mergeSelectedSettlementPayables(rows: PrepaidSettlementPayableListRow[]) {
    const selectedIds = new Set(settlementSelection.value)
    for (const row of rows) {
      if (selectedIds.has(row.id)) selectedSettlementPayablesById[row.id] = row
    }
  }

  function getSettlementPaymentDraft(id: string): PrepaidSettlementPaymentPayload {
    const draft = settlementPaymentDrafts[id]
    return draft
      ? { ...draft, proofUrls: draft.proofUrls ? [...draft.proofUrls] : undefined }
      : { actualTransferredAt: '' }
  }

  function setSettlementPaymentDraftFor(id: string, draft: PrepaidSettlementPaymentPayload) {
    settlementPaymentDrafts[id] = {
      ...draft,
      proofUrls: draft.proofUrls ? [...draft.proofUrls] : undefined
    }
    settlementDirtyState.payment = Object.values(settlementPaymentDrafts).some(isPaymentDraftDirty)
    syncSettlementDirty()
  }

  function clearSettlementPaymentDraft(id: string) {
    delete settlementPaymentDrafts[id]
    settlementDirtyState.payment = Object.values(settlementPaymentDrafts).some(isPaymentDraftDirty)
    syncSettlementDirty()
  }

  async function loadMembers(query: PrepaidMemberQuery = {}) {
    return runLatest('members:list', 'members', () => prepaidApi.getPrepaidMembers(query), (result) => {
      membersPage.value = result
    })
  }

  async function lookupMember(phone: string) {
    return runLatest('members:lookup', 'members', () => prepaidApi.lookupPrepaidMember(phone), () => undefined)
  }

  async function lookupLabMember(phone: string) {
    return runLatest('members:lab-lookup', 'members', () => prepaidApi.lookupLabPrepaidMember(phone), () => undefined)
  }

  async function loadMemberDetail(
    id: string,
    page: 'members' | 'consumptions' = 'members'
  ) {
    return runLatest('member:detail', page, () => prepaidApi.getPrepaidMemberDetail(id), (result) => {
      selectedMember.value = result
      consumptions.value = result.consumptions
      payables.value = result.consumptions.flatMap((row) => row.payables)
    })
  }

  async function loadMoreMemberHistory(
    collection: 'recharges' | 'consumptions' | 'ledgerEntries'
  ) {
    const current = selectedMember.value
    if (!current) return null
    const nextPage = current.historyPagination[collection].nextPage
    if (!nextPage) return current
    const pageKey = collection === 'recharges'
      ? 'rechargePage'
      : collection === 'consumptions' ? 'consumptionPage' : 'ledgerPage'
    return runLatest(
      `member:detail:${current.id}:${collection}`,
      'members',
      () => prepaidApi.getPrepaidMemberDetail(current.id, {
        historyPageSize: current.historyPagination.pageSize,
        [pageKey]: nextPage
      }),
      (result) => {
        if (selectedMember.value?.id !== current.id) return
        const merged = {
          ...selectedMember.value,
          [collection]: [...selectedMember.value[collection], ...result[collection]],
          historyPagination: {
            ...selectedMember.value.historyPagination,
            [collection]: result.historyPagination[collection]
          }
        }
        selectedMember.value = merged
        if (collection === 'consumptions') {
          consumptions.value = merged.consumptions
          payables.value = merged.consumptions.flatMap((row) => row.payables)
        }
      }
    )
  }

  async function loadRecharges(query: PrepaidRechargeQuery = {}) {
    return runLatest('recharges:list', 'recharges', () => prepaidApi.getPrepaidRecharges(query), (result) => {
      rechargesPage.value = result
    })
  }

  async function loadConsumptions(query: PrepaidConsumptionQuery = {}) {
    return runLatest('consumptions:list', 'consumptions', () => prepaidApi.getPrepaidConsumptions(query), (result) => {
      consumptionsPage.value = result
    })
  }

  async function loadConsumptionFilterOptions() {
    return runLatest(
      'consumptions:filter-options',
      'consumptions',
      () => prepaidApi.getPrepaidConsumptionFilterOptions(),
      (result) => { consumptionFilterOptions.value = result }
    )
  }

  async function loadSettlementPayables(query: PrepaidSettlementPayableQuery = {}) {
    return runLatest('settlements:payables', 'settlements', () => (
      prepaidApi.getPrepaidSettlementPayables(query)
    ), (result) => {
      settlementPayablesPage.value = result
      mergeSelectedSettlementPayables(result.items)
    })
  }

  async function refreshSelectedSettlementPayables(ids: string[]) {
    if (!ids.length) return
    const chunks: string[][] = []
    for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100))
    return runPage('settlements', () => Promise.all(chunks.map((payableIds) => (
      prepaidApi.getPrepaidSettlementPayables({
        page: 1,
        pageSize: payableIds.length,
        payableIds
      })
    ))), (results) => {
      const updates = new Map(results.flatMap((result) => result.items).map((row) => [row.id, row]))
      const selectedIds = new Set(ids)
      settlementPayablesPage.value = {
        ...settlementPayablesPage.value,
        items: settlementPayablesPage.value.items.map((row) => (
          selectedIds.has(row.id) ? updates.get(row.id) ?? { ...row, eligible: false } : row
        ))
      }
      for (const id of ids) {
        const update = updates.get(id)
        if (update) selectedSettlementPayablesById[id] = update
        else if (selectedSettlementPayablesById[id]) {
          selectedSettlementPayablesById[id] = { ...selectedSettlementPayablesById[id], eligible: false }
        }
      }
      settlementPreview.value = null
    })
  }

  async function loadSettlements(query: PrepaidSettlementQuery = {}) {
    return runLatest('settlements:list', 'settlements', () => (
      prepaidApi.getPrepaidSettlements(query)
    ), (result) => {
      settlementsPage.value = result
    })
  }

  async function loadSettlementDetail(id: string) {
    return runLatest(`settlements:detail:${id}`, 'settlements', () => (
      prepaidApi.getPrepaidSettlement(id)
    ), (result) => {
      selectedSettlement.value = result
    })
  }

  function mutate<T>(
    page: SharedPrepaidPage,
    mutation: SharedPrepaidMutation,
    explicitKey: string | undefined,
    action: (key: string) => Promise<T>,
    afterSuccess?: (result: T, isLatestInvocation: boolean) => void,
    requestFingerprint = ''
  ): Promise<T> {
    const mutationScope = currentMutationScope()
    const inFlightKey = `${mutationScope}\u0000${mutation}\u0000${explicitKey ?? ''}\u0000${requestFingerprint}`
    const existing = inFlightMutationPromises.get(inFlightKey)
    if (existing) return existing as Promise<T>
    const promise = executeMutation(
      page, mutationScope, mutation, explicitKey, action, afterSuccess, requestFingerprint
    )
    inFlightMutationPromises.set(inFlightKey, promise)
    void promise.finally(() => {
      if (inFlightMutationPromises.get(inFlightKey) === promise) inFlightMutationPromises.delete(inFlightKey)
    }).catch(() => undefined)
    return promise
  }

  async function executeMutation<T>(
    page: SharedPrepaidPage,
    mutationScope: string,
    mutation: SharedPrepaidMutation,
    explicitKey: string | undefined,
    action: (key: string) => Promise<T>,
    afterSuccess?: (result: T, isLatestInvocation: boolean) => void,
    requestFingerprint = ''
  ) {
    const scopedMutation = `${mutationScope}\u0000${mutation}`
    const pendingCount = mutationPendingCounts.get(scopedMutation) ?? 0
    const pendingKeyMatchesRequest = pendingMutationFingerprints.get(scopedMutation) === requestFingerprint
    if (pendingCount === 0 && !explicitKey && preparedMutationKeys.has(scopedMutation) && !pendingKeyMatchesRequest) {
      preparedMutationKeys.delete(scopedMutation)
      delete pendingIdempotencyKeys[mutation]
      pendingMutationFingerprints.delete(scopedMutation)
    }
    const key = explicitKey ?? (
      pendingCount === 0 && pendingKeyMatchesRequest ? preparedMutationKeys.get(scopedMutation) : undefined
    ) ?? crypto.randomUUID()
    const invocationVersion = (mutationInvocationVersions.get(scopedMutation) ?? 0) + 1
    mutationInvocationVersions.set(scopedMutation, invocationVersion)
    mutationPendingCounts.set(scopedMutation, pendingCount + 1)

    const previous = mutationQueues.get(scopedMutation) ?? Promise.resolve()
    const execution = previous.then(() => {
      if (currentMutationScope() !== mutationScope) {
        throw new Error('登录身份已变更，请重新提交')
      }
      loadingCounts[page] += 1
      errorsByPage[page] = ''
      return action(key).catch((error) => {
        if (currentMutationScope() === mutationScope) {
          errorsByPage[page] = error instanceof Error ? error.message : '操作失败'
        }
        throw error
      }).finally(() => {
        if (currentMutationScope() === mutationScope) loadingCounts[page] -= 1
      })
    })
    const queueTail = execution.then(() => undefined, () => undefined)
    mutationQueues.set(scopedMutation, queueTail)

    try {
      const result = await execution
      const isCurrentIdentity = currentMutationScope() === mutationScope
      const isLatestInvocation = isCurrentIdentity &&
        mutationInvocationVersions.get(scopedMutation) === invocationVersion
      if (isLatestInvocation) {
        preparedMutationKeys.delete(scopedMutation)
        delete pendingIdempotencyKeys[mutation]
        pendingMutationFingerprints.delete(scopedMutation)
      }
      if (isCurrentIdentity) afterSuccess?.(result, isLatestInvocation)
      return result
    } catch (error) {
      if (
        currentMutationScope() === mutationScope &&
        mutationInvocationVersions.get(scopedMutation) === invocationVersion
      ) {
        // Any failed response may have been committed before the connection was lost.
        // Keeping the prepared request identity is safe for definitive 4xx failures too;
        // only confirmed success or a canonical payload change rotates it.
        preparedMutationKeys.set(scopedMutation, key)
        pendingIdempotencyKeys[mutation] = key
        pendingMutationFingerprints.set(scopedMutation, requestFingerprint)
      }
      throw error
    } finally {
      const remaining = (mutationPendingCounts.get(scopedMutation) ?? 1) - 1
      if (remaining > 0) mutationPendingCounts.set(scopedMutation, remaining)
      else {
        mutationPendingCounts.delete(scopedMutation)
        mutationInvocationVersions.delete(scopedMutation)
      }
      if (mutationQueues.get(scopedMutation) === queueTail) mutationQueues.delete(scopedMutation)
    }
  }

  async function createRecharge(
    payload: CreatePrepaidRechargePayload = rechargeDraft.value,
    idempotencyKey?: string
  ) {
    const requestPayload = { ...payload, phone: prepaidNormalizePhone(payload.phone) }
    return mutate('recharges', 'createRecharge', idempotencyKey, (key) => (
      prepaidApi.createPrepaidRecharge(requestPayload, key)
    ), (_result, isLatestInvocation) => {
      if (isLatestInvocation) {
        rechargeDraft.value = emptyRechargeDraft()
        setPageDirty('recharges', false)
      }
    }, canonicalJson({
      phone: requestPayload.phone,
      rechargeDate: requestPayload.rechargeDate.trim(),
      paidAmount: canonicalMoney(requestPayload.paidAmount),
      giftAmount: canonicalMoney(requestPayload.giftAmount),
      isOpeningBalance: requestPayload.isOpeningBalance === true,
      remark: requestPayload.remark?.trim() || null
    }))
  }

  async function reverseRecharge(id: string, reason: string, idempotencyKey?: string) {
    const payload: PrepaidReasonPayload = { reason }
    return mutate('recharges', `reverseRecharge:${id}`, idempotencyKey, (key) => (
      prepaidApi.reversePrepaidRecharge(id, payload, key)
    ), undefined, canonicalJson({ reason: reason.trim() }))
  }

  async function reverseConsumption(id: string, reason: string, idempotencyKey?: string) {
    const payload: PrepaidReasonPayload = { reason }
    return mutate('consumptions', `reverseConsumption:${id}`, idempotencyKey, (key) => (
      prepaidApi.reversePrepaidConsumption(id, payload, key)
    ), undefined, canonicalJson({ reason: reason.trim() }))
  }

  async function previewSettlement(ids: string[] = settlementSelection.value) {
    const payableIds = [...ids]
    return runLatest('settlements:preview', 'settlements', () => (
      prepaidApi.previewPrepaidSettlement({ payableIds })
    ), (result) => {
      settlementPreview.value = result
    })
  }

  async function createSettlement(ids: string[] = settlementSelection.value, idempotencyKey?: string) {
    const payableIds = [...ids]
    return mutate('settlements', 'createSettlement', idempotencyKey, (key) => (
      prepaidApi.createPrepaidSettlement({ payableIds }, key)
    ), (row, isLatestInvocation) => {
      upsertSettlement(row)
      if (isLatestInvocation) {
        setSettlementSelection([])
      }
    }, canonicalJson([...payableIds].sort()))
  }

  async function submitSettlementPayment(
    id: string,
    payload: PrepaidSettlementPaymentPayload = getSettlementPaymentDraft(id),
    idempotencyKey?: string
  ) {
    const requestPayload = {
      ...payload,
      proofUrls: payload.proofUrls ? [...payload.proofUrls] : undefined
    }
    return mutate('settlements', `submitPayment:${id}`, idempotencyKey, (key) => (
      prepaidApi.submitPrepaidSettlementPayment(id, requestPayload, key)
    ), (row, isLatestInvocation) => {
      upsertSettlement(row)
      if (isLatestInvocation) {
        clearSettlementPaymentDraft(id)
      }
    }, canonicalJson({
      actualTransferredAt: canonicalDateTime(requestPayload.actualTransferredAt),
      proofUrls: (requestPayload.proofUrls ?? []).map((url) => url.trim()),
      remark: requestPayload.remark?.trim() || null
    }))
  }

  function confirmSettlement(id: string, idempotencyKey?: string) {
    return mutate('settlements', `confirmSettlement:${id}`, idempotencyKey, (key) => (
      prepaidApi.confirmPrepaidSettlement(id, key)
    ), upsertSettlement, id)
  }

  function rejectSettlement(id: string, reason: string, idempotencyKey?: string) {
    return mutate('settlements', `rejectSettlement:${id}`, idempotencyKey, (key) => (
      prepaidApi.rejectPrepaidSettlement(id, { reason }, key)
    ), upsertSettlement, reason.trim())
  }

  function cancelSettlement(id: string, idempotencyKey?: string) {
    return mutate('settlements', `cancelSettlement:${id}`, idempotencyKey, (key) => (
      prepaidApi.cancelPrepaidSettlement(id, key)
    ), upsertSettlement, id)
  }

  function upsertSettlement(row: PrepaidSettlementRow) {
    const index = settlements.value.findIndex((item) => item.id === row.id)
    if (index >= 0) settlements.value[index] = row
    else settlements.value.unshift(row)
    const pageIndex = settlementsPage.value.items.findIndex((item) => item.id === row.id)
    if (pageIndex >= 0) {
      settlementsPage.value.items[pageIndex] = mergeSettlementSummary(settlementsPage.value.items[pageIndex], row)
    }
    if (selectedSettlement.value?.id === row.id) {
      selectedSettlement.value = mergeSettlementDetail(selectedSettlement.value, row)
    }
  }

  function canUseRealtime() {
    const user = authStore.user
    if (!authStore.isLoggedIn || !user) return false
    if (user.role === 'FRONTEND_USER') return true
    return user.role === 'FRONTEND_SUB_USER' &&
      Boolean(user.permissions?.some((permission) => PREPAID_PERMISSIONS.has(permission)))
  }

  function registerModule(
    module: SharedPrepaidRealtimeModule,
    registration: SharedPrepaidRealtimeRegistration
  ) {
    registrations.set(module, registration)
    return () => {
      if (registrations.get(module) === registration) registrations.delete(module)
    }
  }

  async function refreshModule(module: SharedPrepaidRealtimeModule): Promise<void> {
    const sessionEpoch = readSessionEpoch
    const registration = registrations.get(module)
    if (!registration) return
    if (registration.isDirty()) {
      markRefreshPrompt(module)
      return
    }
    if (refreshing.has(module)) {
      trailingRefresh.add(module)
      return
    }

    refreshing.add(module)
    try {
      // Coalesce synchronous bursts and re-check draft state immediately before starting I/O.
      await Promise.resolve()
      if (readSessionEpoch !== sessionEpoch) return
      if (registrations.get(module) !== registration) return
      if (registration.isDirty()) {
        markRefreshPrompt(module)
        return
      }
      try {
        await registration.refresh()
        if (readSessionEpoch === sessionEpoch) clearRefreshPrompt(module)
      } catch {
        // The invalidation remains pending and the page can call acknowledgeAndRefresh to retry.
        if (readSessionEpoch === sessionEpoch) markRefreshPrompt(module, true)
      }
    } finally {
      if (readSessionEpoch !== sessionEpoch) return
      refreshing.delete(module)
      if (trailingRefresh.delete(module)) void refreshModule(module)
    }
  }

  function handleRealtimeEvent(event: SharedPrepaidRealtimeEvent): Promise<void> {
    if (event.type !== 'change') return Promise.resolve()
    return refreshModule(event.module)
  }

  function markRefreshPrompt(module: SharedPrepaidRealtimeModule, refreshFailed = false) {
    if (refreshPromptModules.value.includes(module)) return
    refreshPromptModules.value = [...refreshPromptModules.value, module]
    ElMessage.warning(refreshFailed
      ? '共享预存款刷新失败，新数据提示已保留，请点击刷新重试'
      : '共享预存款已有新数据，已保留你尚未提交的内容，请保存或放弃后刷新')
  }

  function clearRefreshPrompt(module?: SharedPrepaidRealtimeModule) {
    refreshPromptModules.value = module
      ? refreshPromptModules.value.filter((item) => item !== module)
      : []
  }

  async function acknowledgeAndRefresh(module: SharedPrepaidRealtimeModule) {
    const registration = registrations.get(module)
    if (!registration || registration.isDirty()) {
      markRefreshPrompt(module)
      return
    }
    await refreshModule(module)
  }

  async function connectRealtime() {
    if (source || connectingEpoch !== null || realtimeAuthTerminal.value || !canUseRealtime()) return
    const attempt = ++connectionEpoch
    connectingEpoch = attempt
    try {
      const { ticket } = await createSharedPrepaidStreamTicket()
      if (attempt !== connectionEpoch || !canUseRealtime() || realtimeAuthTerminal.value) return
      const nextSource = createSharedPrepaidEventSource(ticket)
      if (!nextSource) return
      source = nextSource
      nextSource.onopen = () => {
        if (source === nextSource) realtimeConnected.value = true
      }
      nextSource.onmessage = (message) => {
        try {
          void handleRealtimeEvent(JSON.parse(message.data) as SharedPrepaidRealtimeEvent)
        } catch {
          // SSE carries invalidation metadata only; malformed or future-version signals are ignored.
        }
      }
      nextSource.onerror = () => {
        if (source !== nextSource) return
        realtimeConnected.value = false
        nextSource.close()
        source = null
        scheduleReconnect()
      }
    } catch (error) {
      if (attempt !== connectionEpoch) return
      if (isSharedPrepaidTerminalAuthError(error)) {
        realtimeAuthTerminal.value = true
        cancelReconnect()
      } else {
        scheduleReconnect()
      }
    } finally {
      if (connectingEpoch === attempt) connectingEpoch = null
    }
  }

  function scheduleReconnect() {
    if (realtimeAuthTerminal.value || !canUseRealtime()) return
    cancelReconnect()
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      if (!realtimeAuthTerminal.value && canUseRealtime()) void connectRealtime()
    }, RECONNECT_DELAY_MS)
  }

  function cancelReconnect() {
    if (reconnectTimer !== undefined) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
  }

  function disconnectRealtime(clearPrompts = true) {
    connectionEpoch += 1
    connectingEpoch = null
    cancelReconnect()
    source?.close()
    source = null
    realtimeConnected.value = false
    refreshing.clear()
    trailingRefresh.clear()
    if (clearPrompts) clearRefreshPrompt()
  }

  watch(
    authSessionSignature,
    () => {
      mutationSessionVersion += 1
      readSessionEpoch += 1
      loadGenerations.clear()
      for (const page of Object.keys(loadingCounts) as SharedPrepaidPage[]) {
        loadingCounts[page] = 0
        errorsByPage[page] = ''
      }
      clearPreparedMutationIdentities()
      clearAccountDerivedState()
      disconnectRealtime()
      realtimeAuthTerminal.value = false
      if (canUseRealtime()) void connectRealtime()
      else if (authStore.isLoggedIn) realtimeAuthTerminal.value = true
    },
    { flush: 'sync', immediate: true }
  )
  onScopeDispose(() => disconnectRealtime())

  return {
    loadingByPage,
    dirtyByPage,
    errorsByPage,
    pendingIdempotencyKeys,
    membersPage,
    rechargesPage,
    selectedMember,
    consumptionsPage,
    consumptionFilterOptions,
    consumptions,
    payables,
    settlementPayablesPage,
    settlementPreview,
    settlements,
    settlementsPage,
    selectedSettlement,
    rechargeDraft,
    settlementSelection,
    selectedSettlementPayableRows,
    settlementPaymentDrafts,
    realtimeConnected,
    realtimeAuthTerminal,
    refreshPromptModules,
    hasRefreshPrompt,
    setPageDirty,
    setRechargeDraft,
    setSettlementSelection,
    getSettlementPaymentDraft,
    setSettlementPaymentDraftFor,
    clearSettlementPaymentDraft,
    loadMembers,
    lookupMember,
    lookupLabMember,
    loadMemberDetail,
    loadMoreMemberHistory,
    loadRecharges,
    loadConsumptions,
    loadConsumptionFilterOptions,
    loadSettlementPayables,
    refreshSelectedSettlementPayables,
    loadSettlements,
    loadSettlementDetail,
    createRecharge,
    reverseRecharge,
    reverseConsumption,
    previewSettlement,
    createSettlement,
    submitSettlementPayment,
    confirmSettlement,
    rejectSettlement,
    cancelSettlement,
    registerModule,
    handleRealtimeEvent,
    acknowledgeAndRefresh,
    clearRefreshPrompt,
    connectRealtime,
    disconnectRealtime
  }
})

function isPaymentDraftDirty(draft: PrepaidSettlementPaymentPayload) {
  return Boolean(draft.actualTransferredAt?.trim() || draft.proofUrls?.length || draft.remark?.trim())
}

function mergeSettlementDetail(detail: PrepaidSettlementDetailRow, mutation: PrepaidSettlementRow) {
  const { lines: mutationLines, ...fields } = mutation
  const linesById = new Map(mutationLines.map((line) => [line.id, line]))
  return {
    ...detail,
    ...fields,
    lines: detail.lines.map((line) => {
      const update = linesById.get(line.id)
      return update
        ? { ...line, ...update, payable: { ...line.payable, status: update.payableStatus } }
        : line
    })
  }
}

function mergeSettlementSummary(summary: PrepaidSettlementSummaryRow, mutation: PrepaidSettlementRow) {
  return {
    ...summary,
    accountAId: mutation.accountAId,
    accountBId: mutation.accountBId,
    aToBAmount: mutation.aToBAmount,
    bToAAmount: mutation.bToAAmount,
    netAmount: mutation.netAmount,
    payerFrontendUserId: mutation.payerFrontendUserId,
    receiverFrontendUserId: mutation.receiverFrontendUserId,
    status: mutation.status,
    createdAt: mutation.createdAt
  }
}
