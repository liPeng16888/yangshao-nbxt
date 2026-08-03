import { describe, expect, it } from 'vitest'
import type { MonthlySettlementDailyRow, MonthlySettlementElementCount } from '@/types/financeBills'
import type { MonthlyBillDraft } from '@/types/monthlySettlementBill'
import {
  applyMonthlyBillElementPrice,
  addMonthlyBillManualEntry,
  createMonthlyBillDraft,
  createMonthlyBillFilename,
  createMonthlyBillTableLayout,
  formatMonthlyBillDate,
  formatMonthlyBillMoney,
  formatMonthlyBillMonth,
  recalculateMonthlyBillDraft,
  roundMonthlyBillMoney,
  updateMonthlyBillEntry,
  validateMonthlyBillDraft
} from './monthlySettlementBill'

function makeDailyRow(
  date: string,
  customer: string,
  elementCounts: MonthlySettlementElementCount[]
): MonthlySettlementDailyRow {
  return {
    id: `${date}__${customer}`,
    date,
    customer,
    customerDisplay: customer,
    sampleCount: 1,
    amount: 0,
    elementCounts
  }
}

function makeDraftWithEntries(): MonthlyBillDraft {
  return {
    title: '客户甲化验账单',
    month: '2026-08',
    customer: '客户甲',
    customerDisplay: '客户甲',
    entries: [{
      id: 'entry-1',
      sourceElementKey: 'sulfur',
      date: '2026-08-01',
      elementLabel: '硫',
      quantity: 1,
      unitPrice: null,
      subtotal: 0
    }],
    elementTotals: [],
    totalAmount: 0
  }
}

function makeDraftWithElementCount(count: number): MonthlyBillDraft {
  return recalculateMonthlyBillDraft({
    title: '客户甲化验账单',
    month: '2026-08',
    customer: '客户甲',
    customerDisplay: '客户甲',
    entries: Array.from({ length: count }, (_, index) => ({
      id: `entry-${index + 1}`,
      sourceElementKey: `element-${index + 1}`,
      date: '2026-08-01',
      elementLabel: `元素${index + 1}`,
      quantity: 1,
      unitPrice: 10,
      subtotal: 10
    })),
    elementTotals: [],
    totalAmount: 0
  })
}

