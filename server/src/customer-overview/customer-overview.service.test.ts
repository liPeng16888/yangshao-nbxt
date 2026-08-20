import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomerOverviewService } from './customer-overview.service'

function makeBlock(
  id: string,
  inputs: Record<string, unknown>,
  retests: Array<{ id: string; status: string; inputs: Record<string, unknown>; results: Record<string, unknown> }> = []
) {
  return { id, index: Number(id.replace(/\D/g, '')) || 1, inputs, retests }
}

function makeSheet(
  frontendUserId: string,
  date: string,
  sampleBlocks: Array<ReturnType<typeof makeBlock>>,
  frontendUserName = frontendUserId
) {
  return {
    id: `${frontendUserId}-${date}`,
    frontendUserId,
    date,
    frontendUser: { account: frontendUserId, username: frontendUserName, displayRemark: null },
    sampleBlocks
  }
}

describe('CustomerOverviewService', () => {
  const prisma = {
    labSheet: { findMany: vi.fn() },
    customer: { findMany: vi.fn() }
  }
  let service: CustomerOverviewService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.customer.findMany.mockResolvedValue([
      { id: 'customer-a', frontendUserId: 'front-1', name: '客户甲', phone: '13800000001', wechat: 'wx-a', wechatNickname: '甲昵称' },
      { id: 'customer-b', frontendUserId: 'front-1', name: '客户乙', phone: '13800000002', wechat: null, wechatNickname: null }
    ])
    service = new CustomerOverviewService(prisma as never)
  })

  it('groups a combined customer across dates and sums sample count and amount', async () => {
    prisma.labSheet.findMany.mockResolvedValue([
      makeSheet('front-1', '2026-07-01', [
        makeBlock('block-1', {
          customerIds: ['customer-a', 'customer-b'],
          customerText: '客户甲、客户乙',
          price: 50,
          ironRaw: 0.2
        })
      ], '前台一'),
      makeSheet('front-1', '2026-07-03', [
        makeBlock('block-2', {
          customerIds: ['customer-b', 'customer-a'],
          customerText: '客户甲、客户乙',
          price: 70,
          siliconRaw: 0.3
        })
      ], '前台一')
    ])

    const rows = await service.getRows(['front-1'])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      frontendUserId: 'front-1',
      frontendUserName: '前台一',
      customerKey: 'ids:customer-a|customer-b',
      customer: '客户甲、客户乙',
      customerDisplay: '客户甲 13800000001 wx-a 甲昵称、客户乙 13800000002',
      sampleCount: 2,
      totalAmount: 120,
      firstDetectionDate: '2026-07-01',
      lastDetectionDate: '2026-07-03'
    })
  })

  it('keeps the same customer in different frontend accounts separate', async () => {
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSheet.findMany.mockResolvedValue([
      makeSheet('front-1', '2026-07-01', [makeBlock('block-1', { customerText: '客户甲', price: 10, ironRaw: 0.1 })]),
      makeSheet('front-2', '2026-07-01', [makeBlock('block-2', { customerText: '客户甲', price: 20, ironRaw: 0.2 })])
    ])

    const rows = await service.getRows(['front-1', 'front-2'])

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.frontendUserId).sort()).toEqual(['front-1', 'front-2'])
  })

  it('counts detected historical samples with missing prices as zero amount', async () => {
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSheet.findMany.mockResolvedValue([
      makeSheet('front-1', '2026-07-01', [makeBlock('block-1', { customerText: '手工客户', calciumRaw: 0.4 })])
    ])

    const rows = await service.getRows(['front-1'])

    expect(rows[0]).toMatchObject({ customerKey: 'text:手工客户', sampleCount: 1, totalAmount: 0 })
  })

  it('keeps active and void retests out of customer sample counts and totals', async () => {
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSheet.findMany.mockResolvedValue([
      makeSheet('front-1', '2026-08-20', [
        makeBlock(
          'block-1',
          { customerText: '客户甲', price: 80, ironRaw: 1 },
          [
            { id: 'retest-1', status: 'ACTIVE', inputs: { ironRaw: 99 }, results: { iron: 9999 } },
            { id: 'retest-2', status: 'VOID', inputs: { ironRaw: 88 }, results: { iron: 8888 } }
          ]
        )
      ], '前台一')
    ])

    const rows = await service.getRows(['front-1'])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ customer: '客户甲', sampleCount: 1, totalAmount: 80 })
  })

  it('excludes blank customers and samples without detection input', async () => {
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSheet.findMany.mockResolvedValue([
      makeSheet('front-1', '2026-07-01', [
        makeBlock('block-1', { customerText: '', price: 20, ironRaw: 0.1 }),
        makeBlock('block-2', { customerText: '客户甲', price: 20 }),
        makeBlock('block-3', { customerText: '客户乙', price: 30, moisture: 1.2 })
      ])
    ])

    const rows = await service.getRows(['front-1'])

    expect(rows).toHaveLength(1)
    expect(rows[0].customer).toBe('客户乙')
  })

  it('does not create or assign overview rows from recipient customer fields', async () => {
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSheet.findMany.mockResolvedValue([
      makeSheet('front-1', '2026-07-01', [
        makeBlock('recipient-only', {
          recipientCustomerId: 'customer-recipient',
          recipientCustomerIds: ['customer-recipient'],
          recipientCustomerText: '数据接收方',
          price: 10,
          ironRaw: 0.1
        }),
        makeBlock('payer-and-recipient', {
          customerId: 'customer-payer',
          customerIds: ['customer-payer'],
          customerText: '付款方',
          recipientCustomerId: 'customer-recipient',
          recipientCustomerIds: ['customer-recipient'],
          recipientCustomerText: '数据接收方',
          price: 20,
          siliconRaw: 0.2
        })
      ])
    ])

    const rows = await service.getRows(['front-1'])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ customer: '付款方', sampleCount: 1, totalAmount: 20 })
    expect(rows.some((row) => row.customer === '数据接收方')).toBe(false)
    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['customer-payer'] }, frontendUserId: { in: ['front-1'] } }
    }))
  })
})
