import { describe, expect, it } from 'vitest'
import type { Customer } from '@/types/customer'
import {
  buildSampleCustomerPatch,
  getPayerCustomerDisplayText,
  getPayerCustomerName,
  getRecipientCustomerDisplayText,
  getRecipientCustomerName
} from './sampleCustomers'

const wang: Customer = {
  id: 'customer-wang',
  name: '王总',
  phone: '13055558888',
  wechat: 'wangzong',
  wechatNickname: '王总微信',
  note: '月结客户'
}

const li: Customer = {
  id: 'customer-li',
  name: '李总',
  phone: '13900000000',
  note: '接收检测数据'
}

describe('sample customer helpers', () => {
  it('builds a payer patch with the existing payer fields', () => {
    expect(buildSampleCustomerPatch('payer', ['王总'], [wang])).toEqual({
      customerId: wang.id,
      customerIds: [wang.id],
      customers: [wang],
      customerText: '王总'
    })
  })

  it('builds a recipient patch without touching payer fields', () => {
    expect(buildSampleCustomerPatch('recipient', ['李总'], [li])).toEqual({
      recipientCustomerId: li.id,
      recipientCustomerIds: [li.id],
      recipientCustomers: [li],
      recipientCustomerText: '李总'
    })
  })

  it('uses complete stored customer details for payer display text', () => {
    expect(getPayerCustomerName({ customers: [wang], customerText: '王总' })).toBe('王总')
    expect(getPayerCustomerDisplayText({ customers: [wang], customerText: '王总' })).toBe(
      '王总 13055558888 wangzong 王总微信 月结客户'
    )
  })

  it('prefers recipients and falls back to the payer when recipients are absent', () => {
    expect(getRecipientCustomerName({ customerText: '王总', recipientCustomerText: '李总' })).toBe('李总')
    expect(getRecipientCustomerName({ customerText: '王总' })).toBe('王总')
    expect(getRecipientCustomerDisplayText({ recipientCustomers: [li], customerText: '王总' })).toBe(
      '李总 13900000000 接收检测数据'
    )
    expect(getRecipientCustomerDisplayText({ customers: [wang], customerText: '王总' })).toBe(
      '王总 13055558888 wangzong 王总微信 月结客户'
    )
  })
})
