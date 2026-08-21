import request, { useMocks } from '@/utils/request'
import { readAccessGuardSessions, selectAccessGuardGrant } from '@/api/accessGuard'
import type {
  CreateSampleRetestsPayload,
  DeleteSampleRetestPayload,
  LabParameter,
  LabSheet,
  SampleBlock,
  SampleBlockSavePayload,
  SampleRetest,
  SaveSampleRetestPayload,
  VoidSampleRetestPayload
} from '@/types/labSheet'
import {
  mockAddSampleBlocks,
  mockCreateSampleRetests,
  mockCurrentLabSheet,
  mockCurrentParameters,
  mockDeleteSampleRetest,
  mockApplyParametersFromIndex,
  mockLabHistory,
  mockLabSheetByDate,
  mockSaveSampleBlock,
  mockSaveSampleRetest,
  mockUpdateParameters,
  mockVoidSampleRetest
} from '@/mocks/db'
import type { MockSampleRetestAccess } from '@/mocks/db'

const CLIENT_ID_KEY = 'ys_lab_sheet_client_id'

export type LabSheetRealtimeEvent =
  | {
      type: 'connected'
      frontendUserId: string
      date: string
      updatedAt: string
    }
  | {
      type: 'block-saved'
      frontendUserId: string
      date: string
      sheetId: string
      sourceClientId?: string
      changedById?: string
      updatedAt: string
    }
  | {
      type: 'parameters-updated'
      frontendUserId: string
      date: string
      sheetId: string
      sourceClientId?: string
      changedById?: string
      updatedAt: string
      parameters: LabParameter
    }
  | {
      type: 'sheet-reloaded'
      frontendUserId: string
      date: string
      sheetId: string
      sourceClientId?: string
      changedById?: string
      updatedAt: string
    }
  | {
      type: 'retests-changed'
      frontendUserId: string
      date: string
      sheetId: string
      sourceClientId?: string
      changedById?: string
      updatedAt: string
      sampleBlockId?: string
      sampleRetestId?: string
    }
  | {
      type: 'heartbeat'
      updatedAt: string
    }

export function getLabSheetClientId() {
  if (typeof window === 'undefined') return 'server'
  const existing = window.sessionStorage.getItem(CLIENT_ID_KEY)
  if (existing) return existing
  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  window.sessionStorage.setItem(CLIENT_ID_KEY, next)
  return next
}

