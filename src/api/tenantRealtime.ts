import { useMocks } from '@/utils/request'

export interface TenantRealtimeChangeEvent {
  type: 'change'
  module: string
  entityId: string
  operation: 'create' | 'update' | 'delete'
  changedById: string
  updatedAt: string
}

export type TenantRealtimeEvent = TenantRealtimeChangeEvent | {
  type: 'connected' | 'heartbeat'
  updatedAt: string
}

export function createTenantRealtimeEventSource() {
  if (useMocks || typeof window === 'undefined' || typeof EventSource === 'undefined') return null
  const token = window.localStorage.getItem('ys_token')
  if (!token) return null
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  const baseUrl = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/tenant-realtime/stream`)
  url.searchParams.set('token', token)
  return new EventSource(url.toString())
}
