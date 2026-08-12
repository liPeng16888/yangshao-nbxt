// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { adminLogin, request } from './api'
import { getAdminSharedPrepaidDetail, getAdminSharedPrepaidPage } from './api/sharedPrepaid'

beforeAll(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  } satisfies Storage })
})

beforeEach(() => window.localStorage.clear())

describe('admin shared prepaid mock contract', () => {
  it('returns global root rows and only allowed participating rows to a sub-admin', async () => {
    const rootPage = await getAdminSharedPrepaidPage('recharges', {
      frontendUserIds: ['front-1', 'front-2'], page: 1, pageSize: 20
    })
    expect(rootPage.items.length).toBeGreaterThan(1)
    expect(rootPage.items.every((item) => !('reversal' in item))).toBe(true)

    await adminLogin({ account: 'sub001', password: 'sub123456' })
    const subPage = await getAdminSharedPrepaidPage('recharges', {
      frontendUserIds: ['front-1'], page: 1, pageSize: 20
    })
    expect(subPage.items).toHaveLength(1)
    expect(subPage.items[0]).toMatchObject({ ownerFrontendUserId: 'front-1' })
    await expect(getAdminSharedPrepaidPage('recharges', {
      frontendUserIds: ['front-2'], page: 1, pageSize: 20
    })).rejects.toThrow('没有访问部分前端账号的权限')
  })

  it('mirrors member participation through consumption and settlement without leaking list histories', async () => {
    await adminLogin({ account: 'sub001', password: 'sub123456' })

    const page = await getAdminSharedPrepaidPage('members', {
      frontendUserIds: ['front-1'], page: 1, pageSize: 20
    })
    expect(page.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      'member-1', 'member-consumer-only', 'member-settlement-only'
    ]))
    for (const item of page.items) {
      expect(item).not.toHaveProperty('recharges')
      expect(item).not.toHaveProperty('consumptions')
      expect(item).not.toHaveProperty('ledgerEntries')
      expect(item).not.toHaveProperty('historyTruncated')
    }

    const detail = await getAdminSharedPrepaidDetail('members', 'member-consumer-only', ['front-1'])
    expect(detail).toMatchObject({
      id: 'member-consumer-only',
      consumptions: [expect.objectContaining({ id: 'consumption-consumer-only' })],
      historyTruncated: expect.any(Object)
    })
  })

  it('returns audit detail through GET', async () => {
    const detail = await getAdminSharedPrepaidDetail('settlements', 'settlement-1', ['front-1'])
    expect(detail).toMatchObject({
      id: 'settlement-1',
      proofUrls: ['/uploads/prepaid-proof-demo.jpg'],
      actions: [expect.objectContaining({ operation: 'SUBMIT_PAYMENT' })]
    })

  })

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'rejects the %s mutation method independently',
    async (method) => {
      await expect(request[method]('/admin/shared-prepaid/recharges'))
        .rejects.toThrow('后台共享预存款只读')
    }
  )
})
