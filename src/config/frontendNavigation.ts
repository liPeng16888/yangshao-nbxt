export const frontendMenuPermissions = [
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
] as const

export type FrontendMenuPermission = typeof frontendMenuPermissions[number]
export type FrontendNavigationIcon = 'data' | 'report' | 'attendance' | 'prepaid' | 'finance' | 'reports' | 'medicine' | 'customers' | 'blacklist'

export interface FrontendNavigationLeaf {
  path: string
  label: string
  permission: FrontendMenuPermission
}

export interface FrontendNavigationItem {
  key: string
  path: string
  label: string
  icon: FrontendNavigationIcon
  permission?: FrontendMenuPermission
  children?: FrontendNavigationLeaf[]
}

interface FrontendNavigationUser {
  role?: string
  permissions?: readonly string[]
  isFrontendSubAccount?: boolean
}

export const frontendNavigation: FrontendNavigationItem[] = [
  {
    key: 'DATA', path: '/data', label: '数据计算', icon: 'data',
    children: [
      { path: '/data', label: '数据计算', permission: 'DATA_MAIN' },
      { path: '/data/standard-sample', label: '标样计算', permission: 'DATA_STANDARD_SAMPLE' },
      { path: '/data/coefficient', label: '系数计算', permission: 'DATA_COEFFICIENT' }
    ]
  },
  {
    key: 'LAB_REPORT', path: '/lab-report', label: '化验报告', icon: 'report',
    children: [
      { path: '/lab-report/image-template', label: '化验报告图片模板', permission: 'LAB_REPORT_IMAGE_TEMPLATE' },
      { path: '/lab-report/sms-template', label: '化验短信生成模板', permission: 'LAB_REPORT_SMS_TEMPLATE' }
    ]
  },
  {
    key: 'ATTENDANCE', path: '/employee-attendance', label: '员工考勤', icon: 'attendance',
    children: [
      { path: '/employee-attendance/schedules', label: '排班考勤概览', permission: 'ATTENDANCE_SCHEDULES' },
      { path: '/employee-attendance/employees', label: '员工档案', permission: 'ATTENDANCE_EMPLOYEES' },
      { path: '/employee-attendance/records', label: '考勤记录', permission: 'ATTENDANCE_RECORDS' },
      { path: '/employee-attendance/leave', label: '请假管理', permission: 'ATTENDANCE_LEAVE' },
      { path: '/employee-attendance/compensation', label: '提成与奖金', permission: 'ATTENDANCE_COMPENSATION' },
      { path: '/employee-attendance/payroll', label: '工资统计', permission: 'ATTENDANCE_PAYROLL' }
    ]
  },
  {
    key: 'PREPAID', path: '/prepaid', label: '预充值客户', icon: 'prepaid',
    children: [
      { path: '/prepaid/recharges', label: '预存款充值', permission: 'PREPAID_RECHARGE' },
      { path: '/prepaid/customers', label: '预存款客户', permission: 'PREPAID_CUSTOMERS' },
      { path: '/prepaid/consumptions', label: '消费明细', permission: 'PREPAID_CONSUMPTIONS' },
      { path: '/prepaid/settlements', label: '转账结算', permission: 'PREPAID_SETTLEMENTS' }
    ]
  },
  {
    key: 'FINANCE', path: '/finance', label: '财务', icon: 'finance',
    children: [
      { path: '/finance/expenses', label: '支出账单', permission: 'FINANCE_EXPENSES' },
      { path: '/finance/income', label: '收入账单', permission: 'FINANCE_INCOME' },
      { path: '/finance/unsettled', label: '未结款', permission: 'FINANCE_UNSETTLED' },
      { path: '/finance/monthly-settlement', label: '月结款', permission: 'FINANCE_MONTHLY_SETTLEMENT' }
    ]
  },
  { key: 'REPORTS', path: '/reports', label: '报表', icon: 'reports', permission: 'REPORTS' },
  {
    key: 'MEDICINE_INVENTORY', path: '/medicine-inventory', label: '药品库存', icon: 'medicine',
    children: [
      { path: '/medicine-inventory/stock', label: '药品库存', permission: 'MEDICINE_STOCK' },
      { path: '/medicine-inventory/inbound', label: '药品入库', permission: 'MEDICINE_INBOUND' },
      { path: '/medicine-inventory/outbound', label: '药品出库', permission: 'MEDICINE_OUTBOUND' }
    ]
  },
  { key: 'CUSTOMER_OVERVIEW', path: '/customers-overview', label: '客户总览', icon: 'customers', permission: 'CUSTOMER_OVERVIEW' },
  { key: 'BLACKLIST', path: '/blacklist', label: '黑名单', icon: 'blacklist', permission: 'BLACKLIST' }
]

export const allFrontendNavigationPermissions = frontendNavigation.flatMap((item) => (
  item.children?.map((child) => child.permission) || (item.permission ? [item.permission] : [])
))

export function isFrontendSubAccount(user: FrontendNavigationUser | null | undefined) {
  return user?.role === 'FRONTEND_SUB_USER' || user?.isFrontendSubAccount === true
}

export function navigationForUser(user: FrontendNavigationUser | null | undefined): FrontendNavigationItem[] {
  if (!isFrontendSubAccount(user)) return frontendNavigation
  const assigned = new Set(user?.permissions || [])
  return frontendNavigation.flatMap((item) => {
    if (item.children) {
      const children = item.children.filter((child) => assigned.has(child.permission))
      return children.length ? [{ ...item, path: children[0].path, children }] : []
    }
    return item.permission && assigned.has(item.permission) ? [item] : []
  })
}

export function permissionForPath(path: string): FrontendMenuPermission | null {
  const leaves = frontendNavigation.flatMap((item) => item.children || (item.permission ? [{
    path: item.path, label: item.label, permission: item.permission
  }] : []))
  const match = leaves
    .filter((leaf) => path === leaf.path || path.startsWith(`${leaf.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]
  return match?.permission || null
}

export function firstAllowedPath(user: FrontendNavigationUser | null | undefined, groupPath?: string) {
  const navigation = navigationForUser(user)
  const scoped = groupPath ? navigation.find((item) => (
    item.key === groupPath || item.path.startsWith(groupPath) ||
    item.children?.some((child) => child.path === groupPath || child.path.startsWith(`${groupPath}/`))
  )) : undefined
  if (scoped) return scoped.children?.[0]?.path || scoped.path
  const first = navigation[0]
  return first?.children?.[0]?.path || first?.path || '/no-menu-permission'
}

export function canAccessPath(user: FrontendNavigationUser | null | undefined, path: string) {
  if (!isFrontendSubAccount(user)) return true
  if (path === '/no-menu-permission') return !(user?.permissions?.length)
  const permission = permissionForPath(path)
  return Boolean(permission && user?.permissions?.includes(permission))
}
