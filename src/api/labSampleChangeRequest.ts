import request, { useMocks } from '@/utils/request'
import { readAccessGuardSessions, selectAccessGuardGrant } from '@/api/accessGuard'
import {
  mockCreateLabSampleChangeRequest,
  mockGetLabSampleChangeRequest,
  mockListLabSampleChangeRequests,
  mockWithdrawLabSampleChangeRequest
} from '@/mocks/db'
import type {
  CreateLabSampleChangeRequestPayload,
  LabSampleChangeRequestDetail,
  LabSampleChangeRequestFilters,
  LabSampleChangeRequestSummary
} from '@/types/labSampleChangeRequest'

function accessGrantHeaders() {
  try {
    const sessions = readAccessGuardSessions()
    const historical = selectAccessGuardGrant(sessions, 'HISTORICAL_DATES')
    const completedData = selectAccessGuardGrant(sessions, 'COMPLETED_SAMPLE_DATA')
    const headers = {
      ...(historical ? { 'X-YS-Historical-Access-Grant': historical } : {}),
      ...(completedData ? { 'X-YS-Completed-Data-Access-Grant': completedData } : {})
    }
    return Object.keys(headers).length ? { headers } : undefined
  } catch { return undefined }
}

export async function listLabSampleChangeRequests(filters: LabSampleChangeRequestFilters = {}): Promise<LabSampleChangeRequestSummary[]> {
  if (useMocks) return mockListLabSampleChangeRequests(filters)
  return request.get('/lab-sheets/change-requests', { params: filters, ...accessGrantHeaders() })
}

export async function getLabSampleChangeRequest(id: string): Promise<LabSampleChangeRequestDetail> {
  if (useMocks) return mockGetLabSampleChangeRequest(id)
  return request.get(`/lab-sheets/change-requests/${encodeURIComponent(id)}`, accessGrantHeaders())
}

export async function createLabSampleChangeRequest(payload: CreateLabSampleChangeRequestPayload): Promise<LabSampleChangeRequestSummary> {
  if (useMocks) return mockCreateLabSampleChangeRequest(payload)
  return request.post('/lab-sheets/change-requests', payload, accessGrantHeaders())
}

export async function withdrawLabSampleChangeRequest(id: string): Promise<LabSampleChangeRequestSummary> {
  if (useMocks) return mockWithdrawLabSampleChangeRequest(id)
  return request.post(`/lab-sheets/change-requests/${encodeURIComponent(id)}/withdraw`, undefined, accessGrantHeaders())
}
