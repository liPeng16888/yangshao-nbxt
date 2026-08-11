const useMocks = import.meta.env.VITE_USE_MOCKS === 'true'

export type SharedPrepaidRealtimeModule = 'recharges' | 'members' | 'consumptions' | 'settlements'

export interface SharedPrepaidRealtimeChangeEvent {
  type: 'change'
  module: SharedPrepaidRealtimeModule
  entityId: string
  operation: 'create' | 'update' | 'delete'
  changedById: string
  updatedAt: string
}

export type SharedPrepaidRealtimeEvent = SharedPrepaidRealtimeChangeEvent | {
  type: 'connected' | 'heartbeat'
  updatedAt: string
}

export function createSharedPrepaidEventSource() {
  if (useMocks || typeof window === 'undefined' || typeof EventSource === 'undefined') return null
  const token = window.localStorage.getItem('ys_token')
  if (!token) return null
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  const baseUrl = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`
  const url = new URL(`${baseUrl}/shared-prepaid/stream`)
  url.searchParams.set('token', token)
  return new EventSource(url.toString())
}
