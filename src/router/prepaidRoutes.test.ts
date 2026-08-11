import { describe, expect, it } from 'vitest'
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
})
