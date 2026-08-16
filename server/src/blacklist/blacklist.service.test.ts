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

function viewerRow(uploadedById: string) {
  return {
    id: `record-${uploadedById}`,
    uploadedById,
    uploadedAt: new Date('2026-08-15T08:00:00.000Z'),
    updatedAt: new Date('2026-08-15T08:01:00.000Z'),
    uploadedBy: { username: '重名用户', account: uploadedById },
    phone: '13800000000',
    wechat: null,
    wechatNickname: null,
    amount: null,
    images: [],
    other: null,
    note: null
  }
}

describe('BlacklistService viewer ownership and amount validation', () => {
  it('derives canManage from stable uploader id even when display names are identical', async () => {
    const findMany = vi.fn().mockResolvedValue([viewerRow('viewer-1'), viewerRow('viewer-2')])
    const service = new BlacklistService({ blacklistRecord: { findMany } } as never)

    const records = await service.search('viewer-1', '')

    expect(records.map((record) => ({ uploadedBy: record.uploadedBy, canManage: record.canManage }))).toEqual([
      { uploadedBy: '重名用户', canManage: true },
      { uploadedBy: '重名用户', canManage: false }
    ])
  })

  it('returns the same viewer-derived ownership flag from blacklist checks', async () => {
    const findMany = vi.fn().mockResolvedValue([viewerRow('viewer-1')])
    const service = new BlacklistService({ blacklistRecord: { findMany } } as never)

    await expect(service.check('viewer-2', '138')).resolves.toMatchObject({
      hit: true,
      records: [expect.objectContaining({ canManage: false })]
    })
  })

  it.each([-1, 1.999])('rejects invalid create amount %s before writing', async (amount) => {
    const create = vi.fn()
    const service = new BlacklistService({ blacklistRecord: { create } } as never)
    await expect(service.create('viewer-1', 'actor-1', { phone: '13800000000', amount, images: [] })).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([-1, 1.999])('rejects invalid update amount %s before writing', async (amount) => {
    const updateMany = vi.fn()
    const service = new BlacklistService({ blacklistRecord: { updateMany } } as never)
    await expect(service.update('viewer-1', 'actor-1', 'record-1', {
      phone: '13800000000', amount, images: [], baseUpdatedAt: '2026-08-15T08:01:00.000Z'
    })).rejects.toThrow()
    expect(updateMany).not.toHaveBeenCalled()
  })

  it('accepts zero as valid non-image blacklist information', async () => {
    const create = vi.fn().mockResolvedValue({ ...viewerRow('viewer-1'), amount: 0 })
    const service = new BlacklistService({ blacklistRecord: { create } } as never)

    await expect(service.create('viewer-1', 'actor-1', { amount: 0, images: [] }))
      .resolves.toMatchObject({ amount: 0 })
  })
})
