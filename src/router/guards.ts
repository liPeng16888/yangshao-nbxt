export interface AuthRedirectInput {
  isLoggedIn: boolean
  toPath: string
  requiresAuth?: boolean
}

export function resolveAuthRedirect(input: AuthRedirectInput) {
  if (input.requiresAuth && !input.isLoggedIn) return '/login'
  if (input.toPath === '/login' && input.isLoggedIn) return '/data'
  return null
}

export function isSensitiveAccessPath(path: string) {
  return path.startsWith('/finance') ||
    path.startsWith('/reports') ||
    path.startsWith('/customers-overview') ||
    path.startsWith('/blacklist')
}
