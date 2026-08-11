import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PrepaidMemberPickerDialog from './PrepaidMemberPickerDialog.vue'

const storeMocks = vi.hoisted(() => ({
  lookupLabMember: vi.fn()
}))

vi.mock('@/stores/sharedPrepaid', () => ({
  useSharedPrepaidStore: () => ({ lookupLabMember: storeMocks.lookupLabMember })
}))

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['close'],
  template: '<section v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></section>'
})

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(PrepaidMemberPickerDialog, {
    props: {
      visible: true,
      initialPhone: '',
      initialAmount: null,
      ...props
    },
    global: {
      plugins: [ElementPlus],
      stubs: { ElDialog: DialogStub }
    }
  })
}

describe('PrepaidMemberPickerDialog', () => {
  beforeEach(() => {
    storeMocks.lookupLabMember.mockReset()
  })

  it('requires an exact phone lookup before showing balances and confirming one exact deduction', async () => {
    storeMocks.lookupLabMember.mockResolvedValue({ id: 'member-1', phone: '13800000000', currentBalance: 100 })
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="prepaid-member-phone"]').setValue('138')
    await wrapper.get('[data-testid="prepaid-member-search"]').trigger('click')
    expect(storeMocks.lookupLabMember).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入11位会员手机号')

    await wrapper.get('[data-testid="prepaid-member-phone"]').setValue('138 0000-0000')
    await wrapper.get('[data-testid="prepaid-member-search"]').trigger('click')
    await nextTick()

    expect(storeMocks.lookupLabMember).toHaveBeenCalledWith('13800000000')
    expect(wrapper.text()).toContain('当前余额')
    expect(wrapper.text()).toContain('¥100.00')

    await wrapper.get('[data-testid="prepaid-deduction-amount"] input').setValue('30.25')
    await nextTick()

    expect(wrapper.text()).toContain('扣除后余额')
    expect(wrapper.text()).toContain('¥69.75')
    expect(wrapper.text()).toContain('余额仅供参考')
    expect(wrapper.text()).toContain('扣除金额')
    expect(wrapper.text()).not.toContain('扣除次数')

    const confirm = wrapper.get('[data-testid="prepaid-member-confirm"]')
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([[
      { memberId: 'member-1', phone: '13800000000', amount: 30.25, currentBalance: 100 }
    ]])
  })

  it('disables confirmation when the exact two-decimal deduction exceeds the advisory balance', async () => {
    storeMocks.lookupLabMember.mockResolvedValue({ id: 'member-1', phone: '13800000000', currentBalance: 20 })
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 20.01 })
    await nextTick()
    await nextTick()

    expect(storeMocks.lookupLabMember).toHaveBeenCalledWith('13800000000')
    expect(wrapper.text()).toContain('余额不足')
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('refreshes the current balance and clears stale hidden values before the next opening', async () => {
    storeMocks.lookupLabMember
      .mockResolvedValueOnce({ id: 'member-1', phone: '13800000000', currentBalance: 50 })
      .mockResolvedValueOnce({ id: 'member-1', phone: '13800000000', currentBalance: 40 })
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 10 })
    await nextTick()
    await nextTick()

    await wrapper.get('[data-testid="prepaid-member-refresh"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('¥40.00')

    await wrapper.setProps({ visible: false, initialPhone: '', initialAmount: null })
    await wrapper.setProps({ visible: true })
    await nextTick()

    expect((wrapper.get('[data-testid="prepaid-member-phone"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-testid="prepaid-deduction-amount"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('¥40.00')
  })
})
