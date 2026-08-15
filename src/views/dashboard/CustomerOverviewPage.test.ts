// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElSelect } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import CustomerOverviewPage from './CustomerOverviewPage.vue'

const mocks = vi.hoisted(() => ({
  getCustomerOverview: vi.fn(),
  mobileLayout: undefined as unknown as ReturnType<typeof ref<boolean>>
}))

vi.mock('@/api/customerOverview', () => ({
  getCustomerOverview: mocks.getCustomerOverview
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.mobileLayout })
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

const DrawerStub = defineComponent({
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

const DialogStub = defineComponent({
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

function mountPage() {
  return mount(CustomerOverviewPage, {
    global: {
      plugins: [ElementPlus],
      directives: { loading: {} },
      stubs: { ElDrawer: DrawerStub, ElDialog: DialogStub }
    }
  })
}

describe('CustomerOverviewPage', () => {
  beforeEach(() => {
    mocks.getCustomerOverview.mockReset()
    mocks.getCustomerOverview.mockResolvedValue(rows)
    mocks.mobileLayout = ref(false)
  })

  it('loads complete customer rows and supports one or multiple customer filters', async () => {
    const wrapper = mountPage()
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
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-summary="customers"]').text()).toContain('2')
    expect(wrapper.find('[data-summary="samples"]').text()).toContain('4')
    expect(wrapper.find('[data-summary="amount"]').text()).toContain('160.00')
  })

  it('uses cards rather than the desktop table in the mobile layout', async () => {
    mocks.mobileLayout.value = true
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-customer-overview-list"]').text()).toContain('客户甲')
    expect(wrapper.get('[data-testid="mobile-customer-overview-list"]').text()).toContain('3 个样品')
    expect(wrapper.find('.el-table').exists()).toBe(false)
  })

  it('shows the active sort and selected filter in the mobile summary without secondary navigation', async () => {
    mocks.mobileLayout.value = true
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-customer-filter-summary"]').text()).toContain('最后检测时间')
    expect(wrapper.find('.mobile-secondary-nav').exists()).toBe(false)
  })

  it('keeps selected customer keys after a failed mobile refresh and offers retry', async () => {
    mocks.mobileLayout.value = true
    mocks.getCustomerOverview.mockResolvedValueOnce(rows).mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(rows)
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-customer-filter-summary"] .mobile-filter-summary').trigger('click')
    const customerSelect = wrapper.findAllComponents(ElSelect)[0]
    customerSelect.vm.$emit('update:modelValue', ['a'])
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    await wrapper.get('[data-testid="mobile-customer-refresh"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-customer-load-error"]').text()).toContain('加载失败')
    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(1)
    await wrapper.get('[data-testid="mobile-customer-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="mobile-customer-load-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(1)
  })
})
