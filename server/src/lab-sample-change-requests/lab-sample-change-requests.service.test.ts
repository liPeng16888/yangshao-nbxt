import { ConflictException, ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyInputs, defaultLabParameters } from '../common/lab'
import { LabSampleChangeRequestStatus } from './lab-sample-change-request.types'
import { LabSampleChangeRequestsService } from './lab-sample-change-requests.service'

const frontendUser = { id: 'front-1', account: 'front', username: '前台', role: 'FRONTEND_USER' as const }
const grants = { historical: 'history-grant', completedData: 'completed-grant' }
const historicalDate = '2026-08-19'

function makeHistoricalBlock(overrides: Record<string, unknown> = {}) {
  const inputs = {
    ...createEmptyInputs(1),
    sampleNumber: '旧样品', customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1,
    ...((overrides.inputs || {}) as Record<string, unknown>)
  }
  return {
    id: 'block-1', index: 1, inputs, results: { iron: 1 }, parameterSnapshot: defaultLabParameters,
    updatedAt: new Date('2026-08-19T08:00:00.000Z'),
    sheet: { id: 'sheet-1', frontendUserId: 'front-1', date: historicalDate },
    ...overrides
  }
}

function makeCurrentBlock() {
  return makeHistoricalBlock({ sheet: { id: 'sheet-current', frontendUserId: 'front-1', date: '2026-08-20' } })
}

function validCreateDto() {
  return {
    blockId: 'block-1', baseUpdatedAt: '2026-08-19T08:00:00.000Z',
    changes: { sampleNumber: '新样品' }, reason: '客户要求更正'
  }
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1', frontendUserId: 'front-1', requestedById: 'front-1', sheetId: 'sheet-1', blockId: 'block-1',
    date: historicalDate, blockIndex: 1, baseBlockUpdatedAt: new Date('2026-08-19T08:00:00.000Z'),
    sourceSnapshot: { inputs: makeHistoricalBlock().inputs, results: { iron: 1 }, parameterSnapshot: defaultLabParameters },
    requestedChanges: { sampleNumber: '新样品' }, previewResults: { iron: 57.036 }, reason: '客户要求更正',
    status: LabSampleChangeRequestStatus.PENDING, reviewRemark: null, reviewedById: null, reviewedAt: null,
    withdrawnAt: null, createdAt: new Date('2026-08-20T01:00:00.000Z'), updatedAt: new Date('2026-08-20T01:00:00.000Z'),
    ...overrides
  }
}

