import { describe, expect, it } from 'vitest'
import { isSensitiveAccessPath, resolveAuthRedirect } from './guards'

describe('resolveAuthRedirect', () => {
  it('redirects protected pages to login when the user is not authenticated', () => {
    expect(resolveAuthRedirect({ isLoggedIn: false, toPath: '/data', requiresAuth: true })).toBe('/login')
  })

  it('redirects authenticated users away from login', () => {
    expect(resolveAuthRedirect({ isLoggedIn: true, toPath: '/login' })).toBe('/data')
  })

  it('allows valid navigation', () => {
    expect(resolveAuthRedirect({ isLoggedIn: true, toPath: '/finance', requiresAuth: true })).toBeNull()
  })

  it('protects the customer overview with the shared sensitive access password', () => {
    expect(isSensitiveAccessPath('/customers-overview')).toBe(true)
    expect(isSensitiveAccessPath('/data')).toBe(false)
  })

  it('protects every medicine inventory page with the shared sensitive access password', () => {
    expect(isSensitiveAccessPath('/medicine-inventory/stock')).toBe(true)
    expect(isSensitiveAccessPath('/medicine-inventory/outbound')).toBe(true)
  })
})
