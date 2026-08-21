export interface AuthRedirectInput {
  isLoggedIn: boolean
  toPath: string
  requiresAuth?: boolean
  authenticatedHome?: string
}

export const accessGuardFeatures = [
  'FINANCE',
  'EMPLOYEE_ATTENDANCE',
  'REPORTS',
  'BLACKLIST',
  'HISTORICAL_DATES',
  'MEDICINE_INVENTORY',
  'CUSTOMER_OVERVIEW',
  'COMPLETED_SAMPLE_DATA'
] as const

export type AccessGuardFeature = typeof accessGuardFeatures[number]

export function featureForPath(path: string): AccessGuardFeature | null {
  if (path.startsWith('/employee-attendance')) return 'EMPLOYEE_ATTENDANCE'
  if (path.startsWith('/finance')) return 'FINANCE'
  if (path.startsWith('/reports')) return 'REPORTS'
  if (path.startsWith('/blacklist')) return 'BLACKLIST'
  if (path.startsWith('/medicine-inventory')) return 'MEDICINE_INVENTORY'
  if (path.startsWith('/customers-overview')) return 'CUSTOMER_OVERVIEW'
  return null
}

export function resolveAuthRedirect(input: AuthRedirectInput) {
  if (input.requiresAuth && !input.isLoggedIn) return '/login'
  if (input.toPath === '/login' && input.isLoggedIn) return input.authenticatedHome || '/data'
  return null
}

export function isSensitiveAccessPath(path: string) {
  return featureForPath(path) !== null
}
