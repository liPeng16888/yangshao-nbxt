import { describe, expect, it } from 'vitest'
import {
  deleteCoefficientRows,
  inferCoefficientRowAutoCode,
  renumberAutomaticCoefficientRows
} from './coefficientRows'

describe('coefficient row identity', () => {
  it('infers legacy automatic codes only when code matches the loaded position', () => {
    expect(inferCoefficientRowAutoCode('003', 3)).toBe(true)
    expect(inferCoefficientRowAutoCode('A-03', 3)).toBe(false)
    expect(inferCoefficientRowAutoCode('010', 3)).toBe(false)
    expect(inferCoefficientRowAutoCode('CUSTOM', 3, true)).toBe(true)
  })

  it('renumbers only automatic rows in display order', () => {
    const rows = [
      { id: '1', code: '001', autoCode: true },
      { id: '2', code: 'A-02', autoCode: false },
      { id: '4', code: '004', autoCode: true }
    ]
    renumberAutomaticCoefficientRows(rows)
    expect(rows.map((row) => row.code)).toEqual(['001', 'A-02', '003'])
  })

  it('deletes multiple rows but rejects deleting every row', () => {
    const rows = [
      { id: '1', code: '001', autoCode: true },
      { id: '2', code: '002', autoCode: true },
      { id: '3', code: '003', autoCode: true }
    ]
    expect(deleteCoefficientRows(rows, new Set(['2']))).toHaveLength(2)
    expect(() => deleteCoefficientRows(rows, new Set(['1', '2', '3']))).toThrow('至少保留一个样品')
  })
})
