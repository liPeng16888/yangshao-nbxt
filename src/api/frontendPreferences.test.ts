import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))

vi.mock('@/utils/request', () => ({
  default: requestMocks
}))

import { listFrontendPreferences, saveFrontendPreference } from './frontendPreferences'

describe('frontend preference API', () => {
  beforeEach(() => {
    requestMocks.get.mockReset()
    requestMocks.put.mockReset()
  })

  it('reads all accessible preference records from the authoritative route', async () => {
    requestMocks.get.mockResolvedValue([])

    await listFrontendPreferences()

    expect(requestMocks.get).toHaveBeenCalledWith('/frontend-preferences')
  })

  it('sends only value and baseVersion when saving a preference section', async () => {
    const value = { prefix: '检测结果：', suffix: '。' }
    requestMocks.put.mockResolvedValue({})

    await saveFrontendPreference('LAB_REPORT_SMS_TEMPLATE', value, 7)

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/frontend-preferences/LAB_REPORT_SMS_TEMPLATE',
      { value, baseVersion: 7 }
    )
  })
})
