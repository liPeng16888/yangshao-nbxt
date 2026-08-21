import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FrontendSubAccountsReadOnly from './FrontendSubAccountsReadOnly.vue'

describe('FrontendSubAccountsReadOnly', () => {
  it('groups leaf permissions and renders no account mutation controls', () => {
    const wrapper = mount(FrontendSubAccountsReadOnly, {
      props: {
        rows: [{
          id: 'sub-1', account: 'operator01', username: '操作员', disabled: false,
          requiresAccessGuardPassword: true,
          permissions: ['DATA_MAIN', 'DATA_STANDARD_SAMPLE', 'REPORTS'],
          createdAt: '2026-08-11T00:00:00.000Z', lastLoginAt: null
        }]
      },
      global: {
        stubs: {
          ElTag: { template: '<span><slot /></span>' }
        }
      }
    })

    expect(wrapper.text()).toContain('操作员')
    expect(wrapper.text()).toContain('数据计算：数据计算、标样计算')
    expect(wrapper.text()).toContain('报表：报表')
    expect(wrapper.text()).toContain('需要输入')
    for (const forbidden of ['编辑', '删除', '停用', '启用', '重置密码', '权限管理']) {
      expect(wrapper.text()).not.toContain(forbidden)
    }
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