export function createLabSheetEventSource(date: string) {
  if (useMocks || typeof window === 'undefined' || typeof EventSource === 'undefined') return null
  const token = window.localStorage.getItem('ys_token')
  if (!token) return null
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api'
  const baseUrl = apiBase.startsWith('http') ? apiBase : `${window.location.origin}${apiBase}`
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/lab-sheets/stream`)
  url.searchParams.set('date', date)
  url.searchParams.set('token', token)
  return new EventSource(url.toString())
}

function clientHeaders() {
  return { headers: { 'X-YS-Client-Id': getLabSheetClientId() } }
}

function accessGrantHeaders() {
  try {
    const token = selectAccessGuardGrant(readAccessGuardSessions(), 'COMPLETED_SAMPLE_DATA')
    return token ? { headers: { 'X-YS-Access-Grant': token } } : undefined
  } catch { return undefined }
}

function retestWriteOptions() {
  return { headers: { ...clientHeaders().headers, ...(accessGrantHeaders()?.headers || {}) } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function getMockCompletedSampleAccess(): MockSampleRetestAccess {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem('ys_mock_access_guard_groups') || '[]')
    const groups = Array.isArray(parsed) ? parsed : []
    const group = groups.find((value): value is Record<string, unknown> => {
      if (!isRecord(value) || !Array.isArray(value.features)) return false
      return value.enabled === true && value.features.includes('COMPLETED_SAMPLE_DATA')
    })
    if (!group || typeof group.id !== 'string' || typeof group.grantVersion !== 'number') {
      return { protected: false, allowed: true }
    }
    const session = readAccessGuardSessions()[group.id]
    const allowed = Boolean(
      session?.groupId === group.id &&
      session.grantVersion === group.grantVersion &&
      session.token &&
      (session.expiresAt || 0) > Date.now() &&
      session.features?.includes('COMPLETED_SAMPLE_DATA')
    )
    return { protected: true, allowed }
  } catch {
    return { protected: false, allowed: true }
  }
}

export async function getCurrentLabSheet(): Promise<LabSheet> {
  if (useMocks) return mockCurrentLabSheet(getMockCompletedSampleAccess())
  return request.get('/lab-sheets/current', accessGrantHeaders())
}

export async function getLabSheetByDate(date: string): Promise<LabSheet> {
  if (useMocks) return mockLabSheetByDate(date, getMockCompletedSampleAccess())
  return request.get('/lab-sheets', { params: { date }, ...accessGrantHeaders() })
}

export async function getCurrentParameters(): Promise<LabParameter> {
  if (useMocks) return mockCurrentParameters()
  return request.get('/lab-sheets/parameters/current')
}

export async function updateCurrentParameters(parameters: LabParameter): Promise<LabParameter> {
  if (useMocks) return mockUpdateParameters(parameters)
  return request.put('/lab-sheets/parameters/current', parameters, clientHeaders())
}

export async function applyCurrentParametersFromIndex(
  parameters: LabParameter,
  startIndex: number
): Promise<LabSheet> {
  if (useMocks) return mockApplyParametersFromIndex(parameters, startIndex)
  return request.put(
    '/lab-sheets/parameters/current/apply',
    { parameters, startIndex },
    { headers: { ...clientHeaders().headers, ...(accessGrantHeaders()?.headers || {}) } }
  )
}

export async function addSampleBlocks(sheetId: string, count: number): Promise<LabSheet> {
  if (useMocks) return mockAddSampleBlocks(sheetId, count)
  return request.post(
    `/lab-sheets/${sheetId}/sample-blocks`,
    { count },
    { headers: { ...clientHeaders().headers, ...(accessGrantHeaders()?.headers || {}) } }
  )
}

export async function saveSampleBlock(sheetId: string, block: SampleBlockSavePayload): Promise<SampleBlock> {
  if (useMocks) return mockSaveSampleBlock(sheetId, block)
  return request.put(`/lab-sheets/${sheetId}/cells`, block, { headers: { ...clientHeaders().headers, ...(accessGrantHeaders()?.headers || {}) } })
}

export async function createSampleRetests(
  sheetId: string,
  payload: CreateSampleRetestsPayload
): Promise<SampleRetest[]> {
  if (useMocks) return mockCreateSampleRetests(sheetId, payload, getMockCompletedSampleAccess())
  return request.post(`/lab-sheets/${sheetId}/sample-retests`, payload, retestWriteOptions())
}

export async function saveSampleRetest(
  sheetId: string,
  retestId: string,
  payload: SaveSampleRetestPayload
): Promise<SampleRetest> {
  if (useMocks) return mockSaveSampleRetest(sheetId, retestId, payload, getMockCompletedSampleAccess())
  return request.put(`/lab-sheets/${sheetId}/sample-retests/${retestId}`, payload, retestWriteOptions())
}

export async function deleteSampleRetest(
  sheetId: string,
  retestId: string,
  payload: DeleteSampleRetestPayload
): Promise<{ id: string; sampleBlockId: string; deleted: true }> {
  if (useMocks) return mockDeleteSampleRetest(sheetId, retestId, payload, getMockCompletedSampleAccess())
  return request.delete(`/lab-sheets/${sheetId}/sample-retests/${retestId}`, {
    ...retestWriteOptions(),
    data: payload
  })
}

export async function voidSampleRetest(
  sheetId: string,
  retestId: string,
  payload: VoidSampleRetestPayload
): Promise<SampleRetest> {
  if (useMocks) return mockVoidSampleRetest(sheetId, retestId, payload, getMockCompletedSampleAccess())
  return request.patch(`/lab-sheets/${sheetId}/sample-retests/${retestId}/void`, payload, retestWriteOptions())
}

export async function getLabSheetHistory(): Promise<Array<{ id: string; date: string; readonly: boolean }>> {
  if (useMocks) return mockLabHistory()
  return request.get('/lab-sheets/history')
}
