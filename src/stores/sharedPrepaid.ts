import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import {
  createSharedPrepaidEventSource,
  type SharedPrepaidRealtimeEvent,
  type SharedPrepaidRealtimeModule
} from '@/api/sharedPrepaid'
import { useAuthStore } from '@/stores/auth'

export interface SharedPrepaidRealtimeRegistration {
  isDirty: () => boolean
  refresh: () => void | Promise<void>
}

const RECONNECT_DELAY_MS = 2000

export const useSharedPrepaidStore = defineStore('sharedPrepaid', () => {
  const authStore = useAuthStore()
  const realtimeConnected = ref(false)
  const refreshPromptModules = ref<SharedPrepaidRealtimeModule[]>([])
  const registrations = new Map<SharedPrepaidRealtimeModule, SharedPrepaidRealtimeRegistration>()
  const refreshing = new Set<SharedPrepaidRealtimeModule>()
  const trailingRefresh = new Set<SharedPrepaidRealtimeModule>()
  let source: EventSource | null = null
  let reconnectTimer: number | undefined

  const hasRefreshPrompt = computed(() => refreshPromptModules.value.length > 0)

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
      await registration.refresh()
      clearRefreshPrompt(module)
    } finally {
      refreshing.delete(module)
      if (trailingRefresh.delete(module)) void refreshModule(module)
    }
  }

  function handleRealtimeEvent(event: SharedPrepaidRealtimeEvent) {
    if (event.type !== 'change') return
    void refreshModule(event.module)
  }

  function markRefreshPrompt(module: SharedPrepaidRealtimeModule) {
    if (refreshPromptModules.value.includes(module)) return
    refreshPromptModules.value = [...refreshPromptModules.value, module]
    ElMessage.warning('共享预存款已有新数据，已保留你尚未提交的内容，请保存或放弃后刷新')
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

  function connectRealtime() {
    if (source || !authStore.isLoggedIn) return
    const nextSource = createSharedPrepaidEventSource()
    if (!nextSource) return
    source = nextSource
    nextSource.onopen = () => { realtimeConnected.value = true }
    nextSource.onmessage = (message) => {
      try {
        handleRealtimeEvent(JSON.parse(message.data) as SharedPrepaidRealtimeEvent)
      } catch {
        // SSE carries invalidation metadata only; malformed or future-version signals are ignored.
      }
    }
    nextSource.onerror = () => {
      realtimeConnected.value = false
      nextSource.close()
      if (source === nextSource) source = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      if (authStore.isLoggedIn) connectRealtime()
    }, RECONNECT_DELAY_MS)
  }

  function disconnectRealtime(clearPrompts = true) {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
    source?.close()
    source = null
    realtimeConnected.value = false
    refreshing.clear()
    trailingRefresh.clear()
    if (clearPrompts) clearRefreshPrompt()
  }

  watch(
    () => authStore.isLoggedIn,
    (loggedIn) => {
      if (loggedIn) connectRealtime()
      else disconnectRealtime()
    },
    { flush: 'sync', immediate: true }
  )
  onScopeDispose(() => disconnectRealtime())

  return {
    realtimeConnected,
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
