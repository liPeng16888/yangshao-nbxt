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
const prepaidCustomersOnly = { role: 'FRONTEND_SUB_USER', permissions: ['PREPAID_CUSTOMERS'], isFrontendSubAccount: true }

describe('frontend navigation permissions', () => {
  it('covers every approved leaf exactly once', () => {
    expect(frontendNavigation.map((item) => item.key)).toEqual([
      'DATA',
      'LAB_REPORT',
      'ATTENDANCE',
      'PREPAID',
      'FINANCE',
      'REPORTS',
      'MEDICINE_INVENTORY',
      'CUSTOMER_OVERVIEW',
      'BLACKLIST'
    ])
    expect(frontendNavigation.find((item) => item.key === 'PREPAID')?.children?.map((child) => child.permission)).toEqual([
      'PREPAID_RECHARGE',
      'PREPAID_CUSTOMERS',
      'PREPAID_CONSUMPTIONS',
      'PREPAID_SETTLEMENTS'
    ])
    expect(frontendNavigation.find((item) => item.key === 'PREPAID')?.icon).toBe('prepaid')
    expect(frontendNavigation.find((item) => item.key === 'FINANCE')?.children?.map((child) => child.permission)).toEqual([
      'FINANCE_EXPENSES',
      'FINANCE_INCOME',
      'FINANCE_UNSETTLED',
      'FINANCE_MONTHLY_SETTLEMENT'
    ])
    expect(allFrontendNavigationPermissions).toHaveLength(25)
    expect(new Set(allFrontendNavigationPermissions).size).toBe(25)
    expect(allFrontendNavigationPermissions).not.toContain('ATTENDANCE_OVERVIEW')
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
    expect(permissionForPath('/prepaid/settlements')).toBe('PREPAID_SETTLEMENTS')
    expect(canAccessPath(incomeOnly, '/finance/income')).toBe(true)
    expect(canAccessPath(incomeOnly, '/finance/expenses')).toBe(false)
  })

  it('sends a prepaid-only subaccount to its first permitted prepaid leaf without looping', () => {
    expect(firstAllowedPath(prepaidCustomersOnly)).toBe('/prepaid/customers')
    expect(firstAllowedPath(prepaidCustomersOnly, '/prepaid')).toBe('/prepaid/customers')
    expect(canAccessPath(prepaidCustomersOnly, '/prepaid/customers')).toBe(true)
    expect(canAccessPath(prepaidCustomersOnly, '/prepaid/recharges')).toBe(false)
  })

  it('uses a dedicated authenticated fallback when no leaf is assigned', () => {
    const none = { role: 'FRONTEND_SUB_USER', permissions: [] as string[], isFrontendSubAccount: true }
    expect(firstAllowedPath(none)).toBe('/no-menu-permission')
    expect(canAccessPath(none, '/no-menu-permission')).toBe(true)
  })
})
