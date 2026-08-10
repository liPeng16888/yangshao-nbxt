// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { readAccessGuardSessions, selectAccessGuardGrant } from './accessGuard'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value)
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
})

describe('access-guard session selection', () => {
  it('selects only a complete unexpired grant for the requested feature', () => {
    const now = Date.now()
    const sessions = {
      finance: { groupId: 'finance', grantVersion: 1, expiresAt: now + 60_000, token: 'finance-token', features: ['FINANCE'] },
      completed: { groupId: 'completed', grantVersion: 2, expiresAt: now + 60_000, token: 'completed-token', features: ['COMPLETED_SAMPLE_DATA'] }
    }

    expect(selectAccessGuardGrant(sessions, 'COMPLETED_SAMPLE_DATA', now)).toBe('completed-token')
    expect(selectAccessGuardGrant(sessions, 'EMPLOYEE_ATTENDANCE', now)).toBeUndefined()
  })

  it('rejects legacy, expired and incomplete cached grants', () => {
    const now = Date.now()
    expect(selectAccessGuardGrant({ legacy: { expiresAt: now + 60_000, token: 'legacy', features: ['EMPLOYEE_ATTENDANCE'] } }, 'EMPLOYEE_ATTENDANCE', now)).toBeUndefined()
    expect(selectAccessGuardGrant({ expired: { groupId: 'g', grantVersion: 1, expiresAt: now, token: 'old', features: ['EMPLOYEE_ATTENDANCE'] } }, 'EMPLOYEE_ATTENDANCE', now)).toBeUndefined()
  })

  it('drops malformed local-storage entries before callers inspect their fields', () => {
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      nil: null, legacyNumber: 123,
      valid: { groupId: 'valid', grantVersion: 1, expiresAt: Date.now() + 60_000, token: 'ok', features: ['FINANCE'] }
    }))

    expect(readAccessGuardSessions()).toEqual({
      valid: expect.objectContaining({ groupId: 'valid', token: 'ok' })
    })
  })
})
