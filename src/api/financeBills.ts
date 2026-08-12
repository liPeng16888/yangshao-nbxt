import dayjs from 'dayjs'
import request, { useMocks } from '@/utils/request'
import { getLabSheetByDate, getLabSheetHistory, saveSampleBlock } from './labSheet'
import type {
  IncomeBillReport,
  MonthlySettlementReport,
  MonthlySettlementSummaryRow,
  UnsettledSampleRow
} from '@/types/financeBills'
import type { SampleBlock } from '@/types/labSheet'
import {
  getMonthlySettlementDailyRowsFromSheet,
  getUnsettledRowsFromSheet,
  summarizeIncomeRows,
  summarizeIncomeSheet,
  summarizeMonthlySettlementReport
} from '@/utils/financeBills'
import { businessDateInBeijing, todayInBeijing } from '@/utils/date'
import { getMockSharedPrepaidOwnerId, listMockSharedPrepaidIncomeRecharges } from '@/mocks/sharedPrepaidLedger'

const MONTHLY_SETTLEMENT_STORAGE_KEY = 'ys_monthly_settlement_records'

export async function getIncomeBillReport(month: string): Promise<IncomeBillReport> {
  if (!useMocks) return request.get('/finance/income-bills', { params: { month } })
  const dates = getMonthDates(month)
  const rows = await Promise.all(dates.map(async (date) => summarizeIncomeSheet(await getLabSheetByDate(date))))
  const recharges = listMockSharedPrepaidIncomeRecharges(
    getMockSharedPrepaidOwnerId(),
    dates[0] || `${month}-01`,
    dates.at(-1) || dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD')
  )
  return summarizeIncomeRows(month, rows, recharges, new Set(dates))
}

export async function getUnsettledSamples(): Promise<UnsettledSampleRow[]> {
  if (!useMocks) return request.get('/finance/unsettled-samples')
  await getLabSheetByDate(businessDateInBeijing())
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
    idempotencyKey: crypto.randomUUID(),
    baseUpdatedAt: block.updatedAt,
    baseInputs: { paymentStatus: block.inputs.paymentStatus || '' },
    changedFields: { paymentStatus: '已结款' }
  })
}

export async function markSamplesAsPaid(rows: UnsettledSampleRow[]): Promise<SampleBlock[]> {
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.blockId, row])).values())
  if (!uniqueRows.length) return []
  if (!useMocks) {
    return request.put('/finance/unsettled-samples/paid', {
      blockIds: uniqueRows.map((row) => row.blockId)
    })
  }

  const sheetsByDate = new Map<string, Awaited<ReturnType<typeof getLabSheetByDate>>>()
  for (const row of uniqueRows) {
    if (!sheetsByDate.has(row.date)) {
      sheetsByDate.set(row.date, await getLabSheetByDate(row.date))
    }
  }
  const targets = uniqueRows.map((row) => {
    const sheet = sheetsByDate.get(row.date)!
    const block = sheet.sampleBlocks.find((item) => item.id === row.blockId)
    if (!block || block.inputs.paymentStatus !== '未结款') {
      throw new Error('部分样品已不是未结款状态，请刷新后重试')
    }
    return { sheet, block }
  })

  const savedBlocks: SampleBlock[] = []
  for (const { sheet, block } of targets) {
    savedBlocks.push(await saveSampleBlock(sheet.id, {
      id: block.id,
      idempotencyKey: crypto.randomUUID(),
      baseUpdatedAt: block.updatedAt,
      baseInputs: { paymentStatus: block.inputs.paymentStatus || '' },
      changedFields: { paymentStatus: '已结款' }
    }))
  }
  return savedBlocks
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
