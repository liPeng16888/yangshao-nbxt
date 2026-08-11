import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import type {
  AllocationInput,
  AllocationResult,
  PrepaidAllocation,
  PrepaidLot
} from './shared-prepaid.types'

const INVALID_PHONE_MESSAGE = '会员手机号必须为中国大陆 11 位手机号'

export function normalizePrepaidPhone(value: unknown): string {
  const phone = String(value ?? '').replace(/\D/g, '')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error(INVALID_PHONE_MESSAGE)
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
  const availableBalance = input.lots.reduce(
    (sum, lot) => sum.add(lot.remainingAmount),
    new Prisma.Decimal(0)
  )
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
    const paidRatio = lot.paidAmount.div(lot.paidAmount.add(lot.giftAmount))
    const exactTransferAmount = exactTransfer(allocatedAmount, lot.paidAmount, lot.giftAmount)

    allocations.push({
      rechargeId: lot.id,
      sourceOwnerId: lot.ownerFrontendUserId,
      allocatedAmount,
      paidRatio,
      exactTransferAmount
    })

    if (lot.ownerFrontendUserId !== input.consumingFrontendUserId) {
      const ownerTransfer = transfersByOwner.get(lot.ownerFrontendUserId) ?? new Prisma.Decimal(0)
      transfersByOwner.set(lot.ownerFrontendUserId, ownerTransfer.add(exactTransferAmount))
    }

    amountToAllocate = amountToAllocate.sub(allocatedAmount)
  }

  return {
    allocations,
    payables: [...transfersByOwner].map(([sourceOwnerId, exactAmount]) => ({
      sourceOwnerId,
      consumerOwnerId: input.consumingFrontendUserId,
      exactAmount,
      amount: roundPayable(exactAmount)
    })),
    remainingBalance: availableBalance.sub(input.amount)
  }
}
