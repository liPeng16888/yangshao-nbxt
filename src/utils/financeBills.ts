import type {
  IncomeDailyRow,
  IncomePaymentStatus,
  IncomeStatusSummary,
  MonthlySettlementElementCount,
  MonthlySettlementDailyRow,
  MonthlySettlementReport,
  MonthlySettlementSummaryRow,
  UnsettledSampleRow
} from '@/types/financeBills'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import { getSmsElementLabel, labReportElements, parseLabElementKeys } from './labReport'
import { getPayerCustomerDisplayText, getPayerCustomerName } from './sampleCustomers'

export const incomePaymentStatuses: IncomePaymentStatus[] = ['已结款', '未结款', '月结款', '预存款', '未选择']

export interface SharedPrepaidIncomeRecharge {
  rechargeDate: string
  paidAmount: number
  giftAmount?: number
  totalAmount?: number
}

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
    if (status !== '预存款') summary.amount += block.inputs.price || 0
  })

  return {
    date: sheet.date,
    sampleCount: samples.length,
    totalAmount: roundMoney(samples.reduce(
      (sum, block) => sum + (block.inputs.paymentStatus === '预存款' ? 0 : block.inputs.price || 0),
      0
    )),
    statusSummaries: statusSummaries.map((item) => ({ ...item, amount: roundMoney(item.amount) }))
  }
}

export function summarizeIncomeRows(month: string, rows: IncomeDailyRow[], prepaidRecharges: SharedPrepaidIncomeRecharge[] = [], allowedDates?: Set<string>) {
  const rowMap = new Map(rows.map((row) => [row.date, cloneIncomeDailyRow(row)]))
  prepaidRecharges
    .filter((row) => (allowedDates ? allowedDates.has(row.rechargeDate) : row.rechargeDate.startsWith(month)))
    .forEach((recharge) => {
      const row = rowMap.get(recharge.rechargeDate) || {
        date: recharge.rechargeDate,
        sampleCount: 0,
        totalAmount: 0,
        statusSummaries: createEmptyStatusSummaries()
      }
      const summary = row.statusSummaries.find((item) => item.status === '预存款')
      if (summary) summary.amount = roundMoney(summary.amount + recharge.paidAmount)
      row.totalAmount = roundMoney(row.totalAmount + recharge.paidAmount)
      rowMap.set(row.date, row)
    })
  const mergedRows = Array.from(rowMap.values()).sort((a, b) => b.date.localeCompare(a.date))
  const statusSummaries = createEmptyStatusSummaries()
  mergedRows.forEach((row) => {
    row.statusSummaries.forEach((summary) => {
      const target = statusSummaries.find((item) => item.status === summary.status)
      if (!target) return
      target.count += summary.count
      target.amount += summary.amount
    })
  })
  const totalSamples = mergedRows.reduce((sum, row) => sum + row.sampleCount, 0)
  const totalAmount = roundMoney(mergedRows.reduce((sum, row) => sum + row.totalAmount, 0))
  return {
    month,
    totalSamples,
    totalAmount,
    statusSummaries: statusSummaries.map((item) => ({ ...item, amount: roundMoney(item.amount) })),
    rows: mergedRows
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
      customer: getPayerCustomerName(block.inputs) || '无信息',
      amount: block.inputs.price || 0
    }))
}

export function filterUnsettledRows(rows: UnsettledSampleRow[], selectedCustomers: string[]) {
  if (!selectedCustomers.length) return rows
  const selectedCustomerSet = new Set(selectedCustomers)
  return rows.filter((row) => selectedCustomerSet.has(row.customer))
}

export function getMonthlySettlementDailyRowsFromSheet(sheet: LabSheet): MonthlySettlementDailyRow[] {
  const rowMap = new Map<string, MonthlySettlementDailyRow>()
  sheet.sampleBlocks
    .filter((block) => isIncomeSample(block) && block.inputs.paymentStatus === '月结款')
    .forEach((block) => {
      const customer = getPayerCustomerName(block.inputs) || '无信息'
      const customerDisplay = getPayerCustomerDisplayText(block.inputs) || customer
      const id = `${sheet.date}__${customer}`
      const current = rowMap.get(id) || {
        id,
        date: sheet.date,
        customer,
        customerDisplay,
        sampleCount: 0,
        amount: 0,
        elementCounts: []
      }
      if (!current.customerDisplay || current.customerDisplay === current.customer) current.customerDisplay = customerDisplay
      current.sampleCount += 1
      current.amount += block.inputs.price || 0
      current.elementCounts = mergeMonthlyElementCounts(current.elementCounts, getMonthlyElementCounts(block))
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
      customerDisplay: row.customerDisplay || row.customer,
      sampleCount: 0,
      amount: 0,
      settlementStatus: '未结款' as const,
      paidAmount: null,
      remark: ''
    }
    current.sampleCount += row.sampleCount
    current.amount += row.amount
    if (!current.customerDisplay || current.customerDisplay === current.customer) current.customerDisplay = row.customerDisplay || row.customer
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

export function filterMonthlySettlementDailyRows(rows: MonthlySettlementDailyRow[], selectedCustomers: string[]) {
  if (!selectedCustomers.length) return rows
  const selectedCustomerSet = new Set(selectedCustomers)
  return rows.filter((row) => selectedCustomerSet.has(row.customer))
}

export function createMonthlySettlementSummaryId(month: string, customer: string) {
  return `${month}__${customer}`
}

export function createPartialSettlementRemark(amount: number, paidAmount: number) {
  return `未结款差额 ¥${roundMoney(Math.max(0, amount - paidAmount)).toFixed(2)}`
}

export function createPaidSettlementRemark() {
  return '此款项已结清'
}

export function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

function sortMonthlySettlementDailyRows(rows: MonthlySettlementDailyRow[]) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || a.customer.localeCompare(b.customer, 'zh-Hans-CN'))
}

function getMonthlyElementCounts(block: SampleBlock): MonthlySettlementElementCount[] {
  const selectedKeys = new Set(parseLabElementKeys(block.inputs.elementNote || ''))
  if (
    selectedKeys.has('aluminum') &&
    selectedKeys.has('silicon') &&
    selectedKeys.has('aluminumSiliconRatio')
  ) {
    selectedKeys.delete('aluminum')
    selectedKeys.delete('silicon')
  }
  return labReportElements
    .filter((element) => selectedKeys.has(element.key))
    .map((element) => ({ key: element.key, label: getSmsElementLabel(element.key), count: 1 }))
}

function mergeMonthlyElementCounts(current: MonthlySettlementElementCount[], next: MonthlySettlementElementCount[]) {
  const map = new Map(current.map((item) => [item.key, { ...item }]))
  next.forEach((item) => {
    const target = map.get(item.key)
    if (target) target.count += item.count
    else map.set(item.key, { ...item })
  })
  return labReportElements.map((element) => map.get(element.key)).filter(Boolean) as MonthlySettlementElementCount[]
}

function cloneIncomeDailyRow(row: IncomeDailyRow): IncomeDailyRow {
  return {
    ...row,
    statusSummaries: row.statusSummaries.map((summary) => ({ ...summary }))
  }
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
    remark:
      settlementStatus === '已结款'
        ? createPaidSettlementRemark()
        : saved?.remark || (settlementStatus === '部分结款' ? createPartialSettlementRemark(row.amount, paidAmount || 0) : row.remark || '')
  }
}
