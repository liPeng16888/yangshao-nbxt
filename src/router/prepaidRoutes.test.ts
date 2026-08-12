import { describe, expect, it } from 'vitest'
import PrepaidSettlementsPage from '@/views/dashboard/PrepaidSettlementsPage.vue'
import router, { prepaidRootRedirect } from './index'

describe('shared prepaid routes', () => {
  it.each([
    ['/prepaid/recharges', 'PREPAID_RECHARGE'],
    ['/prepaid/customers', 'PREPAID_CUSTOMERS'],
    ['/prepaid/consumptions', 'PREPAID_CONSUMPTIONS'],
    ['/prepaid/settlements', 'PREPAID_SETTLEMENTS']
  ])('resolves %s with its permission guard', (path, permission) => {
    const resolved = router.resolve(path)

    expect(resolved.matched.at(-1)?.path).toBe(path)
    expect(resolved.meta.frontendPermission).toBe(permission)
  })

  it('defines a group redirect instead of falling through to the catch-all route', () => {
    expect(router.getRoutes().find((route) => route.path === '/prepaid')?.redirect).toBeTypeOf('function')
    expect(prepaidRootRedirect({
      role: 'FRONTEND_SUB_USER',
      isFrontendSubAccount: true,
      permissions: ['PREPAID_CUSTOMERS']
    })).toBe('/prepaid/customers')
  })

  it('routes all prepaid leaves to their real pages', () => {
    expect(router.getRoutes().find((route) => route.path === '/prepaid/recharges')?.components?.default?.name)
      .toBe('PrepaidRechargePage')
    expect(router.getRoutes().find((route) => route.path === '/prepaid/customers')?.components?.default?.name)
      .toBe('PrepaidCustomersPage')
    expect(router.getRoutes().find((route) => route.path === '/prepaid/consumptions')?.components?.default?.name)
      .toBe('PrepaidConsumptionsPage')
    expect(router.getRoutes().find((route) => route.path === '/prepaid/settlements')?.components?.default)
      .toBe(PrepaidSettlementsPage)
  })
})
