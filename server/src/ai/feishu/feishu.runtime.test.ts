import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeishuRuntime } from './feishu.runtime'
import { encryptAiKey } from '../ai.security'
import type { FeishuBot } from './feishu.types'
const runtimes: FeishuRuntime[] = []
function fixture() {
  const configs = { frontend: { id: 'frontend', enabled: true, appId: 'front-app', revision: 1, appSecretCipher: encryptAiKey('front-secret') }, admin: { id: 'admin', enabled: true, appId: 'admin-app', revision: 1, appSecretCipher: encryptAiKey('admin-secret') } }
  const transport = () => ({ connect: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined), snapshot: vi.fn(() => ({ state: 'connected' })), error: vi.fn(), send: vi.fn(), image: vi.fn() })
  const front = transport(), admin = transport(), factory = { create: vi.fn().mockReturnValueOnce(front).mockReturnValueOnce(admin) }
  const prisma = { aiFeishuConfig: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, aiFeishuEvent: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), findFirst: vi.fn().mockResolvedValue(null), createMany: vi.fn().mockResolvedValue({ count: 1 }) } }
  const service = { settings: vi.fn((bot: FeishuBot) => Promise.resolve(configs[bot])) }
  const runtime = new FeishuRuntime(prisma as never, service as never, factory as never)
  runtimes.push(runtime)
  return { runtime, configs, front, admin, prisma, service }
}
beforeEach(() => vi.stubEnv('AI_API_KEY_SECRET', 'isolated-runtime-unit-secret-at-least-32-bytes'))
afterEach(async () => { await Promise.all(runtimes.splice(0).map(r => r.beforeApplicationShutdown())); vi.unstubAllEnvs() })
describe('Independent Feishu workers', () => {
  it('uses two transports, separate leases and scoped queues', async () => {
    const f = fixture()
    await Promise.all([f.runtime.tick('frontend'), f.runtime.tick('admin')])
    expect(f.front.connect).toHaveBeenCalledWith('frontend', 'front-app', 'front-secret', expect.any(Function))
    expect(f.admin.connect).toHaveBeenCalledWith('admin', 'admin-app', 'admin-secret', expect.any(Function))
    for (const bot of ['frontend', 'admin']) {
      expect(f.prisma.aiFeishuConfig.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: bot }) }))
      expect(f.prisma.aiFeishuEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ configId: bot }) }))
      expect(f.prisma.aiFeishuEvent.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { configId: bot, status: 'PROCESSING' } }))
    }
  })
  it('an unresolved front handshake does not block admin processing', async () => {
    const f = fixture(); let finish!: () => void
    f.front.connect.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const pending = f.runtime.tick('frontend')
    await f.runtime.tick('admin')
    expect(f.admin.connect).toHaveBeenCalled()
    expect(f.prisma.aiFeishuEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ configId: 'admin' }) }))
    finish(); await pending
  })
  it('stopping front does not close or reconnect admin', async () => {
    const f = fixture(); await f.runtime.tick('admin')
    f.configs.frontend.enabled = false
    await f.runtime.tick('frontend'); await f.runtime.tick('admin')
    expect(f.front.stop).toHaveBeenCalledOnce(); expect(f.admin.stop).not.toHaveBeenCalled()
    expect(f.admin.connect).toHaveBeenCalledOnce()
  })
  it('drops an App ID from the other slot before persisting any message', async () => {
    const f = fixture()
    await f.runtime.ingest({ configId: 'frontend', appId: 'admin-app', tenantKey: 'tenant', openId: 'operator', chatId: 'chat' }, 'message:forged', { kind: 'message', text: '帮助' })
    expect(f.prisma.aiFeishuEvent.createMany).not.toHaveBeenCalled()
    await f.runtime.ingest({ configId: 'admin', appId: 'admin-app', tenantKey: 'tenant', openId: 'operator', chatId: 'chat' }, 'message:valid', { kind: 'message', text: '帮助' })
    expect(f.prisma.aiFeishuEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ configId: 'admin', appId: 'admin-app' }), skipDuplicates: true }))
  })
})
