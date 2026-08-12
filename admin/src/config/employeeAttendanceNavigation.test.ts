import { describe, expect, it } from 'vitest'
import {
  defaultEmployeeAttendanceRoute,
  employeeAttendanceNavigation,
  resolveEmployeeAttendancePage
} from './employeeAttendanceNavigation'
import { employeeAttendanceColumns } from './employeeAttendanceColumns'

describe('employee attendance admin navigation', () => {
  it('contains the seven approved read-only pages in their fixed order', () => {
    expect(employeeAttendanceNavigation.map((item) => item.label)).toEqual([
      '考勤概览', '员工档案', '排班管理', '考勤记录', '请假管理', '提成与奖金', '工资统计'
    ])
    expect(employeeAttendanceNavigation.map((item) => item.path)).toEqual([
      '/employee-attendance/overview',
      '/employee-attendance/employees',
      '/employee-attendance/schedules',
      '/employee-attendance/records',
      '/employee-attendance/leave',
      '/employee-attendance/compensation',
      '/employee-attendance/payroll'
    ])
  })

  it('resolves unknown paths to overview', () => {
    expect(defaultEmployeeAttendanceRoute.path).toBe('/employee-attendance/overview')
    expect(resolveEmployeeAttendancePage('/employee-attendance/payroll')).toBe('payroll')
    expect(resolveEmployeeAttendancePage('/employee-attendance/unknown')).toBe('overview')
  })

  it('keeps multi-account rows identifiable and includes both punch times', () => {
    for (const page of ['schedules', 'records', 'leave', 'compensation', 'payroll'] as const) {
      expect(employeeAttendanceColumns[page].map((column) => column.key)).toContain('accountName')
    }
    expect(employeeAttendanceColumns.records.map((column) => column.key)).toEqual(expect.arrayContaining(['checkInText', 'checkOutText']))
  })
})
