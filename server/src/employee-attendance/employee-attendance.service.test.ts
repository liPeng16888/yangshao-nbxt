import { ConflictException } from '@nestjs/common'
import { EmployeeLeaveStatus, EmployeePayrollStatus, EmployeeStatus } from '@prisma/client'
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
    employeeCommissionRecord: { count: vi.fn().mockResolvedValue(0) },
    employeeDateOverride: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    employeeWeeklySchedule: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    employeeMonthlySetting: { count: vi.fn().mockResolvedValue(0) },
    employeeBonus: { count: vi.fn().mockResolvedValue(0) },
    employeePayrollItem: { count: vi.fn().mockResolvedValue(0) },
    employeePayrollRun: { findFirst: vi.fn().mockResolvedValue(null) },
    employeeAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    ...overrides
  }
  const cipher = {
    encrypt: vi.fn((value: string) => `cipher:${value}`),
    decrypt: vi.fn((value: string) => value.replace('cipher:', '')),
    mask: vi.fn((value: string) => `***${value.slice(-4)}`)
  } as unknown as EmployeeDataCipherService
  return { service: new EmployeeAttendanceService(prisma as never, cipher), prisma, cipher }
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
    prisma.employee.findMany.mockResolvedValue([{ id: 'employee-1' }])
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'manual-1', employeeId: 'employee-1', date: '2026-08-10', manuallyEdited: true
    }])

    const result = await service.generateAttendance('front-1', 'front-1', {
      month: '2026-08', employeeIds: ['employee-1']
    })

    expect(result).toEqual({ created: 30, updated: 0, skippedManual: 1 })
    expect(prisma.employeeAttendanceRecord.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'manual-1' } }))
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
})
