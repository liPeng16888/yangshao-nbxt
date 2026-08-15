// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceReport, SampleDetectionReport } from '@/types/report'
import MobileReportFilter from '@/components/report/MobileReportFilter.vue'
import ReportPage from './ReportPage.vue'

const mocks = vi.hoisted(() => ({
  mobile: true,
  store: undefined as unknown as Record<string, unknown>,
  loadReport: vi.fn()
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: { __v_isRef: true, value: mocks.mobile } })
}))

vi.mock('@/stores/report', () => ({
  useReportStore: () => mocks.store
}))

const report: SampleDetectionReport = {
  summary: {
    totalSamples: 123456,
    totalPrice: 9876543.21,
    averageSamples: 123456,
    averagePrice: 9876543.21,
    statusSummaries: []
  },
  rows: []
}

const financeReport: FinanceReport = {
  summary: { totalAmount: 100, totalCount: 1, averageAmount: 100, highestExpenseDay: '2026-08-15' },
  rows: [],
  categories: []
}

function createStore(kind: 'sample' | 'finance' = 'sample') {
  return reactive({
    kind,
    mode: 'daily' as const,
    date: '2026-08-15',
    startDate: '2026-08-01',
    endDate: '2026-08-15',
    sampleReport: report,
    financeReport: kind === 'finance' ? financeReport : null,
    loading: false,
    loadReport: mocks.loadReport
  })
}

const globalStubs = {
  ElSegmented: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<button data-testid="kind-toggle" @click="$emit(\'update:modelValue\', \'finance\')"><slot /></button>'
  },
  ElRadioGroup: { template: '<div><slot /></div>' },
  ElRadioButton: { props: ['label'], template: '<button type="button"><slot /></button>' },
  ElDatePicker: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  ElButton: { emits: ['click'], template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
  ElDrawer: { template: '<section><slot /><slot name="footer" /></section>' },
  ElEmpty: { props: ['description'], template: '<div data-testid="empty-state">{{ description }}</div>' },
  ElTable: { template: '<div class="el-table"><slot /></div>' },
  ElTableColumn: { template: '<div />' },
  ReportChart: { props: ['option'], template: '<div class="report-chart-stub" />' }
}

function mountPage() {
  return mount(ReportPage, { global: { directives: { loading: () => undefined }, stubs: globalStubs } })
}

describe('mobile reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mobile = true
    mocks.loadReport.mockResolvedValue(undefined)
    mocks.store = createStore()
  })

  it('uses the single-page mobile filter, two-column summaries, and no secondary navigation', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.mobile-secondary-nav').exists()).toBe(false)
    expect(wrapper.get('[data-testid="mobile-report-filter"]').text()).toContain('筛选')
    expect(wrapper.findAll('.summary-card')).toHaveLength(4)
    expect(wrapper.get('.summary-cards').classes()).toContain('summary-cards--mobile')
    expect(wrapper.get('[data-testid="mobile-report-charts"]').classes()).toContain('mobile-report-charts--single-column')
    expect(wrapper.get('[data-testid="empty-state"]').text()).toContain('当前周期暂无统计数据')
    expect(wrapper.findComponent({ name: 'ReportFilterBar' }).exists()).toBe(false)
  })

  it('keeps dirty mobile filter values available when a report request fails and retries the same request', async () => {
    mocks.loadReport.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(undefined)
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-report-filter"] input').setValue('2026-08-14')
    expect((mocks.store as { date: string }).date).toBe('2026-08-14')
    expect(wrapper.get('[data-testid="mobile-report-load-error"]').text()).toContain('加载失败')

    await wrapper.get('[data-testid="retry-mobile-report"]').trigger('click')
    await flushPromises()

    expect(mocks.loadReport).toHaveBeenCalledTimes(2)
    expect((mocks.store as { date: string }).date).toBe('2026-08-14')
    expect(wrapper.find('[data-testid="mobile-report-load-error"]').exists()).toBe(false)
  })

  it('keeps the desktop ReportFilterBar presentation when the shared layout filter is desktop', async () => {
    mocks.mobile = false
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-report-filter"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'ReportFilterBar' }).exists()).toBe(true)
    expect(wrapper.get('.summary-cards').classes()).not.toContain('summary-cards--mobile')
  })

  it('keeps finance charts in one mobile column without changing the shared report data', async () => {
    mocks.store = createStore('finance')
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-report-charts"]').classes()).toContain('mobile-report-charts--single-column')
    expect((mocks.store as { financeReport: FinanceReport }).financeReport.summary.totalAmount).toBe(100)
  })
})

describe('MobileReportFilter', () => {
  it('emits the same v-model updates and explicit search contract as the desktop report filter', async () => {
    const wrapper = mount(MobileReportFilter, {
      props: {
        mode: 'custom',
        date: '2026-08-15',
        startDate: '2026-08-01',
        endDate: '2026-08-15'
      },
      global: { stubs: globalStubs }
    })

    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('2026-08-02')
    await inputs[1].setValue('2026-08-16')
    await wrapper.get('[data-testid="mobile-report-search"]').trigger('click')

    expect(wrapper.emitted('update:startDate')).toEqual([['2026-08-02']])
    expect(wrapper.emitted('update:endDate')).toEqual([['2026-08-16']])
    expect(wrapper.emitted('search')).toEqual([[]])
  })
})
