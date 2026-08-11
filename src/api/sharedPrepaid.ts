import request, { useMocks } from '@/utils/request'

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

export interface SharedPrepaidStreamTicket {
  ticket: string
  expiresAt: number
}

export async function createSharedPrepaidStreamTicket(): Promise<SharedPrepaidStreamTicket> {
  if (useMocks) return { ticket: 'mock-stream-ticket', expiresAt: Date.now() + 30_000 }
  return request.post('/shared-prepaid/stream-ticket')
}

export function createSharedPrepaidEventSource(ticket: string) {
  if (useMocks || typeof window === 'undefined' || typeof EventSource === 'undefined') return null
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  const baseUrl = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/shared-prepaid/stream`)
  url.searchParams.set('ticket', ticket)
  return new EventSource(url.toString())
}

export function isSharedPrepaidTerminalAuthError(error: unknown) {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return status === 401 || status === 403
}