describe('monthly settlement bill calculations', () => {
  it('builds a detached draft for one customer without mutating report rows', () => {
    const rows = [
      makeDailyRow('2026-08-01', '客户甲', [
        { key: 'aluminumSiliconRatio', label: '铝硅比', count: 2 },
        { key: 'sulfur', label: '硫', count: 1 },
        { key: 'calcium', label: '钙', count: 0 }
      ]),
      makeDailyRow('2026-08-02', '客户乙', [{ key: 'calcium', label: '钙', count: 3 }])
    ]
    const snapshot = structuredClone(rows)
    const draft = createMonthlyBillDraft(rows, '客户甲', '客户甲 13800000000', '2026-08')

    expect(draft.title).toBe('客户甲 13800000000化验账单')
    expect(draft.entries.map((entry) => [entry.date, entry.elementLabel, entry.quantity])).toEqual([
      ['2026-08-01', '铝硅比', 2],
      ['2026-08-01', '硫', 1]
    ])
    expect(rows).toEqual(snapshot)
  })

  it('sorts bill dates from the first day of the month to the last day', () => {
    const draft = createMonthlyBillDraft([
      makeDailyRow('2026-08-31', '客户甲', [{ key: 'sulfur', label: '硫', count: 1 }]),
      makeDailyRow('2026-08-01', '客户甲', [{ key: 'sulfur', label: '硫', count: 2 }]),
      makeDailyRow('2026-08-09', '客户甲', [{ key: 'sulfur', label: '硫', count: 3 }])
    ], '客户甲', '客户甲', '2026-08')

    expect(createMonthlyBillTableLayout(draft).detailRows.map((row) => row.date)).toEqual([
      '2026-08-01',
      '2026-08-09',
      '2026-08-31'
    ])
  })

  it('keeps every element in a stable column and leaves missing date cells empty', () => {
    const draft = createMonthlyBillDraft([
      makeDailyRow('2026-08-02', '客户甲', [{ key: 'calcium', label: '钙', count: 2 }]),
      makeDailyRow('2026-08-01', '客户甲', [
        { key: 'sulfur', label: '硫', count: 1 },
        { key: 'calcium', label: '钙', count: 1 }
      ])
    ], '客户甲', '客户甲', '2026-08')

    const layout = createMonthlyBillTableLayout(draft)

    expect(layout.groupCount).toBe(5)
    expect(layout.detailRows.map((row) => row.entries.map((entry) => entry?.sourceElementKey || null))).toEqual([
      ['sulfur', 'calcium', null, null, null],
      [null, 'calcium', null, null, null]
    ])
  })

  it('adds a temporary manual element to the export draft and includes it in totals', () => {
    const sourceRows = [makeDailyRow('2026-08-01', '客户甲', [{ key: 'sulfur', label: '硫', count: 1 }])]
    const snapshot = structuredClone(sourceRows)
    let draft = createMonthlyBillDraft(sourceRows, '客户甲', '客户甲', '2026-08')
    draft = addMonthlyBillManualEntry(draft, '2026-08-02', '临时检测', 2)
    draft = applyMonthlyBillElementPrice(draft, 'manual:临时检测', 30)

    expect(draft.entries).toContainEqual(expect.objectContaining({
      sourceElementKey: 'manual:临时检测',
      date: '2026-08-02',
      elementLabel: '临时检测',
      quantity: 2,
      subtotal: 60
    }))
    expect(draft.elementTotals).toContainEqual(expect.objectContaining({
      elementLabel: '临时检测',
      quantity: 2,
      amount: 60
    }))
    expect(sourceRows).toEqual(snapshot)
  })

  it('creates an empty draft when the customer has no positive element detail', () => {
    const draft = createMonthlyBillDraft(
      [makeDailyRow('2026-08-01', '客户甲', [{ key: 'sulfur', label: '硫', count: 0 }])],
      '客户甲',
      '客户甲',
      '2026-08'
    )

    expect(draft.entries).toEqual([])
    expect(validateMonthlyBillDraft(draft)).toContainEqual({
      field: 'entries',
      message: '该客户本月暂无可导出的检测明细'
    })
  })

  it('applies prices, recalculates totals and regroups an edited element label', () => {
    const original = makeDraftWithEntries()
    let draft = applyMonthlyBillElementPrice(original, 'sulfur', 30)
    draft = updateMonthlyBillEntry(draft, 'entry-1', {
      elementLabel: '全硫',
      quantity: 2,
      unitPrice: 35
    })

    expect(draft.entries[0].subtotal).toBe(70)
    expect(draft.elementTotals).toContainEqual(expect.objectContaining({ elementLabel: '全硫', quantity: 2, amount: 70 }))
    expect(draft.totalAmount).toBe(70)
    expect(original.entries[0]).toMatchObject({ elementLabel: '硫', quantity: 1, unitPrice: null, subtotal: 0 })
  })

  it('quantizes an element price to two decimals before applying it to every matching source element', () => {
    const draft = createMonthlyBillDraft([
      makeDailyRow('2026-08-01', '客户甲', [{ key: 'sulfur', label: '硫', count: 2 }]),
      makeDailyRow('2026-08-02', '客户甲', [{ key: 'sulfur', label: '硫', count: 3 }])
    ], '客户甲', '客户甲', '2026-08')

    const pricedDraft = applyMonthlyBillElementPrice(draft, 'sulfur', 12.345)

    expect(pricedDraft.entries.map((entry) => entry.unitPrice)).toEqual([12.35, 12.35])
    expect(pricedDraft.entries.map((entry) => entry.subtotal)).toEqual([24.7, 37.05])
    expect(pricedDraft.elementTotals).toEqual([
      { sourceElementKey: 'sulfur', elementLabel: '硫', quantity: 5, amount: 61.75 }
    ])
    expect(pricedDraft.totalAmount).toBe(61.75)
  })

  it('reserves five editable element groups in every bill row', () => {
    const layouts = [1, 2, 3, 4, 5].map((count) => createMonthlyBillTableLayout(makeDraftWithElementCount(count)))

    expect(layouts.map((layout) => layout.groupCount)).toEqual([5, 5, 5, 5, 5])
    expect(layouts.map((layout) => layout.detailRows[0].entries.length)).toEqual([5, 5, 5, 5, 5])
    expect(layouts.map((layout) => layout.summaryRows[0].length)).toEqual([5, 5, 5, 5, 5])
  })

  it('chunks each date and summary into continuation rows after five groups', () => {
    const layout = createMonthlyBillTableLayout(makeDraftWithElementCount(7), 5)

    expect(layout.groupCount).toBe(5)
    expect(layout.detailRows.map((row) => row.entries.length)).toEqual([5, 5])
    expect(layout.detailRows.map((row) => [row.showDate, row.dateRowSpan])).toEqual([
      [true, 2],
      [false, 0]
    ])
    expect(layout.summaryRows.map((row) => row.length)).toEqual([5, 5])
  })

  it('keeps date groups in source order and sets row spans per date', () => {
    const draft = makeDraftWithElementCount(2)
    draft.entries.push(
      { ...draft.entries[0], id: 'entry-3', date: '2026-08-02', elementLabel: '元素3' },
      { ...draft.entries[0], id: 'entry-4', date: '2026-08-02', elementLabel: '元素4' }
    )
    const layout = createMonthlyBillTableLayout(recalculateMonthlyBillDraft(draft), 1)

    expect(layout.detailRows.map((row) => [row.date, row.showDate, row.dateRowSpan])).toEqual([
      ['2026-08-01', true, 2],
      ['2026-08-01', false, 0],
      ['2026-08-02', true, 2],
      ['2026-08-02', false, 0]
    ])
  })

  it('rounds money to two decimal places', () => {
    expect(roundMonthlyBillMoney(0.1 * 0.2)).toBe(0.02)
    expect(roundMonthlyBillMoney(1.005)).toBe(1.01)
    expect(roundMonthlyBillMoney(10.075)).toBe(10.08)
  })

  it('quantizes an entry unit price before recalculating totals', () => {
    const draft = makeDraftWithEntries()
    draft.entries[0].quantity = 1
    draft.entries[0].unitPrice = 10.075

    const recalculated = recalculateMonthlyBillDraft(draft)

    expect(recalculated.entries[0].unitPrice).toBe(10.08)
    expect(recalculated.entries[0].subtotal).toBe(10.08)
    expect(recalculated.elementTotals[0].amount).toBe(10.08)
    expect(recalculated.totalAmount).toBe(10.08)
  })

  it('quantizes an edited entry unit price to at most two decimals', () => {
    const updated = updateMonthlyBillEntry(makeDraftWithEntries(), 'entry-1', { unitPrice: 1.235 })

    expect(updated.entries[0].unitPrice).toBe(1.24)
    expect(updated.entries[0].subtotal).toBe(1.24)
    expect(validateMonthlyBillDraft(updated)).toEqual([])
  })

  it('preserves a tiny negative unit price so it remains invalid after normalization', () => {
    const priced = applyMonthlyBillElementPrice(makeDraftWithEntries(), 'sulfur', -0.004)

    expect(priced.entries[0].unitPrice).toBe(-0.004)
    expect(Object.is(priced.entries[0].unitPrice, -0)).toBe(false)
    expect(validateMonthlyBillDraft(priced)).toContainEqual({
      field: 'unitPrice',
      entryId: 'entry-1',
      message: '请填写有效的元素单价'
    })
  })

  it('uses shared Chinese date, month and currency formats', () => {
    expect(formatMonthlyBillDate('2026-08-01')).toBe('8月1日')
    expect(formatMonthlyBillDate('手动日期')).toBe('手动日期')
    expect(formatMonthlyBillMonth('2026-08')).toBe('2026年8月')
    expect(formatMonthlyBillMonth('自定义账期')).toBe('自定义账期')
    expect(formatMonthlyBillMoney(20)).toBe('¥20.00')
    expect(formatMonthlyBillMoney(Number.NaN)).toBe('')
  })

  it('returns deterministic errors for invalid customer, entries, price and quantity', () => {
    const draft = makeDraftWithEntries()
    draft.customer = ''
    draft.entries[0].unitPrice = -1
    draft.entries[0].quantity = -2

    expect(validateMonthlyBillDraft(draft)).toEqual([
      { field: 'customer', message: '请选择需要导出的客户' },
      { field: 'unitPrice', entryId: 'entry-1', message: '请填写有效的元素单价' },
      { field: 'quantity', entryId: 'entry-1', message: '请输入不小于零的有效数量' }
    ])

    const emptyDraft = { ...draft, entries: [] }
    expect(validateMonthlyBillDraft(emptyDraft)).toEqual([
      { field: 'customer', message: '请选择需要导出的客户' },
      { field: 'entries', message: '该客户本月暂无可导出的检测明细' }
    ])
  })

  it('rejects non-finite prices and quantities', () => {
    const draft = makeDraftWithEntries()
    draft.entries[0].unitPrice = Number.NaN
    draft.entries[0].quantity = Number.POSITIVE_INFINITY

    expect(validateMonthlyBillDraft(draft)).toEqual([
      { field: 'unitPrice', entryId: 'entry-1', message: '请填写有效的元素单价' },
      { field: 'quantity', entryId: 'entry-1', message: '请输入不小于零的有效数量' }
    ])
  })

  it('cleans illegal filename characters', () => {
    const draft = makeDraftWithEntries()
    draft.customer = '客户/甲:乙*丙?丁"戊<己>庚|辛\\'

    expect(createMonthlyBillFilename(draft)).toBe('客户-甲-乙-丙-丁-戊-己-庚-辛--2026-08-化验账单.png')
  })
})
