import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FrontendSubAccountManager from './FrontendSubAccountManager.vue'

const api = vi.hoisted(() => ({
  listFrontendSubAccounts: vi.fn(),
  createFrontendSubAccount: vi.fn(),
  updateFrontendSubAccount: vi.fn(),
  setFrontendSubAccountStatus: vi.fn(),
  resetFrontendSubAccountPassword: vi.fn(),
  deleteFrontendSubAccount: vi.fn()
}))

vi.mock('@/api/frontendSubAccounts', () => api)

describe('FrontendSubAccountManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listFrontendSubAccounts.mockResolvedValue([{
      id: 'sub-1', account: 'operator', username: '操作员', disabled: false,
      requiresAccessGuardPassword: true, permissions: ['DATA_MAIN'], permissionVersion: 1,
      lastLoginAt: null, createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z'
    }])
  })

  it('loads subaccounts and exposes create, permission and lifecycle controls without raw passwords', async () => {
    const wrapper = mount(FrontendSubAccountManager, {
      global: {
        stubs: {
          ElTable: { template: '<div class="table"><slot /></div>' },
          ElTableColumn: { template: '<div><slot :row="{}" /></div>' },
          ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
          ElForm: { template: '<form><slot /></form>' },
          ElFormItem: { template: '<label><slot /></label>' },
          ElInput: true,
          ElSwitch: true,
          ElTree: true,
          ElTag: true,
          ElButton: { template: '<button><slot /></button>' }
        }
      }
    })
    await flushPromises()

    expect(api.listFrontendSubAccounts).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('创建子账号')
    expect(wrapper.text()).toContain('菜单权限')
    expect(wrapper.text()).toContain('重置密码')
    expect(wrapper.text()).not.toContain('passwordHash')
    expect(wrapper.text()).not.toContain('passwordCipher')
  })
})
