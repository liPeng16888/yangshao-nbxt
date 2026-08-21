// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { router } from './router'
import SharedPrepaidReadOnlyPage from './views/SharedPrepaidReadOnlyPage.vue'

describe('admin shared prepaid routes', () => {
  it('wires the first-level redirect and all four leaves to the read-only page', () => {
    const routes = router.getRoutes()
    const root = routes.find((route) => route.path === '/shared-prepaid')
    expect(root?.redirect).toBe('/shared-prepaid/recharges')

    const leaves = routes.filter((route) => route.path.startsWith('/shared-prepaid/'))
    expect(leaves.map((route) => route.path).sort()).toEqual([
      '/shared-prepaid/consumptions',
      '/shared-prepaid/customers',
      '/shared-prepaid/recharges',
      '/shared-prepaid/settlements'
    ])
    expect(leaves.every((route) => route.components?.default === SharedPrepaidReadOnlyPage)).toBe(true)
  })
})
