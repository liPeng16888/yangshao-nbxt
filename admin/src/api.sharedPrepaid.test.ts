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

  it('dynamically scopes member totals and detail histories for every participation path', async () => {
    await adminLogin({ account: 'sub001', password: 'sub123456' })

    const page = await getAdminSharedPrepaidPage('members', {
      frontendUserIds: ['front-1'], page: 1, pageSize: 20
    })
    const byId = new Map(page.items.map((item) => [item.id, item as Record<string, any>]))
    expect([...byId.keys()]).toEqual(expect.arrayContaining([
      'member-1', 'member-consumer-only', 'member-settlement-only'
    ]))
    // member-1 is source-only for this admin: only its 10 allocation is scoped in.
    expect(byId.get('member-1')).toMatchObject({ consumedTotal: 10 })
    // The consumer owns this row, so its full amount is counted.
    expect(byId.get('member-consumer-only')).toMatchObject({ consumedTotal: 30 })
    // Settlement participation grants visibility, not consumption ownership.
    expect(byId.get('member-settlement-only')).toMatchObject({
      consumedTotal: 0,
      latestConsumptionTime: null
    })
    for (const item of page.items) {
      expect(item).not.toHaveProperty('recharges')
      expect(item).not.toHaveProperty('consumptions')
      expect(item).not.toHaveProperty('ledgerEntries')
      expect(item).not.toHaveProperty('historyTruncated')
    }

    const consumerDetail = await getAdminSharedPrepaidDetail('members', 'member-consumer-only', ['front-1'])
    expect(consumerDetail).toMatchObject({
      id: 'member-consumer-only',
      consumptions: [expect.objectContaining({ id: 'consumption-consumer-only' })],
      historyTruncated: expect.any(Object)
    })

    const sourceDetail = await getAdminSharedPrepaidDetail('members', 'member-1', ['front-1'])
    expect(sourceDetail).toMatchObject({ consumedTotal: 10 })
    expect(sourceDetail.consumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'consumption-1',
        sourceOwners: expect.any(Array),
        sourceOwnersTruncated: false
      })
    ]))
    expect((sourceDetail.consumptions as Array<Record<string, unknown>>)[0]).not.toHaveProperty('allocations')

    const settlementDetail = await getAdminSharedPrepaidDetail('members', 'member-settlement-only', ['front-1'])
    expect(settlementDetail).toMatchObject({
      consumedTotal: 0,
      latestConsumptionTime: null,
      consumptions: []
    })

    window.localStorage.clear()
    const rootPage = await getAdminSharedPrepaidPage('members', {
      frontendUserIds: ['front-1', 'front-2'], page: 1, pageSize: 20
    })
    // front-2 is the consumer, so the mixed 10/90 allocations still count the full 100 exactly once.
    expect(rootPage.items.find((item) => item.id === 'member-1')).toMatchObject({ consumedTotal: 100 })
  })

  it('returns audit detail through GET', async () => {
    const detail = await getAdminSharedPrepaidDetail('settlements', 'settlement-1', ['front-1'])
    expect(detail).toMatchObject({
      id: 'settlement-1',
      proofUrls: ['/uploads/prepaid-proof-demo.jpg'],
      actions: [expect.objectContaining({ operation: 'SUBMIT_PAYMENT' })]
    })

  })

  it('filters reversal rows by their effective original allocation sources', async () => {
    await adminLogin({ account: 'sub001', password: 'sub123456' })

    const withoutSourceFilter = await getAdminSharedPrepaidPage('consumptions', {
      frontendUserIds: ['front-1'], page: 1, pageSize: 20
    })
    expect(withoutSourceFilter.items.map((item) => item.id)).toContain('consumption-reversal-1')

    const matchingSource = await getAdminSharedPrepaidPage('consumptions', {
      frontendUserIds: ['front-1'], sourceOwnerId: 'front-1', page: 1, pageSize: 20
    })
    expect(matchingSource.items.map((item) => item.id)).toContain('consumption-reversal-1')

    const nonmatchingSource = await getAdminSharedPrepaidPage('consumptions', {
      frontendUserIds: ['front-1'], sourceOwnerId: 'front-3', page: 1, pageSize: 20
    })
    expect(nonmatchingSource.items.map((item) => item.id)).not.toContain('consumption-reversal-1')
  })

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'rejects the %s mutation method independently',
    async (method) => {
      await expect(request[method]('/admin/shared-prepaid/recharges'))
        .rejects.toThrow('后台共享预存款只读')
    }
  )
})
