// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomeBillReport } from '@/types/financeBills'
import FinanceIncomePage from './FinanceIncomePage.vue'

const mocks = vi.hoisted(() => ({
  mobileLayout: undefined as unknown as ReturnType<typeof ref<boolean>>,
  store: undefined as any
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.mobileLayout })
}))

vi.mock('@/stores/financeBills', () => ({
  useFinanceBillsStore: () => mocks.store
}))

const report: IncomeBillReport = {
  month: '2026-08',
  totalSamples: 2,
  totalAmount: 6,
  statusSummaries: [
    { status: '已结款', count: 1, amount: 0 },
    { status: '未结款', count: 1, amount: 6 },
    { status: '月结款', count: 0, amount: 0 },
    { status: '预存款', count: 0, amount: 0 },
    { status: '未选择', count: 0, amount: 0 }
  ],
  rows: [
    {
      date: '2026-08-15',
      sampleCount: 2,
      totalAmount: 6,
      statusSummaries: [
        { status: '已结款', count: 1, amount: 0 },
        { status: '未结款', count: 1, amount: 6 },
        { status: '月结款', count: 0, amount: 0 },
        { status: '预存款', count: 0, amount: 0 },
        { status: '未选择', count: 0, amount: 0 }
      ]
    },
    {
      date: '2026-08-14',
      sampleCount: 0,
      totalAmount: 0,
      statusSummaries: [
        { status: '已结款', count: 0, amount: 0 },
        { status: '未结款', count: 0, amount: 0 },
        { status: '月结款', count: 0, amount: 0 },
        { status: '预存款', count: 0, amount: 0 },
        { status: '未选择', count: 0, amount: 0 }
      ]
    }
  ]
}

const DrawerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="drawer-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

function mountPage(mobile: boolean) {
  mocks.mobileLayout.value = mobile
  return mount(FinanceIncomePage, {
    global: {
      plugins: [ElementPlus],
      stubs: { ElDrawer: DrawerStub, teleport: true }
    }
  })
}

describe('FinanceIncomePage mobile', () => {
  beforeEach(() => {
    mocks.mobileLayout = ref(true)
    mocks.store = {
      month: '2026-08',
      incomeReport: structuredClone(report),
      loading: false,
      loadIncomeReport: vi.fn(async () => undefined),
      cancelIncomeLoads: vi.fn()
    }
  })

  it('renders only non-empty daily cards with report totals, status counts, and exact money precision', async () => {
    const wrapper = mountPage(true)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-income-day-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-income-summary"]').text()).toContain('收入合计')
    expect(wrapper.get('[data-testid="mobile-income-summary"]').text()).toContain('2 个样品')
    expect(wrapper.get('[data-testid="mobile-income-summary"]').text()).toContain('¥6.00')
    expect(wrapper.get('[data-testid="mobile-income-status-已结款"]').text()).toContain('1 个')
    expect(wrapper.get('[data-testid="mobile-income-status-已结款"]').text()).toContain('¥0.00')
    const dayCard = wrapper.get('[data-testid="mobile-income-day-card"]')
    expect(dayCard.text()).toContain('2026-08-15')
    expect(dayCard.text()).toContain('2 个样品')
    expect(dayCard.text()).toContain('已结款1 个 · ¥0.00')
    expect(dayCard.text()).toContain('未结款1 个 · ¥6.00')
    expect(dayCard.text()).not.toContain('月结款')
    expect(dayCard.text()).not.toContain('预存款')
    expect(wrapper.find('.el-table').exists()).toBe(false)
  })

  it('applies the month from the mobile filter drawer through the existing store', async () => {
    const wrapper = mountPage(true)
    await wrapper.get('[data-testid="mobile-income-month-summary"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-income-month-input"]').setValue('2026-07')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')

    expect(mocks.store.loadIncomeReport).toHaveBeenLastCalledWith('2026-07')
  })

  it('keeps the existing desktop table mutually exclusive from the mobile cards', async () => {
    const wrapper = mountPage(false)
    await flushPromises()
    expect(wrapper.find('.el-table').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-income-summary"]').exists()).toBe(false)

    mocks.mobileLayout.value = true
    await nextTick()
    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-income-summary"]').exists()).toBe(true)
  })

  it('cancels a pending income load when the page unmounts', () => {
    const wrapper = mountPage(true)
    wrapper.unmount()
    expect(mocks.store.cancelIncomeLoads).toHaveBeenCalledTimes(1)
  })
})
