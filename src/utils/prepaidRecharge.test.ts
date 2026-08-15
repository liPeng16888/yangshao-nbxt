import { describe, expect, it } from 'vitest'
import {
  buildPrepaidRechargePayload,
  validatePrepaidAmount,
  validatePrepaidRechargeDate,
  validatePrepaidUsableTimes
} from './prepaidRecharge'

describe('prepaid recharge validation', () => {
  it.each([
    ['2026-02-29', '请选择有效的充值日期'],
    ['2026-02-30', '请选择有效的充值日期'],
    ['2026-2-03', '请选择有效的充值日期'],
    ['not-a-date', '请选择有效的充值日期']
  ])('rejects invalid calendar date %s', (value, expected) => {
    expect(validatePrepaidRechargeDate(value)).toBe(expected)
  })

  it('accepts an actual leap day', () => {
    expect(validatePrepaidRechargeDate('2024-02-29')).toBe('')
  })

  it.each([1.234, 0.001, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER])(
    'rejects unsupported amount %s without rounding it into another payload',
    (value) => {
      expect(validatePrepaidAmount(value)).not.toBe('')
    }
  )

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-positive, fractional, or unsafe usable times %s',
    (value) => {
      expect(validatePrepaidUsableTimes(value)).not.toBe('')
    }
  )

  it('returns the exact validated payload without truncating or rounding', () => {
    expect(buildPrepaidRechargePayload({
      rechargeDate: '2024-02-29',
      customer: '  客户甲  ',
      amount: '25.75',
      usableTimes: '3',
      remark: '备注'
    })).toEqual({
      payload: { rechargeDate: '2024-02-29', customer: '客户甲', amount: 25.75, usableTimes: 3, remark: '备注' },
      error: ''
    })
  })
})
