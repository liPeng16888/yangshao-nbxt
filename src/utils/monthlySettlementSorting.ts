import type { MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'

const statusRanks: Record<MonthlySettlementStatus, number> = {
  已结款: 0,
  部分结款: 1,
  未结款: 2
}

function getStatusRank(status: string) {
  return statusRanks[status as MonthlySettlementStatus] ?? Number.MAX_SAFE_INTEGER
}

export function compareMonthlySettlementStatusRows(
  left: Pick<MonthlySettlementSummaryRow, 'settlementStatus'>,
  right: Pick<MonthlySettlementSummaryRow, 'settlementStatus'>
) {
  return getStatusRank(left.settlementStatus) - getStatusRank(right.settlementStatus)
}
