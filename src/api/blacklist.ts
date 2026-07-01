import request, { useMocks } from '@/utils/request'
import type { BlacklistCheckResult, BlacklistPayload, BlacklistRecord, BlacklistUpdatePayload } from '@/types/blacklist'
import { mockCheckBlacklist, mockCreateBlacklist, mockDeleteBlacklist, mockSearchBlacklist, mockUpdateBlacklist } from '@/mocks/db'

export async function searchBlacklist(keyword = ''): Promise<BlacklistRecord[]> {
  if (useMocks) return mockSearchBlacklist(keyword)
  return request.get('/blacklist', { params: { keyword } })
}

export async function checkBlacklist(keyword: string): Promise<BlacklistCheckResult> {
  if (useMocks) return mockCheckBlacklist(keyword)
  return request.get('/blacklist/check', { params: { keyword } })
}

export async function createBlacklist(payload: BlacklistPayload): Promise<BlacklistRecord> {
  if (useMocks) return mockCreateBlacklist(payload)
  return request.post('/blacklist', payload)
}

export async function deleteBlacklist(id: string): Promise<BlacklistRecord> {
  if (useMocks) return mockDeleteBlacklist(id)
  return request.delete(`/blacklist/${id}`)
}

export async function updateBlacklist(id: string, payload: BlacklistUpdatePayload): Promise<BlacklistRecord> {
  if (useMocks) return mockUpdateBlacklist(id, payload)
  return request.patch(`/blacklist/${id}`, payload)
}
