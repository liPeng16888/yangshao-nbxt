import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { EmployeeLeaveStatus, EmployeeLeaveUnit, EmployeePayrollStatus, EmployeeStatus, Prisma, UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { PayrollService } from './payroll.service'

const decimal = (value: number | string) => new Prisma.Decimal(value)
const workdays = (count: number, scheduledMinutes = 480) => Array.from({ length: count }, (_, index) => ({
  employeeId: employee.id,
  date: `2026-08-${String(index + 1).padStart(2, '0')}`,
  isWorkday: true,
  scheduledMinutes,
  segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
}))

function createPrisma() {
  const tx: any = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    employee: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    employeeMonthlySetting: { findMany: vi.fn().mockResolvedValue([]) },
    employeeMonthlyScheduleDay: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    employeeAttendanceRecord: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    employeeLeaveRequest: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    employeeCommissionRecord: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    employeeBonus: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    employeePayrollRun: {
      findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 })
    },
    employeePayrollItem: {
      findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(),
      create: vi.fn(async ({ data }: any) => ({ id: `item-${data.employeeId}`, ...data })),
      update: vi.fn(async ({ data }: any) => data),
      deleteMany: vi.fn()
    },
    employeePayrollAdjustment: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    employeeAuditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    user: { findUnique: vi.fn() }
  }
  const prisma: any = { ...tx, $transaction: vi.fn(async (callback: any) => callback(tx)) }
  return { prisma, tx }
}

function serviceFixture() {
  const { prisma, tx } = createPrisma()
  const cipher = { decrypt: vi.fn((value: string) => `plain:${value}`), mask: vi.fn((value: string) => `mask:${value}`) }
  const passwords = { verify: vi.fn().mockResolvedValue(true) }
  return { service: new PayrollService(prisma, cipher as never, passwords as never), prisma, tx, cipher, passwords }
}

const employee = {
  id: 'employee-1', frontendUserId: 'front-1', employeeNumber: '001', name: '张三', status: EmployeeStatus.ACTIVE,
  hireDate: '2026-01-01', terminationDate: null, baseSalary: decimal(6000), attendanceBonus: decimal(300),
  overtimeHourlyRate: decimal(30), restQuotaDays: decimal(2), idCardCipher: null, bankCardCipher: null,
  addressCipher: null, emergencyContactCipher: null, photoPath: null
}

