import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import {
  createSharedPrepaidEventSource,
  createSharedPrepaidStreamTicket,
  isSharedPrepaidTerminalAuthError,
  type SharedPrepaidRealtimeEvent,
  type SharedPrepaidRealtimeModule
} from '@/api/sharedPrepaid'
import { useAuthStore } from '@/stores/auth'

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

export const useSharedPrepaidStore = defineStore('sharedPrepaid', () => {
  const authStore = useAuthStore()
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
    realtimeConnected,
    realtimeAuthTerminal,
    refreshPromptModules,
    hasRefreshPrompt,
    registerModule,
    handleRealtimeEvent,
    acknowledgeAndRefresh,
    clearRefreshPrompt,
    connectRealtime,
    disconnectRealtime
  }
})
