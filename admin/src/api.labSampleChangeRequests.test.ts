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
  it('seeds a pending server-shaped request and applies account, status, and date filters', async () => {
    const api = await importMockApi()

    const rows = await api.getAdminLabSampleChangeRequests({
      frontendUserIds: ['front-1'], status: 'PENDING', date: '2026-06-25'
    })
    const detail = await api.getAdminLabSampleChangeRequest(rows[0]!.id)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ frontendUserId: 'front-1', status: 'PENDING' })
    expect(detail).toMatchObject({
      frontendUserId: 'front-1',
      sourceSnapshot: { inputs: expect.any(Object), results: expect.any(Object), parameterSnapshot: expect.any(Object) },
      requestedChanges: expect.any(Object),
      previewResults: expect.any(Object),
      settlementEffects: []
    })
    expect(await api.getAdminLabSampleChangeRequests({ frontendUserIds: ['front-2'] })).toEqual([])
    expect(await api.getAdminLabSampleChangeRequests({ status: 'REJECTED' })).toEqual([])
    expect(await api.getAdminLabSampleChangeRequests({ date: '2026-06-24' })).toEqual([])
  })

  it('approves only requested changes, recalculates from the saved parameter snapshot, and resets affected paid settlements', async () => {
    const api = await importMockApi()
    const [summary] = await api.getAdminLabSampleChangeRequests({ status: 'PENDING' })
    const before = await api.getAdminLabSampleChangeRequest(summary!.id)
    const [sheetBefore] = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: before.date } }) as any[]
    const blockBefore = sheetBefore.sampleBlocks.find((row: any) => row.id === before.blockId)

    const approved = await api.approveAdminLabSampleChangeRequest(summary!.id, '已核对')
    const [sheetAfter] = await api.request.get('/admin/data-statistics/lab-sheets', { params: { date: before.date } }) as any[]
    const blockAfter = sheetAfter.sampleBlocks.find((row: any) => row.id === before.blockId)
    const monthly = await api.request.get('/admin/finance/monthly-bills') as { summaryRows: any[] }

    expect(blockAfter.inputs).toMatchObject({ sampleNumber: '新样品', price: 120, ironRaw: 2, customerText: '王五' })
    expect(blockAfter.inputs.siliconRaw).toBe(blockBefore.inputs.siliconRaw)
    expect(approved).toMatchObject({
      status: 'APPROVED', review: { remark: '已核对' },
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

  it('requires a trimmed rejection reason and rejects the whole pending request without changing the sample', async () => {
    const api = await importMockApi()
    const [summary] = await api.getAdminLabSampleChangeRequests({ status: 'PENDING' })
    const [sheetBefore] = await api.request.get('/admin/data-statistics/lab-sheets') as any[]

    await expect(api.rejectAdminLabSampleChangeRequest(summary!.id, '  ')).rejects.toThrow('请填写拒绝原因')
    const rejected = await api.rejectAdminLabSampleChangeRequest(summary!.id, '  记录有误  ')
    const [sheetAfter] = await api.request.get('/admin/data-statistics/lab-sheets') as any[]

    expect(rejected).toMatchObject({ status: 'REJECTED', review: { remark: '记录有误' } })
    expect(sheetAfter.sampleBlocks).toEqual(sheetBefore.sampleBlocks)
    await expect(api.rejectAdminLabSampleChangeRequest(summary!.id, '再次拒绝')).rejects.toThrow('状态已变更')
  })

  it('enforces the same sub-admin account scope instead of using Mock data to bypass authorization', async () => {
    const api = await importMockApi()
    await api.adminLogin({ account: 'sub001', password: 'sub123456' })

    await expect(api.getAdminLabSampleChangeRequests({ frontendUserIds: ['front-2'] })).rejects.toThrow('没有访问部分前端账号的权限')
    expect((await api.getAdminLabSampleChangeRequests({ frontendUserIds: ['front-1'] }))).toHaveLength(1)
  })
})
