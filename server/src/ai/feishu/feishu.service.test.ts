import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeishuService } from './feishu.service'
import type { CurrentUser } from '../../auth/current-user'
import { encryptAiKey } from '../ai.security'

const root = { id: 'root', role: 'ROOT_ADMIN' } as CurrentUser
function fixture() {
  const rows = new Map([
    ['frontend', { id: 'frontend', appId: 'front-app', publicSiteUrl: 'https://front.example.com', appSecretCipher: encryptAiKey('front-secret'), enabled: true, revision: 3 }],
    ['admin', { id: 'admin', appId: 'admin-app', publicSiteUrl: 'https://admin.example.com', appSecretCipher: encryptAiKey('admin-secret'), enabled: true, revision: 5 }]
  ])
  const many = () => ({ updateMany: vi.fn().mockResolvedValue({ count: 1 }) })
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn(),
    aiFeishuConfig: {
      findUnique: vi.fn(({ where }) => Promise.resolve(rows.get(where.id) || null)),
      upsert: vi.fn(({ where, update }) => { const old = rows.get(where.id)!; rows.set(where.id, { ...old, ...update, revision: old.revision + 1 }); return Promise.resolve(rows.get(where.id)) })
    },
    aiFeishuSession: many(), aiFeishuInvitation: many(),
    aiFeishuBinding: { ...many(), findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue({ id: 'admin-binding', configId: 'admin' }), update: vi.fn() },
    aiAuditLog: { create: vi.fn().mockResolvedValue({}) }, user: { findMany: vi.fn().mockResolvedValue([]) }
  }
  prisma.$transaction.mockImplementation(fn => fn(prisma))
  const config = { assertRoot: vi.fn((user: CurrentUser) => { if (user.role !== 'ROOT_ADMIN') throw Error('root only') }) }
  const access = { isAdmin: (u: CurrentUser) => u.role.includes('ADMIN') }
  return { rows, prisma, service: new FeishuService(prisma as never, config as never, access as never, {} as never, {} as never) }
}
beforeEach(() => vi.stubEnv('AI_API_KEY_SECRET', 'isolated-feishu-unit-secret-at-least-32-bytes'))
afterEach(() => vi.unstubAllEnvs())
describe('Independent robot configuration boundaries', () => {
  it('requires explicit, valid audience and masks each secret', async () => {
    const f = fixture()
    await expect(f.service.getConfig(root, 'forged' as never)).rejects.toThrow(/前端机器人/)
    await expect(f.service.getConfig({ role: 'FRONTEND_USER' } as never, 'admin')).rejects.toThrow('root only')
    expect(await f.service.getConfig(root, 'admin')).toMatchObject({ bot: 'admin', appId: 'admin-app', hasSecret: true })
    expect(JSON.stringify(await f.service.getConfig(root, 'admin'))).not.toMatch(/admin-secret|Cipher/)
  })
  it('changing the front App ID revokes only front bindings and sessions', async () => {
    const f = fixture(), admin = { ...f.rows.get('admin')! }
    await f.service.saveConfig(root, 'frontend', { appId: 'new-front-app', appSecret: 'new-front-secret', publicSiteUrl: 'https://front.example.com', enabled: true })
    expect(f.rows.get('admin')).toEqual(admin)
    expect(f.prisma.aiFeishuBinding.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { configId: 'frontend' } }))
    expect(f.prisma.aiFeishuSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { configId: 'frontend' } }))
    expect(f.prisma.aiFeishuInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { configId: 'frontend', usedAt: null } }))
  })
  it('updating a URL or stopping the same App ID never revokes bindings', async () => {
    const f = fixture()
    await f.service.saveConfig(root, 'admin', { appId: 'admin-app', publicSiteUrl: 'https://new-admin.example.com', enabled: false })
    expect(f.prisma.aiFeishuBinding.updateMany).not.toHaveBeenCalled()
    expect(f.rows.get('frontend')?.enabled).toBe(true)
  })
  it('rejects the same App ID across robots before any state mutation', async () => {
    const f = fixture()
    await expect(f.service.saveConfig(root, 'admin', { appId: 'front-app', appSecret: 'secret', publicSiteUrl: 'https://admin.example.com', enabled: true })).rejects.toThrow(/不同的 App ID/)
    expect(f.prisma.aiFeishuConfig.upsert).not.toHaveBeenCalled()
    expect(f.prisma.aiFeishuSession.updateMany).not.toHaveBeenCalled()
  })
  it('filters binding lists and blocks cross-robot unlink operations', async () => {
    const f = fixture()
    await f.service.bindings(root, 'frontend')
    expect(f.prisma.aiFeishuBinding.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { configId: 'frontend' } }))
    await expect(f.service.unbind(root, 'frontend', 'admin-binding')).rejects.toThrow(/不属于此机器人/)
    expect(f.prisma.aiFeishuBinding.update).not.toHaveBeenCalled()
  })
})