describe('PayrollService frontend payroll', () => {
  it('uses full-absence conditions rather than counting a partial short day as absent in the shared calendar overview', async () => {
    const { service, prisma } = serviceFixture()
    vi.spyOn(service as any, 'today').mockReturnValue('2026-08-11')
    const scheduled = {
      frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-11', isWorkday: true, scheduledMinutes: 600,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '12:00' }, { sequence: 1, startTime: '13:00', endTime: '19:00' }]
    }
    const shortRow = {
      frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-11', explicitAbsenceMinutes: 0, overtimeMinutes: 0,
      segments: [{ sequence: 0, checkInAt: '2026-08-11T08:00:00+08:00', checkOutAt: '2026-08-11T12:00:00+08:00' }, { sequence: 1, checkInAt: '2026-08-11T13:00:00+08:00', checkOutAt: '2026-08-11T18:00:00+08:00' }]
    }
    prisma.employee.count.mockResolvedValue(1)
    prisma.employeeAttendanceRecord.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.date === '2026-08-11' ? [shortRow] : [shortRow]))
    prisma.employeeMonthlyScheduleDay.findMany.mockImplementation(({ where }: any) => Promise.resolve(where.date === '2026-08-11' ? [scheduled] : [scheduled]))
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([])
    prisma.employeeLeaveRequest.count.mockResolvedValue(0)
    prisma.employeePayrollRun.findMany.mockResolvedValue([])

    await expect(service.calendarOverviewForAccounts(['front-1'], '2026-08', '2026-08-11')).resolves.toMatchObject({
      todayAttendance: 1,
      todayLeave: 0,
      todayAbsence: 0
    })
  })

  it('generates a decimal-safe formula snapshot from current monthly records', async () => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(20), restQuotaDays: decimal(1) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue(workdays(20))
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{ employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480, checkInAt: new Date(), checkOutAt: new Date(), absenceMinutes: 0, overtimeMinutes: 120 }])
    tx.employeeLeaveRequest.findMany.mockResolvedValue([{ employeeId: employee.id, startDate: '2026-08-02', endDate: '2026-08-03', countedDays: decimal(2), unit: EmployeeLeaveUnit.FULL_DAY, status: EmployeeLeaveStatus.APPROVED, leaveType: { countsTowardRestQuota: true } }])
    tx.employeeCommissionRecord.findMany.mockResolvedValue([{ employeeId: employee.id, amount: decimal(100) }])
    tx.employeeBonus.findMany.mockResolvedValue([{ employeeId: employee.id, amount: decimal(50) }])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employeePayrollItem.create.mockImplementation(async ({ data }: any) => ({ id: 'item-1', ...data }))

    const result: any = await service.generate('front-1', 'front-1', '2026-08')

    const item = result.items[0]
    expect(item.payableAmount).toEqual(decimal(5910))
    expect(item.leaveDeduction).toEqual(decimal(300))
    expect(item.overtimePay).toEqual(decimal(60))
    expect(item.calculationSnapshot).toMatchObject({
      input: { baseSalary: 6000, scheduledWorkDays: 20, countedLeaveDays: 2, overtimeMinutes: 120 },
      result: { payableAmount: 5910 }
    })
  })

  it('keeps a confirmed payroll snapshot stable when listing it later', async () => {
    const { service, prisma } = serviceFixture()
    const stored = { id: 'run-1', status: EmployeePayrollStatus.CONFIRMED, items: [{ calculationSnapshot: { result: { payableAmount: 7777 } } }] }
    prisma.employeePayrollRun.findFirst.mockResolvedValue(stored)

    await expect(service.getPayroll('front-1', '2026-08')).resolves.toBe(stored)
    expect(prisma.employee.findMany).not.toHaveBeenCalled()
  })

  it('rejects confirmation blockers and leaves the run unlocked', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employeeLeaveRequest.count.mockResolvedValue(1)

    await expect(service.confirm('front-1', 'front-1', 'run-1')).rejects.toThrow('待审批请假')
    expect(tx.employeePayrollRun.updateMany).not.toHaveBeenCalled()
    expect(tx.employeeAttendanceRecord.updateMany).not.toHaveBeenCalled()
  })

  it('blocks confirmation when the employee has no monthly schedule', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(20), restQuotaDays: decimal(2) }])

    await expect(service.confirm('front-1', 'front-1', 'run-1')).rejects.toThrow('缺少员工月度排班')
    expect(tx.employeePayrollRun.updateMany).not.toHaveBeenCalled()
  })

  it('treats a scheduled day without a manual attendance row as normal', async () => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(9), restQuotaDays: decimal(2) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{
      employeeId: employee.id, date: '2026-08-11', isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
    }])
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })

    const run: any = await service.generate('front-1', 'front-1', '2026-08')

    expect(run.items[0].calculationSnapshot.input).toMatchObject({ scheduledWorkDays: 1, absenceDays: 0 })
    expect(run.items[0].issues.join('')).not.toContain('缺少考勤')
  })

  it('derives scheduled workdays from monthly plan rows inside employment bounds', async () => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([{ ...employee, hireDate: '2026-08-10', terminationDate: '2026-08-20' }])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(99), restQuotaDays: decimal(2) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue([
      { employeeId: employee.id, date: '2026-08-09', isWorkday: true, scheduledMinutes: 480, segments: [] },
      { employeeId: employee.id, date: '2026-08-10', isWorkday: true, scheduledMinutes: 480, segments: [] },
      { employeeId: employee.id, date: '2026-08-20', isWorkday: true, scheduledMinutes: 480, segments: [] },
      { employeeId: employee.id, date: '2026-08-21', isWorkday: true, scheduledMinutes: 480, segments: [] }
    ])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })

    const run: any = await service.generate('front-1', 'front-1', '2026-08')

    expect(run.items[0].scheduledWorkDays).toEqual(decimal(2))
  })

  it.each([
    ['hourly', EmployeeLeaveUnit.HOUR, 0.25],
    ['full-day', EmployeeLeaveUnit.FULL_DAY, 1],
    ['half-day', EmployeeLeaveUnit.HALF_DAY, 0.5]
  ])('does not count %s leave outside the employee schedule bounds', async (_label, unit, countedDays) => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([{ ...employee, hireDate: '2026-08-10' }])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(1), restQuotaDays: decimal(0) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue([
      { ...workdays(1)[0], date: '2026-08-10' }
    ])
    tx.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: employee.id, startDate: '2026-08-01', endDate: '2026-08-01', unit,
      hours: unit === EmployeeLeaveUnit.HOUR ? decimal(2) : null,
      countedDays: decimal(countedDays), leaveType: { countsTowardRestQuota: true }
    }])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })

    const run: any = await service.generate('front-1', 'front-1', '2026-08')

    expect(run.items[0].countedLeaveDays).toEqual(decimal(0))
  })

  it('keeps explicit zero absence when a no-punch day has approved leave', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(1), restQuotaDays: decimal(2) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue(workdays(1))
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{ employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480, checkInAt: null, checkOutAt: null, absenceMinutes: 0, overtimeMinutes: 0 }])
    tx.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: employee.id, startDate: '2026-08-01', endDate: '2026-08-01', countedDays: decimal(0.5),
      unit: EmployeeLeaveUnit.HALF_DAY, status: EmployeeLeaveStatus.APPROVED, leaveType: { countsTowardRestQuota: true }
    }])

    await expect(service.generate('front-1', 'front-1', '2026-08')).resolves.toMatchObject({
      items: [expect.objectContaining({ absenceDays: decimal(0) })]
    })
  })

  it('uses raw explicit absence and subtracts approved leave exactly once', async () => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, restQuotaDays: decimal(2) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue(workdays(1))
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{
      employeeId: employee.id, date: '2026-08-01', explicitAbsenceMinutes: 180,
      absenceMinutes: 60, overtimeMinutes: 0, segments: []
    }])
    tx.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: employee.id, startDate: '2026-08-01', endDate: '2026-08-01', countedDays: decimal(0.25),
      unit: EmployeeLeaveUnit.HOUR, hours: decimal(1), status: EmployeeLeaveStatus.APPROVED,
      leaveType: { countsTowardRestQuota: false }
    }])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })

    const result: any = await service.generate('front-1', 'front-1', '2026-08')

    expect(result.items[0].absenceDays).toEqual(decimal(0.25))
    expect(result.items[0].issues.join('')).not.toContain('未处理缺勤')
  })

  it('confirms atomically and locks all payroll source rows', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst
      .mockResolvedValueOnce({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
      .mockResolvedValueOnce({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
      .mockResolvedValueOnce({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.CONFIRMED, items: [] })
    tx.employee.findMany.mockResolvedValue([])

    const result: any = await service.confirm('front-1', 'front-1', 'run-1')

    expect(result.status).toBe(EmployeePayrollStatus.CONFIRMED)
    expect(tx.employeePayrollRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run-1', frontendUserId: 'front-1', status: EmployeePayrollStatus.DRAFT } }))
    expect(tx.employeeAttendanceRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ frontendUserId: 'front-1', date: { startsWith: '2026-08' } }) }))
    expect(tx.employeeLeaveRequest.updateMany).toHaveBeenCalled()
    expect(tx.employeeCommissionRecord.updateMany).toHaveBeenCalled()
    expect(tx.employeeBonus.updateMany).toHaveBeenCalled()
    expect(tx.employeeMonthlyScheduleDay.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { frontendUserId: 'front-1', date: { startsWith: '2026-08' } }
    }))
    expect(tx.employeeLeaveRequest.count).toHaveBeenCalledWith({ where: {
      frontendUserId: 'front-1', status: EmployeeLeaveStatus.PENDING,
      startDate: { lte: '2026-08-31' }, endDate: { gte: '2026-08-01' }
    } })
    expect(tx.$executeRawUnsafe.mock.calls[0][1]).toBe('employee-payroll-config:front-1')
    expect(tx.$executeRawUnsafe.mock.calls[1][1]).toBe('employee-payroll:front-1:2026-08')
  })

  it('permits only one concurrent confirmation winner', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employeePayrollRun.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.confirm('front-1', 'front-1', 'run-1')).rejects.toBeInstanceOf(ConflictException)
    expect(tx.employeeAuditLog.create).not.toHaveBeenCalled()
  })

  it('requires a reopen reason and unlocks the month in the same transaction', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.CONFIRMED, confirmedAt: new Date('2026-09-01T00:00:00Z') })
    tx.employeePayrollRun.update.mockResolvedValue({ id: 'run-1', status: EmployeePayrollStatus.DRAFT })

    await expect(service.reopen('front-1', 'front-1', 'run-1', '  ')).rejects.toThrow('撤销原因')
    const result: any = await service.reopen('front-1', 'front-1', 'run-1', '补录考勤')

    expect(result.status).toBe(EmployeePayrollStatus.DRAFT)
    expect(tx.employeeAttendanceRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { payrollLockedAt: null } }))
    expect(tx.employeeMonthlyScheduleDay.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { payrollLockedAt: null } }))
    expect(tx.employeeAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'REOPEN', reason: '补录考勤' }) })
  })

  it('serializes signed draft adjustments with confirmation and recalculates the snapshot', async () => {
    const { service, prisma, tx } = serviceFixture()
    const item = {
      id: 'item-1', frontendUserId: 'front-1', employeeId: employee.id, issues: [],
      payrollRun: { month: '2026-08', status: EmployeePayrollStatus.DRAFT },
      calculationSnapshot: { input: {
        baseSalary: 6000, attendanceBonus: 0, scheduledWorkDays: 20, restQuotaDays: 0,
        countedLeaveDays: 0, absenceDays: 0, overtimeMinutes: 0, overtimeHourlyRate: 0,
        commissionAmount: 0, bonusAmount: 0, adjustments: []
      } }
    }
    prisma.employeePayrollItem.findFirst.mockResolvedValue(item)
    tx.employeePayrollAdjustment.create.mockResolvedValue({ id: 'adjustment-1', amount: decimal(-100), reason: '扣除' })
    tx.employeePayrollAdjustment.findMany.mockResolvedValue([{ amount: decimal(-100) }])

    await service.createAdjustment('front-1', 'front-1', 'item-1', -100, '扣除')

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), 'employee-payroll:front-1:2026-08')
    expect(tx.employeePayrollItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: expect.objectContaining({ payableAmount: decimal(5900), adjustmentAmount: decimal(-100) }) })
  })

  it.each([
    ['full-day approved leave', EmployeeLeaveUnit.FULL_DAY, 1, 0],
    ['half-day approved leave', EmployeeLeaveUnit.HALF_DAY, 0.5, 0.5],
    ['hourly approved leave', EmployeeLeaveUnit.HOUR, 0.25, 0.75],
    ['no approved leave', null, 0, 1]
  ])('subtracts %s coverage from recorded absence', async (_label, unit, countedDays, expectedAbsenceDays) => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(1), restQuotaDays: decimal(2) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue(workdays(1))
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{
      employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480,
      checkInAt: null, checkOutAt: null, explicitAbsenceMinutes: 480, absenceMinutes: 480, overtimeMinutes: 0
    }])
    tx.employeeLeaveRequest.findMany.mockResolvedValue(unit ? [{
      employeeId: employee.id, startDate: '2026-08-01', endDate: '2026-08-01', countedDays: decimal(countedDays),
      unit, status: EmployeeLeaveStatus.APPROVED, leaveType: { countsTowardRestQuota: false }
    }] : [])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })

    const result: any = await service.generate('front-1', 'front-1', '2026-08')

    expect(result.items[0].absenceDays).toEqual(decimal(expectedAbsenceDays))
  })

  it('filters admin payroll parent runs through matching employee items', async () => {
    const { service, prisma } = serviceFixture()

    await service.adminPayroll(['front-1'], { month: '2026-08', employeeId: 'employee-1' })

    expect(prisma.employeePayrollRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ items: { some: { employeeId: 'employee-1' } } })
    }))
  })

  it('re-derives readonly admin attendance from current schedules and approved leave', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-1', frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-01',
      explicitAbsenceMinutes: 90, absenceMinutes: 480, overtimeMinutes: 0,
      employee: { employeeNumber: '001', name: '张三' }, segments: []
    }])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{
      frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-01', isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '16:00', endTime: '24:00' }]
    }])
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([{
      frontendUserId: 'front-1', employeeId: employee.id, startDate: '2026-08-01', endDate: '2026-08-01',
      unit: EmployeeLeaveUnit.HOUR, hours: decimal(0.5)
    }])

    await expect(service.adminAttendance(['front-1'], { month: '2026-08' })).resolves.toMatchObject([{
      scheduledMinutes: 480, workedMinutes: 480, explicitAbsenceMinutes: 90, absenceMinutes: 60
    }])
  })

  it('zeros derived readonly admin metrics for an explicit current rest-day schedule', async () => {
    const { service, prisma } = serviceFixture()
    const checkInAt = new Date('2026-08-01T00:00:00Z')
    const checkOutAt = new Date('2026-08-01T04:00:00Z')
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-rest', frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-01',
      isScheduledWorkday: true, scheduledMinutes: 480, workedMinutes: 240, lateMinutes: 20, earlyLeaveMinutes: 30,
      explicitAbsenceMinutes: 60, absenceMinutes: 240, overtimeMinutes: 45, remark: '保留原始信息',
      employee: { employeeNumber: '001', name: '张三' },
      segments: [{ sequence: 0, checkInAt, checkOutAt }]
    }])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{
      frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-01',
      isWorkday: false, scheduledMinutes: 0, segments: []
    }])

    await expect(service.adminAttendance(['front-1'], { month: '2026-08' })).resolves.toMatchObject([{
      isScheduledWorkday: false,
      scheduledMinutes: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      explicitAbsenceMinutes: 60,
      absenceMinutes: 0,
      overtimeMinutes: 45,
      remark: '保留原始信息',
      actualSegments: [{ sequence: 0, checkInAt, checkOutAt }]
    }])
  })

  it('keeps deleted-schedule attendance metrics cleared in readonly admin and overview responses', async () => {
    const deletedScheduleAttendance = {
      id: 'attendance-deleted-schedule', frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-01',
      isScheduledWorkday: false, scheduledMinutes: 0, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0,
      explicitAbsenceMinutes: 30, absenceMinutes: 0, overtimeMinutes: 45,
      employee: { employeeNumber: '001', name: '张三' }, segments: []
    }

    const admin = serviceFixture()
    admin.prisma.employeeAttendanceRecord.findMany.mockResolvedValue([deletedScheduleAttendance])
    await expect(admin.service.adminAttendance(['front-1'], { month: '2026-08' })).resolves.toMatchObject([{
      isScheduledWorkday: false, scheduledMinutes: 0, workedMinutes: 0, lateMinutes: 0,
      earlyLeaveMinutes: 0, explicitAbsenceMinutes: 30, absenceMinutes: 0, overtimeMinutes: 45
    }])

    const overview = serviceFixture()
    overview.prisma.employee.count = vi.fn().mockResolvedValue(1)
    overview.prisma.employeeAttendanceRecord.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([deletedScheduleAttendance])
    overview.prisma.employeeLeaveRequest.count.mockResolvedValue(0)
    overview.prisma.employeePayrollRun.findFirst.mockResolvedValue(null)
    await expect(overview.service.overview('front-1', '2026-08')).resolves.toMatchObject({
      overtimeMinutes: 45,
      issues: []
    })
  })

  it.each([
    ['zero-minute workday', { scheduledMinutes: 0, checkInAt: null, checkOutAt: null, absenceMinutes: 0 }, '排班工作日时长必须大于 0'],
    ['lone punch', { scheduledMinutes: 480, checkInAt: new Date('2026-08-01T00:00:00Z'), checkOutAt: null, absenceMinutes: 0 }, '打卡必须成对']
  ])('blocks %s instead of allowing full pay', async (_label, attendance, issue) => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(1), restQuotaDays: decimal(0) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue(workdays(1, attendance.scheduledMinutes))
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{ employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, overtimeMinutes: 0, ...attendance }])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })

    const result: any = await service.generate('front-1', 'front-1', '2026-08')

    expect(result.items[0].issues.join('')).toContain(issue)
  })

  it('deducts only the uncovered portion after partial approved leave and requires the full uncovered absence', async () => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(1), restQuotaDays: decimal(2) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue(workdays(1))
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{
      employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480,
      checkInAt: null, checkOutAt: null, explicitAbsenceMinutes: 480, absenceMinutes: 480, overtimeMinutes: 0
    }])
    tx.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: employee.id, startDate: '2026-08-01', endDate: '2026-08-01', countedDays: decimal(0.5),
      unit: EmployeeLeaveUnit.HALF_DAY, status: EmployeeLeaveStatus.APPROVED, leaveType: { countsTowardRestQuota: false }
    }])
    tx.employeePayrollRun.findFirst.mockResolvedValue(null)
    tx.employeePayrollRun.create.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })

    const result: any = await service.generate('front-1', 'front-1', '2026-08')
    expect(result.items[0].absenceDays).toEqual(decimal(0.5))
    expect(result.items[0].issues.join('')).not.toContain('未处理缺勤')
  })

  it('preserves existing draft employees and manual adjustments across eligibility edits and regeneration', async () => {
    const { service, tx } = serviceFixture()
    const existing = {
      id: 'item-1', frontendUserId: 'front-1', payrollRunId: 'run-1', employeeId: employee.id,
      adjustments: [{ id: 'adjustment-1', amount: decimal(200), reason: '补发' }]
    }
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employeePayrollItem.findMany.mockResolvedValue([existing])
    tx.employee.findMany.mockResolvedValue([{ ...employee, status: EmployeeStatus.INACTIVE, terminationDate: null, hireDate: '2026-09-01' }])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(1), restQuotaDays: decimal(0) }])
    tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue(workdays(1))
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{
      employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480,
      checkInAt: new Date('2026-08-01T00:00:00Z'), checkOutAt: new Date('2026-08-01T09:00:00Z'), absenceMinutes: 0, overtimeMinutes: 0
    }])

    const result: any = await service.generate('front-1', 'front-1', '2026-08')

    expect(result.items[0].adjustments).toEqual(existing.adjustments)
    expect(tx.employeePayrollItem.deleteMany).not.toHaveBeenCalled()
    expect(tx.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ id: { in: [employee.id] } }]) }) }))
  })

  it('scopes pending leave and overtime overview totals to the selected month', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employee.count = vi.fn().mockResolvedValue(1)
    prisma.employeeAttendanceRecord.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ overtimeMinutes: 60, lateMinutes: 5, earlyLeaveMinutes: 0 }, { overtimeMinutes: 90, lateMinutes: 0, earlyLeaveMinutes: 3 }])
    prisma.employeeLeaveRequest.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2)
    prisma.employeePayrollRun.findFirst.mockResolvedValue(null)

    const result = await service.overview('front-1', '2026-08')

    expect(prisma.employeeLeaveRequest.count).toHaveBeenLastCalledWith({ where: expect.objectContaining({ startDate: { lte: '2026-08-31' }, endDate: { gte: '2026-08-01' } }) })
    expect(prisma.employeeAttendanceRecord.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { frontendUserId: 'front-1', date: { startsWith: '2026-08' } } }))
    expect(result.overtimeMinutes).toBe(150)
    expect(result.issues).toContain('本月考勤提醒：迟到 1 天，早退 1 天（不自动扣薪）')
  })

  it('counts a scheduled employee as present today when no attendance row or approved leave exists', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employee.count = vi.fn().mockResolvedValue(1)
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{ employeeId: employee.id, isWorkday: true, scheduledMinutes: 480 }])
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([])
    prisma.employeeLeaveRequest.count.mockResolvedValue(0)
    prisma.employeePayrollRun.findFirst.mockResolvedValue(null)

    const result = await service.overview('front-1', '2026-08')

    expect(result.todayAttendance).toBe(1)
    expect(result.todayAbsence).toBe(0)
  })

  it('classifies current scheduled employees once using live leave and attendance derivation', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employee.count = vi.fn().mockResolvedValue(3)
    prisma.employeeAttendanceRecord.findMany
      .mockResolvedValueOnce([{
        employeeId: 'employee-absent', date: '2026-08-11', explicitAbsenceMinutes: 30,
        absenceMinutes: 0, overtimeMinutes: 0, segments: []
      }])
      .mockResolvedValueOnce([])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([
      { employeeId: 'employee-present', date: '2026-08-11', isWorkday: true, scheduledMinutes: 480, segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }] },
      { employeeId: 'employee-leave', date: '2026-08-11', isWorkday: true, scheduledMinutes: 480, segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }] },
      { employeeId: 'employee-absent', date: '2026-08-11', isWorkday: true, scheduledMinutes: 480, segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }] }
    ])
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: 'employee-leave', startDate: '2026-08-11', endDate: '2026-08-11', unit: EmployeeLeaveUnit.FULL_DAY
    }])
    prisma.employeeLeaveRequest.count.mockResolvedValue(0)
    prisma.employeePayrollRun.findFirst.mockResolvedValue(null)

    const result = await service.overview('front-1', '2026-08')

    expect(result).toMatchObject({ todayAttendance: 1, todayLeave: 1, todayAbsence: 1 })
  })

  it.each([
    ['half-day', EmployeeLeaveUnit.HALF_DAY, undefined],
    ['hourly', EmployeeLeaveUnit.HOUR, decimal(1)]
  ])('classifies any positive approved %s leave coverage as leave exactly once', async (_label, unit, hours) => {
    const { service, prisma } = serviceFixture()
    prisma.employee.count = vi.fn().mockResolvedValue(1)
    prisma.employeeAttendanceRecord.findMany
      .mockResolvedValueOnce([{
        employeeId: employee.id, date: '2026-08-11', explicitAbsenceMinutes: 480,
        absenceMinutes: 480, overtimeMinutes: 0, segments: []
      }])
      .mockResolvedValueOnce([])
    prisma.employeeMonthlyScheduleDay.findMany
      .mockResolvedValueOnce([{
        employeeId: employee.id, date: '2026-08-11', isWorkday: true, scheduledMinutes: 480,
        segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
      }])
      .mockResolvedValueOnce([])
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: employee.id, startDate: '2026-08-11', endDate: '2026-08-11', unit, hours
    }])
    prisma.employeeLeaveRequest.count.mockResolvedValue(0)
    prisma.employeePayrollRun.findFirst.mockResolvedValue(null)

    await expect(service.overview('front-1', '2026-08')).resolves.toMatchObject({
      todayAttendance: 0,
      todayLeave: 1,
      todayAbsence: 0
    })
  })

  it('uses an explicit rest-day schedule to suppress stale monthly attendance reminders', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employee.count = vi.fn().mockResolvedValue(1)
    prisma.employeeAttendanceRecord.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        employeeId: employee.id, date: '2026-08-01', explicitAbsenceMinutes: 60,
        workedMinutes: 240, lateMinutes: 20, earlyLeaveMinutes: 30, absenceMinutes: 240, overtimeMinutes: 45,
        segments: []
      }])
    prisma.employeeMonthlyScheduleDay.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        employeeId: employee.id, date: '2026-08-01', isWorkday: false, scheduledMinutes: 0, segments: []
      }])
    prisma.employeeLeaveRequest.count.mockResolvedValue(0)
    prisma.employeePayrollRun.findFirst.mockResolvedValue(null)

    const result = await service.overview('front-1', '2026-08')

    expect(result).toMatchObject({ overtimeMinutes: 45, issues: [] })
    expect(prisma.employeeMonthlyScheduleDay.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { frontendUserId: 'front-1', date: { startsWith: '2026-08' } }
    }))
  })

  it('scopes the admin overview pending leave count to the selected month', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employee.count = vi.fn().mockResolvedValue(1)
    prisma.employeeAttendanceRecord.count = vi.fn().mockResolvedValue(2)
    prisma.employeeLeaveRequest.count = vi.fn().mockResolvedValue(3)
    prisma.employeePayrollRun.count = vi.fn().mockResolvedValue(1)

    await service.adminOverview(['front-1'], { month: '2026-08' })

    expect(prisma.employeeLeaveRequest.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      status: EmployeeLeaveStatus.PENDING,
      startDate: { lte: '2026-08-31' },
      endDate: { gte: '2026-08-01' }
    }) })
  })

  it('rejects mixed month and date-range filters in admin queries', async () => {
    const { service, prisma } = serviceFixture()
    await expect(service.adminAttendance(['front-1'], { month: '2026-08', startDate: '2026-08-01' }))
      .rejects.toThrow('月份和日期范围不能同时使用')
    expect(prisma.employeeAttendanceRecord.findMany).not.toHaveBeenCalled()
  })

  it('returns only allowed monthly schedule days with ordered intervals and derived rest minutes', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{
      id: 'schedule-1', frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-11',
      isWorkday: true, scheduledMinutes: 510, remark: '常规班',
      segments: [
        { sequence: 0, startTime: '08:00', endTime: '12:00' },
        { sequence: 1, startTime: '13:00', endTime: '17:30' }
      ],
      employee: { employeeNumber: '001', name: '张三' },
      frontendUser: { account: 'front', username: '前台', displayRemark: null }
    }])

    const rows: any[] = await service.adminSchedules(['front-1'], { employeeId: employee.id, month: '2026-08', status: 'IGNORED' })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      date: '2026-08-11', scheduledMinutes: 510, breakMinutes: 60,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '12:00' }, { sequence: 1, startTime: '13:00', endTime: '17:30' }]
    })
    expect(prisma.employeeMonthlyScheduleDay.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { frontendUserId: { in: ['front-1'] }, employeeId: employee.id, date: { startsWith: '2026-08' } },
      include: expect.objectContaining({ segments: { orderBy: { sequence: 'asc' } } })
    }))
    expect(prisma.employeeWeeklySchedule).toBeUndefined()
    expect(prisma.employeeDateOverride).toBeUndefined()
  })

  it('gives the monthly schedule filter precedence over a supplied date range', async () => {
    const { service, prisma } = serviceFixture()

    await service.adminSchedules(['front-1'], { month: '2026-08', startDate: '2099-01-01', endDate: '2099-01-31' })

    expect(prisma.employeeMonthlyScheduleDay.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ date: { startsWith: '2026-08' } })
    }))
  })

  it('maps ordered actual attendance intervals to the public contract without exposing Prisma segments', async () => {
    const { service, prisma } = serviceFixture()
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-1', frontendUserId: 'front-1', employeeId: employee.id, date: '2026-08-11',
      segments: [
        { id: 'segment-later', sequence: 1, checkInAt: new Date('2026-08-11T05:00:00.000Z'), checkOutAt: new Date('2026-08-11T09:00:00.000Z') },
        { id: 'segment-first', sequence: 0, checkInAt: new Date('2026-08-11T00:00:00.000Z'), checkOutAt: new Date('2026-08-11T04:00:00.000Z') }
      ],
      employee: { employeeNumber: '001', name: '张三' }
    }])

    const rows: any[] = await service.adminAttendance(['front-1'], { month: '2026-08' })

    expect(rows[0]).not.toHaveProperty('segments')
    expect(rows[0].actualSegments).toEqual([
      { sequence: 0, checkInAt: new Date('2026-08-11T00:00:00.000Z'), checkOutAt: new Date('2026-08-11T04:00:00.000Z') },
      { sequence: 1, checkInAt: new Date('2026-08-11T05:00:00.000Z'), checkOutAt: new Date('2026-08-11T09:00:00.000Z') }
    ])
    expect(prisma.employeeAttendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ segments: { orderBy: { sequence: 'asc' } } })
    }))
  })

  it('rejects unsupported admin employee status instead of silently returning all rows', async () => {
    const { service, prisma } = serviceFixture()
    await expect(service.adminEmployees(['front-1'], { status: 'TERMINATED' })).rejects.toThrow('员工状态无效')
    expect(prisma.employee.findMany).not.toHaveBeenCalled()
  })
})

