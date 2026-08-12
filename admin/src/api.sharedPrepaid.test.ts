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

  it('returns audit detail through GET while rejecting every admin prepaid mutation method', async () => {
    const detail = await getAdminSharedPrepaidDetail('settlements', 'settlement-1', ['front-1'])
    expect(detail).toMatchObject({
      id: 'settlement-1',
      proofUrls: ['/uploads/prepaid-proof-demo.jpg'],
      actions: [expect.objectContaining({ operation: 'SUBMIT_PAYMENT' })]
    })

    for (const method of ['post', 'patch', 'delete'] as const) {
      await expect(request[method]('/admin/shared-prepaid/recharges')).rejects.toThrow('后台共享预存款只读')
    }
  })
})
