import { describe, expect, it } from 'vitest'
import {
  allFrontendNavigationPermissions,
  canAccessPath,
  firstAllowedPath,
  frontendNavigation,
  navigationForUser,
  permissionForPath
} from './frontendNavigation'

const main = { role: 'FRONTEND_USER', permissions: [] as string[], isFrontendSubAccount: false }
const incomeOnly = { role: 'FRONTEND_SUB_USER', permissions: ['FINANCE_INCOME'], isFrontendSubAccount: true }

describe('frontend navigation permissions', () => {
  it('covers every approved leaf exactly once', () => {
    expect(allFrontendNavigationPermissions).toHaveLength(24)
    expect(new Set(allFrontendNavigationPermissions).size).toBe(24)
    expect(frontendNavigation.every((item) => item.permission || item.children?.length)).toBe(true)
  })

  it('keeps the complete tree for a main account', () => {
    expect(navigationForUser(main)).toEqual(frontendNavigation)
  })

  it('keeps only assigned leaves and points the parent at its first allowed child', () => {
    const navigation = navigationForUser(incomeOnly)

    expect(navigation).toHaveLength(1)
    expect(navigation[0]).toMatchObject({ key: 'FINANCE', path: '/finance/income' })
    expect(navigation[0].children).toEqual([
      expect.objectContaining({ path: '/finance/income', permission: 'FINANCE_INCOME' })
    ])
    expect(firstAllowedPath(incomeOnly)).toBe('/finance/income')
  })

  it('maps direct URLs to leaves and rejects denied paths', () => {
    expect(permissionForPath('/medicine-inventory/inbound')).toBe('MEDICINE_INBOUND')
    expect(permissionForPath('/finance/prepaid/customers')).toBe('FINANCE_PREPAID_CUSTOMERS')
    expect(canAccessPath(incomeOnly, '/finance/income')).toBe(true)
    expect(canAccessPath(incomeOnly, '/finance/expenses')).toBe(false)
  })

  it('uses a dedicated authenticated fallback when no leaf is assigned', () => {
    const none = { role: 'FRONTEND_SUB_USER', permissions: [] as string[], isFrontendSubAccount: true }
    expect(firstAllowedPath(none)).toBe('/no-menu-permission')
    expect(canAccessPath(none, '/no-menu-permission')).toBe(true)
  })
})
