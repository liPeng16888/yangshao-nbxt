// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  mockConfirmPayroll,
  mockCreateEmployee,
  mockCreatePayrollAdjustment,
  mockDeleteEmployee,
  mockGeneratePayroll,
  mockGetAttendance,
  mockGetEmployee,
  mockGetEmployees,
  mockGetLeaves,
  mockGetPayroll,
  mockReviewLeave,
  mockSaveAttendance,
  mockSaveBonus,
  mockSaveDateOverride,
  mockSaveLeave,
  mockSaveLeaveType,
  mockSaveMonthlySetting,
  mockUploadEmployeePhoto,
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
    expect(await mockUploadEmployeePhoto('emp-1', new File(['photo'], 'photo.png', { type: 'image/png' }))).toEqual({ id: 'emp-1', hasPhoto: true })
    expect(Object.values(window.localStorage).join('')).not.toContain('410000199001011234')
  })

  it('isolates persisted records by the authenticated frontend account and never exposes plaintext sensitive fields in normal lists', async () => {
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'front-a', account: 'lab-a' }))
    resetEmployeeAttendanceMock()
    await mockCreateEmployee({ employeeNumber: 'A003', name: '甲账号员工', status: 'ACTIVE', hireDate: '2026-01-01', idCard: '410000198812121234', bankCard: '6222021234567890123' })
    const normal = (await mockGetEmployees({ keyword: '甲账号' }))[0] as unknown as Record<string, unknown>
    expect(normal.idCard).toBeUndefined()
    expect(normal.bankCard).toBeUndefined()
    expect(JSON.stringify(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.getItem(window.localStorage.key(index)!)))).not.toContain('410000198812121234')

    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'front-b', account: 'lab-b' }))
    expect(await mockGetEmployees({ keyword: '甲账号' })).toEqual([])
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'front-a', account: 'lab-a' }))
    expect((await mockGetEmployees({ keyword: '甲账号' }))[0]?.employeeNumber).toBe('A003')
  })

  it('blocks confirmation while leave is pending', async () => {
    const draft = await mockGeneratePayroll(dayjs().format('YYYY-MM'))
    expect(draft.issues.join('')).toContain('请假待审批')
    await expect(mockConfirmPayroll(draft.id)).rejects.toThrow('暂不能确认')
  })

  it('locks confirmed payroll and preserves adjustments only while the run is a draft', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, scheduledWorkDays: 1, restQuotaDays: 4 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, scheduledWorkDays: 1, restQuotaDays: 4 })
    const draft = await mockGeneratePayroll(month)
    await mockCreatePayrollAdjustment(draft.items[0].id, { amount: 88, reason: '补发岗位补贴' })
    await mockConfirmPayroll(draft.id)
    expect((await mockGetAttendance({ month })).every((row) => Boolean(row.lockedAt))).toBe(true)
    await expect(mockCreatePayrollAdjustment(draft.items[0].id, { amount: 10, reason: '已确认后修改' }))
      .rejects.toThrow('已确认')
  })

  it('calculates leave, absence, overtime, commission, bonus and signed adjustments with two-decimal rounding', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, scheduledWorkDays: 2, restQuotaDays: 0 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, scheduledWorkDays: 1, restQuotaDays: 4 })
    const leaveDate = dayjs(`${month}-01`).day(1).month() === dayjs(`${month}-01`).month()
      ? dayjs(`${month}-01`).day(1).format('YYYY-MM-DD')
      : dayjs(`${month}-01`).add(1, 'week').day(1).format('YYYY-MM-DD')
    const leave = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: leaveDate, endDate: leaveDate, unit: 'FULL_DAY', reason: '事假' })
    await mockReviewLeave(leave.id, 'APPROVED')
    await mockSaveAttendance({ employeeId: 'emp-1', date: leaveDate, isScheduledWorkday: true, scheduledMinutes: 480, absenceMinutes: 0, overtimeMinutes: 0 })
    const current = (await mockGetAttendance({ employeeId: 'emp-1', month })).find((row) => row.id === 'att-emp-1')!
    await mockSaveAttendance({ ...current, absenceMinutes: 240, overtimeMinutes: 31 }, current.id)
    const draft = await mockGeneratePayroll(month)
    const item = draft.items.find((row) => row.employeeId === 'emp-1')!
    await mockCreatePayrollAdjustment(item.id, { amount: -10.01, reason: '补扣' })
    const refreshed = await mockGetPayroll(month)
    const result = refreshed!.items.find((row) => row.employeeId === 'emp-1')!.calculationSnapshot
    expect(result).toMatchObject({ attendanceBonus: 0, overtimePay: 15.5, commissionAmount: 96, bonusAmount: 200, adjustmentAmount: -10.01, leaveDeduction: 3000, absenceDeduction: 1500, payableAmount: 1801.49 })
  })

  it('matches conflict, inactive-type, overlapping-month, history-delete and employment-window rules', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    await mockSaveDateOverride({ employeeId: 'emp-1', date: today, isWorkday: false, scheduledMinutes: 0 })
    await expect(mockSaveDateOverride({ employeeId: 'emp-1', date: today, isWorkday: true, scheduledMinutes: 480 })).rejects.toThrow('已有临时调班')

    const inactiveType = await mockSaveLeaveType({ name: '已停用类型', active: false, countsTowardRestQuota: true })
    const nextMonday = dayjs().add(1, 'week').day(1).format('YYYY-MM-DD')
    await expect(mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: inactiveType.id, startDate: nextMonday, endDate: nextMonday, unit: 'FULL_DAY', reason: '不应保存' })).rejects.toThrow('已停用')

    const end = dayjs().endOf('month').add(2, 'day').format('YYYY-MM-DD')
    const start = dayjs().endOf('month').subtract(4, 'day').format('YYYY-MM-DD')
    const spanning = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: start, endDate: end, unit: 'FULL_DAY', reason: '跨月请假' })
    expect((await mockGetLeaves({ month: dayjs().add(1, 'month').format('YYYY-MM') })).map(row => row.id)).toContain(spanning.id)

    const employee = await mockCreateEmployee({ employeeNumber: 'YG099', name: '历史员工', status: 'ACTIVE', hireDate: dayjs().startOf('month').format('YYYY-MM-DD') })
    await mockSaveBonus({ employeeId: employee.id, date: today, amount: 1, reason: '历史奖金' })
    await mockDeleteEmployee(employee.id)
    expect((await mockGetEmployee(employee.id)).status).toBe('INACTIVE')

    const inactive = await mockCreateEmployee({ employeeNumber: 'YG100', name: '未入职停用员工', status: 'INACTIVE', hireDate: dayjs().startOf('month').format('YYYY-MM-DD') })
    const draft = await mockGeneratePayroll(dayjs().format('YYYY-MM'))
    expect(draft.items.some(row => row.employeeId === inactive.id)).toBe(false)
  })

  it('flags uncovered no-punch time and subtracts approved leave coverage from recorded absence', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, scheduledWorkDays: 1, restQuotaDays: 4 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, scheduledWorkDays: 1, restQuotaDays: 4 })
    const record = (await mockGetAttendance({ employeeId: 'emp-2', month }))[0]
    await mockSaveAttendance({ ...record, checkInAt: '', checkOutAt: '', absenceMinutes: 0 }, record.id)
    expect((await mockGeneratePayroll(month)).issues.join('')).toContain('未打卡且未处理')

    await mockSaveAttendance({ ...record, checkInAt: '', checkOutAt: '', absenceMinutes: 480 }, record.id)
    const refreshed = await mockGeneratePayroll(month)
    const snapshot = refreshed.items.find(row => row.employeeId === 'emp-2')!.calculationSnapshot
    expect(snapshot).toMatchObject({ attendanceBonus: 0, absenceDeduction: 2750 })
  })
})
