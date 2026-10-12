import { describe,it,expect } from 'vitest'
import { nextSequence,parseEntryRows } from './entry'
describe('explicit sample registration shorthand',()=>{
  it('parses compact text without turning sequence into a customer ID',()=>{expect(parseEntryRows('001 小张 60 月结款')[0]).toEqual({sequence:'001',customerName:'小张',price:60,paymentStatus:'月结款',createCustomer:false})})
  it('accepts the exact natural-language example and multiline paste',()=>{expect(parseEntryRows('编号001付款客户录入小张、金额60、费用状态月结款')[0].price).toBe(60);expect(parseEntryRows('001 小张 60 月结款\n002 小李 80 未结款')).toHaveLength(2)})
  it('keeps a spaced customer name intact',()=>{expect(parseEntryRows('001 华北 化验厂 60 已结款')[0].customerName).toBe('华北 化验厂')})
  it('reuses customer and status only when explicit defaults are provided; never reuses money',()=>{expect(parseEntryRows('002 80',{customerName:'小张',paymentStatus:'月结款'})[0]).toMatchObject({customerName:'小张',price:80});expect(()=>parseEntryRows('002 80')).toThrow();expect(()=>parseEntryRows('002',{customerName:'小张',paymentStatus:'月结款'})).toThrow()})
  it('rejects malformed money, duplicate sequences, and oversized batches',()=>{for(const text of ['001 小张 -60 月结款','001 小张 60.001 月结款','001 小张 NaN 月结款','001 小张 60 未知状态','001 小张 60 月结款\n1 小李 80 未结款'])expect(()=>parseEntryRows(text)).toThrow();expect(()=>parseEntryRows(Array.from({length:6},(_,i)=>`${i+1} 小张 60 月结款`).join('\n'))).toThrow()})
  it('increments only numeric sequences without losing zero padding',()=>{expect(nextSequence('001')).toBe('002');expect(nextSequence('009')).toBe('010');expect(nextSequence('A01')).toBe('')})
})
