// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FinanceMonthlySettlementPage from './FinanceMonthlySettlementPage.vue'
import type { MonthlySettlementDailyRow, MonthlySettlementReport, MonthlySettlementSummaryRow } from '@/types/financeBills'

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

const summaryRows: MonthlySettlementSummaryRow[] = [
  {
    id: 'summary-a',
    month: '2026-08',
    customer: '客户甲',
    customerDisplay: '客户甲 13800000000',
    sampleCount: 3,
    amount: 300,
    settlementStatus: '未结款',
    paidAmount: null,
    remark: ''
  },
  {
    id: 'summary-b',
    month: '2026-08',
    customer: '客户乙',
    sampleCount: 1,
    amount: 100,
    settlementStatus: '已结款',
    paidAmount: 100,
    remark: '已收齐'
  },
  {
    id: 'summary-c',
    month: '2026-08',
    customer: '客户丙',
    sampleCount: 2,
    amount: 200,
    settlementStatus: '部分结款',
    paidAmount: 80,
    remark: '首款'
  }
]

const dailyRows: MonthlySettlementDailyRow[] = [
  {
    id: 'daily-a-1',
    date: '2026-08-01',
    customer: '客户甲',
    customerDisplay: '客户甲 13800000000',
    sampleCount: 2,
    amount: 200,
    elementCounts: [
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 2 },
      { key: 'calcium', label: '钙', count: 0 }
    ]
  },
  {
    id: 'daily-a-2',
    date: '2026-08-02',
    customer: '客户甲',
    customerDisplay: '客户甲 13800000000',
    sampleCount: 1,
    amount: 100,
    elementCounts: [{ key: 'sulfur', label: '硫', count: 1 }]
  },
  {
    id: 'daily-b-1',
    date: '2026-08-03',
    customer: '客户乙',
    sampleCount: 1,
    amount: 100,
    elementCounts: [{ key: 'calcium', label: '钙', count: 1 }]
  }
]

const report: MonthlySettlementReport = {
  month: '2026-08',
  totalSamples: 6,
  totalAmount: 600,
  summaryRows,
  dailyRows
}

const DialogStub = defineComponent({
  name: 'ElDialog',
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String, fullscreen: Boolean },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="dialog-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

const ExportDialogStub = defineComponent({
  name: 'MonthlySettlementBillExportDialog',
  props: { visible: Boolean, month: String, rows: Array, mobile: Boolean },
  emits: ['close'],
  template: '<section v-if="visible" data-testid="monthly-bill-dialog" :data-mobile="String(mobile)" />'
})

const TableStub = defineComponent({
  name: 'ElTable',
  props: { data: Array },
  template: '<div class="el-table"><slot /></div>'
})

const TableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: { label: String },
  template: '<div class="el-table-column" />'
})

function mountPage(mobile = true) {
  mocks.mobileLayout.value = mobile
  return mount(FinanceMonthlySettlementPage, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: DialogStub,
        ElTable: TableStub,
        ElTableColumn: TableColumnStub,
        ElSelect: true,
        ElOption: true,
        ElDatePicker: true,
        ElInputNumber: true,
        ElInput: true,
        MonthlySettlementBillExportDialog: ExportDialogStub,
        teleport: true
      }
    }
  })
}

function cardCustomers(wrapper: ReturnType<typeof mountPage>) {
  return wrapper.findAll('[data-testid="mobile-monthly-summary-card"]')
    .map((card) => card.attributes('data-customer'))
}

