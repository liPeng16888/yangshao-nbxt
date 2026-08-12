import { FinanceDeletionRequestStatus, FinanceDeletionRequestType, Prisma, UserRole } from '@prisma/client'
import dayjs from 'dayjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { defaultLabParameters } from '../common/lab'
import { FinanceService } from './finance.service'

function getElementCounts(elementNote: string) {
  const service = new FinanceService({} as never, {} as never, {} as never)
  return (service as unknown as {
    getMonthlyElementCounts(inputs: Record<string, unknown>): Array<{ key: string; label: string; count: number }>
  }).getMonthlyElementCounts({ elementNote })
}

describe('FinanceService monthly element counts', () => {
  it('collapses aluminum, silicon and their ratio into the ratio item', () => {
    expect(getElementCounts('铝、硅、铝硅比、硫')).toEqual([
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 },
      { key: 'sulfur', label: '硫', count: 1 }
    ])
  })

  it('keeps aluminum or silicon when they are selected separately', () => {
    expect(getElementCounts('铝')).toEqual([{ key: 'aluminum', label: '铝', count: 1 }])
    expect(getElementCounts('硅')).toEqual([{ key: 'silicon', label: '硅', count: 1 }])
  })

  it('counts a standalone aluminum-silicon ratio selection as the combined ratio item', () => {
    expect(getElementCounts('铝硅比')).toEqual([
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 }
    ])
  })
})

describe('FinanceService shared prepaid income', () => {
  it('counts prepaid samples once and recognizes only active paid principal as income', async () => {
    const prisma = {
      labSheet: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'sheet-1',
          date: '2026-08-12',
          frontendUserId: 'front-1',
          frontendUser: { id: 'front-1', username: 'lab', account: 'lab', displayRemark: null },
          sampleBlocks: [{
            id: 'block-1',
            index: 1,
            inputs: { sampleNumber: 'A-1', paymentStatus: '预存款', price: 100 }
          }]
        }])
      },
      sharedPrepaidRecharge: {
        findMany: vi.fn().mockResolvedValue([{
          rechargeDate: '2026-08-12',
          paidAmount: 1000,
          giftAmount: 100,
          totalAmount: 1100
        }])
      },
      prepaidRechargeRecord: {
        findMany: vi.fn().mockResolvedValue([{
          rechargeDate: '2026-08-12',
          amount: 100,
          usableTimes: 10
        }])
      }
    }
    const service = new FinanceService(prisma as never, {} as never, {} as never)

    const report = await service.getFrontendIncomeReport('front-1', '2026-08')

    expect(prisma.sharedPrepaidRecharge.findMany).toHaveBeenCalledWith({
      where: {
        ownerFrontendUserId: 'front-1',
        rechargeDate: { gte: '2026-08-01', lte: '2026-08-31' },
        reversedAt: null
      }
    })
    expect(prisma.prepaidRechargeRecord.findMany).not.toHaveBeenCalled()
    expect(report.statusSummaries.find((row) => row.status === '预存款')).toMatchObject({ count: 1, amount: 1000 })
    expect(report.totalAmount).toBe(1000)
    expect(report.totalSamples).toBe(1)
  })
})

