import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  allocatePrepaidLots,
  exactTransfer,
  normalizePrepaidPhone,
  roundPayable
} from './shared-prepaid-money'
import type { PrepaidLot } from './shared-prepaid.types'

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value)

function lot(overrides: Partial<PrepaidLot> = {}): PrepaidLot {
  return {
    id: 'lot-1',
    ownerFrontendUserId: 'A',
    rechargeDate: '2026-08-01',
    createdAt: new Date('2026-08-01T01:00:00Z'),
    paidAmount: decimal(100),
    giftAmount: decimal(0),
    remainingAmount: decimal(100),
    ...overrides
  }
}

describe('normalizePrepaidPhone', () => {
  it('removes separators from a valid mainland China mobile number', () => {
    expect(normalizePrepaidPhone('138-0000 0000')).toBe('13800000000')
  })

  it('rejects a number that is not a mainland China 11-digit mobile number', () => {
    expect(() => normalizePrepaidPhone('1380000000')).toThrow('会员手机号必须为中国大陆 11 位手机号')
  })
})

describe('prepaid money rules', () => {
  it('rounds payables to one decimal place using half-up rounding', () => {
    expect(roundPayable(decimal('1.25'))).toEqual(decimal('1.3'))
  })

  it('returns the paid portion exactly when a lot has no gift amount', () => {
    expect(exactTransfer(decimal('12.34'), decimal(100), decimal(0))).toEqual(decimal('12.34'))
  })
})

describe('allocatePrepaidLots', () => {
  it('calculates the cross-owner payable from the paid portion of a lot', () => {
    const result = allocatePrepaidLots({
      consumingFrontendUserId: 'B',
      amount: decimal(100),
      lots: [lot({
        id: 'a-1',
        paidAmount: decimal(1000),
        giftAmount: decimal(100),
        remainingAmount: decimal(1100)
      })]
    })

    expect(result.allocations).toEqual([
      expect.objectContaining({
        rechargeId: 'a-1',
        sourceOwnerId: 'A',
        allocatedAmount: decimal(100)
      })
    ])
    expect(result.payables).toEqual([
      expect.objectContaining({
        sourceOwnerId: 'A',
        consumerOwnerId: 'B',
        amount: decimal('90.9')
      })
    ])
    expect(result.remainingBalance).toEqual(decimal(1000))
  })

  it('uses the consuming owner lots before older lots from another owner', () => {
    const lots = [
      lot({ id: 'external-old', remainingAmount: decimal(40) }),
      lot({
        id: 'local-new',
        ownerFrontendUserId: 'B',
        rechargeDate: '2026-08-10',
        createdAt: new Date('2026-08-10T01:00:00Z'),
        remainingAmount: decimal(50)
      })
    ]

    const result = allocatePrepaidLots({
      consumingFrontendUserId: 'B',
      amount: decimal(60),
      lots
    })

    expect(result.allocations.map((allocation) => [allocation.rechargeId, allocation.allocatedAmount])).toEqual([
      ['local-new', decimal(50)],
      ['external-old', decimal(10)]
    ])
    expect(result.payables).toEqual([
      expect.objectContaining({ sourceOwnerId: 'A', consumerOwnerId: 'B', amount: decimal(10) })
    ])
    expect(lots.map((item) => [item.id, item.remainingAmount])).toEqual([
      ['external-old', decimal(40)],
      ['local-new', decimal(50)]
    ])
  })

  it('orders FIFO lots by recharge date, creation time, and finally ID', () => {
    const result = allocatePrepaidLots({
      consumingFrontendUserId: 'B',
      amount: decimal(35),
      lots: [
        lot({ id: 'later-date', rechargeDate: '2026-08-02', remainingAmount: decimal(10) }),
        lot({ id: 'same-time-b', remainingAmount: decimal(10) }),
        lot({ id: 'earlier-time', createdAt: new Date('2026-08-01T00:00:00Z'), remainingAmount: decimal(10) }),
        lot({ id: 'same-time-a', remainingAmount: decimal(10) })
      ]
    })

    expect(result.allocations.map((allocation) => allocation.rechargeId)).toEqual([
      'earlier-time',
      'same-time-a',
      'same-time-b',
      'later-date'
    ])
    expect(result.allocations.at(-1)?.allocatedAmount).toEqual(decimal(5))
  })

  it('groups exact transfers from multiple lots of one owner before rounding', () => {
    const result = allocatePrepaidLots({
      consumingFrontendUserId: 'B',
      amount: decimal('0.4'),
      lots: [
        lot({ id: 'a-1', paidAmount: decimal(1), giftAmount: decimal(2), remainingAmount: decimal('0.2') }),
        lot({ id: 'a-2', paidAmount: decimal(1), giftAmount: decimal(2), remainingAmount: decimal('0.2') })
      ]
    })

    expect(result.payables).toHaveLength(1)
    expect(result.payables[0]).toEqual({
      sourceOwnerId: 'A',
      consumerOwnerId: 'B',
      exactAmount: decimal('0.13333333333333333333'),
      amount: decimal('0.1')
    })
  })

  it('keeps payables grouped and ordered by first allocation for multiple source owners', () => {
    const result = allocatePrepaidLots({
      consumingFrontendUserId: 'B',
      amount: decimal(200),
      lots: [
        lot({ id: 'a-1', ownerFrontendUserId: 'A', remainingAmount: decimal(100) }),
        lot({
          id: 'c-1',
          ownerFrontendUserId: 'C',
          rechargeDate: '2026-08-02',
          paidAmount: decimal(100),
          giftAmount: decimal(100),
          remainingAmount: decimal(100)
        })
      ]
    })

    expect(result.payables).toEqual([
      {
        sourceOwnerId: 'A',
        consumerOwnerId: 'B',
        exactAmount: decimal(100),
        amount: decimal(100)
      },
      {
        sourceOwnerId: 'C',
        consumerOwnerId: 'B',
        exactAmount: decimal(50),
        amount: decimal(50)
      }
    ])
  })

  it('returns zero remaining balance on exact exhaustion', () => {
    const result = allocatePrepaidLots({
      consumingFrontendUserId: 'B',
      amount: decimal(30),
      lots: [lot({ remainingAmount: decimal(30) })]
    })

    expect(result.remainingBalance).toEqual(decimal(0))
    expect(result.allocations[0].allocatedAmount).toEqual(decimal(30))
  })

  it('throws a coded conflict with the exact available balance when funds are insufficient', () => {
    let caught: unknown

    try {
      allocatePrepaidLots({
        consumingFrontendUserId: 'B',
        amount: decimal('30.01'),
        lots: [lot({ remainingAmount: decimal(30) })]
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ConflictException)
    expect((caught as ConflictException).getResponse()).toMatchObject({
      code: 'PREPAID_BALANCE_INSUFFICIENT',
      availableBalance: decimal(30)
    })
  })
})
