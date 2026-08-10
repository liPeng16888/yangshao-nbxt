import { BadRequestException, ConflictException } from '@nestjs/common'
import { EmployeeLeaveStatus, EmployeePayrollStatus, EmployeeStatus, Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { EmployeeDataCipherService } from './employee-data-cipher.service'
import { EmployeeAttendanceService } from './employee-attendance.service'

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    employee: {
      findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn()
    },
    employeeAttendanceRecord: {
      findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0)
    },
    employeeLeaveRequest: {
      findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0)
    },
    employeeLeaveType: {
      findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn()
    },
    employeeCommissionType: {
      findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn()
    },
    employeeCommissionRecord: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
    employeeDateOverride: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    employeeWeeklySchedule: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    employeeMonthlySetting: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    employeeBonus: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
    employeePayrollItem: { count: vi.fn().mockResolvedValue(0) },
    employeePayrollRun: { findFirst: vi.fn().mockResolvedValue(null) },
    employeeAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
    ...overrides
  }
  prisma.$transaction = vi.fn(async (argument: Array<Promise<unknown>> | ((tx: typeof prisma) => Promise<unknown>)) =>
    typeof argument === 'function' ? argument(prisma) : Promise.all(argument))
  return finishService(prisma)
}

function finishService(prisma: any) {
  const cipher = {
    encrypt: vi.fn((value: string) => `cipher:${value}`),
    decrypt: vi.fn((value: string) => value.replace('cipher:', '')),
    mask: vi.fn((value: string) => `***${value.slice(-4)}`)
  } as unknown as EmployeeDataCipherService
  const photos = { remove: vi.fn().mockResolvedValue(true) }
  return { service: new EmployeeAttendanceService(prisma as never, cipher, photos as never), prisma, cipher, photos }
}

