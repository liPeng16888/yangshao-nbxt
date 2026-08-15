import router from '@/router'
import { describe, expect, it } from 'vitest'
import { customerNavigation, findCustomerNavigation, isCustomerNavChildActive, type CustomerNavSection } from './customerNavigation'

describe('customer navigation', () => {
  const navigationSections: readonly CustomerNavSection[] = customerNavigation

  it('keeps the approved top-level section order', () => {
    expect(customerNavigation.map((item) => item.key)).toEqual([
      'data', 'lab-report', 'employee-attendance', 'finance',
      'reports', 'medicine-inventory', 'customers-overview', 'blacklist'
    ])
  })

  it('finds the attendance section and its approved child labels', () => {
    expect(findCustomerNavigation('/employee-attendance/payroll')?.section.children?.map((item) => item.label))
      .toEqual(['排班考勤概览', '员工档案', '考勤记录', '请假管理', '提成与奖金', '工资统计'])
  })

  it('keeps all prepaid pages under the prepaid child', () => {
    const navigation = findCustomerNavigation('/finance/prepaid/customers')

    expect(navigation?.activeChild?.path).toBe('/finance/prepaid/add')
    expect(isCustomerNavChildActive('/finance/prepaid/customers', navigation!.activeChild!)).toBe(true)
  })

  it('does not fabricate children for standalone sections', () => {
    expect(findCustomerNavigation('/reports')?.section.children).toBeUndefined()
  })

  it('describes every non-redirect authenticated customer route exactly once', () => {
    const authenticatedRoutePaths = router.getRoutes()
      .filter((route) => route.path !== '/' && route.meta.requiresAuth && !route.redirect)
      .map((route) => route.path)

    const navigationTargets = new Set(navigationSections.flatMap((section) => [
      section.path,
      ...(section.children ?? []).map((child) => child.path)
    ]))
    const matchPrefixes = navigationSections.flatMap((section) => section.children ?? [])
      .flatMap((child) => child.matchPrefixes ?? [])

    for (const routePath of authenticatedRoutePaths) {
      const exactMatches = [...navigationTargets].filter((target) => routePath === target)
      const matches = exactMatches.length > 0
        ? exactMatches
        : matchPrefixes.filter((prefix) => routePath.startsWith(prefix))
      expect(matches).toHaveLength(1)
    }
  })
})
