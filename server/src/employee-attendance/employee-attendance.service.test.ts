import { BadRequestException, ConflictException } from '@nestjs/common'
import { EmployeeLeaveStatus, EmployeePayrollStatus, EmployeeStatus, Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it, vi } from 'vitest'
import { EmployeeDataCipherService } from './employee-data-cipher.service'
import { ActualAttendanceSegmentDto, AttendanceListQueryDto, ScheduleSegmentDto } from './employee-attendance.dto'
import { EmployeeAttendanceService } from './employee-attendance.service'

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    employee: {
      findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn()
    },
    employeeAttendanceRecord: {
      findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }), delete: vi.fn(), count: vi.fn().mockResolvedValue(0)
    },
    employeeAttendanceSegment: { createMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
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
    employeeDateOverride: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    employeeWeeklySchedule: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    employeeMonthlySetting: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    employeeMonthlyScheduleDay: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    employeeScheduleSegment: { createMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    employeeBonus: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
    employeePayrollItem: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
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
  it('recomputes scheduled minutes and replaces monthly schedule segments atomically', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.upsert.mockResolvedValue({
      id: 'schedule-1', employeeId: 'employee-1', date: '2026-08-11', isWorkday: true,
      scheduledMinutes: 510, remark: null, segments: []
    })

    const result = await service.saveMonthlyScheduleDay('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-11', isWorkday: true, remark: '',
      segments: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:30' }]
    })

    expect(result).toMatchObject({ scheduledMinutes: 510, breakMinutes: 60, segments: [
      { sequence: 0, startTime: '08:00', endTime: '12:00' },
      { sequence: 1, startTime: '13:00', endTime: '17:30' }
    ] })
    expect(prisma.employeeScheduleSegment.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
      expect.objectContaining({ sequence: 0, startTime: '08:00', endTime: '12:00' }),
      expect.objectContaining({ sequence: 1, startTime: '13:00', endTime: '17:30' })
    ]) }))
  })

  it('clears cached derived attendance metrics when deleting an unlocked monthly schedule day', async () => {
    const { service, prisma } = createService()
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({
      id: 'schedule-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11', payrollLockedAt: null
    })
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })

    await expect(service.deleteMonthlyScheduleDay('front-1', 'front-1', 'schedule-1')).resolves.toEqual({ ok: true })

    expect(prisma.employeeAttendanceRecord.updateMany).toHaveBeenCalledWith({
      where: { frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11' },
      data: {
        isScheduledWorkday: false,
        scheduledMinutes: 0,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        absenceMinutes: 0
      }
    })
    expect(prisma.employeeMonthlyScheduleDay.delete).toHaveBeenCalledWith({ where: { id: 'schedule-1' } })

    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isScheduledWorkday: false, scheduledMinutes: 0, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0,
      explicitAbsenceMinutes: 30, absenceMinutes: 0, overtimeMinutes: 45, segments: []
    }])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([])
    await expect(service.listAttendance('front-1')).resolves.toMatchObject([{
      isScheduledWorkday: false, scheduledMinutes: 0, workedMinutes: 0, lateMinutes: 0,
      earlyLeaveMinutes: 0, explicitAbsenceMinutes: 30, absenceMinutes: 0, overtimeMinutes: 45
    }])
  })

  it('rolls back a monthly schedule batch when one selected date belongs to a confirmed month', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeePayrollRun.findFirst.mockImplementation(({ where }: any) => Promise.resolve(
      where.month === '2026-09' ? { id: 'run-1', status: EmployeePayrollStatus.CONFIRMED } : null
    ))

    await expect(service.batchSaveMonthlySchedules('front-1', 'front-1', {
      employeeId: 'employee-1', dates: ['2026-08-11', '2026-09-01'], isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '17:00' }], remark: ''
    })).rejects.toThrow('工资已确认')

    expect(prisma.employeeMonthlyScheduleDay.upsert).not.toHaveBeenCalled()
  })

  it('copies monthly schedules by day number and ignores dates missing from the target month', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.findMany
      .mockResolvedValueOnce(Array.from({ length: 28 }, (_, index) => ({
        id: `source-${index + 1}`, employeeId: 'employee-1', date: `2026-02-${String(index + 1).padStart(2, '0')}`,
        isWorkday: true, scheduledMinutes: 480, remark: null,
        segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
      })))
      .mockResolvedValueOnce([])
    prisma.employeeMonthlyScheduleDay.upsert.mockImplementation(({ create }: any) => Promise.resolve({ id: `target-${create.date}`, ...create, segments: create.segments?.createMany?.data || [] }))

    const result = await service.copyPreviousMonthSchedules('front-1', 'front-1', {
      employeeId: 'employee-1', targetMonth: '2026-03', overwrite: true
    })

    expect(result).toMatchObject({ copied: 28, targetMonth: '2026-03' })
    expect(prisma.employeeMonthlyScheduleDay.upsert).toHaveBeenCalledTimes(28)
  })

  it('copies from a confirmed source month while keeping both months locked', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeePayrollRun.findFirst.mockImplementation(({ where }: any) => Promise.resolve(
      where.month === '2026-02' ? { id: 'confirmed-source', status: EmployeePayrollStatus.CONFIRMED } : null
    ))
    prisma.employeeMonthlyScheduleDay.findMany
      .mockResolvedValueOnce([{ id: 'source-1', employeeId: 'employee-1', date: '2026-02-01', isWorkday: false, scheduledMinutes: 0, remark: null, segments: [] }])
      .mockResolvedValueOnce([])
    prisma.employeeMonthlyScheduleDay.upsert.mockResolvedValue({ id: 'target-1', employeeId: 'employee-1', date: '2026-03-01', isWorkday: false, scheduledMinutes: 0, remark: null })

    await expect(service.copyPreviousMonthSchedules('front-1', 'front-1', {
      employeeId: 'employee-1', targetMonth: '2026-03', overwrite: true
    })).resolves.toMatchObject({ copied: 1, targetMonth: '2026-03' })

    const lockKeys = prisma.$executeRawUnsafe.mock.calls.map((call: unknown[]) => call[1])
    expect(lockKeys).toEqual(expect.arrayContaining(['employee-payroll:front-1:2026-02', 'employee-payroll:front-1:2026-03']))
  })

  it('rejects an empty source month without deleting existing target schedules', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'target-1', employeeId: 'employee-1', date: '2026-03-01', payrollLockedAt: null, segments: [] }])

    await expect(service.copyPreviousMonthSchedules('front-1', 'front-1', {
      employeeId: 'employee-1', targetMonth: '2026-03', overwrite: true
    })).rejects.toThrow('上月暂无可复制排班')

    expect(prisma.employeeMonthlyScheduleDay.deleteMany).not.toHaveBeenCalled()
    expect(prisma.employeeMonthlyScheduleDay.upsert).not.toHaveBeenCalled()
  })

  it('audits every overwritten target schedule before replacing a shorter source month', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.findMany
      .mockResolvedValueOnce([{ id: 'source-1', employeeId: 'employee-1', date: '2026-02-01', isWorkday: false, scheduledMinutes: 0, remark: null, segments: [] }])
      .mockResolvedValueOnce([
        { id: 'target-1', employeeId: 'employee-1', date: '2026-03-01', payrollLockedAt: null, segments: [] },
        { id: 'target-31', employeeId: 'employee-1', date: '2026-03-31', payrollLockedAt: null, segments: [] }
      ])
    prisma.employeeMonthlyScheduleDay.upsert.mockResolvedValue({ id: 'replacement-1', employeeId: 'employee-1', date: '2026-03-01', isWorkday: false, scheduledMinutes: 0, remark: null })

    await service.copyPreviousMonthSchedules('front-1', 'front-1', {
      employeeId: 'employee-1', targetMonth: '2026-03', overwrite: true
    })

    const deleted = prisma.employeeAuditLog.create.mock.calls
      .map((call: unknown[]) => (call[0] as { data: unknown }).data)
      .filter((data: any) => data.action === 'DELETE')
    expect(deleted).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'EmployeeMonthlyScheduleDay', entityId: 'target-1', reason: expect.stringContaining('2026-03-01') }),
      expect.objectContaining({ entityType: 'EmployeeMonthlyScheduleDay', entityId: 'target-31', reason: expect.stringContaining('2026-03-31') })
    ]))
    expect(prisma.employeeAttendanceRecord.updateMany).toHaveBeenCalledWith({
      where: { frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-03-31' },
      data: {
        isScheduledWorkday: false,
        scheduledMinutes: 0,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        absenceMinutes: 0
      }
    })
  })

  it('validates all copied schedules before removing target month rows', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.findMany
      .mockResolvedValueOnce([{ id: 'source-1', employeeId: 'employee-1', date: '2026-02-01', isWorkday: true, scheduledMinutes: 480, remark: null,
        segments: [{ sequence: 0, startTime: '17:00', endTime: '08:00' }] }])
      .mockResolvedValueOnce([{ id: 'target-1', employeeId: 'employee-1', date: '2026-03-01', payrollLockedAt: null }])

    await expect(service.copyPreviousMonthSchedules('front-1', 'front-1', {
      employeeId: 'employee-1', targetMonth: '2026-03', overwrite: true
    })).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.employeeMonthlyScheduleDay.deleteMany).not.toHaveBeenCalled()
  })

  it('derives the monthly setting compatibility workday count from schedule rows', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.count.mockResolvedValue(17)
    prisma.employeeMonthlySetting.upsert.mockResolvedValue({ id: 'setting-1', scheduledWorkDays: new Prisma.Decimal(17) })

    await service.upsertMonthlySetting('front-1', 'front-1', {
      employeeId: 'employee-1', month: '2026-08', restQuotaDays: 4
    })

    expect(prisma.employeeMonthlySetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ scheduledWorkDays: 17, restQuotaDays: expect.objectContaining({ d: expect.any(Array) }) }),
      update: expect.objectContaining({ scheduledWorkDays: 17 })
    }))
  })

  it('reports whether leave and commission types are referenced so immutable UI controls stay disabled', async () => {
    const { service, prisma } = createService()
    prisma.employeeLeaveType.findMany.mockResolvedValue([{ id: 'leave-type-1', name: '事假', _count: { leaveRequests: 1 } }])
    prisma.employeeCommissionType.findMany.mockResolvedValue([{ id: 'commission-type-1', name: '送样', _count: { records: 0 } }])

    await expect(service.listLeaveTypes('front-1')).resolves.toEqual([{ id: 'leave-type-1', name: '事假', referenced: true }])
    await expect(service.listCommissionTypes('front-1')).resolves.toEqual([{ id: 'commission-type-1', name: '送样', referenced: false }])
  })

  it('rejects mixed month and date-range list filters instead of silently choosing one', async () => {
    const { service, prisma } = createService()

    expect(() => service.listAttendance('front-1', { month: '2026-08', startDate: '2026-08-01' }))
      .toThrow('月份和日期范围不能同时使用')
    expect(() => service.listLeaveRequests('front-1', { month: '2026-08', endDate: '2026-08-31' }))
      .toThrow('月份和日期范围不能同时使用')
    expect(prisma.employeeAttendanceRecord.findMany).not.toHaveBeenCalled()
    expect(prisma.employeeLeaveRequest.findMany).not.toHaveBeenCalled()
  })

  it('returns ordered actualSegments in attendance list responses', async () => {
    const { service, prisma } = createService()
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-1', employeeId: 'employee-1', date: '2026-08-11',
      segments: [
        { sequence: 1, checkInAt: new Date('2026-08-11T05:00:00Z'), checkOutAt: new Date('2026-08-11T09:00:00Z') },
        { sequence: 0, checkInAt: new Date('2026-08-11T00:00:00Z'), checkOutAt: new Date('2026-08-11T04:00:00Z') }
      ]
    }])

    await expect(service.listAttendance('front-1')).resolves.toMatchObject([{
      actualSegments: [
        { checkInAt: new Date('2026-08-11T00:00:00Z'), checkOutAt: new Date('2026-08-11T04:00:00Z') },
        { checkInAt: new Date('2026-08-11T05:00:00Z'), checkOutAt: new Date('2026-08-11T09:00:00Z') }
      ]
    }])
  })

  it('re-derives attendance lists from the current schedule, approved leave, and raw explicit absence', async () => {
    const { service, prisma } = createService()
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      explicitAbsenceMinutes: 60, absenceMinutes: 480, overtimeMinutes: 15,
      segments: [], employee: { employeeNumber: '001', name: '张三' }
    }])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{
      id: 'schedule-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '16:00', endTime: '24:00' }]
    }])
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: 'employee-1', startDate: '2026-08-11', endDate: '2026-08-11',
      unit: 'HOUR', hours: new Prisma.Decimal(0.5)
    }])

    await expect(service.listAttendance('front-1')).resolves.toMatchObject([{
      scheduledMinutes: 480, workedMinutes: 480, lateMinutes: 0, earlyLeaveMinutes: 0,
      explicitAbsenceMinutes: 60, absenceMinutes: 30, overtimeMinutes: 15
    }])
  })

  it('keeps raw explicit absence separate when actual intervals are re-derived', async () => {
    const { service, prisma } = createService()
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      explicitAbsenceMinutes: 45, absenceMinutes: 999, overtimeMinutes: 0,
      segments: [{ sequence: 0, checkInAt: new Date('2026-08-11T00:00:00Z'), checkOutAt: new Date('2026-08-11T04:00:00Z') }]
    }])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{
      id: 'schedule-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
    }])
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([{
      employeeId: 'employee-1', startDate: '2026-08-11', endDate: '2026-08-11', unit: 'HOUR', hours: new Prisma.Decimal(2)
    }])

    await expect(service.listAttendance('front-1')).resolves.toMatchObject([{
      workedMinutes: 240, absenceMinutes: 120, explicitAbsenceMinutes: 45
    }])
  })

  it('treats an explicit current rest-day schedule as authoritative while preserving raw attendance fields', async () => {
    const { service, prisma } = createService()
    const checkInAt = new Date('2026-08-11T00:00:00Z')
    const checkOutAt = new Date('2026-08-11T04:00:00Z')
    prisma.employeeAttendanceRecord.findMany.mockResolvedValue([{
      id: 'attendance-rest', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isScheduledWorkday: true, scheduledMinutes: 480, workedMinutes: 240, lateMinutes: 20, earlyLeaveMinutes: 30,
      explicitAbsenceMinutes: 60, absenceMinutes: 240, overtimeMinutes: 45, remark: '保留原始信息',
      segments: [{ sequence: 0, checkInAt, checkOutAt }]
    }])
    prisma.employeeMonthlyScheduleDay.findMany.mockResolvedValue([{
      id: 'schedule-rest', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isWorkday: false, scheduledMinutes: 0, segments: []
    }])

    await expect(service.listAttendance('front-1')).resolves.toMatchObject([{
      isScheduledWorkday: false,
      scheduledMinutes: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      explicitAbsenceMinutes: 60,
      absenceMinutes: 0,
      overtimeMinutes: 45,
      remark: '保留原始信息',
      actualSegments: [{ checkInAt, checkOutAt }]
    }])
  })

  it('validates 24:00 only as a planned end while actual instants remain 00:00-23:59', async () => {
    const validPlan = plainToInstance(ScheduleSegmentDto, { startTime: '16:00', endTime: '24:00' })
    expect(await validate(validPlan)).toHaveLength(0)
    expect(await validate(plainToInstance(ScheduleSegmentDto, { startTime: '24:00', endTime: '24:00' }))).not.toHaveLength(0)
    expect(await validate(plainToInstance(ActualAttendanceSegmentDto, {
      checkInAt: '2026-08-11T24:00:00+08:00', checkOutAt: '2026-08-11T24:30:00+08:00'
    }))).not.toHaveLength(0)
  })

  it('transforms comma-separated leave employeeIds and validates each non-empty value', async () => {
    const query = plainToInstance(AttendanceListQueryDto, { employeeIds: ' employee-1,employee-2 ' })

    expect(await validate(query)).toHaveLength(0)
    expect(query.employeeIds).toEqual(['employee-1', 'employee-2'])

    const invalid = plainToInstance(AttendanceListQueryDto, { employeeIds: 'employee-1, ,employee-2' })
    expect(await validate(invalid)).not.toHaveLength(0)
  })

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

  it('upserts a manual attendance date and replaces its interval children', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({
      id: 'schedule-1', employeeId: 'employee-1', date: '2026-08-10', isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
    })
    prisma.employeeAttendanceRecord.upsert.mockResolvedValue({ id: 'existing', employeeId: 'employee-1', date: '2026-08-10' })

    await service.createAttendance('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', actualSegments: [], explicitAbsenceMinutes: 480
    })

    expect(prisma.employeeAttendanceRecord.upsert).toHaveBeenCalled()
    expect(prisma.employeeAttendanceSegment.deleteMany).toHaveBeenCalledWith({
      where: { frontendUserId: 'front-1', attendanceRecordId: 'existing' }
    })
  })

  it('derives punctuality from ordered manual actual intervals against the monthly plan', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeAttendanceRecord.findFirst.mockResolvedValue(null)
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({
      id: 'schedule-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '12:00' }, { sequence: 1, startTime: '13:00', endTime: '17:00' }]
    })
    prisma.employeeAttendanceRecord.upsert.mockImplementation(async ({ create }: any) => ({ id: 'attendance-1', ...create }))

    const saved = await service.createAttendance('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-11', explicitAbsenceMinutes: 999, overtimeMinutes: 37, remark: '',
      actualSegments: [
        { checkInAt: '2026-08-11T08:10:00+08:00', checkOutAt: '2026-08-11T12:00:00+08:00' },
        { checkInAt: '2026-08-11T13:00:00+08:00', checkOutAt: '2026-08-11T16:50:00+08:00' }
      ]
    })

    expect(saved).toMatchObject({ workedMinutes: 460, lateMinutes: 10, earlyLeaveMinutes: 10, absenceMinutes: 20, overtimeMinutes: 37 })
    expect(saved.actualSegments).toHaveLength(2)
  })

  it('subtracts approved hourly leave minutes from uncovered planned minutes', async () => {
    const { service, prisma } = createService()
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({
      id: 'schedule-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
    })
    prisma.employeeAttendanceRecord.findFirst.mockResolvedValue({
      id: 'attendance-1', employeeId: 'employee-1', date: '2026-08-11', absenceMinutes: 120,
      segments: [{ sequence: 0, checkInAt: new Date('2026-08-11T00:00:00Z'), checkOutAt: new Date('2026-08-11T06:00:00Z') }]
    })
    prisma.employeeLeaveRequest.findMany.mockResolvedValue([{
      unit: 'HOUR', hours: new Prisma.Decimal(2), countedDays: new Prisma.Decimal(0.25)
    }])

    await expect((service as any).calculateAttendanceForDate('front-1', 'employee-1', '2026-08-11'))
      .resolves.toMatchObject({ absenceMinutes: 0 })
  })

  it('rejects actual intervals that overlap or leave the Beijing business date', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeAttendanceRecord.findFirst.mockResolvedValue(null)
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({
      id: 'schedule-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-11',
      isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '12:00' }, { sequence: 1, startTime: '13:00', endTime: '17:00' }]
    })
    const base = { employeeId: 'employee-1', date: '2026-08-11', explicitAbsenceMinutes: 0, overtimeMinutes: 0 }

    await expect(service.createAttendance('front-1', 'front-1', { ...base, actualSegments: [
      { checkInAt: '2026-08-11T08:00:00+08:00', checkOutAt: '2026-08-11T13:30:00+08:00' },
      { checkInAt: '2026-08-11T13:00:00+08:00', checkOutAt: '2026-08-11T17:00:00+08:00' }
    ] })).rejects.toThrow('重叠')
    await expect(service.createAttendance('front-1', 'front-1', { ...base, actualSegments: [
      { checkInAt: '2026-08-10T23:50:00+08:00', checkOutAt: '2026-08-11T08:00:00+08:00' }
    ] })).rejects.toThrow('北京业务考勤日期')
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

  it('converts hourly leave from a monthly-only schedule without a weekly row', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 360 })
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

  it('uses monthly minutes when weekly and monthly schedules disagree on hourly leave counting', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 240 })
    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 480 })
    prisma.employeeLeaveRequest.create.mockResolvedValue({ id: 'leave-1' })

    await service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'HOUR', hours: 3, reason: '事假'
    })

    const createArg = prisma.employeeLeaveRequest.create.mock.calls[0][0]
    expect(Number(createArg.data.countedDays)).toBe(0.75)
  })

  it('enforces the monthly duration when weekly and monthly schedules disagree on hourly leave', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 120 })
    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 480 })
    prisma.employeeLeaveRequest.create.mockResolvedValue({ id: 'unexpected-leave' })

    await expect(service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'HOUR', hours: 3, reason: '事假'
    })).rejects.toThrow('请假小时不能超过当日排班时长')

    expect(prisma.employeeLeaveRequest.create).not.toHaveBeenCalled()
  })

  it('rejects full-day leave when the monthly schedule is a rest day even if weekly says workday', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeLeaveRequest.findFirst.mockResolvedValue(null)
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({ isWorkday: false, scheduledMinutes: 0 })
    prisma.employeeWeeklySchedule.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 480 })
    prisma.employeeLeaveRequest.create.mockResolvedValue({ id: 'unexpected-leave' })

    await expect(service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'FULL_DAY', reason: '事假'
    })).rejects.toThrow('请假日期不包含排班工作日')

    expect(prisma.employeeLeaveRequest.create).not.toHaveBeenCalled()
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
      employeeId: 'employee-1', date: '2026-08-10', actualSegments: [], explicitAbsenceMinutes: 480
    })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.employeeAttendanceRecord.upsert).not.toHaveBeenCalled()
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
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue(null)

    await expect(service.createLeaveRequest('front-1', 'front-1', {
      employeeId: 'employee-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-10', endDate: '2026-08-10',
      unit: 'HOUR', hours: 1, reason: '事假'
    })).rejects.toBeInstanceOf(ConflictException)

    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 360 })
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
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({
      id: 'schedule-1', employeeId: 'employee-1', date: '2026-08-10', isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
    })
    prisma.employeeAttendanceRecord.upsert.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: 'test'
    }))

    await expect(service.createAttendance('front-1', 'front-1', {
      employeeId: 'employee-1', date: '2026-08-10', actualSegments: [], explicitAbsenceMinutes: 480
    })).rejects.toBeInstanceOf(ConflictException)
  })

  it('serializes leave overlap checking and creation inside one transaction', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', active: true })
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 480 })
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
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({ isWorkday: true, scheduledMinutes: 480 })
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

  it('filters leave requests for multiple employees without narrowing an empty employee list', async () => {
    const { service, prisma } = createService()

    await service.listLeaveRequests('front-1', {
      employeeIds: ['employee-1', 'employee-2'], startDate: '2026-08-10', endDate: '2026-08-20', status: EmployeeLeaveStatus.APPROVED
    })
    expect(prisma.employeeLeaveRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
      frontendUserId: 'front-1', employeeId: { in: ['employee-1', 'employee-2'] }, status: EmployeeLeaveStatus.APPROVED,
      startDate: { lte: '2026-08-20' }, endDate: { gte: '2026-08-10' }
    } }))

    await service.listLeaveRequests('front-1', { employeeIds: [] })
    expect(prisma.employeeLeaveRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { frontendUserId: 'front-1' } }))
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

  it('derives workday minutes from a non-overnight planned shift and normalizes rest days', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeWeeklySchedule.create.mockImplementation(async ({ data }: any) => ({ id: 'weekly-1', ...data }))

    const workday: any = await service.createWeeklySchedule('front-1', 'front-1', {
      employeeId: 'employee-1', weekday: 1, isWorkday: true,
      plannedStartTime: '08:30', plannedEndTime: '17:30', scheduledMinutes: 1
    } as any)
    expect(workday).toMatchObject({ plannedStartTime: '08:30', plannedEndTime: '17:30', scheduledMinutes: 540 })

    prisma.employeeWeeklySchedule.create.mockImplementation(async ({ data }: any) => ({ id: 'weekly-2', ...data }))
    const rest: any = await service.createWeeklySchedule('front-1', 'front-1', {
      employeeId: 'employee-1', weekday: 0, isWorkday: false,
      plannedStartTime: '08:30', plannedEndTime: '17:30', scheduledMinutes: 540
    } as any)
    expect(rest).toMatchObject({ plannedStartTime: null, plannedEndTime: null, scheduledMinutes: 0 })
  })

  it('rejects missing or overnight planned shift times', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    await expect(service.createWeeklySchedule('front-1', 'front-1', {
      employeeId: 'employee-1', weekday: 1, isWorkday: true, scheduledMinutes: 480
    } as any)).rejects.toThrow('计划上下班时间')
    await expect(service.createWeeklySchedule('front-1', 'front-1', {
      employeeId: 'employee-1', weekday: 1, isWorkday: true,
      plannedStartTime: '20:00', plannedEndTime: '08:00', scheduledMinutes: 720
    } as any)).rejects.toThrow('暂不支持跨日排班')
  })

  it('rejects a zero-minute monthly workday and invalid actual interval endpoints', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1' })
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValueOnce({
      id: 'schedule-1', employeeId: 'employee-1', date: '2026-08-10', isWorkday: true, scheduledMinutes: 0, segments: []
    }).mockResolvedValue({
      id: 'schedule-1', employeeId: 'employee-1', date: '2026-08-10', isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
    })

    const base = { employeeId: 'employee-1', date: '2026-08-10', explicitAbsenceMinutes: 0 }
    await expect(service.createAttendance('front-1', 'front-1', { ...base, actualSegments: [] })).rejects.toThrow('排班工作日时长必须大于 0')
    await expect(service.createAttendance('front-1', 'front-1', { ...base, actualSegments: [{ checkInAt: '2026-08-10T08:00:00+08:00' } as any] })).rejects.toThrow('必须同时填写')
    await expect(service.createAttendance('front-1', 'front-1', { ...base, actualSegments: [{ checkInAt: '2026-08-10T08:00:00', checkOutAt: '2026-08-10T17:00:00' }] })).rejects.toThrow('时区')
    await expect(service.createAttendance('front-1', 'front-1', { ...base, actualSegments: [{ checkInAt: '2026-08-10T17:00:00+08:00', checkOutAt: '2026-08-10T08:00:00+08:00' }] })).rejects.toThrow('下班时间必须晚于上班时间')
  })

  it('keeps trusted stored punch instants valid when a partial update changes only the remark', async () => {
    const { service, prisma } = createService()
    const current = {
      id: 'attendance-1', frontendUserId: 'front-1', employeeId: 'employee-1', date: '2026-08-10',
      isScheduledWorkday: true, scheduledMinutes: 480,
      checkInAt: new Date('2026-08-10T00:00:00.000Z'), checkOutAt: new Date('2026-08-10T09:00:00.000Z'),
      workedMinutes: 480, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0, overtimeMinutes: 0,
      remark: null, payrollLockedAt: null,
      segments: [{ sequence: 0, checkInAt: new Date('2026-08-10T00:00:00.000Z'), checkOutAt: new Date('2026-08-10T09:00:00.000Z') }]
    }
    prisma.employeeMonthlyScheduleDay.findFirst.mockResolvedValue({
      id: 'schedule-1', employeeId: 'employee-1', date: '2026-08-10', isWorkday: true, scheduledMinutes: 480,
      segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }]
    })
    prisma.employeeAttendanceRecord.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(null)
    prisma.employeeAttendanceRecord.update.mockImplementation(async ({ data }: any) => ({ ...current, ...data }))

    await expect(service.updateAttendance('front-1', 'front-1', current.id, { remark: '修正备注' }))
      .resolves.toMatchObject({ remark: '修正备注' })
    expect(prisma.employeeAttendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ remark: '修正备注', manuallyEdited: true })
    }))
  })

  it('deactivates instead of deleting when any scheduling history exists', async () => {
    const { service, prisma } = createService()
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee-1', frontendUserId: 'front-1', terminationDate: null, photoPath: null })
    prisma.employeeWeeklySchedule.count.mockResolvedValue(1)
    prisma.employee.update.mockResolvedValue({ id: 'employee-1', status: EmployeeStatus.INACTIVE, terminationDate: '2026-08-10' })

    await service.deleteEmployee('front-1', 'front-1', 'employee-1')

    expect(prisma.employee.update).toHaveBeenCalled()
    expect(prisma.employee.delete).not.toHaveBeenCalled()
  })

  it('allows referenced types only to transition from active to inactive', async () => {
    const { service, prisma } = createService()
    prisma.employeeLeaveType.findFirst.mockResolvedValue({ id: 'leave-type-1', frontendUserId: 'front-1', name: '事假', active: true, countsTowardRestQuota: true })
    prisma.employeeLeaveRequest.count.mockResolvedValue(1)
    await expect(service.updateLeaveType('front-1', 'front-1', 'leave-type-1', { name: '新事假' })).rejects.toThrow('已使用')
    prisma.employeeLeaveType.update.mockResolvedValue({ id: 'leave-type-1', active: false })
    await expect(service.updateLeaveType('front-1', 'front-1', 'leave-type-1', { active: false })).resolves.toMatchObject({ active: false })

    prisma.employeeCommissionType.findFirst.mockResolvedValue({ id: 'commission-type-1', frontendUserId: 'front-1', name: '送样', unitName: '份', unitPrice: new Prisma.Decimal(10), active: true })
    prisma.employeeCommissionRecord.count.mockResolvedValue(1)
    await expect(service.updateCommissionType('front-1', 'front-1', 'commission-type-1', { unitPrice: 20 })).rejects.toThrow('已使用')
  })

  it('allows an existing record to retain its now-inactive type but rejects reassignment to another inactive type', async () => {
    const { service, prisma } = createService()
    prisma.employeeCommissionRecord.findFirst.mockResolvedValue({
      id: 'record-1', frontendUserId: 'front-1', employeeId: 'employee-1', commissionTypeId: 'type-old',
      date: '2026-08-10', quantity: new Prisma.Decimal(1), unitPriceSnapshot: new Prisma.Decimal(10), payrollLockedAt: null
    })
    prisma.employeeCommissionType.findFirst.mockResolvedValue({ id: 'type-old', frontendUserId: 'front-1', active: false, unitPrice: new Prisma.Decimal(10) })
    prisma.employeeCommissionRecord.update.mockImplementation(async ({ data }: any) => ({ id: 'record-1', ...data }))
    await expect(service.updateCommissionRecord('front-1', 'front-1', 'record-1', { commissionTypeId: 'type-old', quantity: 2 })).resolves.toBeTruthy()

    prisma.employeeCommissionType.findFirst.mockResolvedValue({ id: 'type-new', frontendUserId: 'front-1', active: false, unitPrice: new Prisma.Decimal(10) })
    await expect(service.updateCommissionRecord('front-1', 'front-1', 'record-1', { commissionTypeId: 'type-new' })).rejects.toThrow('已停用')
  })
})