describe('EmployeeAttendanceService ownership and conflicts', () => {
  it('rejects a duplicate employee number inside the current frontend account', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'existing', frontendUserId: 'front-1', employeeNumber: '001' })

    await expect(service.createEmployee('front-1', 'front-1', {
      employeeNumber: '001', name: '张三', hireDate: '2026-08-01'
    })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.employee.create).not.toHaveBeenCalled()
  })

  it('never returns an employee owned by another frontend account', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue(null)

    await expect(service.getEmployee('front-1', 'employee-from-front-2')).rejects.toMatchObject({ status: 404 })
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'employee-from-front-2', frontendUserId: 'front-1' }
    }))
  })

  it('rejects a duplicate attendance date before writing', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeAttendanceRecord.findFirst.mockResolvedValue({ id: 'existing' })

    await expect(service.createAttendance('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', isScheduledWorkday: true, scheduledMinutes: 480
    })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.employeeAttendanceRecord.create).not.toHaveBeenCalled()
  })

  it('rejects overlapping pending or approved leave for the same employee', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue({ id: 'overlap', status: EmployeeLeaveStatus.PENDING })

    await expect(service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-11',
      unit: 'FULL_DAY', reason: '事假'
    })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.employeeLeaveRequest.create).not.toHaveBeenCalled()
  })

  it('converts hourly leave using the employee scheduled minutes for that date', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 360 })
    prisma.employeeLeaveRequest.create.mockResolvedValue({ id: 'leave-1' })

    await service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'HOUR', hours: 3, reason: '事假'
    })

    expect(prisma.employeeLeaveRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ countedDays: expect.objectContaining({ d: expect.any(Array) }) })
    }))
    const createArg = prisma.employeeLeaveRequest.create.mock.calls[0][0]
    expect(Number(createArg.data.countedDays)).toBe(0.5)
  })

  it('rejects a conflicting date override for the same employee and date', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeDateOverride.findFirst.mockResolvedValue({ id: 'existing' })

    await expect(service.createDateOverride('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', isWorkday: false, scheduledMinutes: 0
    })).rejects.toBeInstanceOf(ConflictException)
  })

  it('rejects attendance writes in a confirmed payroll month', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', status: EmployeePayrollStatus.CONFIRMED })

    await expect(service.createAttendance('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', isScheduledWorkday: true, scheduledMinutes: 480
    })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.employeeAttendanceRecord.create).not.toHaveBeenCalled()
  })

  it('deactivates a used leave type instead of deleting historical configuration', async () => {
    const { service, prisma } = createService()
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.count.mockResolvedValue(1)
    prisma.employeeLeaveType.update.mockResolvedValue({ id: 'type-1', active: false })

    await service.deleteLeaveType('front-1', 'front-1', 'type-1')

    expect(prisma.employeeLeaveType.update).toHaveBeenCalledWith({ where: { id: 'type-1' }, data: { active: false } })
    expect(prisma.employeeLeaveType.delete).not.toHaveBeenCalled()
  })

  it('batch-generates a month without overwriting manually edited attendance', async () => {
    const { service, prisma } = createService()
    prisma.employee.findMany.mockResolvedValue([{ id: 'employee-1', hireDate: '2026-01-01', terminationDate: null }])
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'manual-1', employeeId: 'employee-1', date: '2026-08-10', manuallyEdited: true
    }])

    const result = await service.generateAttendance('front-1', 'front-1', {
      month: '2026-08', employeeIds: ['employee-1']
    })

    expect(result).toEqual({ created: 30, updated: 0, skippedManual: 1 })
    expect(prisma.employeeAttendanceRecord.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'manual-1' } }))
  })

  it('generates only dates inside inclusive employment intervals, including historical inactive employees', async () => {
    const { service, prisma } = createService()
    prisma.employee.findMany.mockResolvedValue([
      { id: 'mid-hire', status: EmployeeStatus.ACTIVE, hireDate: '2026-08-15', terminationDate: '2026-08-20' },
      { id: 'historical', status: EmployeeStatus.INACTIVE, hireDate: '2026-07-01', terminationDate: '2026-08-05' }
    ])

    const result = await service.generateAttendance('front-1', 'front-1', {
      month: '2026-08', employeeIds: ['mid-hire', 'historical']
    })

    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { frontendUserId: 'front-1', id: { in: ['mid-hire', 'historical'] } }
    }))
    expect(result.created).toBe(11)
    const dates = prisma.employeeAttendanceRecord.create.mock.calls.map((call: any[]) => call[0].data.date)
    expect(dates).toContain('2026-08-15')
    expect(dates).toContain('2026-08-20')
    expect(dates).toContain('2026-08-01')
    expect(dates).toContain('2026-08-05')
    expect(dates).not.toContain('2026-08-06')
  })

  it('rejects leave when the date has no resolvable schedule or exceeds scheduled duration', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue(null)

    await expect(service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'HOUR', hours: 1, reason: '事假'
    })).rejects.toBeInstanceOf(ConflictException)

    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 360 })
    await expect(service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'HOUR', hours: 7, reason: '事假'
    })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('semantically validates moved dates and checks both source and destination payroll months', async () => {
    const { service, prisma } = createService()
    prisma.employeeDateOverride.findFirst.mockResolvedValueOnce({
      id: 'override-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-10'
    })

    await expect(service.updateDateOverride('front-1', 'front-1', 'override-1', {
      date: '2026-02-31'
    })).rejects.toBeInstanceOf(BadRequestException)

    prisma.employeeDateOverride.findFirst.mockReset().mockResolvedValueOnce({
      id: 'override-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-10'
    }).mockResolvedValueOnce(null)
    prisma.employeePayrollRun.findFirst.mockImplementation(async ({ where }: any) =>
      where.month === '2026-08' ? { id: 'confirmed' } : null
    )
    await expect(service.updateDateOverride('front-1', 'front-1', 'override-1', {
      date: '2026-09-10'
    })).rejects.toBeInstanceOf(ConflictException)
  })

  it('maps a concurrent attendance unique constraint to HTTP 409', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeAttendanceRecord.findFirst.mockResolvedValue(null)
    prisma.employeeAttendanceRecord.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test'
    }))

    await expect(service.createAttendance('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', isScheduledWorkday: true, scheduledMinutes: 480
    })).rejects.toBeInstanceOf(ConflictException)
  })

  it('serializes leave overlap checking and creation inside one transaction', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 480 })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeLeaveRequest.create.mockResolvedValue({ id: 'leave-1' })

    await service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'FULL_DAY', reason: '事假'
    })

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'employee-leave:front-1:employee-1'
    )
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })
  })

  it('runs a business mutation and audit insert in the same interactive transaction', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeBonus.create.mockResolvedValue({ id: 'bonus-1' })
    prisma.employeeAuditLog.create.mockRejectedValue(new Error('audit failed'))

    await expect(service.createBonus('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', amount: 100, reason: '优秀'
    })).rejects.toThrow('audit failed')

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    })
  })

  it('acquires the payroll month lock and rechecks confirmation inside the mutation transaction', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeePayrollRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'confirmed', status: EmployeePayrollStatus.CONFIRMED })

    await expect(service.createBonus('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', amount: 100, reason: '优秀'
    })).rejects.toBeInstanceOf(ConflictException)

    const lockOrder = prisma.$executeRawUnsafe.mock.invocationCallOrder[0]
    const recheckOrder = prisma.employeePayrollRun.findFirst.mock.invocationCallOrder[1]
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'employee-payroll:front-1:2026-08'
    )
    expect(lockOrder).toBeLessThan(recheckOrder)
    expect(prisma.employeeBonus.create).not.toHaveBeenCalled()
  })

  it('locks every cross-month leave month in canonical order before overlap checking and writing', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 480 })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeLeaveRequest.create.mockResolvedValue({ id: 'leave-1' })

    await service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-31', endDate: '2026-09-01',
      unit: 'FULL_DAY', reason: '跨月请假'
    })

    expect(prisma.$executeRawUnsafe.mock.calls.slice(0, 4)).toEqual([
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'employee-payroll-config:front-1'],
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'employee-payroll:front-1:2026-08'],
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'employee-payroll:front-1:2026-09'],
      ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'employee-leave:front-1:employee-1']
    ])
  })

  it('replans locks when a bonus moved after the stale pre-read', async () => {
    const { service, prisma } = createService()
    const august = { id: 'bonus-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-10', amount: new Prisma.Decimal(100), reason: '原奖金', payrollLockedAt: null }
    const september = { ...august, date: '2026-09-10' }
    prisma.employeeBonus.findFirst
      .mockResolvedValueOnce(august)
      .mockResolvedValueOnce(september)
      .mockResolvedValueOnce(september)
    prisma.employeeBonus.update.mockResolvedValue({ ...september, amount: new Prisma.Decimal(200) })

    await service.updateBonus('front-1', 'front-1', 'bonus-1', { amount: 200 })

    const lockKeys = prisma.$executeRawUnsafe.mock.calls.map((call: unknown[]) => call[1])
    expect(lockKeys).toContain('employee-payroll:front-1:2026-09')
    expect(prisma.employeeBonus.findFirst).toHaveBeenCalledTimes(3)
    expect(prisma.employeeBonus.update).toHaveBeenCalledTimes(1)
  })

  it('rechecks payrollLockedAt on the current attendance row before stale delete', async () => {
    const { service, prisma } = createService()
    prisma.employeeAttendanceRecord.findFirst
      .mockResolvedValueOnce({ id: 'attendance-1', frontendUserId: 'front-1', date: '2026-08-10', payrollLockedAt: null })
      .mockResolvedValueOnce({ id: 'attendance-1', frontendUserId: 'front-1', date: '2026-09-10', payrollLockedAt: new Date() })
      .mockResolvedValueOnce({ id: 'attendance-1', frontendUserId: 'front-1', date: '2026-09-10', payrollLockedAt: new Date() })

    await expect(service.deleteAttendance('front-1', 'front-1', 'attendance-1')).rejects.toBeInstanceOf(ConflictException)

    expect(prisma.employeeAttendanceRecord.delete).not.toHaveBeenCalled()
    expect(prisma.$executeRawUnsafe.mock.calls.map((call: unknown[]) => call[1])).toContain('employee-payroll:front-1:2026-09')
  })

  it('reloads leave range and status under month and employee locks before review', async () => {
    const { service, prisma } = createService()
    prisma.employeeLeaveRequest.findFirst
      .mockResolvedValueOnce({ id: 'leave-1', frontendUserId: 'front-1', employeeId: 'employee-1', startDate: '2026-08-31', endDate: '2026-08-31', status: EmployeeLeaveStatus.PENDING, payrollLockedAt: null })
      .mockResolvedValueOnce({ id: 'leave-1', frontendUserId: 'front-1', employeeId: 'employee-1', startDate: '2026-09-01', endDate: '2026-09-01', status: EmployeeLeaveStatus.APPROVED, payrollLockedAt: null })
      .mockResolvedValueOnce({ id: 'leave-1', frontendUserId: 'front-1', employeeId: 'employee-1', startDate: '2026-09-01', endDate: '2026-09-01', status: EmployeeLeaveStatus.APPROVED, payrollLockedAt: null })

    await expect(service.approveLeave('front-1', 'front-1', 'leave-1')).rejects.toBeInstanceOf(ConflictException)

    const lockKeys = prisma.$executeRawUnsafe.mock.calls.map((call: unknown[]) => call[1])
    expect(lockKeys).toContain('employee-payroll:front-1:2026-09')
    expect(lockKeys.at(-1)).toBe('employee-leave:front-1:employee-1')
    expect(prisma.employeeLeaveRequest.update).not.toHaveBeenCalled()
  })

  it('serializes payroll-affecting employee and leave-type configuration with the shared config lock', async () => {
    const { service, prisma } = createService()
    const employee = { id: 'employee-1', frontendUserId: 'front-1', employeeNumber: '001', name: '张三', hireDate: '2026-01-01', photoPath: null }
    prisma.employee.findFirst.mockResolvedValue(employee)
    prisma.employee.update.mockResolvedValue({ ...employee, baseSalary: new Prisma.Decimal(7000) })

    await service.updateEmployee('front-1', 'front-1', 'employee-1', { baseSalary: 7000 })

    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'type-1', frontendUserId: 'front-1', countsTowardRestQuota: true })
    prisma.employeeLeaveType.update.mockResolvedValue({ id: 'type-1', countsTowardRestQuota: false })
    await service.updateLeaveType('front-1', 'front-1', 'type-1', { countsTowardRestQuota: false })

    const configLocks = prisma.$executeRawUnsafe.mock.calls.filter((call: unknown[]) => call[1] === 'employee-payroll-config:front-1')
    expect(configLocks).toHaveLength(2)
    expect(prisma.employee.update).toHaveBeenCalledTimes(1)
    expect(prisma.employeeLeaveType.update).toHaveBeenCalledTimes(1)
  })

  it('serializes history-based employee deactivation with payroll confirmation', async () => {
    const { service, prisma } = createService()
    const employee = {
      id: 'employee-1', frontendUserId: 'front-1', employeeNumber: '001', name: '张三',
      terminationDate: null, photoPath: null
    }
    prisma.employee.findFirst.mockResolvedValue(employee)
    prisma.employeeAttendanceRecord.count.mockResolvedValue(1)
    prisma.employee.update.mockResolvedValue({ ...employee, status: EmployeeStatus.INACTIVE, terminationDate: '2026-08-10' })

    await service.deleteEmployee('front-1', 'front-1', 'employee-1')

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      'employee-payroll-config:front-1'
    )
    expect(prisma.employee.findFirst).toHaveBeenCalledTimes(2)
    expect(prisma.employee.update).toHaveBeenCalledTimes(1)
  })

  it('requires bonus amounts to be greater than zero', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    await expect(service.createBonus('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', amount: -1, reason: '调整'
    })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('validates and honors leave list date/month filters', async () => {
    const { service, prisma } = createService()
    await service.listLeaveRequests('front-1', { startDate: '2026-08-10', endDate: '2026-08-20' })
    expect(prisma.employeeLeaveRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      startDate: { lte: '2026-08-20' }, endDate: { gte: '2026-08-10' }
    }) }))
    expect(() => service.listLeaveRequests('front-1', { month: '2026-13' })).toThrow(BadRequestException)
  })

  it('deactivates an employee with historical records instead of deleting the employee', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1', status: EmployeeStatus.ACTIVE })
    prisma.employeeAttendanceRecord.count.mockResolvedValue(1)
    prisma.employee.update.mockResolvedValue({ id: 'employee-1', status: EmployeeStatus.INACTIVE })

    await service.deleteEmployee('front-1', 'front-1', 'employee-1')

    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'employee-1' }, data: expect.objectContaining({ status: EmployeeStatus.INACTIVE }) }))
    expect(prisma.employee.delete).not.toHaveBeenCalled()
  })

  it('cleans replaced and hard-deleted private photos only after the database mutation succeeds', async () => {
    const { service, prisma, photos } = createService()
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-1', frontendUserId: 'front-1', photoPath: '/private/old.jpg', terminationDate: null
    })
    prisma.employee.update.mockResolvedValue({ id: 'employee-1' })

    await service.attachPhoto('front-1', 'front-1', 'employee-1', '/private/new.jpg')
    expect(photos.remove).toHaveBeenCalledWith('/private/old.jpg')

    prisma.employeeAttendanceRecord.count.mockResolvedValue(0)
    await service.deleteEmployee('front-1', 'front-1', 'employee-1')
    expect(prisma.employee.delete).toHaveBeenCalledWith({ where: { id: 'employee-1' } })
    expect(photos.remove).toHaveBeenCalledWith('/private/old.jpg')
  })

  it('does not turn successful photo replacement into a false failure when old-file cleanup fails', async () => {
    const { service, prisma, photos } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1', photoPath: '/private/old.jpg' })
    prisma.employee.update.mockResolvedValue({ id: 'employee-1' })
    photos.remove.mockRejectedValue(new Error('unlink failed'))

    await expect(service.attachPhoto('front-1', 'front-1', 'employee-1', '/private/new.jpg')).resolves.toEqual({ id: 'employee-1', hasPhoto: true })
  })
})
