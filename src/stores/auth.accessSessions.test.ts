// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/auth', () => ({
  getMe: vi.fn(), login: vi.fn(), register: vi.fn(), updatePassword: vi.fn(), logout: vi.fn().mockResolvedValue(undefined)
}))

import { useAuthStore } from './auth'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value)
  }
}

describe('auth store secondary-session cleanup', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
    setActivePinia(createPinia())
  })

  it('clears access-guard sessions on logout', async () => {
    localStorage.setItem('ys_token', 'primary')
    localStorage.setItem('ys_user', '{"id":"front-1"}')
    localStorage.setItem('ys_access_guard_group_sessions', '{"group-1":{"token":"old"}}')
    const store = useAuthStore()

    await store.logoutCurrentUser()

    expect(localStorage.getItem('ys_access_guard_group_sessions')).toBeNull()
  })
})
