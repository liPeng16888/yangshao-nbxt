import type { MonthlySettlementDailyRow } from '@/types/financeBills'
import type {
  MonthlyBillDraft,
  MonthlyBillElementTotal,
  MonthlyBillEntry,
  MonthlyBillEntryPatch,
  MonthlyBillTableLayout,
  MonthlyBillTableRow,
  MonthlyBillValidationError
} from '@/types/monthlySettlementBill'

export const MAX_MONTHLY_BILL_ELEMENT_GROUPS = 5

export function createMonthlyBillDraft(
  rows: MonthlySettlementDailyRow[],
  customer: string,
  customerDisplay: string,
  month: string
): MonthlyBillDraft {
  const entries = rows
    .filter((row) => row.customer === customer)
    .sort((left, right) => compareMonthlyBillDates(left.date, right.date))
    .flatMap((row) => row.elementCounts
      .filter((item) => item.count > 0)
      .map((item) => ({
        id: `${row.id}__${item.key}`,
        sourceElementKey: item.key,
        date: row.date,
        elementLabel: item.label,
        quantity: item.count,
        unitPrice: null,
        subtotal: 0
      })))

  return recalculateMonthlyBillDraft({
    title: `${customerDisplay || customer}化验账单`,
    month,
    customer,
    customerDisplay: customerDisplay || customer,
    entries,
    elementTotals: [],
    totalAmount: 0
  })
}

export function addMonthlyBillManualEntry(
  draft: MonthlyBillDraft,
  date: string,
  elementLabel: string,
  quantity = 0
): MonthlyBillDraft {
  const normalizedLabel = elementLabel.trim()
  if (!normalizedLabel) return draft

  const matchingEntry = draft.entries.find((entry) => normalizeElementLabel(entry.elementLabel) === normalizeElementLabel(normalizedLabel))
  const sourceElementKey = matchingEntry?.sourceElementKey || `manual:${normalizedLabel}`
  const existingEntry = draft.entries.find((entry) => entry.date === date && entry.sourceElementKey === sourceElementKey)
  if (existingEntry) return updateMonthlyBillEntry(draft, existingEntry.id, { quantity })

  const duplicateIndex = draft.entries.filter((entry) => entry.id.startsWith(`manual:${date}:${sourceElementKey}:`)).length
  return recalculateMonthlyBillDraft({
    ...draft,
    entries: [
      ...draft.entries,
      {
        id: `manual:${date}:${sourceElementKey}:${duplicateIndex + 1}`,
        sourceElementKey,
        date,
        elementLabel: normalizedLabel,
        quantity: isFiniteNumber(quantity) ? quantity : 0,
        unitPrice: matchingEntry?.unitPrice ?? null,
        subtotal: 0
      }
    ]
  })
}

export function applyMonthlyBillElementPrice(
  draft: MonthlyBillDraft,
  elementKey: string,
  unitPrice: number | null
): MonthlyBillDraft {
  const normalizedUnitPrice = normalizeMonthlyBillUnitPrice(unitPrice)
  const entries = draft.entries.map((entry) => (
    entry.sourceElementKey === elementKey ? { ...entry, unitPrice: normalizedUnitPrice } : { ...entry }
  ))
  return recalculateMonthlyBillDraft({ ...draft, entries })
}

export function updateMonthlyBillEntry(
  draft: MonthlyBillDraft,
  entryId: string,
  patch: MonthlyBillEntryPatch
): MonthlyBillDraft {
  const normalizedPatch = Object.prototype.hasOwnProperty.call(patch, 'unitPrice')
    ? { ...patch, unitPrice: normalizeMonthlyBillUnitPrice(patch.unitPrice ?? null) }
    : patch
  const entries = draft.entries.map((entry) => (
    entry.id === entryId ? { ...entry, ...normalizedPatch } : { ...entry }
  ))
  return recalculateMonthlyBillDraft({ ...draft, entries })
}

export function recalculateMonthlyBillDraft(draft: MonthlyBillDraft): MonthlyBillDraft {
  const entries = draft.entries.map((entry) => {
    const unitPrice = normalizeMonthlyBillUnitPrice(entry.unitPrice)
    const subtotal = isFiniteNumber(entry.quantity) && isFiniteNumber(unitPrice)
      ? roundMonthlyBillMoney(entry.quantity * unitPrice)
      : 0
    return { ...entry, unitPrice, subtotal }
  })
  const totals = new Map<string, MonthlyBillElementTotal>()

  entries.forEach((entry) => {
    const current = totals.get(entry.sourceElementKey)
    if (current) {
      current.quantity += numericOrZero(entry.quantity)
      current.amount = roundMonthlyBillMoney(current.amount + entry.subtotal)
      return
    }
    totals.set(entry.sourceElementKey, {
      sourceElementKey: entry.sourceElementKey,
      elementLabel: entry.elementLabel,
      quantity: numericOrZero(entry.quantity),
      amount: entry.subtotal
    })
  })

  return {
    ...draft,
    entries,
    elementTotals: Array.from(totals.values()),
    totalAmount: roundMonthlyBillMoney(entries.reduce((sum, entry) => sum + entry.subtotal, 0))
  }
}

