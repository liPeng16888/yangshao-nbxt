import { describe, expect, it } from 'vitest'
import { isPositiveInteger, validateBlacklistPayload, validateFinancePayload } from './validators'

describe('validators', () => {
  it('accepts only positive integer sample block counts', () => {
    expect(isPositiveInteger('1')).toBe(true)
    expect(isPositiveInteger(10)).toBe(true)
    expect(isPositiveInteger('0')).toBe(false)
    expect(isPositiveInteger('-1')).toBe(false)
    expect(isPositiveInteger('1.5')).toBe(false)
    expect(isPositiveInteger('abc')).toBe(false)
  })

  it('rejects invalid finance payloads', () => {
    expect(
      validateFinancePayload({
        paymentDate: '',
        item: '',
        amount: Number.NaN,
        paymentMethod: 'online'
      })
    ).toContain('支付日期必填')
  })

  it('rejects blacklist submissions that only include images', () => {
    expect(validateBlacklistPayload({ images: ['mock.png'] })).toContain('必须至少填写一项非图片信息')
    expect(validateBlacklistPayload({ images: ['a.png', 'b.png', 'c.png'], phone: '13800000000' })).toContain('图片最多上传 2 张')
  })

  it.each([-1, -0.01])('rejects negative blacklist amounts %s', (amount) => {
    expect(validateBlacklistPayload({ images: [], amount })).toContain('金额不能小于 0')
  })

  it.each([1.999, 0.001])('rejects blacklist amounts with more than two decimals: %s', (amount) => {
    expect(validateBlacklistPayload({ images: [], amount })).toContain('金额最多保留两位小数')
  })

  it.each([0, 1.99, 123456.78])('accepts valid non-negative two-decimal blacklist amount %s', (amount) => {
    expect(validateBlacklistPayload({ images: [], amount })).toEqual([])
  })
})
