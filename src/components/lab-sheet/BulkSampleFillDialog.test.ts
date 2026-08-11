import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BulkSampleFillDialog from './BulkSampleFillDialog.vue'

const DialogStub = defineComponent({
  props: {
    modelValue: Boolean
  },
  template: '<section v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></section>'
})

const CustomerEditorStub = defineComponent({
  props: {
    customerRole: String
  },
  emits: ['update'],
  template: `
    <button
      :class="customerRole === 'payer' ? 'set-payer-customer' : 'set-recipient-customer'"
      @click="$emit('update', customerRole === 'payer'
        ? { customerId: 'payer-1', customerIds: ['payer-1'], customers: [{ id: 'payer-1', name: '王总' }], customerText: '王总' }
        : { recipientCustomerId: 'recipient-1', recipientCustomerIds: ['recipient-1'], recipientCustomers: [{ id: 'recipient-1', name: '李总' }], recipientCustomerText: '李总' })"
    >{{ customerRole }}</button>
  `
})

function mountDialog() {
  return mount(BulkSampleFillDialog, {
    props: {
      visible: true,
      selectedCount: 2
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: DialogStub,
        CustomerCellEditor: CustomerEditorStub,
        LabElementSelector: true
      }
    }
  })
}

describe('BulkSampleFillDialog', () => {
  beforeEach(() => {
    vi.spyOn(ElMessageBox, 'confirm').mockImplementation(
      () => Promise.resolve(undefined) as unknown as ReturnType<typeof ElMessageBox.confirm>
    )
  })

  it('shows payer and recipient fields without application checkboxes', () => {
    const wrapper = mountDialog()

    expect(wrapper.text()).toContain('付款客户')
    expect(wrapper.text()).toContain('数据发送')
    expect(wrapper.find('.el-checkbox').exists()).toBe(false)
  })

  it('applies only fields that contain values, including recipient customers', async () => {
    const wrapper = mountDialog()

    await wrapper.find('.set-recipient-customer').trigger('click')
    await nextTick()
    const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('确认填充'))
    expect(confirmButton).toBeDefined()
    await confirmButton!.trigger('click')
    await nextTick()

    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      patch: {
        recipientCustomerId: 'recipient-1',
        recipientCustomerIds: ['recipient-1'],
        recipientCustomers: [{ id: 'recipient-1', name: '李总' }],
        recipientCustomerText: '李总'
      }
    })
  })

  it('labels prepaid input as a deduction amount and keeps two decimals', async () => {
    const wrapper = mountDialog()
    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('update:modelValue', '预存款')
    const numberInput = wrapper.findComponent({ name: 'ElInputNumber' })
    numberInput.vm.$emit('update:modelValue', 12.345)
    await nextTick()

    const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('确认填充'))
    await confirmButton!.trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('扣除金额')
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      patch: { price: 12.35, paymentStatus: '预存款' }
    })
  })

  it('rejects a non-positive prepaid deduction amount', async () => {
    const wrapper = mountDialog()
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '预存款')
    wrapper.findComponent({ name: 'ElInputNumber' }).vm.$emit('update:modelValue', 0)
    await nextTick()

    const confirmButton = wrapper.findAll('button').find((button) => button.text().includes('确认填充'))
    await confirmButton!.trigger('click')

    expect(wrapper.emitted('apply')).toBeUndefined()
  })
})
