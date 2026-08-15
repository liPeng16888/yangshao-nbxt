// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_NARROW_QUERY } from '@/composables/useMobileLayout'
import AppLayout from './AppLayout.vue'

const mocks = vi.hoisted(() => ({
  accessGuard: { loadGroups: vi.fn() }
}))

vi.mock('@/stores/accessGuard', () => ({
  useAccessGuardStore: () => mocks.accessGuard
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/data' })
}))

function installMatchMedia() {
  const states = new Map<string, { matches: boolean; listeners: Set<() => void> }>()
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    const state = states.get(query) || { matches: false, listeners: new Set<() => void>() }
    states.set(query, state)
    return {
      get matches() {
        return state.matches
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => state.listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => state.listeners.delete(listener)
    }
  }))
  return (query: string, matches: boolean) => {
    const state = states.get(query)
    if (!state) throw new Error(`media query was not registered: ${query}`)
    state.matches = matches
    state.listeners.forEach((listener) => listener())
  }
}

describe('AppLayout responsive shell', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size }
    } satisfies Storage })
    window.localStorage.clear()
    mocks.accessGuard.loadGroups.mockReset()
  })

  it('mounts exactly one desktop or mobile navigation shell as the viewport changes', async () => {
    const setMatches = installMatchMedia()
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          AppSidebar: { template: '<aside class="desktop-sidebar-stub" />' },
          AppTopbar: { template: '<header class="desktop-topbar-stub" />' },
          AppMobileShell: { template: '<div class="mobile-shell-stub" />' },
          RouterView: { template: '<div class="router-view-stub" />' }
        }
      }
    })

    expect(wrapper.find('.desktop-sidebar-stub').exists()).toBe(true)
    expect(wrapper.find('.desktop-topbar-stub').exists()).toBe(true)
    expect(wrapper.find('.mobile-shell-stub').exists()).toBe(false)

    setMatches(MOBILE_NARROW_QUERY, true)
    await nextTick()

    expect(wrapper.classes()).toContain('app-shell--mobile')
    expect(wrapper.classes()).toContain('app-shell--mobile-has-secondary-nav')
    expect(wrapper.find('.mobile-shell-stub').exists()).toBe(true)
    expect(wrapper.find('.desktop-sidebar-stub').exists()).toBe(false)
    expect(wrapper.find('.desktop-topbar-stub').exists()).toBe(false)
  })
})
