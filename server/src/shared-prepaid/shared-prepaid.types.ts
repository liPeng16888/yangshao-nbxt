import { Prisma } from '@prisma/client'

export interface PrepaidLot {
  id: string
  ownerFrontendUserId: string
  rechargeDate: string
  createdAt: Date
  paidAmount: Prisma.Decimal
  giftAmount: Prisma.Decimal
  remainingAmount: Prisma.Decimal
}

export interface PrepaidAllocation {
  rechargeId: string
  sourceOwnerId: string
  allocatedAmount: Prisma.Decimal
  paidRatio: Prisma.Decimal
  exactTransferAmount: Prisma.Decimal
}

export interface PrepaidPayable {
  sourceOwnerId: string
  consumerOwnerId: string
  exactAmount: Prisma.Decimal
  amount: Prisma.Decimal
}

export interface AllocationInput {
  consumingFrontendUserId: string
  amount: Prisma.Decimal
  lots: PrepaidLot[]
}

export interface AllocationResult {
  allocations: PrepaidAllocation[]
  payables: PrepaidPayable[]
  remainingBalance: Prisma.Decimal
}
