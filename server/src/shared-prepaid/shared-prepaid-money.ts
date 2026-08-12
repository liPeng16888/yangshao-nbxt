import { BadRequestException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import type {
  AllocationInput,
  AllocationResult,
  PrepaidAllocation,
  PrepaidLot
} from './shared-prepaid.types'

const INVALID_PHONE_MESSAGE = '会员手机号必须为中国大陆 11 位手机号'
const PREPAID_PHONE_INPUT_PATTERN = /^[0-9\t\n\v\f\r -]*$/
const PREPAID_PHONE_SEPARATOR_PATTERN = /[\t\n\v\f\r -]/g

export const PREPAID_MONEY_MAX = new Prisma.Decimal('999999999999.99')
export const PREPAID_SETTLEMENT_MONEY_MAX = new Prisma.Decimal('9999999999999.9')
export const PREPAID_EXACT_MONEY_MAX = new Prisma.Decimal('999999999999.99999999')

function amountOutOfRange(label: string): BadRequestException {
  return new BadRequestException({
    code: 'PREPAID_AMOUNT_OUT_OF_RANGE',
    message: `${label}超出允许范围`
  })
}

function amountStateInvalid(label: string): BadRequestException {
  return new BadRequestException({
    code: 'PREPAID_AMOUNT_STATE_INVALID',
    message: `${label}状态异常`
  })
}

function amountUnrepresentable(label: string): BadRequestException {
  return new BadRequestException({
    code: 'PREPAID_AMOUNT_UNREPRESENTABLE',
    message: `${label}精度低于可保存范围`
  })
}

export function assertPrepaidMoney(value: Prisma.Decimal, label: string): Prisma.Decimal {
  if (!value.isFinite() || value.abs().greaterThan(PREPAID_MONEY_MAX)) throw amountOutOfRange(label)
  return value
}

export function assertNonnegativePrepaidMoney(
  value: Prisma.Decimal,
  label: string
): Prisma.Decimal {
  assertPrepaidMoney(value, label)
  if (value.isNegative()) throw amountStateInvalid(label)
  return value
}

export function assertPositivePrepaidMoney(value: Prisma.Decimal, label: string): Prisma.Decimal {
  assertPrepaidMoney(value, label)
  if (value.lessThanOrEqualTo(0)) throw amountStateInvalid(label)
  return value
}

export function assertPrepaidSettlementMoney(
  value: Prisma.Decimal,
  label: string
): Prisma.Decimal {
  if (!value.isFinite() || value.abs().greaterThan(PREPAID_SETTLEMENT_MONEY_MAX)) {
    throw amountOutOfRange(label)
  }
  return value
}

export function assertNonnegativePrepaidSettlementMoney(
  value: Prisma.Decimal,
  label: string
): Prisma.Decimal {
  assertPrepaidSettlementMoney(value, label)
  if (value.isNegative()) throw amountStateInvalid(label)
  return value
}

export function assertPositivePrepaidSettlementMoney(
  value: Prisma.Decimal,
  label: string
): Prisma.Decimal {
  assertPrepaidSettlementMoney(value, label)
  if (value.lessThanOrEqualTo(0)) throw amountStateInvalid(label)
  return value
}

export function assertPrepaidExactMoney(value: Prisma.Decimal, label: string): Prisma.Decimal {
  if (!value.isFinite() || value.isNegative() || value.greaterThan(PREPAID_EXACT_MONEY_MAX)) {
    throw amountOutOfRange(label)
  }
  return value
}

export function assertPositivePrepaidExactMoney(
  value: Prisma.Decimal,
  label: string
): Prisma.Decimal {
  assertPrepaidExactMoney(value, label)
  if (value.lessThanOrEqualTo(0)) throw amountStateInvalid(label)
  return value
}

function quantizePositive(
  value: Prisma.Decimal,
  decimalPlaces: number,
  label: string
): Prisma.Decimal {
  const quantized = value.toDecimalPlaces(decimalPlaces, Prisma.Decimal.ROUND_HALF_UP)
  if (value.greaterThan(0) && quantized.isZero()) throw amountUnrepresentable(label)
  return quantized
}

export function quantizePrepaidPaidRatio(value: Prisma.Decimal): Prisma.Decimal {
  if (!value.isFinite() || value.lessThanOrEqualTo(0) || value.greaterThan(1)) {
    throw amountStateInvalid('充值本金比例')
  }
  return quantizePositive(value, 10, '充值本金比例')
}

export function quantizePrepaidExactMoney(
  value: Prisma.Decimal,
  label: string
): Prisma.Decimal {
  assertPositivePrepaidExactMoney(value, label)
  return quantizePositive(value, 8, label)
}

export function normalizePrepaidPhone(value: unknown): string {
  const input = String(value ?? '')
  if (!PREPAID_PHONE_INPUT_PATTERN.test(input)) throw new Error(INVALID_PHONE_MESSAGE)
  const phone = input.replace(PREPAID_PHONE_SEPARATOR_PATTERN, '')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error(INVALID_PHONE_MESSAGE)
  return phone
}

export function normalizePrepaidPhoneSearch(value: unknown): string {
  const input = String(value ?? '')
  if (!PREPAID_PHONE_INPUT_PATTERN.test(input)) throw new Error(INVALID_PHONE_MESSAGE)
  const phone = input.replace(PREPAID_PHONE_SEPARATOR_PATTERN, '')
  if (phone && !/^\d{1,11}$/.test(phone)) throw new Error(INVALID_PHONE_MESSAGE)
  return phone
}

export function roundPayable(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
}

export function exactTransfer(
  allocated: Prisma.Decimal,
  paid: Prisma.Decimal,
  gift: Prisma.Decimal
): Prisma.Decimal {
  return allocated.mul(paid).div(paid.add(gift))
}

function compareLots(consumingFrontendUserId: string, left: PrepaidLot, right: PrepaidLot): number {
  const leftOwnerPriority = left.ownerFrontendUserId === consumingFrontendUserId ? 0 : 1
  const rightOwnerPriority = right.ownerFrontendUserId === consumingFrontendUserId ? 0 : 1
  if (leftOwnerPriority !== rightOwnerPriority) return leftOwnerPriority - rightOwnerPriority
  if (left.rechargeDate !== right.rechargeDate) return left.rechargeDate < right.rechargeDate ? -1 : 1
  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return left.createdAt.getTime() - right.createdAt.getTime()
  }
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

export function allocatePrepaidLots(input: AllocationInput): AllocationResult {
  assertPositivePrepaidMoney(input.amount, '预存款扣除金额')
  for (const lot of input.lots) {
    assertPositivePrepaidMoney(lot.paidAmount, '充值本金')
    assertNonnegativePrepaidMoney(lot.giftAmount, '赠送金额')
    const totalAmount = assertPositivePrepaidMoney(
      lot.paidAmount.add(lot.giftAmount),
      '充值批次总额'
    )
    assertNonnegativePrepaidMoney(lot.remainingAmount, '充值批次剩余金额')
    if (lot.remainingAmount.greaterThan(totalAmount)) throw amountStateInvalid('充值批次剩余金额')
  }
  const availableBalance = input.lots.reduce(
    (sum, lot) => sum.add(lot.remainingAmount),
    new Prisma.Decimal(0)
  )
  assertNonnegativePrepaidMoney(availableBalance, '会员当前余额')
  if (availableBalance.lessThan(input.amount)) {
    throw new ConflictException({
      code: 'PREPAID_BALANCE_INSUFFICIENT',
      message: '会员预付余额不足',
      availableBalance
    })
  }

  const allocations: PrepaidAllocation[] = []
  const transfersByOwner = new Map<string, Prisma.Decimal>()
  let amountToAllocate = new Prisma.Decimal(input.amount)

  const lots = [...input.lots].sort((left, right) => (
    compareLots(input.consumingFrontendUserId, left, right)
  ))

  for (const lot of lots) {
    if (amountToAllocate.isZero()) break
    if (lot.remainingAmount.lessThanOrEqualTo(0)) continue

    const allocatedAmount = Prisma.Decimal.min(lot.remainingAmount, amountToAllocate)
    const paidRatio = quantizePrepaidPaidRatio(
      lot.paidAmount.div(lot.paidAmount.add(lot.giftAmount))
    )
    const exactTransferAmount = quantizePrepaidExactMoney(
      exactTransfer(allocatedAmount, lot.paidAmount, lot.giftAmount),
      '精确应转金额'
    )
    assertPositivePrepaidMoney(allocatedAmount, '预存款分摊金额')

    allocations.push({
      rechargeId: lot.id,
      sourceOwnerId: lot.ownerFrontendUserId,
      allocatedAmount,
      paidRatio,
      exactTransferAmount
    })

    if (lot.ownerFrontendUserId !== input.consumingFrontendUserId) {
      const ownerTransfer = transfersByOwner.get(lot.ownerFrontendUserId) ?? new Prisma.Decimal(0)
      transfersByOwner.set(
        lot.ownerFrontendUserId,
        assertPositivePrepaidExactMoney(ownerTransfer.add(exactTransferAmount), '精确应转合计')
      )
    }

    amountToAllocate = amountToAllocate.sub(allocatedAmount)
  }

  const payables = [...transfersByOwner].map(([sourceOwnerId, exactAmount]) => {
    const persistedExactAmount = quantizePrepaidExactMoney(exactAmount, '精确应转合计')
    const amount = quantizePositive(persistedExactAmount, 1, '应转款金额')
    assertPositivePrepaidSettlementMoney(amount, '应转款金额')
    return {
      sourceOwnerId,
      consumerOwnerId: input.consumingFrontendUserId,
      exactAmount: persistedExactAmount,
      amount
    }
  })
  const remainingBalance = assertNonnegativePrepaidMoney(
    availableBalance.sub(input.amount),
    '会员扣款后余额'
  )
  return {
    allocations,
    payables,
    remainingBalance
  }
}