describe('LabSampleChangeRequestsService frontend lifecycle', () => {
  const prisma = {
    sampleBlock: { findUnique: vi.fn() },
    customer: { findMany: vi.fn() },
    labSampleChangeRequest: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() }
  }
  const auth = { assertAccessGrant: vi.fn() }
  let service: LabSampleChangeRequestsService

  beforeEach(() => {
    vi.clearAllMocks()
    auth.assertAccessGrant.mockResolvedValue(undefined)
    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(null)
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.create.mockImplementation(async ({ data }: any) => ({
      id: 'request-1', ...data, status: LabSampleChangeRequestStatus.PENDING,
      reviewRemark: null, reviewedAt: null, withdrawnAt: null, createdAt: new Date(), updatedAt: new Date()
    }))
    prisma.labSampleChangeRequest.update.mockImplementation(async ({ data }: any) => makeRequest(data))
    service = new LabSampleChangeRequestsService(prisma as never, auth as never)
  })

  it('creates a server-normalized pending request for a historical sample', async () => {
    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({
      inputs: { ...makeHistoricalBlock().inputs, customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1 }
    }))
    prisma.customer.findMany.mockResolvedValue([{ id: 'c-1', name: '王总', phone: null, wechat: null, wechatNickname: null }])

    const row = await service.createForFrontend(frontendUser, {
      blockId: 'block-1', baseUpdatedAt: '2026-08-19T08:00:00.000Z',
      changes: { sampleNumber: '新样品', payerCustomer: { customerIds: ['c-1'], customerText: '伪造客户名' }, ironRaw: 2 },
      reason: '  客户要求更正  '
    }, grants)

    expect(row.status).toBe(LabSampleChangeRequestStatus.PENDING)
    expect(prisma.labSampleChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      requestedById: 'front-1', frontendUserId: 'front-1', blockId: 'block-1', reason: '客户要求更正',
      requestedChanges: expect.objectContaining({ sampleNumber: '新样品', ironRaw: 2 }),
      sourceSnapshot: expect.objectContaining({ inputs: expect.objectContaining({ customerIds: ['c-old'] }) }),
      previewResults: expect.objectContaining({ iron: expect.any(Number) })
    }) })
    const data = prisma.labSampleChangeRequest.create.mock.calls[0][0].data
    expect((data.sourceSnapshot as any).inputs.customers).toEqual([])
    expect((data.requestedChanges as any).payerCustomer).toEqual({ customerIds: ['c-1'], customerText: '王总' })
  })

  it('rejects today, empty diffs, foreign customers, forbidden keys, and an existing pending request', async () => {
    prisma.sampleBlock.findUnique.mockResolvedValue(makeCurrentBlock())
    await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toThrow('仅支持申请修改历史日期样品')

    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: {} }, grants)).rejects.toThrow('请至少修改一项内容')
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: { sampleNumber: '旧样品' } }, grants)).rejects.toThrow('请至少修改一项内容')
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: { payerCustomer: { customerIds: ['foreign'], customerText: '外部' } } }, grants)).rejects.toThrow('付款客户无效')
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: { completed: true } }, grants)).rejects.toThrow('不允许修改字段: completed')

    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest())
    await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toBeInstanceOf(ConflictException)
  })

  it('requires historical access grant when creating a protected historical request', async () => {
    auth.assertAccessGrant.mockRejectedValue(new ForbiddenException('访问授权无效或已过期'))
    await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toBeInstanceOf(ForbiddenException)
    expect(auth.assertAccessGrant).toHaveBeenCalledWith('front-1', 'history-grant', 'HISTORICAL_DATES')
  })

  it('requires completed-data access only when a completed sample is created or detailed', async () => {
    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: { ...makeHistoricalBlock().inputs, completed: true } }))
    await service.createForFrontend(frontendUser, validCreateDto(), grants)
    expect(auth.assertAccessGrant).toHaveBeenCalledWith('front-1', 'completed-grant', 'COMPLETED_SAMPLE_DATA')

    vi.clearAllMocks()
    auth.assertAccessGrant.mockResolvedValue(undefined)
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest())
    await service.getForFrontend(frontendUser, 'request-1', grants)
    expect(auth.assertAccessGrant).toHaveBeenCalledTimes(0)

    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest({ sourceSnapshot: { inputs: { completed: true } } }))
    await service.getForFrontend(frontendUser, 'request-1', grants)
    expect(auth.assertAccessGrant).toHaveBeenCalledWith('front-1', 'completed-grant', 'COMPLETED_SAMPLE_DATA')
  })

  it('scopes frontend lists and hides source snapshots from summaries', async () => {
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([makeRequest()])
    const rows = await service.listForFrontend(frontendUser, { date: historicalDate, status: LabSampleChangeRequestStatus.PENDING }, grants)

    expect(prisma.labSampleChangeRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      frontendUserId: 'front-1', date: historicalDate, status: LabSampleChangeRequestStatus.PENDING
    } }))
    expect(rows[0]).not.toHaveProperty('sourceSnapshot')
    expect(rows[0]).toMatchObject({ id: 'request-1', sampleName: '旧样品', changedFieldLabels: ['样品编号'] })
  })

  it('rejects a blank reason after trimming it', async () => {
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), reason: '  ' }, grants)).rejects.toThrow('请填写申请原因')
  })

  it('translates a pending-index race conflict with the existing request summary', async () => {
    prisma.labSampleChangeRequest.create.mockRejectedValue({ code: 'P2002' })
    prisma.labSampleChangeRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(makeRequest())

    await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toMatchObject({
      response: expect.objectContaining({ request: expect.objectContaining({ id: 'request-1' }) })
    })
  })

  it('allows only the owner to withdraw a pending request and preserves its record', async () => {
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest({ status: LabSampleChangeRequestStatus.PENDING }))
    await service.withdrawForFrontend(frontendUser, 'request-1', grants)
    expect(prisma.labSampleChangeRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' }, data: { status: LabSampleChangeRequestStatus.WITHDRAWN, withdrawnAt: expect.any(Date) }, include: expect.any(Object)
    })

    expect(prisma.labSampleChangeRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
      id: 'request-1', frontendUserId: 'front-1', status: LabSampleChangeRequestStatus.PENDING
    } }))
  })
})
