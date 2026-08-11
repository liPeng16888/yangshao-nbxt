import { describe, expect, it, vi } from 'vitest'
import { BlacklistService } from './blacklist.service'

const current = {
  id: 'black-1', uploadedById: 'owner-1', uploadedAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:05:00.000Z'), uploadedBy: { username: '主账号', account: 'main' },
  phone: '13800000000', wechat: null, wechatNickname: null, amount: null, images: [], other: null, note: null
}

describe('BlacklistService optimistic concurrency', () => {
  it('rejects a stale update with a safe current representation', async () => {
    const prisma = { blacklistRecord: {
      findUnique: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: 0 })
    } }
    const service = new BlacklistService(prisma as never)

    await expect(service.update('owner-1', 'sub-1', 'black-1', {
      phone: '13900000000', images: [], baseUpdatedAt: '2026-08-11T00:00:00.000Z'
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_WRITE' }) })
    expect(prisma.blacklistRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'black-1', uploadedById: 'owner-1', updatedAt: new Date('2026-08-11T00:00:00.000Z') }
    }))
  })

  it('rejects a stale delete without removing the newer row', async () => {
    const prisma = { blacklistRecord: {
      findUnique: vi.fn().mockResolvedValue(current),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    } }
    const service = new BlacklistService(prisma as never)

    await expect(service.delete('owner-1', 'sub-1', 'black-1', '2026-08-11T00:00:00.000Z'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_WRITE' }) })
    expect(prisma.blacklistRecord.deleteMany).toHaveBeenCalledTimes(1)
  })
})
