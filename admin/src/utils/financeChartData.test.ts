import { describe, expect, it } from 'vitest'
import {
  buildExpenseBarData,
  buildExpensePieData,
  buildIncomeBarData,
  buildIncomePieData
} from './financeChartData'

describe('finance chart data', () => {
  it('builds an income daily total bar chart and payment-status pie chart', () => {
    const rows = [
      {
        date: '2026-08-02',
        totalAmount: 360,
        statusSummaries: [
          { status: '已结款', amount: 200 },
          { status: '未结款', amount: 160 }
        ]
      },
      {
        date: '2026-08-01',
        totalAmount: 120,
        statusSummaries: [{ status: '已结款', amount: 120 }]
      }
    ]

    expect(buildIncomeBarData(rows)).toEqual({ labels: ['2026-08-01', '2026-08-02'], values: [120, 360] })
    expect(buildIncomePieData(rows)).toEqual([
      { name: '已结款', value: 320 },
      { name: '未结款', value: 160 }
    ])
  })

  it('aggregates expenses by payment date and expense item', () => {
    const rows = [
      { paymentDate: '2026-08-02', item: '试剂', amount: 100 },
      { paymentDate: '2026-08-01', item: '运费', amount: 50 },
      { paymentDate: '2026-08-02', item: '试剂', amount: 80 },
      { paymentDate: '2026-08-01', item: '', amount: 20 }
    ]

    expect(buildExpenseBarData(rows)).toEqual({ labels: ['2026-08-01', '2026-08-02'], values: [70, 180] })
    expect(buildExpensePieData(rows)).toEqual([
      { name: '试剂', value: 180 },
      { name: '运费', value: 50 },
      { name: '未分类', value: 20 }
    ])
  })
})
