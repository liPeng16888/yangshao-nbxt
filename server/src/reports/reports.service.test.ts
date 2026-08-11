import { describe, expect, it, vi } from 'vitest'
import { ReportsService } from './reports.service'

describe('ReportsService shared prepaid income', () => {
  it('counts prepaid samples once and recognizes only active paid principal as income', async () => {
    const prisma = {
      labSheet: {
        findMany: vi.fn().mockResolvedValue([{
          date: '2026-08-12',
          sampleBlocks: [{
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
    const service = new ReportsService(prisma as never)

    const report = await service.sampleDetection('front-1', {
      mode: 'custom',
      startDate: '2026-08-12',
      endDate: '2026-08-12'
    })

    expect(prisma.sharedPrepaidRecharge.findMany).toHaveBeenCalledWith({
      where: {
        ownerFrontendUserId: 'front-1',
        rechargeDate: { gte: '2026-08-12', lte: '2026-08-12' },
        reversedAt: null
      }
    })
    expect(prisma.prepaidRechargeRecord.findMany).not.toHaveBeenCalled()
    expect(report.summary.statusSummaries.find((row) => row.status === '预存款')).toMatchObject({ count: 1, amount: 1000 })
    expect(report.summary.totalPrice).toBe(1000)
    expect(report.summary.totalSamples).toBe(1)
  })
})
