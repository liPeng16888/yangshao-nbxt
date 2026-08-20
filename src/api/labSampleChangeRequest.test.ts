// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreateLabSampleChangeRequestPayload } from '@/types/labSampleChangeRequest'

const requestMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/utils/request', () => ({ default: requestMock, useMocks: false }))

import {
  createLabSampleChangeRequest,
  getLabSampleChangeRequest,
  listLabSampleChangeRequests,
  withdrawLabSampleChangeRequest
} from './labSampleChangeRequest'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value)
  }
}

const payload: CreateLabSampleChangeRequestPayload = {
  blockId: 'block-1', baseUpdatedAt: '2026-08-19T01:00:00.000Z', changes: { ironRaw: 2 }, reason: '原始记录更正'
}

describe('lab sample change request API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
    requestMock.get.mockResolvedValue([])
    requestMock.post.mockResolvedValue({})
  })

  it('sends independent access grants and the exact create payload', async () => {
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      historical: { groupId: 'historical', grantVersion: 1, expiresAt: Date.now() + 60_000, token: 'history-token', features: ['HISTORICAL_DATES'] },
      completed: { groupId: 'completed', grantVersion: 1, expiresAt: Date.now() + 60_000, token: 'completed-token', features: ['COMPLETED_SAMPLE_DATA'] }
    }))

    await createLabSampleChangeRequest(payload)

    expect(requestMock.post).toHaveBeenCalledWith('/lab-sheets/change-requests', payload, { headers: {
      'X-YS-Historical-Access-Grant': 'history-token',
      'X-YS-Completed-Data-Access-Grant': 'completed-token'
    } })
  })

  it('uses the same independent grants for list, detail, and withdrawal routes', async () => {
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      historical: { groupId: 'historical', grantVersion: 1, expiresAt: Date.now() + 60_000, token: 'history-token', features: ['HISTORICAL_DATES'] }
    }))

    await listLabSampleChangeRequests({ date: '2026-08-19', status: 'PENDING' })
    await getLabSampleChangeRequest('request-1')
    await withdrawLabSampleChangeRequest('request-1')

    expect(requestMock.get).toHaveBeenNthCalledWith(1, '/lab-sheets/change-requests', {
      params: { date: '2026-08-19', status: 'PENDING' }, headers: { 'X-YS-Historical-Access-Grant': 'history-token' }
    })
    expect(requestMock.get).toHaveBeenNthCalledWith(2, '/lab-sheets/change-requests/request-1', {
      headers: { 'X-YS-Historical-Access-Grant': 'history-token' }
    })
    expect(requestMock.post).toHaveBeenCalledWith('/lab-sheets/change-requests/request-1/withdraw', undefined, {
      headers: { 'X-YS-Historical-Access-Grant': 'history-token' }
    })
  })
})
