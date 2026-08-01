import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElSelect } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerOverviewPage from './CustomerOverviewPage.vue'

const mocks = vi.hoisted(() => ({ getCustomerOverview: vi.fn() }))

vi.mock('@/api/customerOverview', () => ({
  getCustomerOverview: mocks.getCustomerOverview
}))

const rows = [
  {
    customerKey: 'a',
    customer: '客户甲',
    customerDisplay: '客户甲 13800000001 wx-a',
    sampleCount: 3,
    totalAmount: 60,
    firstDetectionDate: '2026-07-01',
    lastDetectionDate: '2026-07-03'
  },
  {
    customerKey: 'b',
    customer: '客户乙',
    customerDisplay: '客户乙 13800000002',
    sampleCount: 1,
    totalAmount: 100,
    firstDetectionDate: '2026-07-02',
    lastDetectionDate: '2026-07-04'
  }
]

describe('CustomerOverviewPage', () => {
  beforeEach(() => {
    mocks.getCustomerOverview.mockReset()
    mocks.getCustomerOverview.mockResolvedValue(rows)
  })

  it('loads complete customer rows and supports one or multiple customer filters', async () => {
    const wrapper = mount(CustomerOverviewPage, {
      global: { plugins: [ElementPlus], directives: { loading: {} } }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('客户甲 13800000001 wx-a')
    expect(wrapper.text()).toContain('客户乙 13800000002')
    const customerSelect = wrapper.findAllComponents(ElSelect)[0]
    expect(customerSelect.props('multiple')).toBe(true)

    customerSelect.vm.$emit('update:modelValue', ['a'])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('客户甲 13800000001 wx-a')
    expect(wrapper.text()).not.toContain('客户乙 13800000002')

    customerSelect.vm.$emit('update:modelValue', ['a', 'b'])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('客户乙 13800000002')
  })

  it('shows summary totals for the currently filtered rows', async () => {
    const wrapper = mount(CustomerOverviewPage, {
      global: { plugins: [ElementPlus], directives: { loading: {} } }
    })
    await flushPromises()

    expect(wrapper.find('[data-summary="customers"]').text()).toContain('2')
    expect(wrapper.find('[data-summary="samples"]').text()).toContain('4')
    expect(wrapper.find('[data-summary="amount"]').text()).toContain('160.00')
  })
})
