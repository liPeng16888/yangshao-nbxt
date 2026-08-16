// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceReport, SampleDetectionReport } from '@/types/report'
import MobileReportFilter from '@/components/report/MobileReportFilter.vue'
import ReportPage from './ReportPage.vue'

const mocks = vi.hoisted(() => ({
  layout: undefined as unknown as ReturnType<typeof ref<boolean>>,
  store: undefined as unknown as Record<string, unknown>,
  loadReport: vi.fn()
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.layout })
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
  ElRadioGroup: { name: 'ElRadioGroup', template: '<div><slot /></div>' },
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

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('mobile reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadReport.mockReset()
    mocks.layout = ref(true)
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
    mocks.loadReport
      .mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(undefined)
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-report-filter"] input').setValue('2026-08-14')
    await wrapper.get('[data-testid="mobile-report-search"]').trigger('click')
    expect((mocks.store as { date: string }).date).toBe('2026-08-14')
    expect(wrapper.get('[data-testid="mobile-report-load-error"]').text()).toContain('加载失败')

    await wrapper.get('[data-testid="retry-mobile-report"]').trigger('click')
    await flushPromises()

    expect(mocks.loadReport).toHaveBeenCalledTimes(3)
    expect((mocks.store as { date: string }).date).toBe('2026-08-14')
    expect(wrapper.find('[data-testid="mobile-report-load-error"]').exists()).toBe(false)
  })

  it('keeps the desktop ReportFilterBar presentation when the shared layout filter is desktop', async () => {
    mocks.layout.value = false
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

  it('keeps the existing desktop kind watcher while a layout switch itself starts no duplicate load', async () => {
    mocks.layout.value = false
    const wrapper = mountPage()
    await flushPromises()
    mocks.loadReport.mockClear()

    ;(mocks.store as { kind: 'sample' | 'finance' }).kind = 'finance'
    await flushPromises()
    expect(mocks.loadReport).toHaveBeenCalledOnce()

    mocks.loadReport.mockClear()
    mocks.layout.value = true
    await wrapper.vm.$nextTick()
    mocks.layout.value = false
    await wrapper.vm.$nextTick()
    expect(mocks.loadReport).not.toHaveBeenCalled()
  })

  it('runs one mobile request for a staged kind change and explicit query', async () => {
    const wrapper = mountPage()
    await flushPromises()
    mocks.loadReport.mockClear()

    await wrapper.findAllComponents({ name: 'ElRadioGroup' })[0].vm.$emit('update:modelValue', 'finance')
    await wrapper.get('[data-testid="mobile-report-search"]').trigger('click')
    await flushPromises()

    expect((mocks.store as { kind: string }).kind).toBe('finance')
    expect(mocks.loadReport).toHaveBeenCalledOnce()
  })

  it('keeps only the newest request busy and ignores older success or failure state', async () => {
    const first = deferred()
    const second = deferred()
    const third = deferred()
    mocks.loadReport
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise)
    const wrapper = mountPage()
    await wrapper.vm.$nextTick()

    expect(wrapper.attributes('aria-busy')).toBe('true')
    await wrapper.get('[data-testid="mobile-report-search"]').trigger('click')
    await flushPromises()
    expect(mocks.loadReport).toHaveBeenCalledTimes(2)

    first.resolve()
    await flushPromises()
    expect(wrapper.attributes('aria-busy')).toBe('true')

    second.reject(new Error('latest request failed'))
    await flushPromises()
    expect(wrapper.attributes('aria-busy')).toBe('false')
    expect(wrapper.get('[data-testid="mobile-report-load-error"]')).toBeTruthy()

    await wrapper.get('[data-testid="retry-mobile-report"]').trigger('click')
    expect(wrapper.attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[data-testid="mobile-report-load-error"]').exists()).toBe(false)

    third.resolve()
    await flushPromises()
    expect(wrapper.attributes('aria-busy')).toBe('false')
  })
})

describe('MobileReportFilter', () => {
  it('stages the existing filter values and atomically emits them with one explicit search', async () => {
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

    expect(wrapper.emitted('update:startDate')).toBeUndefined()
    expect(wrapper.emitted('update:endDate')).toBeUndefined()

    await wrapper.get('[data-testid="mobile-report-search"]').trigger('click')

    expect(wrapper.emitted('update:startDate')).toEqual([['2026-08-02']])
    expect(wrapper.emitted('update:endDate')).toEqual([['2026-08-16']])
    expect(wrapper.emitted('search')).toEqual([[]])
  })
})
