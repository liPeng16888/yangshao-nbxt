import { describe, expect, it, vi } from 'vitest'
import { CustomersService } from './customers.service'

describe('CustomersService optimistic concurrency', () => {
  it('rejects stale customer deletion', async () => {
    const current = {
      id: 'customer-1', frontendUserId: 'owner-1', name: '客户甲', phone: null, wechat: null,
      wechatNickname: null, createdAt: new Date('2026-08-11T00:00:00.000Z'), updatedAt: new Date('2026-08-11T00:05:00.000Z')
    }
    const prisma = { customer: {
      findFirst: vi.fn().mockResolvedValue(current),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    } }
    const service = new CustomersService(prisma as never)

    await expect(service.remove('owner-1', 'sub-1', 'customer-1', '2026-08-11T00:00:00.000Z'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_WRITE' }) })
    expect(prisma.customer.deleteMany).toHaveBeenCalledWith({
      where: { id: 'customer-1', frontendUserId: 'owner-1', updatedAt: new Date('2026-08-11T00:00:00.000Z') }
    })
  })
})
