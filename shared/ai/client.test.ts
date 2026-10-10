import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiClient, currentAiGrants } from './client'
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
describe('AI client identity and access grants', () => {
  it('keeps frontend and admin bearer tokens separate', async () => { localStorage.setItem('ys_token','front'); localStorage.setItem('ys_admin_token','admin'); const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }); vi.stubGlobal('fetch', mock); await aiClient('frontend')('/ai/bootstrap'); await aiClient('admin')('/ai/bootstrap'); expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer front'); expect(mock.mock.calls[1][1].headers.Authorization).toBe('Bearer admin') })
  it('does not forward expired or invalid access grants', () => { localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({ a: { token: 'valid', expiresAt: Date.now()+10000, features: ['FINANCE'] }, b: { token: 'expired', expiresAt: 1, features: ['COMPLETED_SAMPLE_DATA'] } })); expect(currentAiGrants('frontend')).toEqual({ FINANCE: 'valid' }); expect(currentAiGrants('admin')).toEqual({}) })
})
