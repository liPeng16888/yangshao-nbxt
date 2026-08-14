import { describe, expect, it } from 'vitest'
import {
  defaultEmployeeAttendanceRoute,
  employeeAttendanceNavigation,
  resolveEmployeeAttendancePage
} from './employeeAttendanceNavigation'
import { employeeAttendanceColumns } from './employeeAttendanceColumns'

describe('employee attendance admin navigation', () => {
  it('contains six read-only pages with the merged calendar first', () => {
    expect(employeeAttendanceNavigation.map((item) => item.label)).toEqual([
      '排班考勤概览', '员工档案', '考勤记录', '请假管理', '提成与奖金', '工资统计'
    ])
    expect(employeeAttendanceNavigation.map((item) => item.path)).toEqual([
      '/employee-attendance/schedules',
      '/employee-attendance/employees',
      '/employee-attendance/records',
      '/employee-attendance/leave',
      '/employee-attendance/compensation',
      '/employee-attendance/payroll'
    ])
  })

  it('resolves unknown and old overview paths to schedules', () => {
    expect(defaultEmployeeAttendanceRoute.path).toBe('/employee-attendance/schedules')
    expect(resolveEmployeeAttendancePage('/employee-attendance/payroll')).toBe('payroll')
    expect(resolveEmployeeAttendancePage('/employee-attendance/overview')).toBe('schedules')
    expect(resolveEmployeeAttendancePage('/employee-attendance/unknown')).toBe('schedules')
  })

  it('keeps multi-account rows identifiable and includes both punch times', () => {
    for (const page of ['schedules', 'records', 'leave', 'compensation', 'payroll'] as const) {
      expect(employeeAttendanceColumns[page].map((column) => column.key)).toContain('accountName')
    }
    expect(employeeAttendanceColumns.records.map((column) => column.key)).toEqual(expect.arrayContaining(['checkInText', 'checkOutText']))
  })
})
