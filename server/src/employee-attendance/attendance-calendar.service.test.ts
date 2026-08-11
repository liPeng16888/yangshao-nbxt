import { NotFoundException } from '@nestjs/common'
import { EmployeeLeaveStatus, EmployeeLeaveUnit, EmployeeStatus, Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { AttendanceCalendarService } from './attendance-calendar.service'

const employee = { id: 'employee-1', frontendUserId: 'front-1', employeeNumber: '001', name: '张三', status: EmployeeStatus.ACTIVE }
const schedule = (date: string, overrides: Record<string, unknown> = {}) => ({
  id: `schedule-${date}`, employeeId: employee.id, frontendUserId: employee.frontendUserId, date, isWorkday: true, scheduledMinutes: 600, remark: null,
  segments: [{ sequence: 0, startTime: '08:00', endTime: '12:00' }, { sequence: 1, startTime: '13:00', endTime: '19:00' }],
  ...overrides
})
const actual = (date: string, overrides: Record<string, unknown> = {}) => ({
  id: `attendance-${date}`, employeeId: employee.id, frontendUserId: employee.frontendUserId, date, workedMinutes: 600,
  lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0, explicitAbsenceMinutes: 0, overtimeMinutes: 0, remark: null,
  segments: [{ sequence: 0, checkInAt: `${date}T08:00:00+08:00`, checkOutAt: `${date}T12:00:00+08:00` }, { sequence: 1, checkInAt: `${date}T13:00:00+08:00`, checkOutAt: `${date}T19:00:00+08:00` }],
  ...overrides
})

function fixture() {
  const prisma: any = {
    employee: { findFirst: vi.fn().mockResolvedValue(employee) },
    employeeMonthlyScheduleDay: { findMany: vi.fn().mockResolvedValue([]) },
    employeeAttendanceRecord: { findMany: vi.fn().mockResolvedValue([]) },
    employeeLeaveRequest: { findMany: vi.fn().mockResolvedValue([]) }
  }
  const payroll = {
    overview: vi.fn().mockResolvedValue({ month: '2026-08', workforce: 1, todayAttendance: 1, todayLeave: 0, todayAbsence: 0, overtimeMinutes: 30, pendingLeave: 0, projectedPayroll: 6000, issueCount: 0, issues: [] }),
    adminOverview: vi.fn().mockResolvedValue({ month: '2026-08', workforce: 1, todayAttendance: 1, todayLeave: 0, todayAbsence: 0, overtimeMinutes: 30, pendingLeave: 0, projectedPayroll: 6000, issueCount: 0, issues: [], readonly: true }),
    calendarOverviewForAccounts: vi.fn().mockResolvedValue({ month: '2026-08', workforce: 1, todayAttendance: 1, todayLeave: 0, todayAbsence: 0, overtimeMinutes: 30, pendingLeave: 0, projectedPayroll: 6000, issueCount: 0, issues: [] })
  }
  const service = new AttendanceCalendarService(prisma, payroll as never)
  vi.spyOn(service as any, 'today').mockReturnValue('2026-08-16')
  return { service, prisma, payroll }
}

describe('AttendanceCalendarService', () => {
  it('joins every natural month date with schedules, manual attendance and approved leave', async () => {
    const { service, prisma } = fixture()
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([
      schedule('2026-08-08', { isWorkday: false, scheduledMinutes: 0, remark: '公司排休' }),
      schedule('2026-08-10'), schedule('2026-08-11'), schedule('2026-08-12'), schedule('2026-08-13'), schedule('2026-08-14'), schedule('2026-08-20')
    ])
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([
      actual('2026-08-11', { overtimeMinutes: 30 }),
      actual('2026-08-12', { workedMinutes: 540, earlyLeaveMinutes: 60, segments: [{ sequence: 0, checkInAt: '2026-08-12T08:00:00+08:00', checkOutAt: '2026-08-12T12:00:00+08:00' }, { sequence: 1, checkInAt: '2026-08-12T13:00:00+08:00', checkOutAt: '2026-08-12T18:00:00+08:00' }] }),
      actual('2026-08-14', { workedMinutes: 0, absenceMinutes: 600, explicitAbsenceMinutes: 600, remark: '无故未到', segments: [] })
    ])
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: employee.id, startDate: '2026-08-13', endDate: '2026-08-13', unit: EmployeeLeaveUnit.HOUR, hours: new Prisma.Decimal(4), countedDays: new Prisma.Decimal(0.4), reason: '照顾家人', status: EmployeeLeaveStatus.APPROVED,
      leaveType: { name: '事假', countsTowardRestQuota: true }
    }])

    const result: any = await service.customerView('front-1', employee.id, '2026-08')

    expect(result).toMatchObject({ month: '2026-08', employee: { employeeNumber: '001', name: '张三' }, readonly: false })
    expect(result.days).toHaveLength(31)
    expect(result.days.map((day: any) => day.date)).toEqual(Array.from({ length: 31 }, (_, index) => `2026-08-${String(index + 1).padStart(2, '0')}`))
    expect(result.days.find((day: any) => day.date === '2026-08-10')).toMatchObject({ status: 'NORMAL', scheduledMinutes: 600, durationText: '10 小时（工作10）', schedule: { segments: expect.any(Array) } })
    expect(result.days.find((day: any) => day.date === '2026-08-11')).toMatchObject({ status: 'OVERTIME', displayMinutes: 630, durationText: '10.5 小时（工作10＋加班0.5）' })
    expect(result.days.find((day: any) => day.date === '2026-08-12')).toMatchObject({ status: 'SHORT', shortageMinutes: 60, durationTone: 'short' })
    expect(result.days.find((day: any) => day.date === '2026-08-13')).toMatchObject({ status: 'LEAVE', approvedLeaveMinutes: 240, leaveTypeName: '事假', leaveReason: '照顾家人', durationText: '10 小时（工作6＋请假4）' })
    expect(result.days.find((day: any) => day.date === '2026-08-14')).toMatchObject({ status: 'ABSENT', absenceReason: '无故未到' })
    expect(result.days.find((day: any) => day.date === '2026-08-08')).toMatchObject({ status: 'REST', scheduledMinutes: 0 })
    expect(result.days.find((day: any) => day.date === '2026-08-20')).toMatchObject({ status: 'FUTURE', backgroundTone: 'future', schedule: { segments: expect.any(Array) } })
  })

  it('scopes customer lookup to its own account without leaking a foreign employee', async () => {
    const { service, prisma } = fixture()
    prisma.employee.findFirst.mockResolvedValue(null)

    await expect(service.customerView('front-1', 'foreign-employee', '2026-08')).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-employee', frontendUserId: 'front-1' } }))
  })

  it('uses only allowed admin accounts and never falls back to unrestricted queries', async () => {
    const { service, prisma, payroll } = fixture()
    const allowed = await service.adminView(['front-1'], employee.id, '2026-08')
    expect(allowed).toMatchObject({ readonly: true, employee: { employeeNumber: '001' } })
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: employee.id, frontendUserId: { in: ['front-1'] } } }))
    expect(payroll.calendarOverviewForAccounts).toHaveBeenCalledWith(['front-1'], '2026-08', '2026-08-16')

    const empty = await service.adminView([], employee.id, '2026-08')
    expect(empty).toMatchObject({ readonly: true, employee: null, days: [] })
    expect(prisma.employee.findFirst).toHaveBeenCalledTimes(1)
  })

  it('captures one Shanghai business-date snapshot for the overview and every day classification', async () => {
    const { service, payroll } = fixture()
    const today = vi.spyOn(service as any, 'today')
      .mockReturnValueOnce('2026-08-16')
      .mockReturnValue('2026-08-17')

    await service.customerView('front-1', employee.id, '2026-08')

    expect(today).toHaveBeenCalledTimes(1)
    expect(payroll.calendarOverviewForAccounts).toHaveBeenCalledWith(['front-1'], '2026-08', '2026-08-16')
  })
})
