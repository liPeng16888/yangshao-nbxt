// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/utils/request', () => ({ default: requestMock, useMocks: false }))

import { getAccessGuardGroups } from './accessGuard'

describe('access guard API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes a subaccount-safe group summary without inventing parent secrets', async () => {
    requestMock.get.mockResolvedValue([{
      id: 'group-1', name: '数据保护', enabled: true, ttlMinutes: 10, grantVersion: 4,
      features: ['HISTORICAL_DATES', 'COMPLETED_SAMPLE_DATA']
    }])

    await expect(getAccessGuardGroups()).resolves.toEqual([{
      id: 'group-1', name: '数据保护', enabled: true, ttlMinutes: 10, grantVersion: 4,
      password: '', recoveryPrompt: '', recoveryAnswer: '',
      features: ['HISTORICAL_DATES', 'COMPLETED_SAMPLE_DATA']
    }])
  })
})