describe('FinanceService admin income cards', () => {
  it('keeps daily detail scoped while week/month cards use all authorized active rows', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T04:00:00.000Z'))
    const today = '2026-08-12'
    const earlier = '2026-08-10'
    const sheets = [
      {
        id: 'sheet-today', date: today, frontendUserId: 'front-1',
        frontendUser: { id: 'front-1', username: 'front-1', account: 'front-1', displayRemark: null },
        sampleBlocks: [{ id: 'block-today', index: 1, inputs: { paymentStatus: '预存款', price: 100 } }]
      },
      {
        id: 'sheet-earlier', date: earlier, frontendUserId: 'front-2',
        frontendUser: { id: 'front-2', username: 'front-2', account: 'front-2', displayRemark: null },
        sampleBlocks: [{ id: 'block-earlier', index: 1, inputs: { paymentStatus: '已结款', price: 25.35 } }]
      },
      {
        id: 'sheet-denied', date: earlier, frontendUserId: 'front-3',
        frontendUser: { id: 'front-3', username: 'front-3', account: 'front-3', displayRemark: null },
        sampleBlocks: [{ id: 'block-denied', index: 1, inputs: { paymentStatus: '已结款', price: 500 } }]
      }
    ]
    const recharges = [
      { ownerFrontendUserId: 'front-1', rechargeDate: today, paidAmount: new Prisma.Decimal('1000.25'), reversedAt: null },
      { ownerFrontendUserId: 'front-2', rechargeDate: earlier, paidAmount: new Prisma.Decimal('200.10'), reversedAt: null },
      { ownerFrontendUserId: 'front-2', rechargeDate: earlier, paidAmount: new Prisma.Decimal('999.99'), reversedAt: new Date() },
      { ownerFrontendUserId: 'front-3', rechargeDate: earlier, paidAmount: new Prisma.Decimal('777.77'), reversedAt: null }
    ]
    const inRequestedRange = (date: string, range: { gte: string; lte: string }) => date >= range.gte && date <= range.lte
    const prisma = {
      labSheet: {
        findMany: vi.fn(async ({ where }: any) => sheets.filter((row) => (
          where.frontendUserId.in.includes(row.frontendUserId) && inRequestedRange(row.date, where.date)
        )))
      },
      sharedPrepaidRecharge: {
        findMany: vi.fn(async ({ where }: any) => recharges.filter((row) => (
          where.ownerFrontendUserId.in.includes(row.ownerFrontendUserId) &&
          inRequestedRange(row.rechargeDate, where.rechargeDate) &&
          (where.reversedAt !== null || row.reversedAt === null)
        )))
      }
    }
    const adminAccess = {
      parseFrontendUserIds: vi.fn().mockReturnValue(['front-1', 'front-2']),
      getAllowedFrontendUserIds: vi.fn().mockResolvedValue(['front-1', 'front-2'])
    }
    const admin = {
      id: 'admin-1', account: 'root', username: 'root', role: UserRole.ROOT_ADMIN,
      dataOwnerId: 'admin-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
      isFrontendMainAccount: false, isFrontendSubAccount: false
    } satisfies CurrentUser
    const service = new FinanceService(prisma as never, adminAccess as never, {} as never)

    try {
      const report = await service.getAdminIncomeReport(admin, { frontendUserIds: 'front-1,front-2' })

      expect(report.range).toEqual({ startDate: today, endDate: today })
      expect(report.rows).toHaveLength(1)
      expect(report.rows[0]).toMatchObject({ date: today, sampleCount: 1, totalAmount: 1000.25 })
      expect(report.totals.today).toEqual({ sampleCount: 1, amount: 1000.25 })
      expect(report.totals.week).toEqual({ sampleCount: 2, amount: 1225.7 })
      expect(report.totals.month).toEqual({ sampleCount: 2, amount: 1225.7 })
      expect(prisma.labSheet.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ frontendUserId: { in: ['front-1', 'front-2'] } })
      }))
      expect(prisma.sharedPrepaidRecharge.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ ownerFrontendUserId: { in: ['front-1', 'front-2'] }, reversedAt: null })
      }))
      expect(prisma.sharedPrepaidRecharge.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ rechargeDate: { gte: dayjs(today).startOf('month').format('YYYY-MM-DD'), lte: today } })
      }))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('FinanceService deletion approval cutover', () => {
  const admin = {
    id: 'admin-1', account: 'root', username: 'root', role: UserRole.ROOT_ADMIN,
    dataOwnerId: 'admin-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
    isFrontendMainAccount: false, isFrontendSubAccount: false
  } satisfies CurrentUser

  function deletionRequest(sourceType: FinanceDeletionRequestType) {
    const now = new Date('2026-08-12T00:00:00.000Z')
    return {
      id: 'delete-1', frontendUserId: 'front-1', sourceType, sourceId: 'source-1', reason: '录入错误',
      sourceSnapshot: sourceType === FinanceDeletionRequestType.EXPENSE
        ? { paymentDate: '2026-08-12', item: '耗材', amount: 88 }
        : { rechargeDate: '2026-08-12', customer: '客户甲', amount: 1000, usableTimes: 10 },
      status: FinanceDeletionRequestStatus.PENDING, reviewRemark: null, reviewedAt: null,
      reviewedById: null, createdAt: now, updatedAt: now,
      frontendUser: { username: 'front-1', account: 'front-1', displayRemark: null }, reviewedBy: null
    }
  }

  it('still approves and deletes an ordinary expense in one transaction', async () => {
    const row = deletionRequest(FinanceDeletionRequestType.EXPENSE)
    const tx = {
      financeEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      financeDeletionRequest: {
        update: vi.fn().mockImplementation(async ({ data }: any) => ({
          ...row, ...data, reviewedAt: new Date('2026-08-12T01:00:00.000Z'), reviewedBy: { username: 'root', account: 'root' }
        }))
      }
    }
    const prisma = {
      financeDeletionRequest: { findUnique: vi.fn().mockResolvedValue(row) },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) => operation(tx))
    }
    const reminders = { createPaymentReminder: vi.fn().mockResolvedValue({}) }
    const adminAccess = { getAllowedFrontendUserIds: vi.fn().mockResolvedValue(['front-1']) }
    const service = new FinanceService(prisma as never, adminAccess as never, reminders as never)

    const result = await service.approveDeletionRequest(admin, row.id)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.financeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: 'source-1', frontendUserId: 'front-1' } })
    expect(result.status).toBe(FinanceDeletionRequestStatus.APPROVED)
  })

  it('rejects a legacy prepaid approval before opening a transaction', async () => {
    const row = deletionRequest(FinanceDeletionRequestType.PREPAID_RECHARGE)
    const prisma = {
      financeDeletionRequest: { findUnique: vi.fn().mockResolvedValue(row) },
      $transaction: vi.fn()
    }
    const adminAccess = { getAllowedFrontendUserIds: vi.fn().mockResolvedValue(['front-1']) }
    const service = new FinanceService(prisma as never, adminAccess as never, {} as never)

    await expect(service.approveDeletionRequest(admin, row.id)).rejects.toThrow('旧预存款删除申请不再支持审批')

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('FinanceService batch sample payment', () => {
  const transaction = {
    $queryRaw: vi.fn(),
    sampleBlock: {
      findMany: vi.fn(),
      update: vi.fn()
    },
    cellChangeLog: {
      create: vi.fn()
    }
  }
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction))
  }
  let service: FinanceService

  function makeBlock(id: string, frontendUserId = 'front-1', paymentStatus = '未结款') {
    return {
      id,
      sheetId: 'sheet-1',
      index: id === 'block-1' ? 1 : 2,
      readonly: false,
      inputs: { paymentStatus },
      results: {},
      parameterSnapshot: defaultLabParameters,
      sheet: {
        id: 'sheet-1',
        frontendUserId,
        parameters: defaultLabParameters
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    service = new FinanceService(prisma as never, {} as never, {} as never)
    transaction.$queryRaw.mockResolvedValue([])
    transaction.sampleBlock.update.mockImplementation(async ({ where, data }: any) => {
      const block = [makeBlock('block-1'), makeBlock('block-2')].find((item) => item.id === where.id)!
      return { ...block, ...data }
    })
    transaction.cellChangeLog.create.mockResolvedValue({})
  })

  it('marks unique unsettled samples as paid in one transaction and logs every block', async () => {
    transaction.sampleBlock.findMany.mockResolvedValue([makeBlock('block-2'), makeBlock('block-1')])

    const result = await service.markFrontendSamplesPaid('front-1', ['block-1', 'block-1', 'block-2'], 'sub-1')

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(transaction.sampleBlock.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['block-1', 'block-2'] } },
      include: { sheet: true }
    })
    expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(2)
    expect(transaction.cellChangeLog.create).toHaveBeenCalledTimes(2)
    expect(transaction.cellChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ frontendUserId: 'front-1', changedById: 'sub-1' })
    })
    expect(result.map((block) => block.id)).toEqual(['block-1', 'block-2'])
    expect(result.every((block) => (block.inputs as Record<string, unknown>).paymentStatus === '已结款')).toBe(true)
  })

  it('locks owning sheets before rereading blocks and calculates from the latest snapshot', async () => {
    const stale = {
      ...makeBlock('block-1'),
      inputs: { paymentStatus: '未结款', ironRaw: 2 },
      parameterSnapshot: { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    }
    const latest = {
      ...stale,
      parameterSnapshot: { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    }
    let visibleBlock = stale
    transaction.$queryRaw.mockImplementation(async () => {
      visibleBlock = latest
      return [{ id: 'sheet-1' }]
    })
    transaction.sampleBlock.findMany.mockImplementation(async () => [visibleBlock])

    await service.markFrontendSamplesPaid('front-1', ['block-1'])

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1)
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.sampleBlock.findMany.mock.invocationCallOrder[0]
    )
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-1' },
      data: expect.objectContaining({ results: expect.objectContaining({ iron: 50 }) })
    }))
  })

  it('rejects an empty batch before opening a transaction', async () => {
    await expect(service.markFrontendSamplesPaid('front-1', [])).rejects.toThrow('请选择需要结款的样品')

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('rejects missing or unauthorized samples before updating anything', async () => {
    transaction.sampleBlock.findMany.mockResolvedValue([makeBlock('block-1', 'front-2')])

    await expect(service.markFrontendSamplesPaid('front-1', ['block-1', 'block-2'])).rejects.toThrow('部分样品不存在或无权操作')

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
  })

  it('rejects samples that are no longer unsettled before updating anything', async () => {
    transaction.sampleBlock.findMany.mockResolvedValue([makeBlock('block-1', 'front-1', '已结款')])

    await expect(service.markFrontendSamplesPaid('front-1', ['block-1'])).rejects.toThrow('部分样品已不是未结款状态')

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
  })
})

describe('FinanceService optimistic concurrency', () => {
  it('rejects a stale monthly settlement update', async () => {
    const current = {
      id: 'monthly-1', month: '2026-08', frontendUserId: 'front-1', customer: '客户甲',
      status: 'UNPAID', paidAmount: null, remark: '远端备注',
      createdAt: new Date('2026-08-01T00:00:00.000Z'), updatedAt: new Date('2026-08-11T00:05:00.000Z')
    }
    const prisma = { monthlySettlementRecord: {
      findUnique: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: 0 })
    } }
    const service = new FinanceService(prisma as never, {} as never, {} as never)

    await expect(service.updateFrontendMonthlySettlement('front-1', 'sub-1', {
      month: '2026-08', customer: '客户甲', settlementStatus: '未结款', remark: '本地备注',
      baseUpdatedAt: '2026-08-11T00:00:00.000Z'
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_WRITE' }) })
    expect(prisma.monthlySettlementRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'monthly-1', frontendUserId: 'front-1', updatedAt: new Date('2026-08-11T00:00:00.000Z') }
    }))
  })
})