describe('FinanceMonthlySettlementPage mobile', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    mocks.mobileLayout = ref(true)
    mocks.store = reactive({
      loading: false,
      monthlySavingId: '',
      monthlySettlementMonth: '2026-08',
      monthlySettlementReport: structuredClone(report),
      loadMonthlySettlementReport: vi.fn(async () => true),
      cancelMonthlySettlementLoads: vi.fn(),
      saveMonthlySettlementRow: vi.fn(async () => undefined)
    })
  })

  it('renders exact amount, paid and unpaid values in three-state cards without the desktop tables', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-monthly-summary-card"]')).toHaveLength(3)
    expect(wrapper.find('.monthly-settlement-table').exists()).toBe(false)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(wrapper.get('[data-testid="mobile-monthly-summary-card"][data-customer="客户丙"]').text()).toContain('部分结款')
    const partial = wrapper.get('[data-testid="mobile-monthly-summary-card"][data-customer="客户丙"]')
    expect(partial.text()).toContain('应收 ¥200.00')
    expect(partial.text()).toContain('已收 ¥80.00')
    expect(partial.text()).toContain('未收 ¥120.00')
    const unpaid = wrapper.get('[data-testid="mobile-monthly-summary-card"][data-customer="客户甲"]')
    expect(unpaid.text()).toContain('已收 ¥0.00')
    expect(unpaid.text()).toContain('未收 ¥300.00')
    const paid = wrapper.get('[data-testid="mobile-monthly-summary-card"][data-customer="客户乙"]')
    expect(paid.text()).toContain('已收 ¥100.00')
    expect(paid.text()).toContain('未收 ¥0.00')
  })

  it('applies month and customer filters while keeping export available', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-monthly-month-input"]').setValue('2026-07')
    expect(mocks.store.loadMonthlySettlementReport).toHaveBeenLastCalledWith(
      '2026-07',
      expect.objectContaining({ scope: expect.anything() })
    )

    await wrapper.get('[data-testid="mobile-monthly-customer-客户甲"]').setValue(true)
    expect(wrapper.findAll('[data-testid="mobile-monthly-daily-row"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="mobile-monthly-daily-row"]').every((row) => row.text().includes('客户甲'))).toBe(true)

    await wrapper.get('[data-testid="open-monthly-bill-export-mobile"]').trigger('click')
    const exportDialog = wrapper.getComponent(ExportDialogStub)
    expect(exportDialog.props()).toMatchObject({ visible: true, mobile: true, month: '2026-08' })
    expect(exportDialog.props('rows')).toHaveLength(3)
  })

  it('keeps status, paid amount clamp and remark persistence authoritative in the page handlers', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-monthly-status-summary-a"]').setValue('部分结款')
    await flushPromises()
    expect(mocks.store.saveMonthlySettlementRow).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'summary-a',
      settlementStatus: '部分结款',
      paidAmount: 0,
      remark: '未结款差额 ¥300.00'
    }))

    const partialPaid = wrapper.get('[data-testid="mobile-monthly-paid-summary-c"]')
    await partialPaid.setValue('999')
    await flushPromises()
    expect(mocks.store.saveMonthlySettlementRow).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'summary-c',
      paidAmount: 200,
      remark: '未结款差额 ¥0.00'
    }))

    await partialPaid.setValue('-20')
    await flushPromises()
    expect(mocks.store.saveMonthlySettlementRow).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'summary-c',
      paidAmount: 0,
      remark: '未结款差额 ¥200.00'
    }))

    const remark = wrapper.get('[data-testid="mobile-monthly-remark-summary-b"]')
    await remark.setValue('手机端备注')
    expect(mocks.store.monthlySettlementReport.summaryRows[1].remark).toBe('已收齐')
    await remark.trigger('blur')
    await flushPromises()
    expect(mocks.store.saveMonthlySettlementRow).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'summary-b',
      remark: '手机端备注'
    }))
  })

  it('cycles one active mobile sort through ascending, descending and source order with desktop status parity', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(cardCustomers(wrapper)).toEqual(['客户甲', '客户乙', '客户丙'])
    await wrapper.get('[data-testid="mobile-monthly-sort-amount"]').trigger('click')
    expect(cardCustomers(wrapper)).toEqual(['客户乙', '客户丙', '客户甲'])
    await wrapper.get('[data-testid="mobile-monthly-sort-amount"]').trigger('click')
    expect(cardCustomers(wrapper)).toEqual(['客户甲', '客户丙', '客户乙'])
    await wrapper.get('[data-testid="mobile-monthly-sort-amount"]').trigger('click')
    expect(cardCustomers(wrapper)).toEqual(['客户甲', '客户乙', '客户丙'])

    await wrapper.get('[data-testid="mobile-monthly-sort-settlementStatus"]').trigger('click')
    expect(cardCustomers(wrapper)).toEqual(['客户乙', '客户丙', '客户甲'])
    await wrapper.get('[data-testid="mobile-monthly-sort-sampleCount"]').trigger('click')
    expect(cardCustomers(wrapper)).toEqual(['客户乙', '客户丙', '客户甲'])
    expect(wrapper.get('[data-testid="mobile-monthly-sort-amount"]').attributes('aria-pressed')).toBe('false')
  })

  it('opens one customer daily detail as a full-screen accessible panel with element counts', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-monthly-details-summary-a"]').trigger('click')
    const dialog = wrapper.get('[data-testid="mobile-monthly-daily-dialog"]')
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.text()).toContain('客户甲 13800000000')
    expect(dialog.findAll('[data-testid="mobile-monthly-detail-row"]')).toHaveLength(2)
    expect(dialog.text()).toContain('铝硅比2个')
    expect(dialog.text()).not.toContain('钙0个')
    expect(dialog.text()).toContain('硫1个')
  })

  it('keeps mobile and desktop presentations mutually exclusive across layout changes', async () => {
    const wrapper = mountPage(false)
    await flushPromises()
    expect(wrapper.findAll('.el-table')).toHaveLength(2)
    expect(wrapper.find('[data-testid="mobile-monthly-summary-card"]').exists()).toBe(false)

    mocks.mobileLayout.value = true
    await nextTick()
    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-monthly-summary-card"]')).toHaveLength(3)
  })

  it('retries the exact failed month and cancels its owned request on unmount', async () => {
    const wrapper = mountPage()
    await flushPromises()

    mocks.store.loadMonthlySettlementReport.mockRejectedValueOnce(new Error('load failed')).mockResolvedValueOnce(true)
    await wrapper.get('[data-testid="mobile-monthly-month-input"]').setValue('2026-07')
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-monthly-load-error"]').text()).toContain('月结款数据加载失败')
    expect((wrapper.get('[data-testid="mobile-monthly-month-input"]').element as HTMLInputElement).value).toBe('2026-07')
    await wrapper.get('[data-testid="mobile-monthly-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="mobile-monthly-load-error"]').exists()).toBe(false)
    expect(mocks.store.loadMonthlySettlementReport).toHaveBeenLastCalledWith(
      '2026-07',
      expect.objectContaining({ scope: expect.anything() })
    )

    wrapper.unmount()
    expect(mocks.store.cancelMonthlySettlementLoads).toHaveBeenCalledTimes(1)
  })
})
