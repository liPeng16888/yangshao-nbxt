import dayjs from 'dayjs'
import request, { useMocks } from '@/utils/request'
import { getLabSheetByDate, getLabSheetHistory, saveSampleBlock } from './labSheet'
import type {
  IncomeBillReport,
  MonthlySettlementReport,
  MonthlySettlementSummaryRow,
  PrepaidRechargePayload,
  PrepaidRechargeRow,
  PrepaidReport,
  UnsettledSampleRow
} from '@/types/financeBills'
import type { SampleBlock } from '@/types/labSheet'
import {
  getMonthlySettlementDailyRowsFromSheet,
  getPrepaidDailyRowsFromSheet,
  getUnsettledRowsFromSheet,
  summarizeIncomeRows,
  summarizeIncomeSheet,
  summarizeMonthlySettlementReport,
  summarizePrepaidReport
} from '@/utils/financeBills'
import { todayInBeijing } from '@/utils/date'

const MONTHLY_SETTLEMENT_STORAGE_KEY = 'ys_monthly_settlement_records'
const PREPAID_RECHARGE_STORAGE_KEY = 'ys_prepaid_recharge_records'
const PREPAID_CUSTOMER_REMARK_STORAGE_KEY = 'ys_prepaid_customer_remarks'
const PREPAID_USAGE_REMARK_STORAGE_KEY = 'ys_prepaid_usage_remarks'

export async function getIncomeBillReport(month: string): Promise<IncomeBillReport> {
  if (!useMocks) return request.get('/finance/income-bills', { params: { month } })
  const rows = await Promise.all(getMonthDates(month).map(async (date) => summarizeIncomeSheet(await getLabSheetByDate(date))))
  return summarizeIncomeRows(month, rows, loadPrepaidRecharges())
}

export async function getUnsettledSamples(): Promise<UnsettledSampleRow[]> {
  if (!useMocks) return request.get('/finance/unsettled-samples')
  await getLabSheetByDate(todayInBeijing())
  const history = await getLabSheetHistory()
  const rows = await Promise.all(history.map(async (sheet) => getUnsettledRowsFromSheet(await getLabSheetByDate(sheet.date))))
  return rows.flat().sort((a, b) => `${b.date}-${b.sequence}`.localeCompare(`${a.date}-${a.sequence}`))
}

export async function markSampleAsPaid(row: UnsettledSampleRow): Promise<SampleBlock> {
  if (!useMocks) return request.put(`/finance/unsettled-samples/${row.blockId}/paid`, { date: row.date })
  const sheet = await getLabSheetByDate(row.date)
  const block = sheet.sampleBlocks.find((item) => item.id === row.blockId)
  if (!block) throw new Error('未找到对应样品')
  return saveSampleBlock(sheet.id, {
    id: block.id,
    baseUpdatedAt: block.updatedAt,
    baseInputs: { paymentStatus: block.inputs.paymentStatus || '' },
    changedFields: { paymentStatus: '已结款' }
  })
}

export async function getMonthlySettlementReport(month: string): Promise<MonthlySettlementReport> {
  if (!useMocks) return request.get('/finance/monthly-settlements', { params: { month } })
  const dailyRows = await Promise.all(getMonthDates(month).map(async (date) => getMonthlySettlementDailyRowsFromSheet(await getLabSheetByDate(date))))
  return summarizeMonthlySettlementReport(month, dailyRows.flat(), loadMonthlySettlementRows().filter((row) => row.month === month))
}

export async function updateMonthlySettlementSummary(row: MonthlySettlementSummaryRow): Promise<MonthlySettlementSummaryRow> {
  if (!useMocks) return request.put(`/finance/monthly-settlements/${encodeURIComponent(row.id)}`, row)
  const rows = loadMonthlySettlementRows()
  const index = rows.findIndex((item) => item.id === row.id)
  const savedRow = { ...row }
  if (index >= 0) rows[index] = savedRow
  else rows.push(savedRow)
  saveMonthlySettlementRows(rows)
  return savedRow
}

export async function getPrepaidRecharges(): Promise<PrepaidRechargeRow[]> {
  if (!useMocks) return request.get('/finance/prepaid-recharges')
  return loadPrepaidRecharges()
}

export async function createPrepaidRecharge(payload: PrepaidRechargePayload): Promise<PrepaidRechargeRow> {
  if (!useMocks) return request.post('/finance/prepaid-recharges', payload)
  const rows = loadPrepaidRecharges()
  const row: PrepaidRechargeRow = {
    id: `prepaid-${Date.now()}`,
    rechargeDate: payload.rechargeDate,
    customer: payload.customer.trim(),
    amount: roundPayloadMoney(payload.amount),
    usableTimes: Math.max(0, Math.trunc(Number(payload.usableTimes || 0))),
    remark: payload.remark?.trim() || '',
    createdAt: new Date().toISOString()
  }
  rows.unshift(row)
  savePrepaidRecharges(rows)
  return row
}

export async function getPrepaidReport(): Promise<PrepaidReport> {
  if (!useMocks) return request.get('/finance/prepaid-report')
  await getLabSheetByDate(todayInBeijing())
  const history = await getLabSheetHistory()
  const dailyRows = await Promise.all(history.map(async (sheet) => getPrepaidDailyRowsFromSheet(await getLabSheetByDate(sheet.date))))
  return summarizePrepaidReport(loadPrepaidRecharges(), dailyRows.flat(), loadRecord(PREPAID_CUSTOMER_REMARK_STORAGE_KEY), loadRecord(PREPAID_USAGE_REMARK_STORAGE_KEY))
}

export async function updatePrepaidCustomerRemark(customer: string, remark: string) {
  if (!useMocks) return request.patch('/finance/prepaid-customers/remark', { customer, remark })
  const remarks = loadRecord(PREPAID_CUSTOMER_REMARK_STORAGE_KEY)
  remarks[customer] = remark
  saveRecord(PREPAID_CUSTOMER_REMARK_STORAGE_KEY, remarks)
  return { customer, remark }
}

export async function updatePrepaidUsageRemark(id: string, remark: string) {
  if (!useMocks) return request.patch('/finance/prepaid-usage-remarks', { id, remark })
  const remarks = loadRecord(PREPAID_USAGE_REMARK_STORAGE_KEY)
  remarks[id] = remark
  saveRecord(PREPAID_USAGE_REMARK_STORAGE_KEY, remarks)
  return { id, remark }
}

function getMonthDates(month: string) {
  const start = dayjs(`${month}-01`)
  const today = dayjs(todayInBeijing())
  const endOfMonth = start.endOf('month')
  const end = start.isSame(today, 'month') ? today : endOfMonth
  const dates: string[] = []
  let cursor = start
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }
  return dates
}

function loadMonthlySettlementRows(): MonthlySettlementSummaryRow[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MONTHLY_SETTLEMENT_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as MonthlySettlementSummaryRow[]
  } catch {
    return []
  }
}

function saveMonthlySettlementRows(rows: MonthlySettlementSummaryRow[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MONTHLY_SETTLEMENT_STORAGE_KEY, JSON.stringify(rows))
}

export function loadPrepaidRecharges(): PrepaidRechargeRow[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PREPAID_RECHARGE_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as PrepaidRechargeRow[]
  } catch {
    return []
  }
}

function savePrepaidRecharges(rows: PrepaidRechargeRow[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PREPAID_RECHARGE_STORAGE_KEY, JSON.stringify(rows))
}

function loadRecord(key: string): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function saveRecord(key: string, value: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function roundPayloadMoney(value: number) {
  return Number(Number(value || 0).toFixed(2))
}
