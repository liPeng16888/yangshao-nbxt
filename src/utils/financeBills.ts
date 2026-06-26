import type {
  IncomeDailyRow,
  IncomePaymentStatus,
  IncomeStatusSummary,
  MonthlySettlementDailyRow,
  MonthlySettlementReport,
  MonthlySettlementSummaryRow,
  UnsettledSampleRow
} from '@/types/financeBills'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import { getBlockCustomerName } from './labReport'

export const incomePaymentStatuses: IncomePaymentStatus[] = ['已结款', '未结款', '月结款', '未选择']

export function isIncomeSample(block: SampleBlock) {
  return typeof block.inputs.price === 'number' && Number.isFinite(block.inputs.price)
}

export function getIncomePaymentStatus(block: SampleBlock): IncomePaymentStatus {
  return block.inputs.paymentStatus || '未选择'
}

export function createEmptyStatusSummaries(): IncomeStatusSummary[] {
  return incomePaymentStatuses.map((status) => ({ status, count: 0, amount: 0 }))
}

export function summarizeIncomeSheet(sheet: LabSheet): IncomeDailyRow {
  const statusSummaries = createEmptyStatusSummaries()
  const samples = sheet.sampleBlocks.filter(isIncomeSample)
  samples.forEach((block) => {
    const status = getIncomePaymentStatus(block)
    const summary = statusSummaries.find((item) => item.status === status)
    if (!summary) return
    summary.count += 1
    summary.amount += block.inputs.price || 0
  })

  return {
    date: sheet.date,
    sampleCount: samples.length,
    totalAmount: roundMoney(samples.reduce((sum, block) => sum + (block.inputs.price || 0), 0)),
    statusSummaries: statusSummaries.map((item) => ({ ...item, amount: roundMoney(item.amount) }))
  }
}

export function summarizeIncomeRows(month: string, rows: IncomeDailyRow[]) {
  const statusSummaries = createEmptyStatusSummaries()
  rows.forEach((row) => {
    row.statusSummaries.forEach((summary) => {
      const target = statusSummaries.find((item) => item.status === summary.status)
      if (!target) return
      target.count += summary.count
      target.amount += summary.amount
    })
  })
  const totalSamples = rows.reduce((sum, row) => sum + row.sampleCount, 0)
  const totalAmount = roundMoney(rows.reduce((sum, row) => sum + row.totalAmount, 0))
  return {
    month,
    totalSamples,
    totalAmount,
    statusSummaries: statusSummaries.map((item) => ({ ...item, amount: roundMoney(item.amount) })),
    rows
  }
}

export function getStatusSummary(row: IncomeDailyRow, status: IncomePaymentStatus) {
  return row.statusSummaries.find((item) => item.status === status) || { status, count: 0, amount: 0 }
}

export function getUnsettledRowsFromSheet(sheet: LabSheet): UnsettledSampleRow[] {
  return sheet.sampleBlocks
    .filter((block) => isIncomeSample(block) && block.inputs.paymentStatus === '未结款')
    .map((block) => ({
      date: sheet.date,
      sheetId: sheet.id,
      blockId: block.id,
      sequence: block.inputs.sequence || String(block.index).padStart(3, '0'),
      sampleNumber: block.inputs.sampleNumber?.trim() || '无信息',
      customer: getBlockCustomerName(block) || '无信息',
      amount: block.inputs.price || 0
    }))
}

export function getMonthlySettlementDailyRowsFromSheet(sheet: LabSheet): MonthlySettlementDailyRow[] {
  const rowMap = new Map<string, MonthlySettlementDailyRow>()
  sheet.sampleBlocks
    .filter((block) => isIncomeSample(block) && block.inputs.paymentStatus === '月结款')
    .forEach((block) => {
      const customer = getBlockCustomerName(block) || '无信息'
      const id = `${sheet.date}__${customer}`
      const current = rowMap.get(id) || {
        id,
        date: sheet.date,
        customer,
        sampleCount: 0,
        amount: 0
      }
      current.sampleCount += 1
      current.amount += block.inputs.price || 0
      rowMap.set(id, current)
    })

  return sortMonthlySettlementDailyRows(
    Array.from(rowMap.values()).map((row) => ({ ...row, amount: roundMoney(row.amount) }))
  )
}

export function summarizeMonthlySettlementReport(
  month: string,
  dailyRows: MonthlySettlementDailyRow[],
  savedRows: MonthlySettlementSummaryRow[] = []
): MonthlySettlementReport {
  const savedRowMap = new Map(savedRows.map((row) => [row.id, row]))
  const summaryMap = new Map<string, MonthlySettlementSummaryRow>()

  dailyRows.forEach((row) => {
    const id = createMonthlySettlementSummaryId(month, row.customer)
    const current = summaryMap.get(id) || {
      id,
      month,
      customer: row.customer,
      sampleCount: 0,
      amount: 0,
      settlementStatus: '未结款' as const,
      paidAmount: null,
      remark: ''
    }
    current.sampleCount += row.sampleCount
    current.amount += row.amount
    summaryMap.set(id, current)
  })

  const summaryRows = Array.from(summaryMap.values())
    .map((row) => normalizeMonthlySettlementSummaryRow({ ...row, amount: roundMoney(row.amount) }, savedRowMap.get(row.id)))
    .sort((a, b) => a.customer.localeCompare(b.customer, 'zh-Hans-CN'))

  return {
    month,
    totalSamples: dailyRows.reduce((sum, row) => sum + row.sampleCount, 0),
    totalAmount: roundMoney(dailyRows.reduce((sum, row) => sum + row.amount, 0)),
    dailyRows: sortMonthlySettlementDailyRows(dailyRows),
    summaryRows
  }
}

export function createMonthlySettlementSummaryId(month: string, customer: string) {
  return `${month}__${customer}`
}

export function createPartialSettlementRemark(amount: number, paidAmount: number) {
  return `未结款差额 ¥${roundMoney(Math.max(0, amount - paidAmount)).toFixed(2)}`
}

export function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function sortMonthlySettlementDailyRows(rows: MonthlySettlementDailyRow[]) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.customer.localeCompare(b.customer, 'zh-Hans-CN'))
}

function normalizeMonthlySettlementSummaryRow(row: MonthlySettlementSummaryRow, saved?: MonthlySettlementSummaryRow): MonthlySettlementSummaryRow {
  const settlementStatus = saved?.settlementStatus || row.settlementStatus || '未结款'
  const paidAmount =
    settlementStatus === '已结款'
      ? row.amount
      : settlementStatus === '部分结款'
        ? roundMoney(Math.min(Math.max(saved?.paidAmount || 0, 0), row.amount))
        : null
  return {
    ...row,
    settlementStatus,
    paidAmount,
    remark: saved?.remark || (settlementStatus === '部分结款' ? createPartialSettlementRemark(row.amount, paidAmount || 0) : row.remark || '')
  }
}
