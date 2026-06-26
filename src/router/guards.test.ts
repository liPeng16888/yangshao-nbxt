import { describe, expect, it } from 'vitest'
import { resolveAuthRedirect } from './guards'

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
})