describe('PayrollService admin reveal', () => {
  it('re-verifies the current admin password, enforces allowed tenant IDs and audits the one-time plaintext reveal', async () => {
    const { service, prisma, passwords } = serviceFixture()
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', passwordHash: 'hash', deletedAt: null })
    prisma.employee.findFirst.mockResolvedValue({ ...employee, idCardCipher: 'cipher-id', bankCardCipher: 'cipher-bank' })

    const result: any = await service.adminRevealEmployee(
      { id: 'admin-1', account: 'root', username: '主账号', role: UserRole.ROOT_ADMIN },
      ['front-1'], employee.id, 'current-password'
    )

    expect(passwords.verify).toHaveBeenCalledWith('current-password', 'hash')
    expect(prisma.employee.findFirst).toHaveBeenCalledWith({ where: { id: employee.id, frontendUserId: { in: ['front-1'] } } })
    expect(result.idCard).toBe('plain:cipher-id')
    expect(prisma.employeeAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ frontendUserId: 'front-1', actorUserId: 'admin-1', action: 'REVEAL' }) })
  })

  it('does not reveal when password verification fails', async () => {
    const { service, prisma, passwords } = serviceFixture()
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', passwordHash: 'hash', deletedAt: null })
    passwords.verify.mockResolvedValue(false)

    await expect(service.adminRevealEmployee(
      { id: 'admin-1', account: 'root', username: '主账号', role: UserRole.ROOT_ADMIN },
      ['front-1'], employee.id, 'wrong'
    )).rejects.toBeInstanceOf(UnauthorizedException)
    expect(prisma.employee.findFirst).not.toHaveBeenCalled()
  })
})
