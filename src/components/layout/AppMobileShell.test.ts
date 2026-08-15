// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppMobileShell from './AppMobileShell.vue'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  auth: {
    user: { username: 'iphone-user' },
    logoutCurrentUser: vi.fn()
  },
  accessGuard: { openSettings: vi.fn() },
  labSheet: { disconnectRealtime: vi.fn() },
  route: { path: '/data', meta: { title: '数据计算' } }
}))

const scrollIntoView = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace })
}))

vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/stores/accessGuard', () => ({ useAccessGuardStore: () => mocks.accessGuard }))
vi.mock('@/stores/labSheet', () => ({ useLabSheetStore: () => mocks.labSheet }))

function mountShell() {
  return mount(AppMobileShell, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a class="router-link-stub" :href="to"><slot /></a>'
        },
        ElDrawer: {
          props: ['modelValue'],
          template: '<aside v-if="modelValue" class="mobile-menu-drawer-stub"><slot name="header" /><slot /></aside>'
        },
        ElButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
        }
      }
    }
  })
}

describe('AppMobileShell', () => {
  beforeEach(() => {
    mocks.route.path = '/data'
    mocks.route.meta.title = '数据计算'
    mocks.replace.mockReset()
    mocks.auth.logoutCurrentUser.mockReset()
    mocks.auth.logoutCurrentUser.mockResolvedValue(undefined)
    mocks.accessGuard.openSettings.mockReset()
    mocks.labSheet.disconnectRealtime.mockReset()
    scrollIntoView.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  })

  it('provides a compact header, first-level drawer, and route-derived secondary rail', async () => {
    const wrapper = mountShell()

    expect(wrapper.get('.mobile-app-header').text()).toContain('数据计算')
    expect(wrapper.find('.mobile-menu-drawer-stub').exists()).toBe(false)
    expect(wrapper.find('.mobile-bottom-nav').exists()).toBe(false)
    expect(wrapper.find('.mobile-secondary-nav').exists()).toBe(true)

    await wrapper.get('.mobile-menu-button').trigger('click')
    await nextTick()

    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('iphone-user')
    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('数据计算')
    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('化验报告')
    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('财务')
    expect(wrapper.findAll('.mobile-drawer-nav a').map((item) => item.attributes('href'))).toEqual([
      '/data', '/lab-report', '/employee-attendance', '/finance',
      '/reports', '/medicine-inventory', '/customers-overview', '/blacklist'
    ])
  })

  it('keeps access settings and the existing account logout flow available on iPhone', async () => {
    const wrapper = mountShell()
    await wrapper.get('.mobile-menu-button').trigger('click')

    await wrapper.get('.mobile-access-settings').trigger('click')
    expect(mocks.accessGuard.openSettings).toHaveBeenCalledTimes(1)

    await wrapper.get('.mobile-menu-button').trigger('click')
    await wrapper.get('.mobile-logout').trigger('click')
    await Promise.resolve()

    expect(mocks.labSheet.disconnectRealtime).toHaveBeenCalledTimes(1)
    expect(mocks.auth.logoutCurrentUser).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('passes the canonical prepaid child to the rail for nested prepaid pages', async () => {
    mocks.route.path = '/finance/prepaid/customers'
    mocks.route.meta.title = '预存款客户'
    const wrapper = mountShell()
    await nextTick()

    const prepaid = wrapper.get('.mobile-secondary-nav__item[href="/finance/prepaid/add"]')
    expect(prepaid.classes()).toContain('router-link-active')
    expect(scrollIntoView.mock.contexts).toContain(prepaid.element)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' })
  })
})
