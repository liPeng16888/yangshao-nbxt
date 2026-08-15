import { describe, expect, it, vi } from 'vitest'
import { BlacklistService } from './blacklist.service'

function row(uploadedById: string) {
  return {
    id: `record-${uploadedById}`,
    uploadedById,
    uploadedAt: new Date('2026-08-15T08:00:00.000Z'),
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

describe('BlacklistService viewer ownership', () => {
  it('derives canManage from stable uploader id even when display names are identical', async () => {
    const findMany = vi.fn().mockResolvedValue([row('viewer-1'), row('viewer-2')])
    const service = new BlacklistService({ blacklistRecord: { findMany } } as never)

    const records = await service.search('viewer-1', '')

    expect(records.map((record) => ({ uploadedBy: record.uploadedBy, canManage: record.canManage }))).toEqual([
      { uploadedBy: '重名用户', canManage: true },
      { uploadedBy: '重名用户', canManage: false }
    ])
  })

  it('returns the same viewer-derived ownership flag from blacklist checks', async () => {
    const findMany = vi.fn().mockResolvedValue([row('viewer-1')])
    const service = new BlacklistService({ blacklistRecord: { findMany } } as never)

    await expect(service.check('viewer-2', '138')).resolves.toMatchObject({
      hit: true,
      records: [expect.objectContaining({ canManage: false })]
    })
  })

  it.each([-1, 1.999])('rejects invalid create amount %s before writing', async (amount) => {
    const create = vi.fn()
    const service = new BlacklistService({ blacklistRecord: { create } } as never)
    await expect(service.create('viewer-1', { phone: '13800000000', amount, images: [] })).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it.each([-1, 1.999])('rejects invalid update amount %s before writing', async (amount) => {
    const update = vi.fn()
    const service = new BlacklistService({ blacklistRecord: {
      findUnique: vi.fn().mockResolvedValue({ id: 'record-1', uploadedById: 'viewer-1' }), update
    } } as never)
    await expect(service.update('viewer-1', 'record-1', { phone: '13800000000', amount, images: [] })).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts zero as valid non-image blacklist information', async () => {
    const create = vi.fn().mockResolvedValue({ ...row('viewer-1'), amount: 0 })
    const service = new BlacklistService({ blacklistRecord: { create } } as never)

    await expect(service.create('viewer-1', { amount: 0, images: [] })).resolves.toMatchObject({ amount: 0 })
  })
})
