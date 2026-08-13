// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { CachedFrontendPreference } from '@/types/frontendPreference'
import {
  preferenceCacheKey,
  readFrontendPreferenceCache,
  writeFrontendPreferenceCache
} from './frontendPreferenceCache'

const section = 'LAB_REPORT_TEMPLATE' as const

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  }
}

function cached(ownerId: string): CachedFrontendPreference {
  return {
    ownerId,
    section,
    server: {
      section,
      value: { inspector: ownerId },
      version: 2,
      updatedAt: '2026-08-13T00:00:00.000Z',
      updatedBy: { id: ownerId, username: '主账号' }
    }
  }
}

describe('owner-scoped frontend preference cache', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
  })

  it('uses the exact versioned key for an owner and section', () => {
    expect(preferenceCacheKey('main-1', section))
      .toBe('ys_frontend_preferences:v1:main-1:LAB_REPORT_TEMPLATE')
  })

  it('rejects a cache object whose embedded owner does not match the requested owner', () => {
    const requestedKey = preferenceCacheKey('main-2', section)
    window.localStorage.setItem(requestedKey, JSON.stringify(cached('main-1')))

    expect(readFrontendPreferenceCache('main-2', section)).toBeNull()
    expect(window.localStorage.getItem(requestedKey)).not.toBeNull()
  })

  it('rejects a cache object whose embedded section does not match the requested section', () => {
    const requestedKey = preferenceCacheKey('main-1', section)
    window.localStorage.setItem(requestedKey, JSON.stringify({
      ...cached('main-1'),
      section: 'LAB_ELEMENT_GROUPS'
    }))

    expect(readFrontendPreferenceCache('main-1', section)).toBeNull()
  })

  it('round-trips a matching owner cache', () => {
    const entry = cached('main-1')

    writeFrontendPreferenceCache(entry)

    expect(readFrontendPreferenceCache('main-1', section)).toEqual(entry)
  })

  it('removes invalid JSON only from the exact key being read', () => {
    const brokenKey = preferenceCacheKey('main-1', section)
    const otherKey = preferenceCacheKey('main-2', section)
    window.localStorage.setItem(brokenKey, '{broken')
    window.localStorage.setItem(otherKey, JSON.stringify(cached('main-2')))

    expect(readFrontendPreferenceCache('main-1', section)).toBeNull()
    expect(window.localStorage.getItem(brokenKey)).toBeNull()
    expect(window.localStorage.getItem(otherKey)).not.toBeNull()
  })
})
