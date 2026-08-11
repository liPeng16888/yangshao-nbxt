export const frontendMenuPermissionGroups = [
  {
    key: 'DATA',
    children: ['DATA_MAIN', 'DATA_STANDARD_SAMPLE', 'DATA_COEFFICIENT']
  },
  {
    key: 'LAB_REPORT',
    children: ['LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE']
  },
  {
    key: 'ATTENDANCE',
    children: [
      'ATTENDANCE_OVERVIEW',
      'ATTENDANCE_EMPLOYEES',
      'ATTENDANCE_SCHEDULES',
      'ATTENDANCE_RECORDS',
      'ATTENDANCE_LEAVE',
      'ATTENDANCE_COMPENSATION',
      'ATTENDANCE_PAYROLL'
    ]
  },
  {
    key: 'FINANCE',
    children: [
      'FINANCE_EXPENSES',
      'FINANCE_INCOME',
      'FINANCE_UNSETTLED',
      'FINANCE_MONTHLY_SETTLEMENT',
      'FINANCE_PREPAID_ADD',
      'FINANCE_PREPAID_CUSTOMERS'
    ]
  },
  { key: 'REPORTS', children: ['REPORTS'] },
  {
    key: 'MEDICINE_INVENTORY',
    children: ['MEDICINE_STOCK', 'MEDICINE_INBOUND', 'MEDICINE_OUTBOUND']
  },
  { key: 'CUSTOMER_OVERVIEW', children: ['CUSTOMER_OVERVIEW'] },
  { key: 'BLACKLIST', children: ['BLACKLIST'] }
] as const

export type FrontendMenuPermission = (typeof frontendMenuPermissionGroups)[number]['children'][number]

export const allFrontendMenuPermissions: FrontendMenuPermission[] = frontendMenuPermissionGroups.flatMap(
  (group) => [...group.children]
)

export function isFrontendMenuPermission(value: unknown): value is FrontendMenuPermission {
  return typeof value === 'string' && (allFrontendMenuPermissions as readonly string[]).includes(value)
}
