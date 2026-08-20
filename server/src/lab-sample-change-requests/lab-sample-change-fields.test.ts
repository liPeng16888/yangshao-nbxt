import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { applyRequestedChanges, normalizeRequestedChanges } from './lab-sample-change-fields'

describe('historical sample requested changes', () => {
  it('normalizes allowed values and keeps payer customer as one logical field', () => {
    expect(normalizeRequestedChanges({
      sampleNumber: '  新样品  ',
      payerCustomer: { customerIds: ['c-1', 'c-1'], customerText: ' 王总 ' },
      price: 88.5,
      paymentStatus: '月结款',
      elementNote: ' 铁、硅 ',
      ironRaw: 1.25
    })).toEqual({
      sampleNumber: '新样品',
      payerCustomer: { customerIds: ['c-1'], customerText: '王总' },
      price: 88.5,
      paymentStatus: '月结款',
      elementNote: '铁、硅',
      ironRaw: 1.25
    })
  })

  it.each(['results', 'sequence', 'completed', 'note', 'recipientCustomerIds', 'parameterSnapshot'])(
    'rejects forbidden key %s',
    (key) => expect(() => normalizeRequestedChanges({ [key]: 'x' })).toThrow(BadRequestException)
  )

  it('rebuilds payer snapshots supplied by the server', () => {
    const next = applyRequestedChanges(
      { customerIds: ['old'], customers: [{ id: 'old', name: '旧客户' }], customerText: '旧客户' },
      { payerCustomer: { customerIds: ['c-1'], customerText: '王总' } },
      [{ id: 'c-1', name: '王总', phone: null, wechat: null, wechatNickname: null }]
    )
    expect(next).toMatchObject({ customerId: 'c-1', customerIds: ['c-1'], customerText: '王总' })
    expect(next.customers).toEqual([{ id: 'c-1', name: '王总', phone: null, wechat: null, wechatNickname: null }])
  })
})
