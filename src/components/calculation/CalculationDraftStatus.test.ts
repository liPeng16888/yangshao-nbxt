// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalculationDraftStatus from './CalculationDraftStatus.vue'

describe('CalculationDraftStatus', () => {
  it('shows a single accessible retry action only for a save error', async () => {
    const wrapper = mount(CalculationDraftStatus, { props: { status: 'error' } })
    const buttons = wrapper.findAll('button')

    expect(wrapper.text()).toContain('保存失败')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text()).toBe('重试保存')
    expect(buttons[0].classes()).toContain('mobile-touch-target')
    await buttons[0].trigger('click')
    expect(wrapper.emitted('retry')).toEqual([[]])
  })

  it('offers exactly the two explicit resolution actions during conflict', async () => {
    const wrapper = mount(CalculationDraftStatus, {
      props: { status: 'conflict', conflict: { revision: 4 } }
    })
    const buttons = wrapper.findAll('button')

    expect(wrapper.text()).toContain('其他设备')
    expect(buttons.map((button) => button.text())).toEqual(['加载服务器版本', '覆盖服务器版本'])
    expect(buttons.every((button) => button.classes().includes('mobile-touch-target'))).toBe(true)
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('useServer')).toEqual([[]])
    expect(wrapper.emitted('overwrite')).toEqual([[]])
  })

  it.each([
    ['loading', '正在加载草稿'],
    ['idle', '草稿已加载'],
    ['saving', '正在保存'],
    ['retrying', '正在重试保存'],
    ['saved', '已保存']
  ] as const)('renders %s without exposing conflict or retry actions', (status, label) => {
    const wrapper = mount(CalculationDraftStatus, {
      props: { status, updatedAt: '2026-08-15T08:00:00.000Z' }
    })
    expect(wrapper.text()).toContain(label)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
