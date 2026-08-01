import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import CustomerCellEditor from './CustomerCellEditor.vue'
import type { Customer } from '@/types/customer'

vi.mock('@/api/customer', () => ({
  createCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  searchCustomers: vi.fn().mockResolvedValue([])
}))

vi.mock('@/api/blacklist', () => ({
  checkBlacklist: vi.fn().mockResolvedValue({ hit: false, records: [] })
}))

const wang: Customer = { id: 'customer-wang', name: '王总', phone: '13000000001' }
const li: Customer = { id: 'customer-li', name: '李总', phone: '13000000002' }

describe('CustomerCellEditor', () => {
  it('emits recipient fields for the data recipient role', async () => {
    const wrapper = mount(CustomerCellEditor, {
      props: {
        customerRole: 'recipient',
        modelValue: '',
        selectedCustomers: [li]
      },
      global: { plugins: [ElementPlus] }
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('update:modelValue', ['李总'])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update')?.at(-1)).toEqual([{
      recipientCustomerId: 'customer-li',
      recipientCustomerIds: ['customer-li'],
      recipientCustomers: [li],
      recipientCustomerText: '李总'
    }])
    expect(wrapper.emitted('update')?.at(-1)?.[0]).not.toHaveProperty('customerText')
  })

  it('keeps one visible tag and replaces the existing payer in business logic', async () => {
    const wrapper = mount(CustomerCellEditor, {
      props: {
        modelValue: '王总',
        selectedCustomers: [wang, li],
        selectionLimit: 1
      },
      global: { plugins: [ElementPlus] }
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    expect(select.props('collapseTags')).toBe(true)
    expect(select.props('maxCollapseTags')).toBe(1)

    select.vm.$emit('update:modelValue', ['王总', '李总'])
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update')?.at(-1)).toEqual([{
      customerId: 'customer-li',
      customerIds: ['customer-li'],
      customers: [li],
      customerText: '李总'
    }])
  })

  it('keeps the payer visible on focus so the tag close control remains usable', async () => {
    const wrapper = mount(CustomerCellEditor, {
      props: {
        modelValue: '王总',
        selectedCustomers: [wang],
        selectionLimit: 1
      },
      global: { plugins: [ElementPlus] }
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('focus', new FocusEvent('focus'))
    await wrapper.vm.$nextTick()

    expect(select.props('modelValue')).toEqual(['王总'])
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('clears the payer when the selected tag close control removes it', async () => {
    const wrapper = mount(CustomerCellEditor, {
      props: {
        modelValue: '王总',
        selectedCustomers: [wang],
        selectionLimit: 1
      },
      global: { plugins: [ElementPlus] }
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('update:modelValue', [])
    await wrapper.vm.$nextTick()

    expect(select.props('modelValue')).toEqual([])
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{
      customerId: undefined,
      customerIds: [],
      customers: [],
      customerText: ''
    }])
  })

  it('replaces the previous payer with manual input and emits the payer patch', async () => {
    const wrapper = mount(CustomerCellEditor, {
      props: {
        modelValue: '王总',
        selectedCustomers: [wang],
        selectionLimit: 1
      },
      global: { plugins: [ElementPlus] }
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('update:modelValue', ['王总', '手动客户'])
    await wrapper.vm.$nextTick()

    expect(select.props('modelValue')).toEqual(['手动客户'])
    expect(wrapper.emitted('update')?.at(-1)).toEqual([{
      customerId: undefined,
      customerIds: [],
      customers: [],
      customerText: '手动客户'
    }])
  })

  it('uses the role name as the compact placeholder', () => {
    const payer = mount(CustomerCellEditor, {
      props: { customerRole: 'payer' },
      global: { plugins: [ElementPlus] }
    })
    const recipient = mount(CustomerCellEditor, {
      props: { customerRole: 'recipient' },
      global: { plugins: [ElementPlus] }
    })

    expect(payer.findComponent({ name: 'ElSelect' }).props('placeholder')).toBe('付款客户')
    expect(recipient.findComponent({ name: 'ElSelect' }).props('placeholder')).toBe('数据发送')
  })

  it('keeps only add and copy actions beside the customer field', () => {
    const wrapper = mount(CustomerCellEditor, {
      props: {
        modelValue: '王总',
        selectedCustomers: [wang]
      },
      global: { plugins: [ElementPlus] }
    })

    expect(wrapper.find('[aria-label="新增客户"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="复制客户信息"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="删除已选客户"]').exists()).toBe(false)
    expect(wrapper.findAll('.customer-actions .el-button')).toHaveLength(2)
  })

  it('shows the customer role inside an empty field before it is focused', async () => {
    const wrapper = mount(CustomerCellEditor, {
      props: { customerRole: 'payer' },
      global: { plugins: [ElementPlus] }
    })

    expect(wrapper.find('.customer-empty-label').text()).toBe('付款客户')

    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('focus', new FocusEvent('focus'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.customer-empty-label').exists()).toBe(false)

    select.vm.$emit('blur', new FocusEvent('blur'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.customer-empty-label').text()).toBe('付款客户')
  })
})