export function createMonthlyBillTableLayout(
  draft: MonthlyBillDraft,
  maxGroups = MAX_MONTHLY_BILL_ELEMENT_GROUPS
): MonthlyBillTableLayout {
  const groupLimit = normalizeGroupLimit(maxGroups)
  const sortedEntries = draft.entries
    .map((entry) => ({ ...entry }))
    .sort((left, right) => compareMonthlyBillDates(left.date, right.date))
  const columnKeys = Array.from(new Set(sortedEntries.map((entry) => entry.sourceElementKey)))
  const columnChunks = chunk(columnKeys, groupLimit)
  if (!columnChunks.length) columnChunks.push([])
  columnChunks.forEach((keys) => {
    while (keys.length < groupLimit) keys.push('')
  })

  const dateGroups = new Map<string, Map<string, MonthlyBillEntry>>()
  sortedEntries.forEach((entry) => {
    const entries = dateGroups.get(entry.date) || new Map<string, MonthlyBillEntry>()
    entries.set(entry.sourceElementKey, entry)
    dateGroups.set(entry.date, entries)
  })

  const detailRows: MonthlyBillTableRow[] = []
  Array.from(dateGroups.entries())
    .sort(([left], [right]) => compareMonthlyBillDates(left, right))
    .forEach(([date, entries]) => {
      columnChunks.forEach((keys, index) => {
        detailRows.push({
          id: `${date}__${index}`,
          date,
          dateRowSpan: index === 0 ? columnChunks.length : 0,
          showDate: index === 0,
          entries: keys.map((key) => key ? entries.get(key) || null : null),
          columnKeys: keys.map((key) => key || null)
        })
      })
    })

  const totalByKey = new Map(draft.elementTotals.map((total) => [total.sourceElementKey, total]))
  const summaryRows = columnKeys.length
    ? columnChunks.map((keys) => keys.map((key) => key ? { ...totalByKey.get(key)! } : null))
    : []

  return {
    groupCount: groupLimit,
    detailRows,
    summaryRows
  }
}

export function validateMonthlyBillDraft(draft: MonthlyBillDraft): MonthlyBillValidationError[] {
  const errors: MonthlyBillValidationError[] = []
  if (typeof draft.customer !== 'string' || !draft.customer.trim()) {
    errors.push({ field: 'customer', message: '请选择需要导出的客户' })
  }
  if (!draft.entries.length) {
    errors.push({ field: 'entries', message: '该客户本月暂无可导出的检测明细' })
  }

  draft.entries.forEach((entry) => {
    if (!isFiniteNumber(entry.unitPrice) || entry.unitPrice < 0) {
      errors.push({ field: 'unitPrice', entryId: entry.id, message: '请填写有效的元素单价' })
    }
    if (!isFiniteNumber(entry.quantity) || entry.quantity < 0) {
      errors.push({ field: 'quantity', entryId: entry.id, message: '请输入不小于零的有效数量' })
    }
  })

  return errors
}

export function createMonthlyBillFilename(draft: MonthlyBillDraft): string {
  const customerName = draft.customer || draft.customerDisplay
  return `${sanitizeFilenamePart(customerName)}-${draft.month}-化验账单.png`
}

export function formatMonthlyBillDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${Number(match[2])}月${Number(match[3])}日` : value
}

export function formatMonthlyBillMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  return match ? `${match[1]}年${Number(match[2])}月` : value
}

export function formatMonthlyBillMoney(value: number) {
  return Number.isFinite(value) ? `¥${roundMonthlyBillMoney(value).toFixed(2)}` : ''
}

export function roundMonthlyBillMoney(value: number) {
  if (!Number.isFinite(value)) return value

  const sign = value < 0 ? -1 : 1
  // Normalize binary floating-point noise before applying decimal half-up rounding.
  const normalized = expandDecimal(Math.abs(value).toPrecision(15))
  const [integerPart, fractionPart = ''] = normalized.split('.')
  const cents = Number(integerPart) * 100 + Number(fractionPart.slice(0, 2).padEnd(2, '0'))
  const roundedCents = cents + (Number(fractionPart[2] || 0) >= 5 ? 1 : 0)
  return sign * roundedCents / 100
}

function normalizeMonthlyBillUnitPrice(value: number | null) {
  if (!isFiniteNumber(value) || value < 0) return value
  return roundMonthlyBillMoney(value)
}

function normalizeGroupLimit(value: number) {
  if (!Number.isFinite(value)) return MAX_MONTHLY_BILL_ELEMENT_GROUPS
  return Math.max(1, Math.min(MAX_MONTHLY_BILL_ELEMENT_GROUPS, Math.trunc(value)))
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function numericOrZero(value: number) {
  return isFiniteNumber(value) ? value : 0
}

function compareMonthlyBillDates(left: string, right: string) {
  const leftIsIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(left)
  const rightIsIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(right)
  if (leftIsIsoDate && !rightIsIsoDate) return -1
  if (!leftIsIsoDate && rightIsIsoDate) return 1
  return left.localeCompare(right, 'zh-CN', { numeric: true })
}

function normalizeElementLabel(value: string) {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-')
}

function expandDecimal(value: string) {
  const [coefficient, exponentText] = value.toLowerCase().split('e')
  if (!exponentText) return coefficient

  const exponent = Number(exponentText)
  const [integerPart, fractionPart = ''] = coefficient.split('.')
  const digits = integerPart + fractionPart
  const decimalIndex = integerPart.length + exponent
  if (decimalIndex <= 0) return `0.${'0'.repeat(-decimalIndex)}${digits}`
  if (decimalIndex >= digits.length) return `${digits}${'0'.repeat(decimalIndex - digits.length)}`
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
}
