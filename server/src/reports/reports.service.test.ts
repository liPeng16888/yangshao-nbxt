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

describe('ReportsService sample retest isolation', () => {
  it('counts only the original sample when active and void retests contain large results', async () => {
    const prisma = {
      labSheet: {
        findMany: vi.fn().mockResolvedValue([{
          date: '2026-08-20',
          sampleBlocks: [{
            inputs: {
              sampleNumber: 'A-001',
              customerText: '客户甲',
              price: 80,
              paymentStatus: '未结款',
              ironRaw: 1
            },
            results: { iron: 29.1 },
            retests: [
              {
                id: 'retest-1',
                status: 'ACTIVE',
                inputs: {
                  sampleNumber: 'A-001-复样1',
                  customerId: 'customer-retest-active',
                  customerIds: ['customer-retest-active'],
                  customers: [{ id: 'customer-retest-active', name: '复样客户甲' }],
                  customerText: '复样客户甲',
                  price: 9999,
                  paymentStatus: '未结款',
                  completed: true,
                  ironRaw: 99
                },
                results: { iron: 9999 }
              },
              {
                id: 'retest-2',
                status: 'VOID',
                inputs: {
                  sampleNumber: 'A-001-复样2',
                  customerId: 'customer-retest-void',
                  customerIds: ['customer-retest-void'],
                  customers: [{ id: 'customer-retest-void', name: '复样客户乙' }],
                  customerText: '复样客户乙',
                  price: 8888,
                  paymentStatus: '未结款',
                  completed: true,
                  ironRaw: 88
                },
                results: { iron: 8888 }
              }
            ]
          }]
        }])
      },
      sharedPrepaidRecharge: { findMany: vi.fn().mockResolvedValue([]) }
    }
    const service = new ReportsService(prisma as never)

    const report = await service.sampleDetection('front-1', {
      mode: 'custom',
      startDate: '2026-08-20',
      endDate: '2026-08-20'
    })

    expect(report.summary.statusSummaries.find((row) => row.status === '未结款')).toMatchObject({ count: 1, amount: 80 })
    expect(report.summary).toMatchObject({ totalSamples: 1, totalPrice: 80 })
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({ sampleCount: 1, totalPrice: 80 })
    expect(prisma.labSheet.findMany).toHaveBeenCalledWith({
      where: { frontendUserId: 'front-1', date: { gte: '2026-08-20', lte: '2026-08-20' } },
      include: { sampleBlocks: true }
    })
  })
})
