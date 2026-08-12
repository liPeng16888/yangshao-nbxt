import { describe, expect, it } from 'vitest'

import {
  defaultPrepaidRoute,
  prepaidNavigation,
  resolvePrepaidPage
} from './prepaidNavigation'

describe('shared prepaid admin navigation', () => {
  it('contains the four read-only mirrors in their fixed order', () => {
    expect(prepaidNavigation.map((item) => item.label)).toEqual([
      '预存款充值', '预存款客户', '消费明细', '转账结算'
    ])
    expect(prepaidNavigation.map((item) => item.path)).toEqual([
      '/shared-prepaid/recharges',
      '/shared-prepaid/customers',
      '/shared-prepaid/consumptions',
      '/shared-prepaid/settlements'
    ])
  })

  it('defaults the first-level route to recharges and resolves unknown leaves safely', () => {
    expect(defaultPrepaidRoute.path).toBe('/shared-prepaid/recharges')
    expect(resolvePrepaidPage('/shared-prepaid/settlements')).toBe('settlements')
    expect(resolvePrepaidPage('/shared-prepaid/unknown')).toBe('recharges')
  })
})
