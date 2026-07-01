import type { SamplePaymentStatus } from './labSheet'

export type IncomePaymentStatus = SamplePaymentStatus | '未选择'

export interface IncomeStatusSummary {
  status: IncomePaymentStatus
  count: number
  amount: number
}

export interface IncomeDailyRow {
  date: string
  sampleCount: number
  totalAmount: number
  statusSummaries: IncomeStatusSummary[]
}

export interface IncomeBillReport {
  month: string
  totalSamples: number
  totalAmount: number
  statusSummaries: IncomeStatusSummary[]
  rows: IncomeDailyRow[]
}

export interface UnsettledSampleRow {
  date: string
  sheetId: string
  blockId: string
  sequence: string
  sampleNumber: string
  customer: string
  amount: number
}

export type MonthlySettlementStatus = '已结款' | '未结款' | '部分结款'

export interface MonthlySettlementDailyRow {
  id: string
  date: string
  customer: string
  sampleCount: number
  amount: number
}

export interface MonthlySettlementSummaryRow {
  id: string
  month: string
  customer: string
  sampleCount: number
  amount: number
  settlementStatus: MonthlySettlementStatus
  paidAmount?: number | null
  remark?: string
}

export interface MonthlySettlementReport {
  month: string
  totalSamples: number
  totalAmount: number
  dailyRows: MonthlySettlementDailyRow[]
  summaryRows: MonthlySettlementSummaryRow[]
}

export interface PrepaidRechargePayload {
  rechargeDate: string
  customer: string
  amount: number
  usableTimes: number
  remark?: string
}

export interface PrepaidRechargeRow extends PrepaidRechargePayload {
  id: string
  createdAt?: string
}

export interface PrepaidCustomerRow {
  id: string
  customer: string
  totalAmount: number
  totalUsableTimes: number
  usedTimes: number
  availableTimes: number
  remark?: string
}

export interface PrepaidDailyUsageRow {
  id: string
  date: string
  customer: string
  sampleCount: number
  remark?: string
}

export interface PrepaidReport {
  customerRows: PrepaidCustomerRow[]
  dailyRows: PrepaidDailyUsageRow[]
}
