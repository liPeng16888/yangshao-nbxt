import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'

const requestMock = vi.hoisted(() => ({ put: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() }))

vi.mock('@/utils/request', () => ({
  default: requestMock,
  useMocks: false
}))

import {
  addSampleBlocks,
  applyCurrentParametersFromIndex,
  createSampleRetests,
  deleteSampleRetest,
  saveSampleRetest,
  voidSampleRetest
} from './labSheet'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  }
}

describe('lab sheet segmented parameter API', () => {
  beforeEach(() => {
    requestMock.put.mockReset()
    requestMock.put.mockResolvedValue({})
    requestMock.post.mockReset()
    requestMock.post.mockResolvedValue({})
    requestMock.delete.mockReset()
    requestMock.delete.mockResolvedValue({})
    requestMock.patch.mockReset()
    requestMock.patch.mockResolvedValue({})
    Object.defineProperty(window, 'localStorage', { configurable: true, value: createMemoryStorage() })
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: createMemoryStorage() })
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.sessionStorage.setItem('ys_lab_sheet_client_id', 'client-1')
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      'finance-group': {
        groupId: 'finance-group', grantVersion: 1,
        expiresAt: Date.now() + 60_000,
        token: 'finance-grant', features: ['FINANCE']
      },
      'completed-data-group': {
        groupId: 'completed-data-group', grantVersion: 1,
        expiresAt: Date.now() + 60_000,
        token: 'completed-data-grant', features: ['COMPLETED_SAMPLE_DATA']
      }
    }))
  })

  it('sends both the client id and completed-sample access grant when applying', async () => {
    await applyCurrentParametersFromIndex(defaultLabParameters, 3)

    expect(requestMock.put).toHaveBeenCalledWith(
      '/lab-sheets/parameters/current/apply',
      { parameters: defaultLabParameters, startIndex: 3 },
      {
        headers: {
          'X-YS-Client-Id': 'client-1',
          'X-YS-Access-Grant': 'completed-data-grant'
        }
      }
    )
  })

  it('sends both the client id and completed-sample access grant when adding samples', async () => {
    await addSampleBlocks('sheet-1', 2)

    expect(requestMock.put).not.toHaveBeenCalled()
    expect(requestMock.post).toHaveBeenCalledWith(
      '/lab-sheets/sheet-1/sample-blocks',
      { count: 2 },
      {
        headers: {
          'X-YS-Client-Id': 'client-1',
          'X-YS-Access-Grant': 'completed-data-grant'
        }
      }
    )
  })

  it('sends both authorization headers on all four retest writes with exact payload placement', async () => {
    const headers = {
      headers: {
        'X-YS-Client-Id': 'client-1',
        'X-YS-Access-Grant': 'completed-data-grant'
      }
    }
    const createPayload = { sampleBlockIds: ['block-1'], idempotencyKey: 'create-1' }
    const savePayload = {
      idempotencyKey: 'save-1',
      baseUpdatedAt: '2026-08-20T00:00:00.000Z',
      baseInputs: { ironRaw: null },
      changedFields: { ironRaw: 0 }
    }
    const deletePayload = {
      baseUpdatedAt: '2026-08-20T00:00:01.000Z',
      idempotencyKey: 'delete-1'
    }
    const voidPayload = {
      baseUpdatedAt: '2026-08-20T00:00:02.000Z',
      idempotencyKey: 'void-1',
      reason: '复核失败'
    }

    await createSampleRetests('sheet-1', createPayload)
    await saveSampleRetest('sheet-1', 'retest-1', savePayload)
    await deleteSampleRetest('sheet-1', 'retest-2', deletePayload)
    await voidSampleRetest('sheet-1', 'retest-1', voidPayload)

    expect(requestMock.post).toHaveBeenCalledWith('/lab-sheets/sheet-1/sample-retests', createPayload, headers)
    expect(requestMock.put).toHaveBeenCalledWith('/lab-sheets/sheet-1/sample-retests/retest-1', savePayload, headers)
    expect(requestMock.delete).toHaveBeenCalledWith('/lab-sheets/sheet-1/sample-retests/retest-2', {
      ...headers,
      data: deletePayload
    })
    expect(requestMock.patch).toHaveBeenCalledWith('/lab-sheets/sheet-1/sample-retests/retest-1/void', voidPayload, headers)
  })
})
