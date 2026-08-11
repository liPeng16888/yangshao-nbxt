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
      'FINANCE_EXPENSES',
      'FINANCE_INCOME',
      'FINANCE_UNSETTLED',
      'FINANCE_MONTHLY_SETTLEMENT',
      'FINANCE_PREPAID_ADD',
      'FINANCE_PREPAID_CUSTOMERS',
      'REPORTS',
      'MEDICINE_STOCK',
      'MEDICINE_INBOUND',
      'MEDICINE_OUTBOUND',
      'CUSTOMER_OVERVIEW',
      'BLACKLIST'
    ])
    expect(new Set(allFrontendMenuPermissions).size).toBe(24)
    expect(frontendMenuPermissionGroups.every((group) => group.children.length > 0)).toBe(true)
  })
})
