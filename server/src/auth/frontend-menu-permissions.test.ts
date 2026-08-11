import { describe, expect, it } from 'vitest'
import { allFrontendMenuPermissions, frontendMenuPermissionGroups } from './frontend-menu-permissions'

describe('frontend menu permission catalog', () => {
  it('exposes every approved leaf exactly once and keeps every first-level menu non-empty', () => {
    expect(allFrontendMenuPermissions).toEqual([
      'DATA_MAIN',
      'DATA_STANDARD_SAMPLE',
      'DATA_COEFFICIENT',
      'LAB_REPORT_IMAGE_TEMPLATE',
      'LAB_REPORT_SMS_TEMPLATE',
      'ATTENDANCE_OVERVIEW',
      'ATTENDANCE_EMPLOYEES',
      'ATTENDANCE_SCHEDULES',
      'ATTENDANCE_RECORDS',
      'ATTENDANCE_LEAVE',
      'ATTENDANCE_COMPENSATION',
      'ATTENDANCE_PAYROLL',
      'PREPAID_RECHARGE',
      'PREPAID_CUSTOMERS',
      'PREPAID_CONSUMPTIONS',
      'PREPAID_SETTLEMENTS',
      'FINANCE_EXPENSES',
      'FINANCE_INCOME',
      'FINANCE_UNSETTLED',
      'FINANCE_MONTHLY_SETTLEMENT',
      'REPORTS',
      'MEDICINE_STOCK',
      'MEDICINE_INBOUND',
      'MEDICINE_OUTBOUND',
      'CUSTOMER_OVERVIEW',
      'BLACKLIST'
    ])
    expect(frontendMenuPermissionGroups.find((group) => group.key === 'PREPAID')?.children).toEqual([
      'PREPAID_RECHARGE',
      'PREPAID_CUSTOMERS',
      'PREPAID_CONSUMPTIONS',
      'PREPAID_SETTLEMENTS'
    ])
    expect(frontendMenuPermissionGroups.find((group) => group.key === 'FINANCE')?.children).toEqual([
      'FINANCE_EXPENSES',
      'FINANCE_INCOME',
      'FINANCE_UNSETTLED',
      'FINANCE_MONTHLY_SETTLEMENT'
    ])
    expect(new Set(allFrontendMenuPermissions).size).toBe(26)
    expect(frontendMenuPermissionGroups.every((group) => group.children.length > 0)).toBe(true)
  })
})
