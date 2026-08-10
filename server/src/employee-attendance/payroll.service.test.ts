import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { EmployeeLeaveStatus, EmployeeLeaveUnit, EmployeePayrollStatus, EmployeeStatus, Prisma, UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { PayrollService } from './payroll.service'

const decimal = (value: number | string) => new Prisma.Decimal(value)

function createPrisma() {
  const tx: any = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    employee: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    employeeMonthlySetting: { findMany: vi.fn().mockResolvedValue([]) },
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
  it('generates a decimal-safe formula snapshot from current monthly records', async () => {
    const { service, tx } = serviceFixture()
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(20), restQuotaDays: decimal(1) }])
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{ employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480, checkInAt: new Date(), checkOutAt: new Date(), absenceMinutes: 0, overtimeMinutes: 120 }])
    tx.employeeLeaveRequest.findMany.mockResolvedValue([{ employeeId: employee.id, startDate: '2026-08-02', endDate: '2026-08-02', countedDays: decimal(2), status: EmployeeLeaveStatus.APPROVED, leaveType: { countsTowardRestQuota: true } }])
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

  it('blocks confirmation when scheduled workdays have no generated attendance rows', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(20), restQuotaDays: decimal(2) }])

    await expect(service.confirm('front-1', 'front-1', 'run-1')).rejects.toThrow('缺少考勤排班记录')
    expect(tx.employeePayrollRun.updateMany).not.toHaveBeenCalled()
  })

  it('keeps a no-punch half-day leave as unresolved absence', async () => {
    const { service, tx } = serviceFixture()
    tx.employeePayrollRun.findFirst.mockResolvedValue({ id: 'run-1', frontendUserId: 'front-1', month: '2026-08', status: EmployeePayrollStatus.DRAFT })
    tx.employee.findMany.mockResolvedValue([employee])
    tx.employeeMonthlySetting.findMany.mockResolvedValue([{ employeeId: employee.id, scheduledWorkDays: decimal(1), restQuotaDays: decimal(2) }])
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{ employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480, checkInAt: null, checkOutAt: null, absenceMinutes: 0, overtimeMinutes: 0 }])
    tx.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: employee.id, startDate: '2026-08-01', endDate: '2026-08-01', countedDays: decimal(0.5),
      unit: EmployeeLeaveUnit.HALF_DAY, status: EmployeeLeaveStatus.APPROVED, leaveType: { countsTowardRestQuota: true }
    }])

    await expect(service.confirm('front-1', 'front-1', 'run-1')).rejects.toThrow('未处理缺勤')
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
    tx.employeeAttendanceRecord.findMany.mockResolvedValue([{
      employeeId: employee.id, date: '2026-08-01', isScheduledWorkday: true, scheduledMinutes: 480,
      checkInAt: null, checkOutAt: null, absenceMinutes: 480, overtimeMinutes: 0
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
