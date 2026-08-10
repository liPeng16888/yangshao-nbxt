// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const axiosMock = vi.hoisted(() => {
  const handlers: { rejected?: (error: any) => Promise<never> } = {}
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn((_fulfilled, rejected) => { handlers.rejected = rejected }) }
    }
  }
  return { handlers, create: vi.fn(() => instance) }
})
const message = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('axios', () => ({ default: { create: axiosMock.create } }))
vi.mock('element-plus', () => ({ ElMessage: message }))

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value)
  }
}

describe('frontend request access-grant invalidation', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage, location: { href: '' } })
    await import('./request')
  })

  it('clears only secondary sessions for a structured access-grant 403', async () => {
    localStorage.setItem('ys_token', 'primary')
    localStorage.setItem('ys_user', '{"id":"front-1"}')
    localStorage.setItem('ys_access_guard_group_sessions', '{"group-1":{"token":"old"}}')
    const error = { response: { status: 403, data: { code: 'ACCESS_GRANT_INVALID', message: '访问授权无效或已过期' } } }

    await expect(axiosMock.handlers.rejected!(error)).rejects.toBe(error)
    expect(localStorage.getItem('ys_access_guard_group_sessions')).toBeNull()
    expect(localStorage.getItem('ys_token')).toBe('primary')
    expect(localStorage.getItem('ys_user')).toBe('{"id":"front-1"}')
  })

  it('also clears secondary sessions when the primary login expires', async () => {
    localStorage.setItem('ys_token', 'primary')
    localStorage.setItem('ys_user', '{"id":"front-1"}')
    localStorage.setItem('ys_access_guard_group_sessions', '{}')
    const error = { response: { status: 401, data: { message: '登录已失效' } } }

    await expect(axiosMock.handlers.rejected!(error)).rejects.toBe(error)
    expect(localStorage.getItem('ys_access_guard_group_sessions')).toBeNull()
  })
})
