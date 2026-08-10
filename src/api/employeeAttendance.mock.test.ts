// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  mockConfirmPayroll,
  mockCreateEmployee,
  mockCreatePayrollAdjustment,
  mockGeneratePayroll,
  mockGetEmployees,
  mockReviewLeave,
  resetEmployeeAttendanceMock
} from '@/mocks/employeeAttendance'

describe('employee attendance mock repository', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size }
    } satisfies Storage })
    window.localStorage.clear()
    resetEmployeeAttendanceMock()
  })

  it('ships persisted sample employees for an immediately demonstrable frontend', async () => {
    expect((await mockGetEmployees()).map((row) => row.name)).toEqual(expect.arrayContaining(['张三', '李四']))
    await mockCreateEmployee({
      employeeNumber: 'YG003', name: '王五', status: 'ACTIVE', hireDate: '2026-08-01',
      baseSalary: 5200, attendanceBonus: 300, overtimeHourlyRate: 30, restQuotaDays: 4
    })
    expect((await mockGetEmployees({ keyword: '王五' }))[0]?.employeeNumber).toBe('YG003')
    expect(window.localStorage.getItem('ys_employee_attendance_v1')).toContain('王五')
  })

  it('locks confirmed payroll and preserves adjustments only while the run is a draft', async () => {
    await mockReviewLeave('leave-1', 'APPROVED')
    const draft = await mockGeneratePayroll(dayjs().format('YYYY-MM'))
    await mockCreatePayrollAdjustment(draft.items[0].id, { amount: 88, reason: '补发岗位补贴' })
    await mockConfirmPayroll(draft.id)
    await expect(mockCreatePayrollAdjustment(draft.items[0].id, { amount: 10, reason: '已确认后修改' }))
      .rejects.toThrow('已确认')
  })
})
