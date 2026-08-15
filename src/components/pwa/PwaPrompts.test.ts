// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PwaPrompts from './PwaPrompts.vue'

function setNavigator(userAgent: string, standalone = false) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: standalone })
}

describe('PwaPrompts', () => {
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window.navigator, 'standalone')
  })

  it('shows iPhone Safari instructions until the app is installed or the guide is dismissed', async () => {
    setNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
    const wrapper = mount(PwaPrompts)
    await nextTick()

    expect(wrapper.get('.ios-install-guide').text()).toContain('分享')
    expect(wrapper.get('.ios-install-guide').text()).toContain('添加到主屏幕')

    await wrapper.get('.ios-install-guide__dismiss').trigger('click')
    expect(wrapper.find('.ios-install-guide').exists()).toBe(false)
    expect(window.localStorage.getItem('ys_ios_install_guide_dismissed')).toBe('true')
  })

  it('prompts for a new version and delegates the confirmed update to the service-worker runtime', async () => {
    setNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const applyUpdate = vi.fn()
    window.addEventListener('ys-pwa-apply-update', applyUpdate)
    const wrapper = mount(PwaPrompts)

    window.dispatchEvent(new Event('ys-pwa-update-available'))
    await nextTick()

    expect(wrapper.get('.pwa-update-prompt').text()).toContain('发现新版本')
    await wrapper.get('.pwa-update-prompt__apply').trigger('click')
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    window.removeEventListener('ys-pwa-apply-update', applyUpdate)
  })
})
