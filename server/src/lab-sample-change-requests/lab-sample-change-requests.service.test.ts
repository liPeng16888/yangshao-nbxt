import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { MonthlySettlementStatus, ReminderType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyInputs, defaultLabParameters } from '../common/lab'
import { LabSampleChangeRequestStatus } from './lab-sample-change-request.types'
import { LabSampleChangeRequestsService } from './lab-sample-change-requests.service'

const frontendUser = { id: 'front-1', account: 'front', username: '前台', role: 'FRONTEND_USER' as const }
const rootAdmin = { id: 'admin-1', account: 'root', username: '超级管理员', role: 'ROOT_ADMIN' as const }
const subAdmin = { id: 'sub-1', account: 'sub', username: '子管理员', role: 'SUB_ADMIN' as const }
const grants = { historical: 'history-grant', completedData: 'completed-grant' }
const historicalDate = '2026-08-19'

function makeHistoricalBlock(overrides: Record<string, unknown> = {}) {
  const inputs = {
    ...createEmptyInputs(1),
    sampleNumber: '旧样品', customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1,
    ...((overrides.inputs || {}) as Record<string, unknown>)
  }
  return {
    id: 'block-1', sheetId: 'sheet-1', index: 1, inputs, results: { iron: 1 }, parameterSnapshot: defaultLabParameters,
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
    withdrawnAt: null, settlementEffects: null,
    createdAt: new Date('2026-08-20T01:00:00.000Z'), updatedAt: new Date('2026-08-20T01:00:00.000Z'),
    ...overrides
  }
}

describe('LabSampleChangeRequestsService frontend lifecycle', () => {
  const prisma = {
    $transaction: vi.fn(),
    sampleBlock: { findUnique: vi.fn() },
    customer: { findMany: vi.fn() },
    labSampleChangeRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() }
  }
  const transaction = {
    $queryRaw: vi.fn(),
    labSampleChangeRequest: { findUnique: vi.fn(), update: vi.fn() },
    labSheet: { findUnique: vi.fn() },
    sampleBlock: { findUnique: vi.fn(), update: vi.fn() },
    customer: { findMany: vi.fn() },
    monthlySettlementRecord: { findMany: vi.fn(), update: vi.fn() },
    reminder: { create: vi.fn() }
  }
  const auth = { assertAccessGrant: vi.fn() }
  const adminAccess = { getAllowedFrontendUserIds: vi.fn() }
  const cellChanges = { record: vi.fn() }
  let service: LabSampleChangeRequestsService

  beforeEach(() => {
    vi.clearAllMocks()
    auth.assertAccessGrant.mockResolvedValue(undefined)
    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(null)
    prisma.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.create.mockImplementation(async ({ data }: any) => ({
      id: 'request-1', ...data, status: LabSampleChangeRequestStatus.PENDING,
      reviewRemark: null, reviewedAt: null, withdrawnAt: null, createdAt: new Date(), updatedAt: new Date()
    }))
    prisma.labSampleChangeRequest.updateMany.mockResolvedValue({ count: 1 })
    prisma.$transaction.mockImplementation(async (operation: any) => operation(transaction))
    transaction.$queryRaw.mockResolvedValue([])
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    transaction.labSampleChangeRequest.update.mockImplementation(async ({ data }: any) => ({
      ...makeRequest(), ...data, updatedAt: new Date('2026-08-20T02:00:00.000Z')
    }))
    transaction.labSheet.findUnique.mockResolvedValue({ id: 'sheet-1', frontendUserId: 'front-1', date: historicalDate })
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    transaction.sampleBlock.update.mockResolvedValue(makeHistoricalBlock())
    transaction.customer.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.update.mockResolvedValue({})
    transaction.reminder.create.mockResolvedValue({})
    adminAccess.getAllowedFrontendUserIds.mockResolvedValue(['front-1'])
    cellChanges.record.mockResolvedValue(undefined)
    service = new LabSampleChangeRequestsService(prisma as never, auth as never, adminAccess as never, cellChanges as never)
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
    expect(prisma.labSampleChangeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', frontendUserId: 'front-1', status: LabSampleChangeRequestStatus.PENDING },
      data: { status: LabSampleChangeRequestStatus.WITHDRAWN, withdrawnAt: expect.any(Date) }
    })

    expect(prisma.labSampleChangeRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
      id: 'request-1', frontendUserId: 'front-1', status: LabSampleChangeRequestStatus.PENDING
    } }))
  })

  it('rejects a withdrawal race when its pending compare-and-set updates no row', async () => {
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest({ status: LabSampleChangeRequestStatus.PENDING }))
    prisma.labSampleChangeRequest.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.withdrawForFrontend(frontendUser, 'request-1', grants)).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.labSampleChangeRequest.updateMany).toHaveBeenCalledTimes(1)
  })
})

