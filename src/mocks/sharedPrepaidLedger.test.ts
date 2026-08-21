import { describe, expect, it } from 'vitest'
import { listMockSharedPrepaidIncomeRecharges } from './sharedPrepaidLedger'

describe('shared prepaid mock income rows', () => {
  it('filters by owner, date and active reversal state', () => {
    expect(listMockSharedPrepaidIncomeRecharges('u-admin', '2026-08-10', '2026-08-10')).toEqual([
      { rechargeDate: '2026-08-10', paidAmount: 1000 }
    ])
    expect(listMockSharedPrepaidIncomeRecharges('u-other', '2026-08-10', '2026-08-10')).toEqual([
      { rechargeDate: '2026-08-10', paidAmount: 300 }
    ])
    expect(listMockSharedPrepaidIncomeRecharges('u-admin', '2026-08-11', '2026-08-12')).toEqual([])
  })
})
