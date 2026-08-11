import type { AuthUser } from '@/types/auth'
import type { SharedPrepaidIncomeRecharge } from '@/utils/financeBills'

interface MockSharedPrepaidRecharge extends SharedPrepaidIncomeRecharge {
  id: string
  ownerFrontendUserId: string
  reversedAt: string | null
}

interface MockSharedPrepaidConsumption {
  id: string
  ownerFrontendUserId: string
  consumptionDate: string
  amount: number
}

export const mockSharedPrepaidLedger: {
  recharges: MockSharedPrepaidRecharge[]
  consumptions: MockSharedPrepaidConsumption[]
} = {
  recharges: [
    {
      id: 'shared-recharge-active',
      ownerFrontendUserId: 'u-admin',
      rechargeDate: '2026-08-10',
      paidAmount: 1000,
      giftAmount: 100,
      totalAmount: 1100,
      reversedAt: null
    },
    {
      id: 'shared-recharge-reversed',
      ownerFrontendUserId: 'u-admin',
      rechargeDate: '2026-08-10',
      paidAmount: 400,
      giftAmount: 0,
      totalAmount: 400,
      reversedAt: '2026-08-11T00:00:00.000Z'
    },
    {
      id: 'shared-recharge-other-owner',
      ownerFrontendUserId: 'u-other',
      rechargeDate: '2026-08-10',
      paidAmount: 300,
      giftAmount: 0,
      totalAmount: 300,
      reversedAt: null
    },
    {
      id: 'shared-recharge-outside-range',
      ownerFrontendUserId: 'u-admin',
      rechargeDate: '2026-07-31',
      paidAmount: 200,
      giftAmount: 0,
      totalAmount: 200,
      reversedAt: null
    }
  ],
  consumptions: [{
    id: 'shared-consumption-active',
    ownerFrontendUserId: 'u-admin',
    consumptionDate: '2026-08-10',
    amount: 100
  }]
}

export function getMockSharedPrepaidOwnerId(user?: Pick<AuthUser, 'id' | 'dataOwnerId'> | null) {
  if (user) return user.dataOwnerId || user.id
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem('ys_user')
    if (raw) {
      const stored = JSON.parse(raw) as Pick<AuthUser, 'id' | 'dataOwnerId'>
      return stored.dataOwnerId || stored.id
    }
  } catch {
    // The seeded main frontend user is the demo-mode fallback when storage is unavailable.
  }
  return 'u-admin'
}

export function listMockSharedPrepaidIncomeRecharges(ownerFrontendUserId: string, startDate: string, endDate: string) {
  return mockSharedPrepaidLedger.recharges
    .filter((row) => (
      row.ownerFrontendUserId === ownerFrontendUserId &&
      row.rechargeDate >= startDate &&
      row.rechargeDate <= endDate &&
      row.reversedAt === null
    ))
    .map(({ rechargeDate, paidAmount }) => ({ rechargeDate, paidAmount }))
}
