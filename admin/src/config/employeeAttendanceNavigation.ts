export type EmployeeAttendanceAdminPage =
  | 'overview'
  | 'employees'
  | 'schedules'
  | 'records'
  | 'leave'
  | 'compensation'
  | 'payroll'

export interface EmployeeAttendanceNavigationItem {
  path: string
  label: string
  page: EmployeeAttendanceAdminPage
}

export const employeeAttendanceNavigation: EmployeeAttendanceNavigationItem[] = [
  { path: '/employee-attendance/schedules', label: '排班考勤概览', page: 'schedules' },
  { path: '/employee-attendance/employees', label: '员工档案', page: 'employees' },
  { path: '/employee-attendance/records', label: '考勤记录', page: 'records' },
  { path: '/employee-attendance/leave', label: '请假管理', page: 'leave' },
  { path: '/employee-attendance/compensation', label: '提成与奖金', page: 'compensation' },
  { path: '/employee-attendance/payroll', label: '工资统计', page: 'payroll' }
]

export const defaultEmployeeAttendanceRoute = employeeAttendanceNavigation[0]

export function resolveEmployeeAttendancePage(path: string): EmployeeAttendanceAdminPage {
  if (path === '/employee-attendance/overview') return 'schedules'
  return employeeAttendanceNavigation.find((item) => item.path === path)?.page || 'schedules'
}
