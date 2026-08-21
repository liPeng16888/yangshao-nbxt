import { describe, expect, it } from 'vitest'
import type { CustomerOverviewRow } from '@/types/customerOverview'
import { filterAndSortCustomerRows } from './customerOverview'

const rows: CustomerOverviewRow[] = [
  {
    customerKey: 'b',
    customer: '客户乙',
    customerDisplay: '客户乙 13800000002',
    sampleCount: 2,
    totalAmount: 200,
    firstDetectionDate: '2026-07-03',
    lastDetectionDate: '2026-07-10'
  },
  {
    customerKey: 'a',
    customer: '客户甲',
    customerDisplay: '客户甲 13800000001',
    sampleCount: 5,
    totalAmount: 80,
    firstDetectionDate: '2026-07-01',
    lastDetectionDate: '2026-07-08'
  },
  {
    customerKey: 'c',
    customer: '客户丙',
    customerDisplay: '客户丙 13800000003',
    sampleCount: 1,
    totalAmount: 500,
    firstDetectionDate: '2026-07-02',
    lastDetectionDate: '2026-07-12'
  }
]

describe('filterAndSortCustomerRows', () => {
  it('supports single and multiple customer selections', () => {
    expect(filterAndSortCustomerRows(rows, ['a'], 'customerDisplay', 'asc').map((row) => row.customerKey)).toEqual(['a'])
    expect(filterAndSortCustomerRows(rows, ['a', 'c'], 'customerDisplay', 'asc').map((row) => row.customerKey)).toEqual(['c', 'a'])
    expect(filterAndSortCustomerRows(rows, [], 'customerDisplay', 'asc')).toHaveLength(3)
  })

  it('sorts numeric totals numerically without mutating the source', () => {
    expect(filterAndSortCustomerRows(rows, [], 'sampleCount', 'desc').map((row) => row.sampleCount)).toEqual([5, 2, 1])
    expect(filterAndSortCustomerRows(rows, [], 'totalAmount', 'asc').map((row) => row.totalAmount)).toEqual([80, 200, 500])
    expect(rows.map((row) => row.customerKey)).toEqual(['b', 'a', 'c'])
  })

  it('sorts first and last detection dates', () => {
    expect(filterAndSortCustomerRows(rows, [], 'firstDetectionDate', 'asc').map((row) => row.customerKey)).toEqual(['a', 'c', 'b'])
    expect(filterAndSortCustomerRows(rows, [], 'lastDetectionDate', 'desc').map((row) => row.customerKey)).toEqual(['c', 'b', 'a'])
  })

  it('uses the existing customer-display tiebreaker deterministically for equal sort values', () => {
    const tiedRows: CustomerOverviewRow[] = [
      { ...rows[0], customerKey: 'later', customer: '客户乙', customerDisplay: '客户乙', sampleCount: 4 },
      { ...rows[1], customerKey: 'first', customer: '客户甲', customerDisplay: '客户甲', sampleCount: 4 }
    ]

    expect(filterAndSortCustomerRows(tiedRows, [], 'sampleCount', 'asc').map((row) => row.customerKey)).toEqual(['first', 'later'])
    expect(filterAndSortCustomerRows(tiedRows, [], 'sampleCount', 'desc').map((row) => row.customerKey)).toEqual(['first', 'later'])
  })
})
