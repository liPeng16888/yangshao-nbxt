import { describe, expect, it } from 'vitest'

import {
  prepaidAccountLabel,
  prepaidErrorMessage,
  prepaidFormatElements,
  prepaidIsConflict,
  prepaidMoney,
  prepaidNormalizePhone,
  prepaidNormalizePhoneSearch,
  prepaidPreciseDateTime
} from './sharedPrepaidPresentation'

describe('shared prepaid presentation helpers', () => {
  it('formats server account, money, phone, element, and Beijing timestamp values consistently', () => {
    expect(prepaidAccountLabel({ account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }))
      .toBe('北京店（owner-a）')
    expect(prepaidAccountLabel({ account: 'owner-a', username: '主账号 A', displayRemark: null }))
      .toBe('主账号 A（owner-a）')
    expect(prepaidMoney('90.9')).toBe('90.90')
    expect(prepaidNormalizePhone('138 0000-0000')).toBe('13800000000')
    expect(prepaidNormalizePhoneSearch('138-00')).toBe('13800')
    expect(prepaidFormatElements([{ name: '金', value: 1.2 }, '银'])).toBe('金: 1.2、银')
    expect(prepaidPreciseDateTime('2026-08-12T03:04:05.000Z')).toBe('2026-08-12 11:04:05')
  })

  it('never turns letters or punctuation into a valid phone by stripping them', () => {
    expect(() => prepaidNormalizePhone('138abc00000000')).toThrow('会员手机号必须为中国大陆 11 位手机号')
    expect(() => prepaidNormalizePhone('138.0000.0000')).toThrow('会员手机号必须为中国大陆 11 位手机号')
    expect(prepaidNormalizePhoneSearch('138abc')).toBe('138abc')
  })

  it('classifies conflicts and extracts safe actionable server errors', () => {
    const error = { response: { status: 409, data: { message: '共享余额已变化' } } }
    expect(prepaidIsConflict(error)).toBe(true)
    expect(prepaidErrorMessage(error, '备用消息')).toBe('共享余额已变化')
    expect(prepaidErrorMessage({}, '备用消息')).toBe('备用消息')
  })
})
