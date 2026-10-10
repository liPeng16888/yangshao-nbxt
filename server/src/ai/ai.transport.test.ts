import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { providerFetch } from './ai.security'
vi.mock('node:dns/promises', async () => {
  const actual = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises')
  const lookupMock = vi.fn()
  return { ...actual, lookup: lookupMock, default: { ...actual, lookup: lookupMock } }
})
vi.mock('node:https', async () => {
  const actual = await vi.importActual<typeof import('node:https')>('node:https')
  const requestMock = vi.fn()
  return { ...actual, request: requestMock, default: { ...actual, request: requestMock } }
})
function transport(status = 200) {
  const response = Object.assign(new EventEmitter(), { statusCode: status, headers: { 'content-type': 'application/json' }, resume: vi.fn() })
  const req = Object.assign(new EventEmitter(), { write: vi.fn(), setTimeout: vi.fn(), destroy: vi.fn(), end: vi.fn() })
  vi.mocked(request).mockImplementation(((_url: unknown, _options: unknown, callback: (res: unknown) => void) => {
    req.end.mockImplementation(() => { callback(response); queueMicrotask(() => { response.emit('data', Buffer.from('{"ok":true}')); response.emit('end') }) })
    return req
  }) as never)
  return req
}
beforeEach(() => { vi.mocked(lookup).mockReset(); vi.mocked(request).mockReset(); vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never) })
describe('AI pinned HTTPS transport', () => {
  it('pins both ordinary and all-address DNS lookups to the validated public IP', async () => {
    transport(); const response = await providerFetch('https://api.example.com/v1')('https://api.example.com/v1/chat/completions', { method: 'POST', body: '{}' }); expect(await response.json()).toEqual({ ok: true })
    const options = vi.mocked(request).mock.calls[0][1] as unknown as { lookup: (hostname: string, options: unknown, callback: (...args: unknown[]) => void) => void }
    const cb = vi.fn(); options.lookup('api.example.com', { all: true }, cb); expect(cb).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]); cb.mockClear(); options.lookup('api.example.com', {}, cb); expect(cb).toHaveBeenCalledWith(null, '8.8.8.8', 4)
  })
  it('refuses a provider origin change before opening a socket', async () => { await expect(providerFetch('https://api.example.com/v1')('https://other.example/v1')).rejects.toThrow(/origin/); expect(request).not.toHaveBeenCalled() })
  it('rejects a DNS rebind from public to private before opening a socket', async () => { vi.mocked(lookup).mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }] as never).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never); await expect(providerFetch('https://api.example.com/v1')('https://api.example.com/v1/chat/completions')).rejects.toThrow(/Private/); expect(request).not.toHaveBeenCalled() })
  it('does not follow redirects to another destination', async () => { transport(302); await expect(providerFetch('https://api.example.com/v1')('https://api.example.com/v1/chat/completions')).rejects.toThrow(/redirects/); expect(request).toHaveBeenCalledTimes(1) })
})
