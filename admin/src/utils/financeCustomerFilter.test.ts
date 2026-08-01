import { describe, expect, it } from 'vitest'
import {
  filterFinanceRowsByCustomers,
  financeCustomerOptions,
  normalizeFinanceCustomer
} from './financeCustomerFilter'

describe('finance customer filtering', () => {
  it('normalizes string customer values and ignores non-string values', () => {
    expect(normalizeFinanceCustomer('  客户甲  ')).toBe('客户甲')
    expect(normalizeFinanceCustomer('   ')).toBe('')
    expect(normalizeFinanceCustomer(null)).toBe('')
    expect(normalizeFinanceCustomer(123)).toBe('')
  })

  it('builds unique zh-CN sorted options and keeps combined customer text intact', () => {
    const rows = [
      { customer: ' 客户乙 ' },
      { customer: '客户甲、客户乙' },
      { customer: '客户甲' },
      { customer: '客户乙' },
      { customer: '' },
      { customer: null },
      { customer: 123 },
      null
    ]
    const expected = ['客户乙', '客户甲、客户乙', '客户甲'].sort((left, right) =>
      left.localeCompare(right, 'zh-CN')
    )

    expect(financeCustomerOptions(rows)).toEqual(expected)
    expect(financeCustomerOptions(rows)).toContain('客户甲、客户乙')
    expect(financeCustomerOptions(rows)).not.toContain('客户甲、')
  })

  it('returns all rows when no customers are selected', () => {
    const rows = [{ customer: '客户甲' }, { customer: '客户乙' }, { customer: '' }]

    expect(filterFinanceRowsByCustomers(rows, [])).toEqual(rows)
  })

  it('filters by a single normalized exact customer match', () => {
    const rows = [
      { id: 1, customer: '客户甲' },
      { id: 2, customer: ' 客户甲 ' },
      { id: 3, customer: '客户甲、客户乙' },
      { id: 4, customer: '客户乙' }
    ]

    expect(filterFinanceRowsByCustomers(rows, [' 客户甲 '])).toEqual([rows[0], rows[1]])
  })

  it('filters multiple customers as a union without partial matching', () => {
    const rows = [
      { id: 1, customer: '客户甲' },
      { id: 2, customer: '客户乙' },
      { id: 3, customer: '客户甲、客户乙' },
      { id: 4, customer: '客户丙' },
      { id: 5, customer: null }
    ]

    expect(filterFinanceRowsByCustomers(rows, ['客户乙', '客户甲、客户乙'])).toEqual([
      rows[1],
      rows[2]
    ])
  })
})
