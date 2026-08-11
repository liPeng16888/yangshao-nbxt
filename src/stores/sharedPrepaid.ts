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
import type {
  CreatePrepaidRechargePayload,
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
  PrepaidSettlementPreview,
  PrepaidSettlementRow
} from '@/types/sharedPrepaid'

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

export const useSharedPrepaidStore = defineStore('sharedPrepaid', () => {
  const authStore = useAuthStore()
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
  const loadGenerations = new Map<string, number>()
  const mutationQueues = new Map<SharedPrepaidMutation, Promise<void>>()
  const mutationPendingCounts = new Map<SharedPrepaidMutation, number>()
  const mutationInvocationVersions = new Map<SharedPrepaidMutation, number>()
  const settlementDirtyState = reactive({ selection: false, payment: false, manual: false })
  const membersPage = ref<PrepaidPage<PrepaidMemberRow>>(emptyPage())
  const rechargesPage = ref<PrepaidPage<PrepaidRechargeRow>>(emptyPage())
  const selectedMember = ref<PrepaidMemberDetail | null>(null)
  const consumptions = ref<PrepaidConsumptionRow[]>([])
  const payables = ref<PrepaidPayableRow[]>([])
  const settlementPreview = ref<PrepaidSettlementPreview | null>(null)
  const settlements = ref<PrepaidSettlementRow[]>([])
  const rechargeDraft = ref<CreatePrepaidRechargePayload>(emptyRechargeDraft())
  const settlementSelection = ref<string[]>([])
  const settlementPaymentDraft = ref<PrepaidSettlementPaymentPayload>({ actualTransferredAt: '' })
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

  async function runPage<T>(page: SharedPrepaidPage, action: () => Promise<T>): Promise<T> {
    loadingCounts[page] += 1
    errorsByPage[page] = ''
    try {
      return await action()
    } catch (error) {
      errorsByPage[page] = error instanceof Error ? error.message : '操作失败'
      throw error
    } finally {
      loadingCounts[page] -= 1
    }
  }

  async function runLatest<T>(
    resource: string,
    page: SharedPrepaidPage,
    action: () => Promise<T>,
    apply: (result: T) => void
  ): Promise<T> {
    const generation = (loadGenerations.get(resource) ?? 0) + 1
    loadGenerations.set(resource, generation)
    loadingCounts[page] += 1
    errorsByPage[page] = ''
    try {
      const result = await action()
      if (loadGenerations.get(resource) === generation) apply(result)
      return result
    } catch (error) {
      if (loadGenerations.get(resource) === generation) {
        errorsByPage[page] = error instanceof Error ? error.message : '操作失败'
      }
      throw error
    } finally {
      loadingCounts[page] -= 1
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
    settlementSelection.value = [...ids]
    settlementDirtyState.selection = ids.length > 0
    syncSettlementDirty()
  }

  function setSettlementPaymentDraft(draft: PrepaidSettlementPaymentPayload) {
    settlementPaymentDraft.value = { ...draft, proofUrls: draft.proofUrls ? [...draft.proofUrls] : undefined }
    settlementDirtyState.payment = Boolean(
      draft.actualTransferredAt?.trim() || draft.proofUrls?.length || draft.remark?.trim()
    )
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

  async function loadMemberDetail(id: string, page: 'members' | 'consumptions' = 'members') {
    return runLatest('member:detail', page, () => prepaidApi.getPrepaidMemberDetail(id), (result) => {
      selectedMember.value = result
      consumptions.value = result.consumptions
      payables.value = result.consumptions.flatMap((row) => row.payables)
    })
  }

  async function loadRecharges(query: PrepaidRechargeQuery = {}) {
    return runLatest('recharges:list', 'recharges', () => prepaidApi.getPrepaidRecharges(query), (result) => {
      rechargesPage.value = result
    })
  }

  async function mutate<T>(
    page: SharedPrepaidPage,
    mutation: SharedPrepaidMutation,
    explicitKey: string | undefined,
    action: (key: string) => Promise<T>,
    afterSuccess?: (result: T, isLatestInvocation: boolean) => void
  ) {
    const pendingCount = mutationPendingCounts.get(mutation) ?? 0
    const key = explicitKey ?? (pendingCount === 0 ? pendingIdempotencyKeys[mutation] : undefined) ?? crypto.randomUUID()
    const invocationVersion = (mutationInvocationVersions.get(mutation) ?? 0) + 1
    mutationInvocationVersions.set(mutation, invocationVersion)
    mutationPendingCounts.set(mutation, pendingCount + 1)

    const previous = mutationQueues.get(mutation) ?? Promise.resolve()
    const execution = previous.then(() => runPage(page, () => action(key)))
    const queueTail = execution.then(() => undefined, () => undefined)
    mutationQueues.set(mutation, queueTail)

    try {
      const result = await execution
      const isLatestInvocation = mutationInvocationVersions.get(mutation) === invocationVersion
      if (isLatestInvocation) delete pendingIdempotencyKeys[mutation]
      afterSuccess?.(result, isLatestInvocation)
      return result
    } catch (error) {
      if (mutationInvocationVersions.get(mutation) === invocationVersion) {
        if (isConflict(error)) pendingIdempotencyKeys[mutation] = key
        else delete pendingIdempotencyKeys[mutation]
      }
      throw error
    } finally {
      const remaining = (mutationPendingCounts.get(mutation) ?? 1) - 1
      if (remaining > 0) mutationPendingCounts.set(mutation, remaining)
      else mutationPendingCounts.delete(mutation)
      if (mutationQueues.get(mutation) === queueTail) mutationQueues.delete(mutation)
    }
  }

  async function createRecharge(
    payload: CreatePrepaidRechargePayload = rechargeDraft.value,
    idempotencyKey?: string
  ) {
    const requestPayload = { ...payload }
    return mutate('recharges', 'createRecharge', idempotencyKey, (key) => (
      prepaidApi.createPrepaidRecharge(requestPayload, key)
    ), (_result, isLatestInvocation) => {
      if (isLatestInvocation) {
        rechargeDraft.value = emptyRechargeDraft()
        setPageDirty('recharges', false)
      }
    })
  }

  async function reverseRecharge(id: string, reason: string, idempotencyKey?: string) {
    const payload: PrepaidReasonPayload = { reason }
    return mutate('recharges', `reverseRecharge:${id}`, idempotencyKey, (key) => (
      prepaidApi.reversePrepaidRecharge(id, payload, key)
    ))
  }

  async function reverseConsumption(id: string, reason: string, idempotencyKey?: string) {
    const payload: PrepaidReasonPayload = { reason }
    return mutate('consumptions', `reverseConsumption:${id}`, idempotencyKey, (key) => (
      prepaidApi.reversePrepaidConsumption(id, payload, key)
    ))
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
        settlementSelection.value = []
        settlementPreview.value = null
        settlementDirtyState.selection = false
        syncSettlementDirty()
      }
    })
  }

  async function submitSettlementPayment(
    id: string,
    payload: PrepaidSettlementPaymentPayload = settlementPaymentDraft.value,
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
        settlementPaymentDraft.value = { actualTransferredAt: '' }
        settlementDirtyState.payment = false
        syncSettlementDirty()
      }
    })
  }

  function confirmSettlement(id: string, idempotencyKey?: string) {
    return mutate('settlements', `confirmSettlement:${id}`, idempotencyKey, (key) => (
      prepaidApi.confirmPrepaidSettlement(id, key)
    ), upsertSettlement)
  }

  function rejectSettlement(id: string, reason: string, idempotencyKey?: string) {
    return mutate('settlements', `rejectSettlement:${id}`, idempotencyKey, (key) => (
      prepaidApi.rejectPrepaidSettlement(id, { reason }, key)
    ), upsertSettlement)
  }

  function cancelSettlement(id: string, idempotencyKey?: string) {
    return mutate('settlements', `cancelSettlement:${id}`, idempotencyKey, (key) => (
      prepaidApi.cancelPrepaidSettlement(id, key)
    ), upsertSettlement)
  }

  function upsertSettlement(row: PrepaidSettlementRow) {
    const index = settlements.value.findIndex((item) => item.id === row.id)
    if (index >= 0) settlements.value[index] = row
    else settlements.value.unshift(row)
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
      if (registrations.get(module) !== registration) return
      if (registration.isDirty()) {
        markRefreshPrompt(module)
        return
      }
      try {
        await registration.refresh()
        clearRefreshPrompt(module)
      } catch {
        // The invalidation remains pending and the page can call acknowledgeAndRefresh to retry.
        markRefreshPrompt(module, true)
      }
    } finally {
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

  const authSessionSignature = computed(() => {
    const user = authStore.user
    return [
      authStore.token,
      user?.id ?? '',
      user?.permissionVersion ?? '',
      user?.role ?? '',
      [...(user?.permissions ?? [])].sort().join(',')
    ].join('|')
  })

  watch(
    authSessionSignature,
    () => {
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
    consumptions,
    payables,
    settlementPreview,
    settlements,
    rechargeDraft,
    settlementSelection,
    settlementPaymentDraft,
    realtimeConnected,
    realtimeAuthTerminal,
    refreshPromptModules,
    hasRefreshPrompt,
    setPageDirty,
    setRechargeDraft,
    setSettlementSelection,
    setSettlementPaymentDraft,
    loadMembers,
    lookupMember,
    loadMemberDetail,
    loadRecharges,
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

function isConflict(error: unknown) {
  return (error as { response?: { status?: unknown } } | null)?.response?.status === 409
}
