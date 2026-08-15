import { effectScope, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_NARROW_QUERY, MOBILE_TOUCH_QUERY, useMobileLayout } from './useMobileLayout'

interface MutableMediaQueryList extends MediaQueryList {
  setMatches: (matches: boolean) => void
}

function createMediaQueryList(media: string, initialMatches = false): MutableMediaQueryList {
  let matches = initialMatches
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  return {
    get matches() {
      return matches
    },
    media,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') listeners.add(listener as (event: MediaQueryListEvent) => void)
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') listeners.delete(listener as (event: MediaQueryListEvent) => void)
    },
    addListener: (listener) => {
      if (listener) listeners.add(listener)
    },
    removeListener: (listener) => {
      if (listener) listeners.delete(listener)
    },
    dispatchEvent: () => true,
    setMatches(nextMatches) {
      matches = nextMatches
      const event = { matches, media } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    }
  }
}

describe('useMobileLayout', () => {
  const queries = new Map<string, MutableMediaQueryList>()

  beforeEach(() => {
    queries.clear()
    vi.stubGlobal('matchMedia', vi.fn((query: string) => {
      const existing = queries.get(query)
      if (existing) return existing
      const created = createMediaQueryList(query)
      queries.set(query, created)
      return created
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps a regular desktop on the existing desktop layout', () => {
    const scope = effectScope()
    const state = scope.run(() => useMobileLayout())

    expect(state?.isMobileLayout.value).toBe(false)
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_NARROW_QUERY)
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_TOUCH_QUERY)
    scope.stop()
  })

  it('uses the mobile layout for either a narrow viewport or a touch phone', async () => {
    const narrow = createMediaQueryList(MOBILE_NARROW_QUERY, true)
    const touchPhone = createMediaQueryList(MOBILE_TOUCH_QUERY, false)
    queries.set(MOBILE_NARROW_QUERY, narrow)
    queries.set(MOBILE_TOUCH_QUERY, touchPhone)

    const scope = effectScope()
    const state = scope.run(() => useMobileLayout())
    expect(state?.isMobileLayout.value).toBe(true)

    narrow.setMatches(false)
    touchPhone.setMatches(true)
    await nextTick()
    expect(state?.isMobileLayout.value).toBe(true)

    touchPhone.setMatches(false)
    await nextTick()
    expect(state?.isMobileLayout.value).toBe(false)
    scope.stop()
  })
})
