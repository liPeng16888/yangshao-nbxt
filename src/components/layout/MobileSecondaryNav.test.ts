// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MobileSecondaryNav from './MobileSecondaryNav.vue'
import { useCustomerNavigation } from '@/composables/useCustomerNavigation'

const route = reactive({ path: '/data', meta: {} as Record<string, unknown> })
const scrollIntoView = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => route
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: {
      id: 'main-account',
      role: 'FRONTEND_USER',
      permissions: [],
      isFrontendMainAccount: true,
      isFrontendSubAccount: false
    }
  })
}))

function mountNav(count: number, activePath = '/item-1') {
  return mount(MobileSecondaryNav, {
    props: {
      items: Array.from({ length: count }, (_, index) => ({ key: `item-${index + 1}`, path: `/item-${index + 1}`, label: `项目 ${index + 1}` })),
      activePath
    },
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>'
        }
      }
    }
  })
}

const NavigationHost = defineComponent({
  setup() {
    return useCustomerNavigation()
  },
  render() {
    return h('div')
  }
})

describe('MobileSecondaryNav', () => {
  beforeEach(() => {
    route.path = '/data'
    scrollIntoView.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  })

  it('sizes two, three, and six children for their intended mobile tracks', () => {
    expect(mountNav(2).classes()).toContain('mobile-secondary-nav--two')
    expect(mountNav(3).classes()).toContain('mobile-secondary-nav--three')
    expect(mountNav(6).classes()).toContain('mobile-secondary-nav--scrollable')
    expect(mountNav(6).findAll('.mobile-secondary-nav__item')).toHaveLength(6)
  })

  it('centers the active child when the selected route changes', async () => {
    mountNav(6)
    await nextTick()

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' })
  })

  it('only exposes the rail for multi-page customer navigation groups', () => {
    const wrapper = mount(NavigationHost)
    const navigation = wrapper.vm as unknown as { showSecondaryNav: boolean }

    for (const path of ['/data', '/lab-report/image-template', '/employee-attendance/payroll', '/finance/income', '/medicine-inventory/stock']) {
      route.path = path
      expect(navigation.showSecondaryNav).toBe(true)
    }

    for (const path of ['/reports', '/customers-overview', '/blacklist']) {
      route.path = path
      expect(navigation.showSecondaryNav).toBe(false)
    }
  })
})
