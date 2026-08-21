// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const axiosMock = vi.hoisted(() => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
  return { instance, create: vi.fn(() => instance) }
})

vi.mock('axios', () => ({ default: { create: axiosMock.create } }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

async function importRealApi() {
  vi.stubEnv('VITE_ADMIN_USE_MOCKS', 'false')
  return import('./api')
}

async function importMockApi() {
  vi.stubEnv('VITE_ADMIN_USE_MOCKS', 'true')
  return import('./api')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  }
  return value
}

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

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  window.localStorage.clear()
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('admin lab sample change request real API contract', () => {
  it('serializes account, status, and date filters for the admin list endpoint', async () => {
    axiosMock.instance.get.mockResolvedValue([])
    const api = await importRealApi()

    await api.getAdminLabSampleChangeRequests({
      frontendUserIds: ['front-1', 'front-2'],
      status: 'PENDING',
      date: '2026-08-19'
    })

    expect(axiosMock.instance.get).toHaveBeenCalledWith('/admin/lab-sheet-change-requests', {
      params: { frontendUserIds: 'front-1,front-2', status: 'PENDING', date: '2026-08-19' }
    })
  })

  it('uses separate whole-request endpoints, keeps approval remarks optional, and trims required rejection reasons', async () => {
    axiosMock.instance.post.mockResolvedValue({})
    const api = await importRealApi()

    await api.approveAdminLabSampleChangeRequest('request-1')
    await api.approveAdminLabSampleChangeRequest('request-2', '已核对')
    await api.rejectAdminLabSampleChangeRequest('request-3', '  原始凭证不一致  ')

    expect(axiosMock.instance.post).toHaveBeenNthCalledWith(1, '/admin/lab-sheet-change-requests/request-1/approve', {})
    expect(axiosMock.instance.post).toHaveBeenNthCalledWith(2, '/admin/lab-sheet-change-requests/request-2/approve', { reviewRemark: '已核对' })
    expect(axiosMock.instance.post).toHaveBeenNthCalledWith(3, '/admin/lab-sheet-change-requests/request-3/reject', { reviewRemark: '原始凭证不一致' })
  })

  it('rejects an empty trimmed rejection reason before issuing a write request', async () => {
    const api = await importRealApi()

    await expect(api.rejectAdminLabSampleChangeRequest('request-1', '   ')).rejects.toThrow('请填写拒绝原因')
    expect(axiosMock.instance.post).not.toHaveBeenCalled()
  })
})

describe('admin lab sample change request Mock lifecycle', () => {
  it('returns a fully isolated lab-sheet graph on every GET', async () => {
    const api = await importMockApi()
    const first = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: '2026-06-25' } }) as any[]
    const pristine = clone(first)

    first[0].sampleBlocks[0].id = 'mutated-block'
    first[0].sampleBlocks[0].inputs.siliconRaw = 999
    first[0].sampleBlocks[0].results.silicon = 999
    first[0].sampleBlocks.push({ id: 'injected-block', inputs: {}, results: {} })

    const second = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: '2026-06-25' } }) as any[]
    expect(second).toEqual(pristine)
    expect(second).not.toBe(first)
    expect(second[0].sampleBlocks[0]).not.toBe(first[0].sampleBlocks[0])
  })

  it('filters authorized lab sheets by their real date instead of rewriting sheet dates', async () => {
    const api = await importMockApi()

    const dated = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: '2026-06-25' } }) as any[]
    const missing = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: '2099-01-01' } }) as any[]

    expect(dated).toHaveLength(1)
    expect(dated[0]).toMatchObject({ id: 'sheet-1', date: '2026-06-25' })
    expect(missing).toEqual([])
  })

  it('seeds a pending server-shaped request and applies account, status, and date filters', async () => {
    const api = await importMockApi()

    const rows = await api.getAdminLabSampleChangeRequests({
      frontendUserIds: ['front-1'], status: 'PENDING', date: '2026-06-25'
    })
    const detail = await api.getAdminLabSampleChangeRequest(rows[0]!.id)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      frontendUserId: 'front-1', status: 'PENDING',
      requestedBy: { id: 'front-1', account: 'kaili001', username: '凯里化验室' },
      reviewedBy: null
    })
    expect(detail).toMatchObject({
      frontendUserId: 'front-1',
      requestedBy: { id: 'front-1', account: 'kaili001', username: '凯里化验室' },
      reviewedBy: null,
      sourceSnapshot: { inputs: expect.any(Object), results: expect.any(Object), parameterSnapshot: expect.any(Object) },
      requestedChanges: expect.any(Object),
      previewResults: expect.any(Object),
      settlementEffects: []
    })
    expect(await api.getAdminLabSampleChangeRequests({ frontendUserIds: ['front-2'], date: '2026-06-25' })).toEqual([])
    expect(await api.getAdminLabSampleChangeRequests({ status: 'REJECTED' })).toEqual([])
    expect(await api.getAdminLabSampleChangeRequests({ date: '2026-06-24' })).toEqual([])
  })

  it('approves only requested changes, recalculates from the saved parameter snapshot, and resets affected paid settlements', async () => {
    const api = await importMockApi()
    const [summary] = await api.getAdminLabSampleChangeRequests({ status: 'PENDING' })
    const before = await api.getAdminLabSampleChangeRequest(summary!.id)
    const [sheetBefore] = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: before.date } }) as any[]
    const blockBefore = deepFreeze(clone(sheetBefore.sampleBlocks.find((row: any) => row.id === before.blockId))) as any

    const approved = await api.approveAdminLabSampleChangeRequest(summary!.id, '已核对')
    const [sheetAfter] = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: before.date } }) as any[]
    const blockAfter = sheetAfter.sampleBlocks.find((row: any) => row.id === before.blockId)
    const monthly = await api.request.get('/admin/finance/monthly-bills') as { summaryRows: any[] }

    expect(blockAfter.inputs).toMatchObject({ sampleNumber: '新样品', price: 120, ironRaw: 2, customerText: '王五' })
    const {
      sampleNumber: _oldSampleNumber, price: _oldPrice, ironRaw: _oldIronRaw,
      customerText: _oldCustomerText, customerId: _oldCustomerId, customerIds: _oldCustomerIds, customers: _oldCustomers,
      ...unchangedBefore
    } = blockBefore.inputs
    const {
      sampleNumber: _newSampleNumber, price: _newPrice, ironRaw: _newIronRaw,
      customerText: _newCustomerText, customerId: _newCustomerId, customerIds: _newCustomerIds, customers: _newCustomers,
      ...unchangedAfter
    } = blockAfter.inputs
    expect(unchangedAfter).toEqual(unchangedBefore)
    expect(blockAfter.inputs).toMatchObject({ siliconRaw: 1.05, aluminumRaw: 2.7, sulfur: 0.08 })
    expect(approved).toMatchObject({
      status: 'APPROVED', review: { remark: '已核对' },
      requestedBy: { id: 'front-1', account: 'kaili001', username: '凯里化验室' },
      reviewedBy: { id: 'root-admin', account: 'admin', username: '主账号' },
      previewResults: { iron: 50 }, actualResults: { iron: 50 },
      settlementEffects: expect.arrayContaining([
        expect.objectContaining({ customer: '李四', oldStatus: 'PAID', newStatus: 'UNPAID' }),
        expect.objectContaining({ customer: '王五', oldStatus: 'PARTIAL', newStatus: 'UNPAID' })
      ])
    })
    expect(blockAfter.results).toEqual(approved.actualResults)
    expect(monthly.summaryRows.filter((row) => ['李四', '王五'].includes(row.customer))).toEqual(expect.arrayContaining([
      expect.objectContaining({ customer: '李四', settlementStatus: '未结款', paidAmount: null }),
      expect.objectContaining({ customer: '王五', settlementStatus: '未结款', paidAmount: null })
    ]))
    await expect(api.approveAdminLabSampleChangeRequest(summary!.id)).rejects.toThrow('状态已变更')
    await expect(api.rejectAdminLabSampleChangeRequest(summary!.id, '重复处理')).rejects.toThrow('状态已变更')
  })

  it('resets only the old payer when a monthly sample becomes non-monthly', async () => {
    const api = await importMockApi()
    const [summary] = await api.getAdminLabSampleChangeRequests({ status: 'PENDING', date: '2026-06-26' })
    const prepaidBefore = clone({
      recharges: await api.request.get('/admin/finance/prepaid-recharges'),
      report: await api.request.get('/admin/finance/prepaid-report')
    })

    const approved = await api.approveAdminLabSampleChangeRequest(summary!.id)
    const monthly = await api.request.get('/admin/finance/monthly-bills') as { summaryRows: any[] }
    const prepaidAfter = clone({
      recharges: await api.request.get('/admin/finance/prepaid-recharges'),
      report: await api.request.get('/admin/finance/prepaid-report')
    })

    expect(approved.settlementEffects).toEqual([
      expect.objectContaining({ customer: '李四', oldStatus: 'PAID', oldPaidAmount: 100, oldRemark: '已结清', newStatus: 'UNPAID' })
    ])
    expect(monthly.summaryRows.find((row) => row.frontendUserId === 'front-2' && row.customer === '李四')).toMatchObject({
      settlementStatus: '未结款', paidAmount: null, remark: '因历史样品修改审批，需按新汇总重新核对'
    })
    expect(monthly.summaryRows.find((row) => row.frontendUserId === 'front-2' && row.customer === '王五')).toMatchObject({
      status: 'PARTIAL', settlementStatus: '部分结款', paidAmount: 20, remark: '部分结款'
    })
    expect(prepaidAfter).toEqual(prepaidBefore)
  })

  it('resets only the new payer when a non-monthly sample becomes monthly and changes customer', async () => {
    const api = await importMockApi()
    const [summary] = await api.getAdminLabSampleChangeRequests({ status: 'PENDING', date: '2026-06-27' })
    const prepaidBefore = clone({
      recharges: await api.request.get('/admin/finance/prepaid-recharges'),
      report: await api.request.get('/admin/finance/prepaid-report')
    })

    const approved = await api.approveAdminLabSampleChangeRequest(summary!.id)
    const monthly = await api.request.get('/admin/finance/monthly-bills') as { summaryRows: any[] }
    const prepaidAfter = clone({
      recharges: await api.request.get('/admin/finance/prepaid-recharges'),
      report: await api.request.get('/admin/finance/prepaid-report')
    })

    expect(approved.settlementEffects).toEqual([
      expect.objectContaining({ customer: '王五', oldStatus: 'PARTIAL', oldPaidAmount: 20, oldRemark: '部分结款', newStatus: 'UNPAID' })
    ])
    expect(monthly.summaryRows.find((row) => row.frontendUserId === 'front-2' && row.customer === '李四')).toMatchObject({
      status: 'PAID', settlementStatus: '已结款', paidAmount: 100, remark: '已结清'
    })
    expect(monthly.summaryRows.find((row) => row.frontendUserId === 'front-2' && row.customer === '王五')).toMatchObject({
      settlementStatus: '未结款', paidAmount: null, remark: '因历史样品修改审批，需按新汇总重新核对'
    })
    expect(prepaidAfter).toEqual(prepaidBefore)
  })

  it('requires a trimmed rejection reason and rejects the whole pending request without changing the sample', async () => {
    const api = await importMockApi()
    const [summary] = await api.getAdminLabSampleChangeRequests({ status: 'PENDING' })
    const sheetQuery = { params: { date: summary!.date } }
    const [sheetBefore] = await api.request.get('/admin/data-statistics/lab-sheets', sheetQuery) as any[]

    await expect(api.rejectAdminLabSampleChangeRequest(summary!.id, '  ')).rejects.toThrow('请填写拒绝原因')
    const rejected = await api.rejectAdminLabSampleChangeRequest(summary!.id, '  记录有误  ')
    const [sheetAfter] = await api.request.get('/admin/data-statistics/lab-sheets', sheetQuery) as any[]

    expect(rejected).toMatchObject({
      status: 'REJECTED', review: { remark: '记录有误' },
      requestedBy: { id: 'front-1', account: 'kaili001', username: '凯里化验室' },
      reviewedBy: { id: 'root-admin', account: 'admin', username: '主账号' }
    })
    expect(sheetAfter.sampleBlocks).toEqual(sheetBefore.sampleBlocks)
    await expect(api.rejectAdminLabSampleChangeRequest(summary!.id, '再次拒绝')).rejects.toThrow('状态已变更')
  })

  it('enforces the same sub-admin account scope instead of using Mock data to bypass authorization', async () => {
    const api = await importMockApi()
    await api.adminLogin({ account: 'sub001', password: 'sub123456' })

    await expect(api.getAdminLabSampleChangeRequests({ frontendUserIds: ['front-2'] })).rejects.toThrow('没有访问部分前端账号的权限')
    await expect(api.request.get('/admin/data-statistics/lab-sheets', { params: { frontendUserIds: 'front-2' } })).rejects.toThrow('没有访问部分前端账号的权限')
    expect((await api.getAdminLabSampleChangeRequests({ frontendUserIds: ['front-1'] }))).toHaveLength(1)
  })
})
