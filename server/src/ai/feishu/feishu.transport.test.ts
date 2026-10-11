import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeishuTransport } from './feishu.transport'
import { digest } from './feishu.types'

const sdk = vi.hoisted(() => ({ handlers: {} as Record<string, (event: any) => Promise<any>>, ready: undefined as (() => void) | undefined, failed: undefined as (() => void) | undefined, send: vi.fn(), close: vi.fn(), state: 'connecting' }))
vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: class { im = { message: { create: sdk.send } } },
  WSClient: class {
    constructor(options: any) { sdk.ready = options.onReady; sdk.failed = options.onError }
    async start() {}
    close = sdk.close
    getConnectionStatus() { return { state: sdk.state } }
  },
  EventDispatcher: class { register(handlers: any) { sdk.handlers = handlers; return this } }
}))
function fixture() {
  const session = { id: 's', configId: 'frontend', appId: 'app', tenantKey: 'tenant', openId: 'operator', chatId: 'chat' }
  const prisma = { aiFeishuAction: { findUnique: vi.fn().mockResolvedValue({ sessionId: 's' }) }, aiFeishuSession: { findUnique: vi.fn().mockResolvedValue(session) } }
  return { session, prisma, transport: new FeishuTransport(prisma as never), ingest: vi.fn().mockResolvedValue(undefined) }
}
async function connect(f: ReturnType<typeof fixture>) { const p = f.transport.connect('frontend', 'app', 'private-secret', f.ingest); await Promise.resolve(); await Promise.resolve(); sdk.state = 'connected'; sdk.ready?.(); await p }
beforeEach(() => { vi.useFakeTimers(); sdk.state = 'connecting'; sdk.send.mockReset().mockResolvedValue({ code: 0 }); sdk.close.mockReset() })
afterEach(() => vi.useRealTimers())
describe('Feishu official SDK adapter', () => {
  it('waits for a real handshake and reports reconnect state', async () => { const f = fixture(); let resolved = false; const p = f.transport.connect('frontend', 'app', 'private-secret', f.ingest).then(() => { resolved = true }); await Promise.resolve(); await Promise.resolve(); expect(resolved).toBe(false); sdk.state = 'connected'; sdk.ready?.(); await p; expect(f.transport.snapshot().connectedAt).toBeTruthy(); sdk.state = 'reconnecting'; expect(f.transport.snapshot().state).toBe('reconnecting'); await f.transport.stop(); expect(sdk.close).toHaveBeenCalledWith({ force: true }) })
  it('bounds connection testing and never returns SDK credentials/errors', async () => { const f = fixture(); const p = f.transport.connect('frontend', 'app', 'private-secret', f.ingest); const rejected = expect(p).rejects.toThrow(/连接测试失败/); await vi.advanceTimersByTimeAsync(15000); await rejected; expect(JSON.stringify(f.transport.snapshot())).not.toContain('private-secret'); expect(sdk.close).toHaveBeenCalled() })
  it('only admits verified private user messages, not groups/bots/missing identities', async () => {
    const f = fixture(); await connect(f)
    const event = { sender: { sender_id: { open_id: 'operator' }, sender_type: 'user', tenant_key: 'tenant' }, message: { chat_type: 'p2p', chat_id: 'chat', message_id: 'msg', message_type: 'text', content: JSON.stringify({ text: '查询' }) } }
    for (const invalid of [{ ...event, message: { ...event.message, chat_type: 'group' } }, { ...event, sender: { ...event.sender, sender_type: 'app' } }, { ...event, sender: { ...event.sender, sender_id: {} } }]) await sdk.handlers['im.message.receive_v1'](invalid)
    expect(f.ingest).not.toHaveBeenCalled()
    await sdk.handlers['im.message.receive_v1'](event)
    expect(f.ingest).toHaveBeenCalledWith({ configId: 'frontend', appId: 'app', tenantKey: 'tenant', openId: 'operator', chatId: 'chat' }, 'message:msg', expect.objectContaining({ text: '查询', messageId: 'msg' }))
  })
  it('checks the true card operator/chat before persisting a callback, including forwarded cards', async () => {
    const f = fixture(); await connect(f)
    const event = { operator: { open_id: 'operator' }, context: { open_chat_id: 'chat' }, token: 'delivery-token', action: { value: { token: 'action-token', actorId: 'forged-root', changes: {} } } }
    await sdk.handlers['card.action.trigger']({ ...event, operator: { open_id: 'another' } })
    await sdk.handlers['card.action.trigger']({ ...event, context: { open_chat_id: 'forwarded-chat' } })
    expect(f.ingest).not.toHaveBeenCalled()
    await sdk.handlers['card.action.trigger'](event)
    expect(f.prisma.aiFeishuAction.findUnique).toHaveBeenCalledWith({ where: { tokenHash: digest('action-token') } })
    expect(f.ingest).toHaveBeenCalledWith(expect.objectContaining({ tenantKey: 'tenant', openId: 'operator' }), 'card:delivery-token', { kind: 'card', actionToken: 'action-token' })
  })
  it('uses stable outbound UUIDs and surfaces a failed send for saved-result retries', async () => {
    const f = fixture(); await connect(f)
    await f.transport.send('chat', { type: 'text', content: '结果' }, 'event:0')
    expect(sdk.send.mock.calls[0][0].data.uuid).toBe(digest('event:0').slice(0, 32))
    sdk.send.mockResolvedValue({ code: 999 }); await expect(f.transport.send('chat', { type: 'text', content: '结果' }, 'event:0')).rejects.toThrow(/SEND_FAILED/)
  })
})
