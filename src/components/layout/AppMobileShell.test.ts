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
  labSheet: { disconnectRealtime: vi.fn() }
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/data', meta: { title: '数据计算' } }),
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
    mocks.replace.mockReset()
    mocks.auth.logoutCurrentUser.mockReset()
    mocks.auth.logoutCurrentUser.mockResolvedValue(undefined)
    mocks.accessGuard.openSettings.mockReset()
    mocks.labSheet.disconnectRealtime.mockReset()
  })

  it('provides a compact header, drawer menu, and three large bottom navigation actions', async () => {
    const wrapper = mountShell()

    expect(wrapper.get('.mobile-app-header').text()).toContain('数据计算')
    expect(wrapper.find('.mobile-menu-drawer-stub').exists()).toBe(false)
    expect(wrapper.findAll('.mobile-bottom-nav > *')).toHaveLength(3)

    await wrapper.get('.mobile-menu-button').trigger('click')
    await nextTick()

    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('iphone-user')
    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('数据计算')
    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('化验报告')
    expect(wrapper.get('.mobile-menu-drawer-stub').text()).toContain('财务')
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
})