describe('LabSampleChangeRequestsService admin review', () => {
  const prisma = {
    $transaction: vi.fn(),
    labSampleChangeRequest: { findMany: vi.fn(), findUnique: vi.fn() }
  }
  const transaction = {
    $queryRaw: vi.fn(),
    labSampleChangeRequest: { findUnique: vi.fn(), update: vi.fn() },
    labSheet: { findUnique: vi.fn() },
    sampleBlock: { findUnique: vi.fn(), update: vi.fn() },
    customer: { findMany: vi.fn() },
    monthlySettlementRecord: { findMany: vi.fn(), update: vi.fn() },
    reminder: { create: vi.fn() }
  }
  const auth = { assertAccessGrant: vi.fn() }
  const adminAccess = { getAllowedFrontendUserIds: vi.fn() }
  const cellChanges = { record: vi.fn() }
  let service: LabSampleChangeRequestsService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (operation: any) => operation(transaction))
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    transaction.$queryRaw.mockResolvedValue([])
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    transaction.labSampleChangeRequest.update.mockImplementation(async ({ data }: any) => ({
      ...makeRequest(), ...data, updatedAt: new Date('2026-08-20T02:00:00.000Z')
    }))
    transaction.labSheet.findUnique.mockResolvedValue({ id: 'sheet-1', frontendUserId: 'front-1', date: historicalDate })
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    transaction.sampleBlock.update.mockResolvedValue(makeHistoricalBlock())
    transaction.customer.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.update.mockResolvedValue({})
    transaction.reminder.create.mockResolvedValue({})
    adminAccess.getAllowedFrontendUserIds.mockResolvedValue(['front-1'])
    cellChanges.record.mockResolvedValue(undefined)
    service = new LabSampleChangeRequestsService(prisma as never, auth as never, adminAccess as never, cellChanges as never)
  })

  it('approves one request atomically, recalculates from the sample snapshot, links logs, and reminds the owner', async () => {
    const snapshotParameters = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const currentInputs = { ...makeHistoricalBlock().inputs, ironRaw: 1, price: 80 }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      requestedChanges: { ironRaw: 2, price: 100 },
      sourceSnapshot: { inputs: currentInputs, results: {}, parameterSnapshot: snapshotParameters }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({
      inputs: currentInputs, results: {}, parameterSnapshot: snapshotParameters
    }))

    const approved = await service.approveForAdmin(rootAdmin, 'request-1', { reviewRemark: '已核对原始记录' })

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3)
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-1' },
      data: expect.objectContaining({ inputs: expect.objectContaining({ ironRaw: 2, price: 100 }), results: expect.objectContaining({ iron: 50 }) })
    }))
    expect(cellChanges.record).toHaveBeenCalledWith(transaction, expect.objectContaining({
      changedById: 'admin-1', changeRequestId: 'request-1',
      committedFields: expect.arrayContaining([expect.objectContaining({ field: 'ironRaw', oldValue: 1, newValue: 2 })])
    }))
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-1', status: LabSampleChangeRequestStatus.PENDING }),
      data: expect.objectContaining({ status: LabSampleChangeRequestStatus.APPROVED, reviewedById: 'admin-1', reviewRemark: '已核对原始记录' })
    }))
    expect(transaction.reminder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: ReminderType.LAB_SAMPLE_CHANGE_APPROVED, sourceType: 'lab_sample_change_request', sourceId: 'request-1'
    }) })
    expect(approved).toMatchObject({
      status: LabSampleChangeRequestStatus.APPROVED,
      previewResults: expect.objectContaining({ iron: 50 }),
      actualResults: expect.objectContaining({ iron: 50 })
    })
  })

  it('resets affected paid and partial monthly records and snapshots their old state', async () => {
    const oldInputs = {
      ...makeHistoricalBlock().inputs,
      customerId: 'c-old', customerIds: ['c-old'], customers: [{ id: 'c-old', name: '旧客户' }],
      customerText: '旧客户', paymentStatus: '月结款', price: 80
    }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      sourceSnapshot: { inputs: oldInputs, results: {}, parameterSnapshot: defaultLabParameters },
      requestedChanges: { payerCustomer: { customerIds: ['c-new'], customerText: '新客户' }, price: 100 }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: oldInputs }))
    transaction.customer.findMany.mockResolvedValue([
      { id: 'c-new', name: '新客户', phone: null, wechat: null, wechatNickname: null }
    ])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([
      { id: 'settle-old', month: '2026-08', frontendUserId: 'front-1', customer: '旧客户', status: MonthlySettlementStatus.PAID, paidAmount: 80, remark: '已结清' },
      { id: 'settle-new', month: '2026-08', frontendUserId: 'front-1', customer: '新客户', status: MonthlySettlementStatus.PARTIAL, paidAmount: 20, remark: '部分结款' }
    ])

    await service.approveForAdmin(rootAdmin, 'request-1', {})

    expect(transaction.monthlySettlementRecord.findMany).toHaveBeenCalledWith({ where: {
      month: '2026-08', frontendUserId: 'front-1', customer: { in: ['旧客户', '新客户'] }
    } })
    expect(transaction.monthlySettlementRecord.update).toHaveBeenCalledTimes(2)
    expect(transaction.monthlySettlementRecord.update).toHaveBeenCalledWith({
      where: { id: 'settle-old' },
      data: { status: MonthlySettlementStatus.UNPAID, paidAmount: null, remark: '因历史样品修改审批，需按新汇总重新核对' }
    })
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlementEffects: expect.arrayContaining([
        expect.objectContaining({ recordId: 'settle-old', oldStatus: MonthlySettlementStatus.PAID, oldPaidAmount: 80, oldRemark: '已结清', newStatus: MonthlySettlementStatus.UNPAID }),
        expect.objectContaining({ recordId: 'settle-new', oldStatus: MonthlySettlementStatus.PARTIAL })
      ]) })
    }))
  })

  it('resets monthly settlement when the payer identity changes but its display name stays the same', async () => {
    const oldInputs = {
      ...makeHistoricalBlock().inputs,
      customerId: 'c-old', customerIds: ['c-old'], customers: [{ id: 'c-old', name: '同名客户' }],
      customerText: '同名客户', paymentStatus: '月结款', price: 80
    }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      sourceSnapshot: { inputs: oldInputs, results: {}, parameterSnapshot: defaultLabParameters },
      requestedChanges: { payerCustomer: { customerIds: ['c-new'], customerText: '同名客户' } }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: oldInputs }))
    transaction.customer.findMany.mockResolvedValue([
      { id: 'c-new', name: '同名客户', phone: null, wechat: null, wechatNickname: null }
    ])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([{
      id: 'settle-same-name', month: '2026-08', frontendUserId: 'front-1', customer: '同名客户',
      status: MonthlySettlementStatus.PAID, paidAmount: 80, remark: '已结清'
    }])

    await service.approveForAdmin(rootAdmin, 'request-1', {})

    expect(transaction.monthlySettlementRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'settle-same-name' }
    }))
  })

  it.each([
    ['base timestamp', makeHistoricalBlock({ updatedAt: new Date('2026-08-20T00:00:00.000Z') })],
    ['source inputs', makeHistoricalBlock({ inputs: { ...makeHistoricalBlock().inputs, price: 81 } })],
    ['parameter snapshot', makeHistoricalBlock({ parameterSnapshot: { ...defaultLabParameters, ironFactor: 30 } })]
  ])('rolls back on %s conflict before any sample or settlement update', async (_kind, block) => {
    transaction.sampleBlock.findUnique.mockResolvedValue(block)

    await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toThrow('样品数据已变化')

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.monthlySettlementRecord.update).not.toHaveBeenCalled()
    expect(transaction.labSampleChangeRequest.update).not.toHaveBeenCalled()
  })

  it('allows an authorized sub-admin and rejects an unauthorized sub-admin with 403', async () => {
    await service.approveForAdmin(subAdmin, 'request-1', { remark: '授权审批' })
    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledWith(subAdmin, ['front-1'])
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reviewRemark: '授权审批' })
    }))

    vi.clearAllMocks()
    transaction.$queryRaw.mockResolvedValue([])
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    adminAccess.getAllowedFrontendUserIds.mockResolvedValue([])
    await expect(service.approveForAdmin(subAdmin, 'request-1', {})).rejects.toBeInstanceOf(ForbiddenException)
    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('returns 409 for a terminal request', async () => {
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({ status: LabSampleChangeRequestStatus.REJECTED }))

    await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toBeInstanceOf(ConflictException)
    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('lets a double approval update the sample only once', async () => {
    transaction.labSampleChangeRequest.findUnique
      .mockResolvedValueOnce(makeRequest())
      .mockResolvedValueOnce(makeRequest({ status: LabSampleChangeRequestStatus.APPROVED }))

    await service.approveForAdmin(rootAdmin, 'request-1', {})
    await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toBeInstanceOf(ConflictException)

    expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(1)
    expect(transaction.reminder.create).toHaveBeenCalledTimes(1)
  })

  it('rejects the whole request with a trimmed required reason and one transactional reminder', async () => {
    await expect(service.rejectForAdmin(rootAdmin, 'request-1', { remark: '  ' })).rejects.toBeInstanceOf(BadRequestException)

    const rejected = await service.rejectForAdmin(rootAdmin, 'request-1', { remark: '  原始凭证不足  ' })

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-1', status: LabSampleChangeRequestStatus.PENDING }),
      data: expect.objectContaining({ status: LabSampleChangeRequestStatus.REJECTED, reviewedById: 'admin-1', reviewRemark: '原始凭证不足' })
    }))
    expect(transaction.reminder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: ReminderType.LAB_SAMPLE_CHANGE_REJECTED, sourceType: 'lab_sample_change_request', sourceId: 'request-1'
    }) })
    expect(rejected.status).toBe(LabSampleChangeRequestStatus.REJECTED)
  })

  it('filters the admin list to AdminAccessService-authorized frontend accounts', async () => {
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([makeRequest()])

    const rows = await service.listForAdmin(subAdmin, {
      frontendUserId: 'front-1', date: historicalDate, status: LabSampleChangeRequestStatus.PENDING
    })

    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledWith(subAdmin, ['front-1'])
    expect(prisma.labSampleChangeRequest.findMany).toHaveBeenCalledWith({
      where: { frontendUserId: { in: ['front-1'] }, date: historicalDate, status: LabSampleChangeRequestStatus.PENDING },
      orderBy: { createdAt: 'desc' }
    })
    expect(rows[0]).not.toHaveProperty('sourceSnapshot')
  })

  it('returns authorized admin detail with snapshots and settlement effects', async () => {
    prisma.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      settlementEffects: [{ recordId: 'settle-1', oldStatus: MonthlySettlementStatus.PAID }]
    }))

    const detail = await service.getForAdmin(subAdmin, 'request-1')

    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledWith(subAdmin, ['front-1'])
    expect(detail).toMatchObject({
      id: 'request-1', sourceSnapshot: expect.any(Object), requestedChanges: expect.any(Object), previewResults: expect.any(Object),
      settlementEffects: [expect.objectContaining({ recordId: 'settle-1' })]
    })
  })

  it.each([
    ['nonexistent', []],
    ['already unpaid', [{
      id: 'settle-unpaid', month: '2026-08', frontendUserId: 'front-1', customer: '旧客户',
      status: MonthlySettlementStatus.UNPAID, paidAmount: null, remark: null
    }]]
  ])('does not reset %s monthly records', async (_kind, rows) => {
    const oldInputs = { ...makeHistoricalBlock().inputs, customerText: '旧客户', paymentStatus: '月结款', price: 80 }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      sourceSnapshot: { inputs: oldInputs, results: {}, parameterSnapshot: defaultLabParameters },
      requestedChanges: { price: 100 }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: oldInputs }))
    transaction.monthlySettlementRecord.findMany.mockResolvedValue(rows)

    await service.approveForAdmin(rootAdmin, 'request-1', {})

    expect(transaction.monthlySettlementRecord.update).not.toHaveBeenCalled()
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlementEffects: [] })
    }))
  })

  it('keeps the terminal write and reminder in the Prisma transaction so a reminder failure aborts approval', async () => {
    transaction.reminder.create.mockRejectedValue(new Error('reminder write failed'))

    await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toThrow('reminder write failed')

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(1)
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledTimes(1)
  })
})
