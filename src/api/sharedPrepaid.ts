import request, { useMocks } from '@/utils/request'
import * as mock from '@/mocks/sharedPrepaid'
import type {
  CreatePrepaidRechargePayload,
  PrepaidConsumptionQuery,
  PrepaidConsumptionListRow,
  PrepaidConsumptionReversalResult,
  PrepaidMemberDetail,
  PrepaidMemberQuery,
  PrepaidMemberRow,
  PrepaidPage,
  PrepaidReasonPayload,
  PrepaidRechargeMutationResult,
  PrepaidRechargeQuery,
  PrepaidRechargeRow,
  PrepaidSettlementPaymentPayload,
  PrepaidSettlementPreview,
  PrepaidSettlementRow,
  PrepaidSettlementSelectionPayload
} from '@/types/sharedPrepaid'

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

function withIdempotencyKey(key?: string) {
  return { headers: { 'X-Idempotency-Key': key ?? crypto.randomUUID() } }
}

export function getPrepaidMembers(query: PrepaidMemberQuery = {}): Promise<PrepaidPage<PrepaidMemberRow>> {
  if (useMocks) return mock.mockGetPrepaidMembers(query)
  return request.get('/shared-prepaid/members', { params: query })
}

export function lookupPrepaidMember(phone: string): Promise<PrepaidMemberRow | null> {
  if (useMocks) return mock.mockLookupPrepaidMember(phone)
  return request.get('/shared-prepaid/members/lookup', { params: { phone } })
}

export function getPrepaidMemberDetail(id: string): Promise<PrepaidMemberDetail> {
  if (useMocks) return mock.mockGetPrepaidMemberDetail(id)
  return request.get(`/shared-prepaid/members/${id}`)
}

export function getPrepaidRecharges(query: PrepaidRechargeQuery = {}): Promise<PrepaidPage<PrepaidRechargeRow>> {
  if (useMocks) return mock.mockGetPrepaidRecharges(query)
  return request.get('/shared-prepaid/recharges', { params: query })
}

export function getPrepaidConsumptions(query: PrepaidConsumptionQuery = {}): Promise<PrepaidPage<PrepaidConsumptionListRow>> {
  if (useMocks) return mock.mockGetPrepaidConsumptions(query)
  return request.get('/shared-prepaid/consumptions', { params: query })
}

export function createPrepaidRecharge(
  payload: CreatePrepaidRechargePayload,
  idempotencyKey?: string
): Promise<PrepaidRechargeMutationResult> {
  if (useMocks) return mock.mockCreatePrepaidRecharge(payload, idempotencyKey ?? crypto.randomUUID())
  return request.post('/shared-prepaid/recharges', payload, withIdempotencyKey(idempotencyKey))
}

export function reversePrepaidRecharge(
  id: string,
  payload: PrepaidReasonPayload,
  idempotencyKey?: string
): Promise<PrepaidRechargeMutationResult> {
  if (useMocks) return mock.mockReversePrepaidRecharge(id, payload, idempotencyKey ?? crypto.randomUUID())
  return request.post(`/shared-prepaid/recharges/${id}/reversal`, payload, withIdempotencyKey(idempotencyKey))
}

export function reversePrepaidConsumption(
  id: string,
  payload: PrepaidReasonPayload,
  idempotencyKey?: string
): Promise<PrepaidConsumptionReversalResult> {
  if (useMocks) return mock.mockReversePrepaidConsumption(id, payload, idempotencyKey ?? crypto.randomUUID())
  return request.post(`/shared-prepaid/consumptions/${id}/reversal`, payload, withIdempotencyKey(idempotencyKey))
}

export function previewPrepaidSettlement(
  payload: PrepaidSettlementSelectionPayload
): Promise<PrepaidSettlementPreview> {
  if (useMocks) return mock.mockPreviewPrepaidSettlement(payload)
  return request.post('/shared-prepaid/settlements/preview', payload)
}

export function createPrepaidSettlement(
  payload: PrepaidSettlementSelectionPayload,
  idempotencyKey?: string
): Promise<PrepaidSettlementRow> {
  if (useMocks) return mock.mockCreatePrepaidSettlement(payload, idempotencyKey ?? crypto.randomUUID())
  return request.post('/shared-prepaid/settlements', payload, withIdempotencyKey(idempotencyKey))
}

export function submitPrepaidSettlementPayment(
  id: string,
  payload: PrepaidSettlementPaymentPayload,
  idempotencyKey?: string
): Promise<PrepaidSettlementRow> {
  if (useMocks) return mock.mockSubmitPrepaidSettlementPayment(id, payload, idempotencyKey ?? crypto.randomUUID())
  return request.post(`/shared-prepaid/settlements/${id}/payment`, payload, withIdempotencyKey(idempotencyKey))
}

export function confirmPrepaidSettlement(id: string, idempotencyKey?: string): Promise<PrepaidSettlementRow> {
  if (useMocks) return mock.mockConfirmPrepaidSettlement(id, idempotencyKey ?? crypto.randomUUID())
  return request.post(`/shared-prepaid/settlements/${id}/confirm`, undefined, withIdempotencyKey(idempotencyKey))
}

export function rejectPrepaidSettlement(
  id: string,
  payload: PrepaidReasonPayload,
  idempotencyKey?: string
): Promise<PrepaidSettlementRow> {
  if (useMocks) return mock.mockRejectPrepaidSettlement(id, payload, idempotencyKey ?? crypto.randomUUID())
  return request.post(`/shared-prepaid/settlements/${id}/reject`, payload, withIdempotencyKey(idempotencyKey))
}

export function cancelPrepaidSettlement(id: string, idempotencyKey?: string): Promise<PrepaidSettlementRow> {
  if (useMocks) return mock.mockCancelPrepaidSettlement(id, idempotencyKey ?? crypto.randomUUID())
  return request.post(`/shared-prepaid/settlements/${id}/cancel`, undefined, withIdempotencyKey(idempotencyKey))
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
