import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { createTenantRealtimeEventSource, type TenantRealtimeEvent } from '@/api/tenantRealtime'
import { useAuthStore } from '@/stores/auth'

export interface TenantRealtimeRegistration {
  isDirty: () => boolean
  refresh: () => void | Promise<void>
}

const RECONNECT_DELAY_MS = 2000

export const useTenantRealtimeStore = defineStore('tenantRealtime', () => {
  const authStore = useAuthStore()
  const connected = ref(false)
  const remoteChangeModules = ref<string[]>([])
  const registrations = new Map<string, TenantRealtimeRegistration>()
  let source: EventSource | null = null
  let reconnectTimer: number | undefined

  const hasRemoteChanges = computed(() => remoteChangeModules.value.length > 0)

  function registerModule(module: string, registration: TenantRealtimeRegistration) {
    registrations.set(module, registration)
    return () => {
      if (registrations.get(module) === registration) registrations.delete(module)
    }
  }

  async function handleEvent(event: TenantRealtimeEvent) {
    if (event.type !== 'change' || event.changedById === authStore.user?.id) return
    const registration = registrations.get(event.module)
    if (!registration || registration.isDirty()) {
      markRemoteChange(event.module)
      return
    }
    await registration.refresh()
    clearRemoteChanges(event.module)
  }

  async function acknowledgeAndRefresh(module: string) {
    const registration = registrations.get(module)
    if (registration) await registration.refresh()
    clearRemoteChanges(module)
  }

  function markRemoteChange(module: string) {
    if (remoteChangeModules.value.includes(module)) return
    remoteChangeModules.value = [...remoteChangeModules.value, module]
    ElMessage.warning('其他账号已更新数据，已保留你尚未保存的内容')
  }

  function clearRemoteChanges(module?: string) {
    remoteChangeModules.value = module
      ? remoteChangeModules.value.filter((item) => item !== module)
      : []
  }

  function connect() {
    disconnect(false)
    const nextSource = createTenantRealtimeEventSource()
    if (!nextSource) return
    source = nextSource
    nextSource.onopen = () => { connected.value = true }
    nextSource.onmessage = (message) => {
      try {
        void handleEvent(JSON.parse(message.data) as TenantRealtimeEvent)
      } catch {
        // Ignore malformed or future-version events; no business data is accepted from SSE.
      }
    }
    nextSource.onerror = () => {
      connected.value = false
      nextSource.close()
      if (source === nextSource) source = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined
      if (authStore.isLoggedIn) connect()
    }, RECONNECT_DELAY_MS)
  }

  function disconnect(clearPending = true) {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
    source?.close()
    source = null
    connected.value = false
    if (clearPending) clearRemoteChanges()
  }

  return {
    connected,
    remoteChangeModules,
    hasRemoteChanges,
    registerModule,
    handleEvent,
    acknowledgeAndRefresh,
    clearRemoteChanges,
    connect,
    disconnect
  }
})

/** Allows isolated component tests and embedded previews without an installed Pinia. */
export function tryUseTenantRealtimeStore() {
  try { return useTenantRealtimeStore() } catch { return null }
}
