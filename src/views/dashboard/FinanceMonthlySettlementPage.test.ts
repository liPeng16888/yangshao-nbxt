import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FinanceMonthlySettlementPage from './FinanceMonthlySettlementPage.vue'
import type { MonthlySettlementDailyRow, MonthlySettlementReport, MonthlySettlementSummaryRow } from '@/types/financeBills'

const store = reactive({
  loading: false,
  monthlySavingId: '',
  monthlySettlementMonth: '2026-08',
  monthlySettlementReport: null as MonthlySettlementReport | null,
  loadMonthlySettlementReport: vi.fn(),
  saveMonthlySettlementRow: vi.fn()
})

vi.mock('@/stores/financeBills', () => ({
  useFinanceBillsStore: () => store
}))

const BillDialogStub = defineComponent({
  name: 'MonthlySettlementBillExportDialog',
  props: {
    visible: Boolean,
    month: String,
    rows: Array
  },
  emits: ['close'],
  template: '<section v-if="visible" data-testid="monthly-bill-dialog" />'
})

function makePageRows(): MonthlySettlementDailyRow[] {
  return [
    {
      id: 'row-a',
      date: '2026-08-01',
      customer: '客户甲',
      customerDisplay: '客户甲',
      sampleCount: 1,
      amount: 60,
      elementCounts: [{ key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 }]
    },
    {
      id: 'row-b',
      date: '2026-08-01',
      customer: '客户乙',
      customerDisplay: '客户乙',
      sampleCount: 1,
      amount: 50,
      elementCounts: [{ key: 'calcium', label: '钙', count: 1 }]
    }
  ]
}

function makeSummaryRows(): MonthlySettlementSummaryRow[] {
  return [
    {
      id: 'summary-a',
      month: '2026-08',
      customer: '客户甲',
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
      remark: ''
    },
    {
      id: 'summary-c',
      month: '2026-08',
      customer: '客户丙',
      sampleCount: 2,
      amount: 200,
      settlementStatus: '部分结款',
      paidAmount: 80,
      remark: ''
    }
  ]
}

function mountPageWithReport(input: {
  month: string
  dailyRows: MonthlySettlementDailyRow[]
  summaryRows?: MonthlySettlementSummaryRow[]
}) {
  store.monthlySettlementMonth = input.month
  store.monthlySettlementReport = {
    month: input.month,
    totalSamples: input.dailyRows.reduce((sum, row) => sum + row.sampleCount, 0),
    totalAmount: input.dailyRows.reduce((sum, row) => sum + row.amount, 0),
    dailyRows: input.dailyRows,
    summaryRows: input.summaryRows || []
  }
  return mount(FinanceMonthlySettlementPage, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        MonthlySettlementBillExportDialog: BillDialogStub
      }
    }
  })
}

beforeEach(() => {
  store.loadMonthlySettlementReport.mockReset()
  store.saveMonthlySettlementRow.mockReset()
})

describe('FinanceMonthlySettlementPage', () => {
  it('opens the bill export dialog with the current month and unfiltered daily rows', async () => {
    const wrapper = mountPageWithReport({
      month: '2026-08',
      dailyRows: makePageRows()
    })
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', ['客户甲'])
    await nextTick()

    const dailyTable = wrapper.findAllComponents({ name: 'ElTable' })[1]
    expect(dailyTable.props('data')).toHaveLength(1)
    expect(dailyTable.props('data')[0].customer).toBe('客户甲')

    await wrapper.get('[data-testid="open-monthly-bill-export"]').trigger('click')

    const dialog = wrapper.getComponent({ name: 'MonthlySettlementBillExportDialog' })
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('month')).toBe('2026-08')
    expect(dialog.props('rows')).toHaveLength(2)
  })

  it('keeps export available when viewing a historical month', () => {
    const wrapper = mountPageWithReport({ month: '2026-06', dailyRows: makePageRows() })

    expect(wrapper.get('[data-testid="open-monthly-bill-export"]').attributes('disabled')).toBeUndefined()
  })

  it('configures one-cycle sorting for amount, sample count, and settlement status', () => {
    const wrapper = mountPageWithReport({
      month: '2026-08',
      dailyRows: makePageRows(),
      summaryRows: makeSummaryRows()
    })
    const summaryTable = wrapper.findAllComponents({ name: 'ElTable' })[0]
    const columns = summaryTable.findAllComponents({ name: 'ElTableColumn' })
    const findColumn = (label: string) => columns.find((column) => column.props('label') === label)
    const amountColumn = findColumn('金额')
    const sampleCountColumn = findColumn('样品数量')
    const statusColumn = findColumn('结款状态')

    expect(amountColumn?.props()).toMatchObject({
      prop: 'amount',
      sortable: true,
      sortOrders: ['ascending', 'descending', null]
    })
    expect(sampleCountColumn?.props()).toMatchObject({
      prop: 'sampleCount',
      sortable: true,
      sortOrders: ['ascending', 'descending', null]
    })
    expect(statusColumn?.props()).toMatchObject({
      prop: 'settlementStatus',
      sortable: true,
      sortOrders: ['ascending', 'descending', null]
    })
    expect(statusColumn?.props('sortMethod')).toEqual(expect.any(Function))
  })
})
