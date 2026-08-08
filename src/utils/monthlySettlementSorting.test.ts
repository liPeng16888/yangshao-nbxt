import { describe, expect, it } from 'vitest'
import type { MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'
import { compareMonthlySettlementStatusRows } from './monthlySettlementSorting'

function row(settlementStatus: MonthlySettlementStatus): MonthlySettlementSummaryRow {
  return {
    id: settlementStatus,
    month: '2026-08',
    customer: settlementStatus,
    sampleCount: 1,
    amount: 100,
    settlementStatus,
    paidAmount: null,
    remark: ''
  }
}

describe('monthly settlement sorting', () => {
  it('orders paid before partial before unpaid', () => {
    const rows = [row('未结款'), row('已结款'), row('部分结款')]

    expect(rows.sort(compareMonthlySettlementStatusRows).map((item) => item.settlementStatus)).toEqual([
      '已结款',
      '部分结款',
      '未结款'
    ])
  })

  it('places an unknown runtime status after the supported statuses', () => {
    const unknown = row('未结款')
    unknown.settlementStatus = '异常状态' as MonthlySettlementStatus

    expect(compareMonthlySettlementStatusRows(unknown, row('未结款'))).toBeGreaterThan(0)
  })
})
