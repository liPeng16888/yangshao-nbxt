import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import {
  EmployeeAuditAction,
  EmployeeLeaveStatus,
  EmployeeLeaveUnit,
  EmployeePayrollStatus,
  EmployeeStatus,
  Prisma
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { EmployeeDataCipherService } from './employee-data-cipher.service'
import { PrivateEmployeePhotoService } from './private-employee-photo.service'
import { PayrollMonthLockService } from './payroll-month-lock.service'
import type {
  AttendanceDto,
  AttendanceListQueryDto,
  BonusDto,
  CommissionRecordDto,
  CommissionTypeDto,
  CreateEmployeeDto,
  DateOverrideDto,
  EmployeeQueryDto,
  GenerateAttendanceDto,
  LeaveRequestDto,
  LeaveTypeDto,
  BatchMonthlyScheduleDto,
  CopyMonthlyScheduleDto,
  MonthlyScheduleDayDto,
  MonthlySettingDto,
  WeeklyScheduleDto
} from './employee-attendance.dto'
import { breakMinutes, deriveAttendanceMetrics, normalizeClockIntervals, scheduledMinutes, type ActualInterval, type ClockInterval } from './attendance-intervals'

type PrismaDelegate = { findFirst(args: any): Promise<any> }

type MonthlySchedulePayload = Pick<MonthlyScheduleDayDto, 'employeeId' | 'date' | 'isWorkday' | 'segments' | 'remark'>
type BatchMonthlySchedulePayload = Omit<MonthlySchedulePayload, 'date'> & Pick<BatchMonthlyScheduleDto, 'dates'>

class PayrollLockPlanChanged extends Error {
  constructor(readonly months: string[]) { super('payroll lock plan changed') }
}

@Injectable()
export class EmployeeAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: EmployeeDataCipherService,
    @Optional() private readonly photos?: PrivateEmployeePhotoService,
    @Optional() private readonly monthLocks?: PayrollMonthLockService
  ) {}

  async listEmployees(frontendUserId: string, query: EmployeeQueryDto = {}) {
    const rows = await this.prisma.employee.findMany({
      where: {
        frontendUserId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.keyword ? { OR: [
          { employeeNumber: { contains: query.keyword, mode: 'insensitive' } },
          { name: { contains: query.keyword, mode: 'insensitive' } },
          { phone: { contains: query.keyword, mode: 'insensitive' } }
        ] } : {})
      },
      orderBy: [{ status: 'asc' }, { employeeNumber: 'asc' }]
    })
    return rows.map((row) => this.employeeDto(row, false))
  }

  async getEmployee(frontendUserId: string, id: string) {
    return this.employeeDto(await this.owned(this.prisma.employee, frontendUserId, id, '员工不存在'), false)
  }

  async revealEmployee(frontendUserId: string, actorUserId: string, id: string) {
    const employee = await this.owned(this.prisma.employee, frontendUserId, id, '员工不存在')
    await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.REVEAL, 'Employee', id)
    return this.employeeDto(employee, true)
  }

  async createEmployee(frontendUserId: string, actorUserId: string, payload: CreateEmployeeDto) {
    this.assertDate(payload.hireDate)
    if (payload.terminationDate) this.assertDate(payload.terminationDate)
    if (payload.terminationDate && payload.terminationDate < payload.hireDate) throw new BadRequestException('离职日期不能早于入职日期')
    const employeeNumber = this.required(payload.employeeNumber, '员工编号')
    if (await this.prisma.employee.findFirst({ where: { frontendUserId, employeeNumber } })) {
      throw new ConflictException('员工编号已存在')
    }
    try {
      const row = await this.configurationAtomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'Employee', (created) => created.id, (tx) => tx.employee.create({ data: {
        frontendUserId,
        employeeNumber,
        name: this.required(payload.name, '员工姓名'),
        status: payload.status || EmployeeStatus.ACTIVE,
        phone: this.optional(payload.phone),
        idCardCipher: this.encryptOptional(payload.idCard),
        bankCardCipher: this.encryptOptional(payload.bankCard),
        addressCipher: this.encryptOptional(payload.address),
        emergencyContactCipher: this.encryptOptional(payload.emergencyContact),
        hireDate: payload.hireDate,
        terminationDate: this.optional(payload.terminationDate),
        baseSalary: this.nonnegative(payload.baseSalary, '基本月薪'),
        attendanceBonus: this.nonnegative(payload.attendanceBonus, '全勤奖'),
        overtimeHourlyRate: this.nonnegative(payload.overtimeHourlyRate, '加班时薪'),
        restQuotaDays: this.nonnegative(payload.restQuotaDays, '月休额度')
      } }))
      return this.employeeDto(row, false)
    } catch (error) { this.rethrowConflict(error, '员工编号已存在') }
  }

  async updateEmployee(frontendUserId: string, actorUserId: string, id: string, payload: Partial<CreateEmployeeDto>) {
    await this.owned(this.prisma.employee, frontendUserId, id, '员工不存在')
    if (payload.hireDate) this.assertDate(payload.hireDate)
    if (payload.terminationDate) this.assertDate(payload.terminationDate)
    try {
      const row = await this.configurationTransaction(frontendUserId, async (tx) => {
        const lockedCurrent = await this.owned(tx.employee, frontendUserId, id, '员工不存在')
        const hireDate = payload.hireDate || lockedCurrent.hireDate
        const terminationDate = payload.terminationDate === undefined ? lockedCurrent.terminationDate : this.optional(payload.terminationDate)
        if (terminationDate && terminationDate < hireDate) throw new BadRequestException('离职日期不能早于入职日期')
        const updated = await tx.employee.update({ where: { id }, data: {
          ...(payload.employeeNumber !== undefined ? { employeeNumber: this.required(payload.employeeNumber, '员工编号') } : {}),
          ...(payload.name !== undefined ? { name: this.required(payload.name, '员工姓名') } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.phone !== undefined ? { phone: this.optional(payload.phone) } : {}),
          ...(payload.idCard !== undefined ? { idCardCipher: this.encryptOptional(payload.idCard) } : {}),
          ...(payload.bankCard !== undefined ? { bankCardCipher: this.encryptOptional(payload.bankCard) } : {}),
          ...(payload.address !== undefined ? { addressCipher: this.encryptOptional(payload.address) } : {}),
          ...(payload.emergencyContact !== undefined ? { emergencyContactCipher: this.encryptOptional(payload.emergencyContact) } : {}),
          ...(payload.hireDate !== undefined ? { hireDate: payload.hireDate } : {}),
          ...(payload.terminationDate !== undefined ? { terminationDate } : {}),
          ...(payload.baseSalary !== undefined ? { baseSalary: this.nonnegative(payload.baseSalary, '基本月薪') } : {}),
          ...(payload.attendanceBonus !== undefined ? { attendanceBonus: this.nonnegative(payload.attendanceBonus, '全勤奖') } : {}),
          ...(payload.overtimeHourlyRate !== undefined ? { overtimeHourlyRate: this.nonnegative(payload.overtimeHourlyRate, '加班时薪') } : {}),
          ...(payload.restQuotaDays !== undefined ? { restQuotaDays: this.nonnegative(payload.restQuotaDays, '月休额度') } : {})
        } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'Employee', id, undefined, tx)
        return updated
      })
      return this.employeeDto(row, false)
    } catch (error) { this.rethrowConflict(error, '员工编号已存在') }
  }

  async deleteEmployee(frontendUserId: string, actorUserId: string, id: string) {
    await this.owned(this.prisma.employee, frontendUserId, id, '员工不存在')
    const result = await this.configurationTransaction(frontendUserId, async (tx) => {
      const employee = await this.owned(tx.employee, frontendUserId, id, '员工不存在')
      const historyCounts = await Promise.all([
        tx.employeeWeeklySchedule.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeeDateOverride.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeeMonthlySetting.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeeMonthlyScheduleDay.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeeAttendanceRecord.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeeLeaveRequest.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeeCommissionRecord.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeeBonus.count({ where: { frontendUserId, employeeId: id } }),
        tx.employeePayrollItem.count({ where: { frontendUserId, employeeId: id } })
      ])
      if (historyCounts.some(Boolean)) {
        const row = await tx.employee.update({ where: { id }, data: {
          status: EmployeeStatus.INACTIVE,
          terminationDate: employee.terminationDate || this.today()
        } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'Employee', id, '存在历史记录，已停用', tx)
        return { deactivated: true as const, row, photoPath: null }
      }
      await tx.employee.delete({ where: { id } })
      await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'Employee', id, undefined, tx)
      return { deactivated: false as const, row: null, photoPath: employee.photoPath }
    })
    if (result.deactivated) return this.employeeDto(result.row, false)
    await this.cleanupPhoto(result.photoPath)
    return { ok: true }
  }

  listWeeklySchedules(frontendUserId: string, employeeId?: string) {
    return this.prisma.employeeWeeklySchedule.findMany({ where: { frontendUserId, ...(employeeId ? { employeeId } : {}) }, orderBy: [{ employeeId: 'asc' }, { weekday: 'asc' }] })
  }

  async createWeeklySchedule(frontendUserId: string, actorUserId: string, payload: WeeklyScheduleDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertWeekday(payload.weekday)
    const schedule = this.scheduleData(payload)
    try {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeWeeklySchedule', (created) => created.id,
        (tx) => tx.employeeWeeklySchedule.create({ data: { frontendUserId, employeeId: payload.employeeId, weekday: payload.weekday, ...schedule } }))
      return row
    } catch (error) { this.rethrowConflict(error, '该员工星期排班已存在') }
  }

  async updateWeeklySchedule(frontendUserId: string, actorUserId: string, id: string, payload: Partial<WeeklyScheduleDto>) {
    const current = await this.owned(this.prisma.employeeWeeklySchedule, frontendUserId, id, '排班不存在')
    if (payload.employeeId) await this.assertEmployee(frontendUserId, payload.employeeId)
    if (payload.weekday !== undefined) this.assertWeekday(payload.weekday)
    const schedule = this.scheduleData(payload, current)
    try {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeWeeklySchedule', current.id, (tx) => tx.employeeWeeklySchedule.update({ where: { id }, data: {
        ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
        ...(payload.weekday !== undefined ? { weekday: payload.weekday } : {}),
        ...schedule
      } }))
      return row
    } catch (error) { this.rethrowConflict(error, '该员工星期排班已存在') }
  }

  async deleteWeeklySchedule(frontendUserId: string, actorUserId: string, id: string) {
    await this.owned(this.prisma.employeeWeeklySchedule, frontendUserId, id, '排班不存在')
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeWeeklySchedule', id, (tx) => tx.employeeWeeklySchedule.delete({ where: { id } }))
    return { ok: true }
  }

  listDateOverrides(frontendUserId: string, query: AttendanceListQueryDto = {}) {
    return this.prisma.employeeDateOverride.findMany({ where: {
      frontendUserId,
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...this.dateWhere(query)
    }, orderBy: [{ date: 'asc' }, { employeeId: 'asc' }] })
  }

  async createDateOverride(frontendUserId: string, actorUserId: string, payload: DateOverrideDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertDate(payload.date)
    await this.assertMonthWritable(frontendUserId, payload.date)
    const duplicate = await this.prisma.employeeDateOverride.findFirst({ where: { frontendUserId, employeeId: payload.employeeId, date: payload.date } })
    if (duplicate) throw new ConflictException('该员工当日已有临时调班')
    const schedule = this.scheduleData(payload)
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeDateOverride', (created) => created.id,
        (tx) => tx.employeeDateOverride.create({ data: {
          frontendUserId, employeeId: payload.employeeId, date: payload.date, ...schedule, remark: this.optional(payload.remark)
        } }), undefined, [payload.date])
    } catch (error) { this.rethrowConflict(error, '该员工当日已有临时调班') }
  }

  async updateDateOverride(frontendUserId: string, actorUserId: string, id: string, payload: Partial<DateOverrideDto>) {
    const current = await this.owned(this.prisma.employeeDateOverride, frontendUserId, id, '临时调班不存在')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    try {
      return await this.withCurrentPayrollSource(
        frontendUserId,
        [current.date, date],
        (tx) => this.owned(tx.employeeDateOverride, frontendUserId, id, '临时调班不存在'),
        (locked) => [locked.date, payload.date || locked.date],
        async (tx, locked) => {
          const targetDate = payload.date || locked.date
          this.assertDate(locked.date)
          this.assertDate(targetDate)
          if (payload.employeeId) await this.owned(tx.employee, frontendUserId, payload.employeeId, '员工不存在')
          const duplicate = await tx.employeeDateOverride.findFirst({ where: {
            frontendUserId, employeeId: payload.employeeId || locked.employeeId, date: targetDate, id: { not: id }
          } })
          if (duplicate) throw new ConflictException('该员工当日已有临时调班')
          const schedule = this.scheduleData(payload, locked)
          const row = await tx.employeeDateOverride.update({ where: { id }, data: {
            ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
            ...(payload.date !== undefined ? { date: payload.date } : {}),
            ...schedule,
            ...(payload.remark !== undefined ? { remark: this.optional(payload.remark) } : {})
          } })
          await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeDateOverride', id, undefined, tx)
          return row
        }
      )
    } catch (error) { this.rethrowConflict(error, '该员工当日已有临时调班') }
  }

  async deleteDateOverride(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeDateOverride, frontendUserId, id, '临时调班不存在')
    await this.withCurrentPayrollSource(
      frontendUserId,
      [row.date],
      (tx) => this.owned(tx.employeeDateOverride, frontendUserId, id, '临时调班不存在'),
      (locked) => [locked.date],
      async (tx) => {
        await tx.employeeDateOverride.delete({ where: { id } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeDateOverride', id, undefined, tx)
      }
    )
    return { ok: true }
  }

  listMonthlySettings(frontendUserId: string, month?: string) {
    if (month) this.assertMonth(month)
    return this.prisma.employeeMonthlySetting.findMany({ where: { frontendUserId, ...(month ? { month } : {}) }, orderBy: [{ month: 'desc' }, { employeeId: 'asc' }] })
  }

  async upsertMonthlySetting(frontendUserId: string, actorUserId: string, payload: MonthlySettingDto) {
    this.assertMonth(payload.month)
    return this.payrollMonthLocks().run(frontendUserId, [payload.month], async (tx) => {
      await this.assertMonthsWritable(frontendUserId, [payload.month], tx)
      await this.owned(tx.employee, frontendUserId, payload.employeeId, '员工不存在')
      const scheduledWorkDays = await tx.employeeMonthlyScheduleDay.count({ where: {
        frontendUserId, employeeId: payload.employeeId, isWorkday: true, date: { startsWith: payload.month }
      } })
      const row = await tx.employeeMonthlySetting.upsert({
        where: { employeeId_month: { employeeId: payload.employeeId, month: payload.month } },
        create: { frontendUserId, employeeId: payload.employeeId, month: payload.month, scheduledWorkDays, restQuotaDays: this.nonnegative(payload.restQuotaDays, '月休额度') },
        update: { scheduledWorkDays, restQuotaDays: this.nonnegative(payload.restQuotaDays, '月休额度') }
      })
      await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeMonthlySetting', row.id, `月份=${payload.month}; 排班工作日=${scheduledWorkDays}`, tx)
      return row
    })
  }

  async deleteMonthlySetting(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeMonthlySetting, frontendUserId, id, '月度设置不存在')
    await this.assertMonthWritable(frontendUserId, row.month)
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeMonthlySetting', id, (tx) => tx.employeeMonthlySetting.delete({ where: { id } }), undefined, [row.month])
    return { ok: true }
  }

  async listMonthlySchedules(frontendUserId: string, employeeId: string, month: string) {
    this.assertMonth(month)
    await this.assertEmployee(frontendUserId, employeeId)
    const rows = await this.prisma.employeeMonthlyScheduleDay.findMany({
      where: { frontendUserId, employeeId, date: { startsWith: month } },
      include: { segments: { orderBy: { sequence: 'asc' } } },
      orderBy: { date: 'asc' }
    })
    return rows.map((row) => this.monthlyScheduleDto(row))
  }

  async saveMonthlyScheduleDay(frontendUserId: string, actorUserId: string, payload: MonthlySchedulePayload) {
    this.assertDate(payload.date)
    const normalized = this.normalizedMonthlySegments(payload)
    return this.withMonthlyScheduleSerialization(frontendUserId, payload.employeeId, [payload.date], async (tx) => {
      const current = await tx.employeeMonthlyScheduleDay.findFirst({ where: { frontendUserId, employeeId: payload.employeeId, date: payload.date } })
      if (current?.payrollLockedAt) throw new ConflictException('该排班记录已被工资确认锁定')
      const row = await this.replaceMonthlyScheduleDay(tx, frontendUserId, payload.employeeId, payload.date, payload.isWorkday, normalized, payload.remark)
      await this.audit(frontendUserId, actorUserId, current ? EmployeeAuditAction.UPDATE : EmployeeAuditAction.CREATE, 'EmployeeMonthlyScheduleDay', row.id, `员工=${payload.employeeId}; 日期=${payload.date}`, tx)
      return this.monthlyScheduleDto({ ...row, segments: this.scheduleSegmentsForResponse(normalized) })
    })
  }

  async deleteMonthlyScheduleDay(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeMonthlyScheduleDay, frontendUserId, id, '月度排班不存在')
    return this.withCurrentPayrollSource(
      frontendUserId,
      [row.date],
      (tx) => this.owned(tx.employeeMonthlyScheduleDay, frontendUserId, id, '月度排班不存在'),
      (locked) => [locked.date],
      async (tx, locked) => {
        await this.owned(tx.employee, frontendUserId, locked.employeeId, '员工不存在')
        if (locked.payrollLockedAt) throw new ConflictException('该排班记录已被工资确认锁定')
        await this.clearDeletedScheduleAttendance(tx, frontendUserId, locked.employeeId, [locked.date])
        await tx.employeeMonthlyScheduleDay.delete({ where: { id } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeMonthlyScheduleDay', id, `员工=${locked.employeeId}; 日期=${locked.date}`, tx)
        return { ok: true }
      }
    )
  }

  async batchSaveMonthlySchedules(frontendUserId: string, actorUserId: string, payload: BatchMonthlySchedulePayload) {
    const dates = Array.from(new Set(payload.dates || [])).sort()
    if (!dates.length) throw new BadRequestException('请选择排班日期')
    dates.forEach((date) => this.assertDate(date))
    const normalized = this.normalizedMonthlySegments(payload)
    return this.withMonthlyScheduleSerialization(frontendUserId, payload.employeeId, dates, async (tx) => {
      const currentRows = await tx.employeeMonthlyScheduleDay.findMany({ where: { frontendUserId, employeeId: payload.employeeId, date: { in: dates } } })
      if (currentRows.some((row) => row.payrollLockedAt)) throw new ConflictException('存在已被工资确认锁定的排班记录')
      const currentByDate = new Map(currentRows.map((row) => [row.date, row]))
      const rows = []
      for (const date of dates) {
        const row = await this.replaceMonthlyScheduleDay(tx, frontendUserId, payload.employeeId, date, payload.isWorkday, normalized, payload.remark)
        await this.audit(frontendUserId, actorUserId, currentByDate.has(date) ? EmployeeAuditAction.UPDATE : EmployeeAuditAction.CREATE, 'EmployeeMonthlyScheduleDay', row.id, `员工=${payload.employeeId}; 日期=${date}; 批量排班`, tx)
        rows.push(this.monthlyScheduleDto({ ...row, segments: this.scheduleSegmentsForResponse(normalized) }))
      }
      return { rows, updated: rows.length, overwritten: currentByDate.size }
    })
  }

  async copyPreviousMonthSchedules(frontendUserId: string, actorUserId: string, payload: Pick<CopyMonthlyScheduleDto, 'employeeId' | 'targetMonth' | 'overwrite'>) {
    this.assertMonth(payload.targetMonth)
    const sourceMonth = this.previousMonth(payload.targetMonth)
    return this.withMonthlyScheduleSerialization(frontendUserId, payload.employeeId, [sourceMonth, payload.targetMonth], async (tx) => {
      const [source, target] = await Promise.all([
        tx.employeeMonthlyScheduleDay.findMany({
          where: { frontendUserId, employeeId: payload.employeeId, date: { startsWith: sourceMonth } },
          include: { segments: { orderBy: { sequence: 'asc' } } }, orderBy: { date: 'asc' }
        }),
        tx.employeeMonthlyScheduleDay.findMany({
          where: { frontendUserId, employeeId: payload.employeeId, date: { startsWith: payload.targetMonth } },
          include: { segments: { orderBy: { sequence: 'asc' } } }, orderBy: { date: 'asc' }
        })
      ])
      if (!source.length) throw new BadRequestException('上月暂无可复制排班')
      if (target.some((row) => row.payrollLockedAt)) throw new ConflictException('存在已被工资确认锁定的排班记录')
      if (target.length && !payload.overwrite) throw new ConflictException('目标月份已有排班，请确认覆盖')
      const targetDates = new Set(this.monthDates(payload.targetMonth))
      const copies = source
        .filter((row) => targetDates.has(`${payload.targetMonth}-${row.date.slice(-2)}`))
        .map((row) => ({
          source: row,
          date: `${payload.targetMonth}-${row.date.slice(-2)}`,
          segments: row.isWorkday ? this.normalizedMonthlySegments({ ...row, segments: row.segments }) : []
        }))
      for (const targetRow of target) {
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeMonthlyScheduleDay', targetRow.id, `员工=${payload.employeeId}; 日期=${targetRow.date}; 覆盖复制删除`, tx)
      }
      const copiedDates = new Set(copies.map((copy) => copy.date))
      await this.clearDeletedScheduleAttendance(
        tx,
        frontendUserId,
        payload.employeeId,
        target.filter((row) => !copiedDates.has(row.date)).map((row) => row.date)
      )
      if (target.length) await tx.employeeMonthlyScheduleDay.deleteMany({ where: { frontendUserId, employeeId: payload.employeeId, date: { startsWith: payload.targetMonth } } })
      for (const copy of copies) {
        const row = await this.replaceMonthlyScheduleDay(tx, frontendUserId, payload.employeeId, copy.date, copy.source.isWorkday, copy.segments, copy.source.remark)
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeMonthlyScheduleDay', row.id, `员工=${payload.employeeId}; 从=${copy.source.date}; 到=${copy.date}`, tx)
      }
      return { copied: copies.length, targetMonth: payload.targetMonth }
    }, [payload.targetMonth])
  }

  listAttendance(frontendUserId: string, query: AttendanceListQueryDto = {}) {
    const where = {
      frontendUserId, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...this.dateWhere(query)
    }
    return this.prisma.employeeAttendanceRecord.findMany({ where, include: {
      employee: { select: { employeeNumber: true, name: true } },
      segments: { orderBy: { sequence: 'asc' } }
    }, orderBy: [{ date: 'desc' }, { employeeId: 'asc' }] }).then((rows) => this.currentAttendanceDtos(frontendUserId, rows))
  }

  async createAttendance(frontendUserId: string, actorUserId: string, payload: AttendanceDto) {
    this.assertDate(payload.date)
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeAttendanceRecord', (created) => created.id, async (tx) => {
        await this.owned(tx.employee, frontendUserId, payload.employeeId, '员工不存在')
        const prepared = await this.prepareAttendance(frontendUserId, payload, undefined, tx)
        const row = await tx.employeeAttendanceRecord.upsert({
          where: { employeeId_date: { employeeId: payload.employeeId, date: payload.date } },
          create: { frontendUserId, employeeId: payload.employeeId, date: payload.date, ...prepared.data, manuallyEdited: true },
          update: { ...prepared.data, manuallyEdited: true }
        })
        await this.replaceAttendanceSegments(tx, frontendUserId, row.id, prepared.actualSegments)
        return this.attendanceDto(row, prepared.actualSegments)
      }, undefined, [payload.date])
    } catch (error) { this.rethrowConflict(error, '该员工当日考勤已存在') }
  }

  async updateAttendance(frontendUserId: string, actorUserId: string, id: string, payload: Partial<AttendanceDto>) {
    const current = await this.owned(this.prisma.employeeAttendanceRecord, frontendUserId, id, '考勤记录不存在')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    try {
      return await this.withCurrentPayrollSource(
        frontendUserId,
        [current.date, date],
        async (tx) => {
          const row = await tx.employeeAttendanceRecord.findFirst({
            where: { id, frontendUserId }, include: { segments: { orderBy: { sequence: 'asc' } } }
          })
          if (!row) throw new NotFoundException('考勤记录不存在')
          return row
        },
        (locked) => [locked.date, payload.date || locked.date],
        async (tx, locked) => {
          if (locked.payrollLockedAt) throw new ConflictException('该考勤记录已被工资确认锁定')
          const targetDate = payload.date || locked.date
          this.assertDate(locked.date)
          this.assertDate(targetDate)
          if (payload.employeeId) await this.owned(tx.employee, frontendUserId, payload.employeeId, '员工不存在')
          const duplicate = await tx.employeeAttendanceRecord.findFirst({ where: {
            frontendUserId, employeeId: payload.employeeId || locked.employeeId, date: targetDate, id: { not: id }
          } })
          if (duplicate) throw new ConflictException('该员工当日考勤已存在')
          const prepared = await this.prepareAttendance(frontendUserId, payload, locked, tx)
          const row = await tx.employeeAttendanceRecord.update({ where: { id }, data: { ...prepared.data, manuallyEdited: true } })
          await this.replaceAttendanceSegments(tx, frontendUserId, id, prepared.actualSegments)
          await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeAttendanceRecord', id, undefined, tx)
          return this.attendanceDto(row, prepared.actualSegments)
        }
      )
    } catch (error) { this.rethrowConflict(error, '该员工当日考勤已存在') }
  }

  async calculateAttendanceForDate(frontendUserId: string, employeeId: string, date: string) {
    this.assertDate(date)
    const [schedule, attendance] = await Promise.all([
      this.prisma.employeeMonthlyScheduleDay.findFirst({
        where: { frontendUserId, employeeId, date },
        include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      this.prisma.employeeAttendanceRecord.findFirst({
        where: { frontendUserId, employeeId, date },
        include: { segments: { orderBy: { sequence: 'asc' } } }
      })
    ])
    if (!schedule) throw new ConflictException(`缺少 ${date} 的员工月度排班`)
    const actualSegments = (attendance?.segments || []).map((segment: any) => ({
      checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt
    }))
    const approvedLeaveMinutes = await this.approvedLeaveMinutes(frontendUserId, employeeId, date, schedule.scheduledMinutes, this.prisma)
    const metrics = this.metricsForSchedule(
      schedule,
      actualSegments,
      approvedLeaveMinutes,
      attendance?.explicitAbsenceMinutes || 0
    )
    return {
      employeeId, date,
      isScheduledWorkday: schedule.isWorkday,
      scheduledMinutes: schedule.isWorkday ? schedule.scheduledMinutes : 0,
      ...metrics,
      overtimeMinutes: attendance?.overtimeMinutes || 0,
      explicitAbsenceMinutes: attendance?.explicitAbsenceMinutes || 0,
      remark: attendance?.remark || null,
      actualSegments: actualSegments.map((segment) => ({ checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt }))
    }
  }

  async deleteAttendance(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeAttendanceRecord, frontendUserId, id, '考勤记录不存在')
    await this.withCurrentPayrollSource(
      frontendUserId,
      [row.date],
      (tx) => this.owned(tx.employeeAttendanceRecord, frontendUserId, id, '考勤记录不存在'),
      (locked) => [locked.date],
      async (tx, locked) => {
        if (locked.payrollLockedAt) throw new ConflictException('该考勤记录已被工资确认锁定')
        await tx.employeeAttendanceRecord.delete({ where: { id } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeAttendanceRecord', id, undefined, tx)
      }
    )
    return { ok: true }
  }

  async generateAttendance(frontendUserId: string, actorUserId: string, payload: GenerateAttendanceDto) {
    this.assertMonth(payload.month)
    await this.assertMonthWritable(frontendUserId, payload.month)
    const employeeIds = Array.from(new Set(payload.employeeIds || []))
    if (!employeeIds.length) throw new BadRequestException('请选择员工')
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeAttendanceGeneration', payload.month, async (tx) => {
        const employees = await tx.employee.findMany({
          where: { frontendUserId, id: { in: employeeIds } },
          select: { id: true, status: true, hireDate: true, terminationDate: true }
        })
        if (employees.length !== employeeIds.length) throw new NotFoundException('部分员工不存在')
        const [schedules, overrides, existing] = await Promise.all([
          tx.employeeWeeklySchedule.findMany({ where: { frontendUserId, employeeId: { in: employeeIds } } }),
          tx.employeeDateOverride.findMany({ where: { frontendUserId, employeeId: { in: employeeIds }, date: { startsWith: payload.month } } }),
          tx.employeeAttendanceRecord.findMany({ where: { frontendUserId, employeeId: { in: employeeIds }, date: { startsWith: payload.month } } })
        ])
        const scheduleMap = new Map(schedules.map((item) => [`${item.employeeId}:${item.weekday}`, item]))
        const overrideMap = new Map(overrides.map((item) => [`${item.employeeId}:${item.date}`, item]))
        const existingMap = new Map(existing.map((item) => [`${item.employeeId}:${item.date}`, item]))
        let created = 0
        let updated = 0
        let skippedManual = 0
        const writes: Array<{ id?: string; data: Prisma.EmployeeAttendanceRecordUncheckedCreateInput }> = []
        for (const employee of employees) {
          if (employee.status === EmployeeStatus.INACTIVE && !employee.terminationDate) continue
          for (const date of this.monthDates(payload.month)) {
            if (date < employee.hireDate || (employee.terminationDate && date > employee.terminationDate)) continue
            const override = overrideMap.get(`${employee.id}:${date}`)
            const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
            const schedule = override || scheduleMap.get(`${employee.id}:${weekday}`)
            const data = {
              frontendUserId, employeeId: employee.id, date,
              isScheduledWorkday: Boolean(schedule?.isWorkday),
              scheduledMinutes: schedule?.isWorkday ? this.minutes(schedule.scheduledMinutes) : 0,
              manuallyEdited: false
            }
            const current = existingMap.get(`${employee.id}:${date}`)
            if (current?.manuallyEdited) { skippedManual += 1; continue }
            if (current) { writes.push({ id: current.id, data }); updated += 1 }
            else { writes.push({ data }); created += 1 }
          }
        }
        for (const write of writes) {
          if (write.id) await tx.employeeAttendanceRecord.update({ where: { id: write.id }, data: write.data })
          else await tx.employeeAttendanceRecord.create({ data: write.data })
        }
        return { created, updated, skippedManual }
      }, undefined, [payload.month])
    } catch (error) { this.rethrowConflict(error, '批量生成考勤时发生并发重复，请刷新后重试') }
  }

  async listLeaveTypes(frontendUserId: string) {
    const rows = await this.prisma.employeeLeaveType.findMany({
      where: { frontendUserId },
      include: { _count: { select: { leaveRequests: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    })
    return rows.map(({ _count, ...row }) => ({ ...row, referenced: _count.leaveRequests > 0 }))
  }

  async createLeaveType(frontendUserId: string, actorUserId: string, payload: LeaveTypeDto) {
    try {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeLeaveType', (created) => created.id,
        (tx) => tx.employeeLeaveType.create({ data: { frontendUserId, name: this.required(payload.name, '请假类型'), active: payload.active ?? true, countsTowardRestQuota: payload.countsTowardRestQuota } }))
      return row
    } catch (error) { this.rethrowConflict(error, '请假类型名称已存在') }
  }

  async updateLeaveType(frontendUserId: string, actorUserId: string, id: string, payload: Partial<LeaveTypeDto>) {
    await this.owned(this.prisma.employeeLeaveType, frontendUserId, id, '请假类型不存在')
    try {
      const row = await this.configurationTransaction(frontendUserId, async (tx) => {
        const current = await this.owned(tx.employeeLeaveType, frontendUserId, id, '请假类型不存在')
        const referenced = await tx.employeeLeaveRequest.count({ where: { frontendUserId, leaveTypeId: id } })
        if (referenced && !this.referencedLeaveTypeUpdateAllowed(current, payload)) {
          throw new ConflictException('已使用的请假类型只允许停用')
        }
        const updated = await tx.employeeLeaveType.update({ where: { id }, data: {
          ...(payload.name !== undefined ? { name: this.required(payload.name, '请假类型') } : {}),
          ...(payload.active !== undefined ? { active: payload.active } : {}),
          ...(payload.countsTowardRestQuota !== undefined ? { countsTowardRestQuota: payload.countsTowardRestQuota } : {})
        } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeLeaveType', id, undefined, tx)
        return updated
      })
      return row
    } catch (error) { this.rethrowConflict(error, '请假类型名称已存在') }
  }

  async deleteLeaveType(frontendUserId: string, actorUserId: string, id: string) {
    await this.owned(this.prisma.employeeLeaveType, frontendUserId, id, '请假类型不存在')
    if (await this.prisma.employeeLeaveRequest.count({ where: { frontendUserId, leaveTypeId: id } })) {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeLeaveType', id,
        (tx) => tx.employeeLeaveType.update({ where: { id }, data: { active: false } }), '类型已使用，已停用')
      return row
    }
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeLeaveType', id, (tx) => tx.employeeLeaveType.delete({ where: { id } }))
    return { ok: true }
  }

  listLeaveRequests(frontendUserId: string, query: AttendanceListQueryDto = {}) {
    this.assertExclusiveDateFilter(query)
    if (query.startDate) this.assertDate(query.startDate)
    if (query.endDate) this.assertDate(query.endDate)
    if (query.startDate && query.endDate && query.startDate > query.endDate) throw new BadRequestException('结束日期不能早于开始日期')
    let lowerBound = query.startDate
    let upperBound = query.endDate
    if (query.month) {
      this.assertMonth(query.month)
      const [monthStart, monthEnd] = this.monthBounds(query.month)
      lowerBound = lowerBound && lowerBound > monthStart ? lowerBound : monthStart
      upperBound = upperBound && upperBound < monthEnd ? upperBound : monthEnd
    }
    if (lowerBound && upperBound && lowerBound > upperBound) throw new BadRequestException('日期筛选范围与月份不重叠')
    const dateFilter = {
      ...(upperBound ? { startDate: { lte: upperBound } } : {}),
      ...(lowerBound ? { endDate: { gte: lowerBound } } : {})
    }
    return this.prisma.employeeLeaveRequest.findMany({ where: {
      frontendUserId,
      ...(query.employeeIds?.length ? { employeeId: { in: query.employeeIds } } : query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...dateFilter
    }, include: { employee: { select: { employeeNumber: true, name: true } }, leaveType: true }, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }] })
  }

  async createLeaveRequest(frontendUserId: string, actorUserId: string, payload: LeaveRequestDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertDateRange(payload.startDate, payload.endDate)
    await this.assertRangeWritable(frontendUserId, payload.startDate, payload.endDate)
    const leaveType = await this.prisma.employeeLeaveType.findFirst({ where: { id: payload.leaveTypeId, frontendUserId } })
    if (!leaveType) throw new NotFoundException('请假类型不存在')
    if (!leaveType.active) throw new ConflictException('请假类型已停用')
    const months = this.monthsBetween(payload.startDate, payload.endDate)
    return this.withLeaveSerialization(frontendUserId, payload.employeeId, months, async (tx) => {
      const countedDays = await this.countLeaveDays(frontendUserId, payload, tx)
      await this.assertNoLeaveOverlap(frontendUserId, payload.employeeId, payload.startDate, payload.endDate, undefined, tx)
      const row = await tx.employeeLeaveRequest.create({ data: {
        frontendUserId, employeeId: payload.employeeId, leaveTypeId: payload.leaveTypeId,
        startDate: payload.startDate, endDate: payload.endDate, unit: payload.unit,
        hours: payload.unit === EmployeeLeaveUnit.HOUR ? this.positive(payload.hours, '请假小时') : null,
        countedDays, reason: this.required(payload.reason, '请假原因')
      } })
      await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeLeaveRequest', row.id, undefined, tx)
      return row
    })
  }

  async updateLeaveRequest(frontendUserId: string, actorUserId: string, id: string, payload: Partial<LeaveRequestDto>) {
    const current = await this.owned(this.prisma.employeeLeaveRequest, frontendUserId, id, '请假记录不存在')
    const merged = { ...current, ...payload } as LeaveRequestDto
    this.assertDateRange(current.startDate, current.endDate)
    this.assertDateRange(merged.startDate, merged.endDate)
    const months = Array.from(new Set([
      ...this.monthsBetween(current.startDate, current.endDate),
      ...this.monthsBetween(merged.startDate, merged.endDate)
    ])).sort()
    return this.withCurrentPayrollSource(
      frontendUserId,
      months,
      (tx) => this.owned(tx.employeeLeaveRequest, frontendUserId, id, '请假记录不存在'),
      (locked) => {
        const target = { ...locked, ...payload }
        return [
          ...this.monthsBetween(locked.startDate, locked.endDate),
          ...this.monthsBetween(target.startDate, target.endDate)
        ]
      },
      async (tx, locked) => {
        const target = { ...locked, ...payload } as LeaveRequestDto
        this.assertDateRange(locked.startDate, locked.endDate)
        this.assertDateRange(target.startDate, target.endDate)
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          `employee-leave:${frontendUserId}:${target.employeeId}`
        )
        if (locked.payrollLockedAt) throw new ConflictException('该请假记录已被工资确认锁定')
        if (locked.status !== EmployeeLeaveStatus.PENDING) throw new ConflictException('仅待审批请假可修改')
        if (payload.employeeId) await this.owned(tx.employee, frontendUserId, payload.employeeId, '员工不存在')
        if (payload.leaveTypeId) {
          const type = await tx.employeeLeaveType.findFirst({ where: { id: payload.leaveTypeId, frontendUserId } })
          if (!type) throw new NotFoundException('请假类型不存在')
          if (!type.active && payload.leaveTypeId !== locked.leaveTypeId) throw new ConflictException('请假类型已停用')
        }
        const countedDays = await this.countLeaveDays(frontendUserId, target, tx)
        await this.assertNoLeaveOverlap(frontendUserId, target.employeeId, target.startDate, target.endDate, id, tx)
        const row = await tx.employeeLeaveRequest.update({ where: { id }, data: {
          ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
          ...(payload.leaveTypeId !== undefined ? { leaveTypeId: payload.leaveTypeId } : {}),
          ...(payload.startDate !== undefined ? { startDate: payload.startDate } : {}),
          ...(payload.endDate !== undefined ? { endDate: payload.endDate } : {}),
          ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
          hours: target.unit === EmployeeLeaveUnit.HOUR ? this.positive(target.hours, '请假小时') : null,
          countedDays,
          ...(payload.reason !== undefined ? { reason: this.required(payload.reason, '请假原因') } : {})
        } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeLeaveRequest', id, undefined, tx)
        return row
      }
    )
  }

  async deleteLeaveRequest(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeLeaveRequest, frontendUserId, id, '请假记录不存在')
    await this.withCurrentPayrollSource(
      frontendUserId,
      this.monthsBetween(row.startDate, row.endDate),
      (tx) => this.owned(tx.employeeLeaveRequest, frontendUserId, id, '请假记录不存在'),
      (locked) => this.monthsBetween(locked.startDate, locked.endDate),
      async (tx, locked) => {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          `employee-leave:${frontendUserId}:${locked.employeeId}`
        )
        if (locked.payrollLockedAt) throw new ConflictException('该请假记录已被工资确认锁定')
        if (locked.status !== EmployeeLeaveStatus.PENDING) throw new ConflictException('仅待审批请假可删除')
        await tx.employeeLeaveRequest.delete({ where: { id } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeLeaveRequest', id, undefined, tx)
      }
    )
    return { ok: true }
  }

  approveLeave(frontendUserId: string, actorUserId: string, id: string, reviewRemark?: string) {
    return this.reviewLeave(frontendUserId, actorUserId, id, EmployeeLeaveStatus.APPROVED, reviewRemark)
  }

  rejectLeave(frontendUserId: string, actorUserId: string, id: string, reviewRemark?: string) {
    return this.reviewLeave(frontendUserId, actorUserId, id, EmployeeLeaveStatus.REJECTED, reviewRemark)
  }

  async listCommissionTypes(frontendUserId: string) {
    const rows = await this.prisma.employeeCommissionType.findMany({
      where: { frontendUserId },
      include: { _count: { select: { records: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }]
    })
    return rows.map(({ _count, ...row }) => ({ ...row, referenced: _count.records > 0 }))
  }

  async createCommissionType(frontendUserId: string, actorUserId: string, payload: CommissionTypeDto) {
    try {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeCommissionType', (created) => created.id, (tx) => tx.employeeCommissionType.create({ data: {
        frontendUserId, name: this.required(payload.name, '提成类型'), unitName: this.required(payload.unitName, '计量单位'),
        unitPrice: this.nonnegative(payload.unitPrice, '默认单价'), active: payload.active ?? true
      } }))
      return row
    } catch (error) { this.rethrowConflict(error, '提成类型名称已存在') }
  }

  async updateCommissionType(frontendUserId: string, actorUserId: string, id: string, payload: Partial<CommissionTypeDto>) {
    await this.owned(this.prisma.employeeCommissionType, frontendUserId, id, '提成类型不存在')
    try {
      const row = await this.configurationTransaction(frontendUserId, async (tx) => {
        const current = await this.owned(tx.employeeCommissionType, frontendUserId, id, '提成类型不存在')
        const referenced = await tx.employeeCommissionRecord.count({ where: { frontendUserId, commissionTypeId: id } })
        if (referenced && !this.referencedCommissionTypeUpdateAllowed(current, payload)) {
          throw new ConflictException('已使用的提成类型只允许停用')
        }
        const updated = await tx.employeeCommissionType.update({ where: { id }, data: {
          ...(payload.name !== undefined ? { name: this.required(payload.name, '提成类型') } : {}),
          ...(payload.unitName !== undefined ? { unitName: this.required(payload.unitName, '计量单位') } : {}),
          ...(payload.unitPrice !== undefined ? { unitPrice: this.nonnegative(payload.unitPrice, '默认单价') } : {}),
          ...(payload.active !== undefined ? { active: payload.active } : {})
        } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeCommissionType', id, undefined, tx)
        return updated
      })
      return row
    } catch (error) { this.rethrowConflict(error, '提成类型名称已存在') }
  }

  async deleteCommissionType(frontendUserId: string, actorUserId: string, id: string) {
    await this.owned(this.prisma.employeeCommissionType, frontendUserId, id, '提成类型不存在')
    if (await this.prisma.employeeCommissionRecord.count({ where: { frontendUserId, commissionTypeId: id } })) {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeCommissionType', id,
        (tx) => tx.employeeCommissionType.update({ where: { id }, data: { active: false } }), '类型已使用，已停用')
      return row
    }
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeCommissionType', id, (tx) => tx.employeeCommissionType.delete({ where: { id } }))
    return { ok: true }
  }

  listCommissionRecords(frontendUserId: string, query: AttendanceListQueryDto = {}) {
    return this.prisma.employeeCommissionRecord.findMany({ where: { frontendUserId, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...this.dateWhere(query) }, include: { employee: { select: { employeeNumber: true, name: true } }, commissionType: true }, orderBy: { date: 'desc' } })
  }

  async createCommissionRecord(frontendUserId: string, actorUserId: string, payload: CommissionRecordDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertDate(payload.date)
    await this.assertMonthWritable(frontendUserId, payload.date)
    const type = await this.prisma.employeeCommissionType.findFirst({ where: { id: payload.commissionTypeId, frontendUserId } })
    if (!type) throw new NotFoundException('提成类型不存在')
    if (!type.active) throw new ConflictException('提成类型已停用')
    const unitPrice = this.nonnegative(payload.unitPrice ?? type.unitPrice, '提成单价')
    const quantity = this.nonnegative(payload.quantity, '提成数量')
    const amount = new Prisma.Decimal(unitPrice).mul(quantity).toDecimalPlaces(2)
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeCommissionRecord', (created) => created.id,
        (tx) => tx.employeeCommissionRecord.create({ data: { frontendUserId, employeeId: payload.employeeId, commissionTypeId: payload.commissionTypeId, date: payload.date, quantity, unitPriceSnapshot: unitPrice, amount, remark: this.optional(payload.remark) } }), undefined, [payload.date])
    } catch (error) { this.rethrowConflict(error, '提成记录重复') }
  }

  async updateCommissionRecord(frontendUserId: string, actorUserId: string, id: string, payload: Partial<CommissionRecordDto>) {
    const current = await this.owned(this.prisma.employeeCommissionRecord, frontendUserId, id, '提成记录不存在')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    try {
      return await this.withCurrentPayrollSource(
        frontendUserId,
        [current.date, date],
        (tx) => this.owned(tx.employeeCommissionRecord, frontendUserId, id, '提成记录不存在'),
        (locked) => [locked.date, payload.date || locked.date],
        async (tx, locked) => {
          if (locked.payrollLockedAt) throw new ConflictException('该提成记录已被工资确认锁定')
          const targetDate = payload.date || locked.date
          this.assertDate(locked.date)
          this.assertDate(targetDate)
          if (payload.employeeId) await this.owned(tx.employee, frontendUserId, payload.employeeId, '员工不存在')
          let type = null
          if (payload.commissionTypeId) {
            type = await tx.employeeCommissionType.findFirst({ where: { id: payload.commissionTypeId, frontendUserId } })
            if (!type) throw new NotFoundException('提成类型不存在')
            if (!type.active && payload.commissionTypeId !== locked.commissionTypeId) throw new ConflictException('提成类型已停用')
          }
          const quantity = this.nonnegative(payload.quantity ?? locked.quantity, '提成数量')
          const unitPrice = this.nonnegative(payload.unitPrice ?? (type?.unitPrice ?? locked.unitPriceSnapshot), '提成单价')
          const row = await tx.employeeCommissionRecord.update({ where: { id }, data: {
            ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
            ...(payload.commissionTypeId !== undefined ? { commissionTypeId: payload.commissionTypeId } : {}),
            ...(payload.date !== undefined ? { date: payload.date } : {}), quantity, unitPriceSnapshot: unitPrice,
            amount: new Prisma.Decimal(unitPrice).mul(quantity).toDecimalPlaces(2),
            ...(payload.remark !== undefined ? { remark: this.optional(payload.remark) } : {})
          } })
          await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeCommissionRecord', id, undefined, tx)
          return row
        }
      )
    } catch (error) { this.rethrowConflict(error, '提成记录重复') }
  }

  async deleteCommissionRecord(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeCommissionRecord, frontendUserId, id, '提成记录不存在')
    await this.withCurrentPayrollSource(
      frontendUserId,
      [row.date],
      (tx) => this.owned(tx.employeeCommissionRecord, frontendUserId, id, '提成记录不存在'),
      (locked) => [locked.date],
      async (tx, locked) => {
        if (locked.payrollLockedAt) throw new ConflictException('该提成记录已被工资确认锁定')
        await tx.employeeCommissionRecord.delete({ where: { id } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeCommissionRecord', id, undefined, tx)
      }
    )
    return { ok: true }
  }

  listBonuses(frontendUserId: string, query: AttendanceListQueryDto = {}) {
    return this.prisma.employeeBonus.findMany({ where: { frontendUserId, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...this.dateWhere(query) }, include: { employee: { select: { employeeNumber: true, name: true } } }, orderBy: { date: 'desc' } })
  }

  async createBonus(frontendUserId: string, actorUserId: string, payload: BonusDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertDate(payload.date)
    await this.assertMonthWritable(frontendUserId, payload.date)
    return this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeBonus', (created) => created.id,
      (tx) => tx.employeeBonus.create({ data: { frontendUserId, employeeId: payload.employeeId, date: payload.date, amount: new Prisma.Decimal(this.positive(payload.amount, '奖金金额')), reason: this.required(payload.reason, '奖金原因') } }), undefined, [payload.date])
  }

  async updateBonus(frontendUserId: string, actorUserId: string, id: string, payload: Partial<BonusDto>) {
    const current = await this.owned(this.prisma.employeeBonus, frontendUserId, id, '奖金记录不存在')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    return this.withCurrentPayrollSource(
      frontendUserId,
      [current.date, date],
      (tx) => this.owned(tx.employeeBonus, frontendUserId, id, '奖金记录不存在'),
      (locked) => [locked.date, payload.date || locked.date],
      async (tx, locked) => {
        if (locked.payrollLockedAt) throw new ConflictException('该奖金记录已被工资确认锁定')
        this.assertDate(locked.date)
        this.assertDate(payload.date || locked.date)
        if (payload.employeeId) await this.owned(tx.employee, frontendUserId, payload.employeeId, '员工不存在')
        const row = await tx.employeeBonus.update({ where: { id }, data: {
          ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
          ...(payload.date !== undefined ? { date: payload.date } : {}),
          ...(payload.amount !== undefined ? { amount: new Prisma.Decimal(this.positive(payload.amount, '奖金金额')) } : {}),
          ...(payload.reason !== undefined ? { reason: this.required(payload.reason, '奖金原因') } : {})
        } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeBonus', id, undefined, tx)
        return row
      }
    )
  }

  async deleteBonus(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeBonus, frontendUserId, id, '奖金记录不存在')
    await this.withCurrentPayrollSource(
      frontendUserId,
      [row.date],
      (tx) => this.owned(tx.employeeBonus, frontendUserId, id, '奖金记录不存在'),
      (locked) => [locked.date],
      async (tx, locked) => {
        if (locked.payrollLockedAt) throw new ConflictException('该奖金记录已被工资确认锁定')
        await tx.employeeBonus.delete({ where: { id } })
        await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeBonus', id, undefined, tx)
      }
    )
    return { ok: true }
  }

  async compensationTotals(frontendUserId: string, month: string) {
    this.assertMonth(month)
    const [commission, bonus] = await Promise.all([
      this.prisma.employeeCommissionRecord.groupBy({ by: ['employeeId'], where: { frontendUserId, date: { startsWith: month } }, _sum: { amount: true } }),
      this.prisma.employeeBonus.groupBy({ by: ['employeeId'], where: { frontendUserId, date: { startsWith: month } }, _sum: { amount: true } })
    ])
    const map = new Map<string, { employeeId: string; commissionAmount: number; bonusAmount: number; totalAmount: number }>()
    for (const row of commission) map.set(row.employeeId, { employeeId: row.employeeId, commissionAmount: Number(row._sum.amount || 0), bonusAmount: 0, totalAmount: Number(row._sum.amount || 0) })
    for (const row of bonus) {
      const item = map.get(row.employeeId) || { employeeId: row.employeeId, commissionAmount: 0, bonusAmount: 0, totalAmount: 0 }
      item.bonusAmount = Number(row._sum.amount || 0); item.totalAmount = item.commissionAmount + item.bonusAmount; map.set(row.employeeId, item)
    }
    return Array.from(map.values())
  }

  async attachPhoto(frontendUserId: string, actorUserId: string, employeeId: string, photoPath: string) {
    const employee = await this.assertEmployee(frontendUserId, employeeId)
    const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeePhoto', employeeId,
      (tx) => tx.employee.update({ where: { id: employeeId }, data: { photoPath } }))
    if (employee.photoPath && employee.photoPath !== photoPath) await this.cleanupPhoto(employee.photoPath)
    return { id: row.id, hasPhoto: true }
  }

  async getPhotoPath(frontendUserId: string, employeeId: string) {
    const employee = await this.owned(this.prisma.employee, frontendUserId, employeeId, '员工不存在')
    if (!employee.photoPath) throw new NotFoundException('员工照片不存在')
    return employee.photoPath as string
  }

  private async reviewLeave(frontendUserId: string, actorUserId: string, id: string, status: EmployeeLeaveStatus, reviewRemark?: string) {
    const current = await this.owned(this.prisma.employeeLeaveRequest, frontendUserId, id, '请假记录不存在')
    return this.withCurrentPayrollSource(
      frontendUserId,
      this.monthsBetween(current.startDate, current.endDate),
      (tx) => this.owned(tx.employeeLeaveRequest, frontendUserId, id, '请假记录不存在'),
      (locked) => this.monthsBetween(locked.startDate, locked.endDate),
      async (tx, locked) => {
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          `employee-leave:${frontendUserId}:${locked.employeeId}`
        )
        if (locked.payrollLockedAt) throw new ConflictException('该请假记录已被工资确认锁定')
        if (locked.status !== EmployeeLeaveStatus.PENDING) throw new ConflictException('仅待审批请假可审批')
        const row = await tx.employeeLeaveRequest.update({ where: { id }, data: {
          status, reviewRemark: this.optional(reviewRemark), reviewedById: actorUserId, reviewedAt: new Date()
        } })
        await this.audit(
          frontendUserId,
          actorUserId,
          status === EmployeeLeaveStatus.APPROVED ? EmployeeAuditAction.APPROVE : EmployeeAuditAction.REJECT,
          'EmployeeLeaveRequest',
          id,
          undefined,
          tx
        )
        return row
      }
    )
  }

  private async assertNoLeaveOverlap(frontendUserId: string, employeeId: string, startDate: string, endDate: string, excludingId?: string, db: Pick<Prisma.TransactionClient, 'employeeLeaveRequest'> = this.prisma) {
    const overlap = await db.employeeLeaveRequest.findFirst({ where: {
      frontendUserId, employeeId, status: { in: [EmployeeLeaveStatus.PENDING, EmployeeLeaveStatus.APPROVED] },
      startDate: { lte: endDate }, endDate: { gte: startDate }, ...(excludingId ? { id: { not: excludingId } } : {})
    } })
    if (overlap) throw new ConflictException('请假时间与已有记录重叠')
  }

  private withLeaveSerialization<T>(frontendUserId: string, employeeId: string, months: string[], operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.payrollMonthLocks().run(frontendUserId, months, async (tx) => {
      await this.assertMonthsWritable(frontendUserId, months, tx)
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        `employee-leave:${frontendUserId}:${employeeId}`
      )
      return operation(tx)
    })
  }

  private async countLeaveDays(frontendUserId: string, payload: LeaveRequestDto, db: Pick<Prisma.TransactionClient, 'employeeMonthlyScheduleDay'> = this.prisma) {
    const days = this.daysInclusive(payload.startDate, payload.endDate)
    if (payload.unit === EmployeeLeaveUnit.HOUR) {
      if (days !== 1) throw new BadRequestException('小时请假必须在同一天')
      const scheduledMinutes = await this.scheduledMinutesForDate(frontendUserId, payload.employeeId, payload.startDate, db)
      if (scheduledMinutes <= 0) throw new BadRequestException('请假日期不是排班工作日')
      const leaveMinutes = this.positive(payload.hours, '请假小时') * 60
      if (leaveMinutes > scheduledMinutes) throw new BadRequestException('请假小时不能超过当日排班时长')
      return new Prisma.Decimal(leaveMinutes).div(scheduledMinutes).toDecimalPlaces(2)
    }
    if (payload.hours !== undefined) throw new BadRequestException('仅小时请假可填写小时数')
    let workdays = 0
    for (const date of this.dateRange(payload.startDate, payload.endDate)) {
      if (await this.scheduledMinutesForDate(frontendUserId, payload.employeeId, date, db) > 0) workdays += 1
    }
    if (!workdays) throw new BadRequestException('请假日期不包含排班工作日')
    return new Prisma.Decimal(payload.unit === EmployeeLeaveUnit.HALF_DAY ? workdays * 0.5 : workdays)
  }

  private async scheduledMinutesForDate(frontendUserId: string, employeeId: string, date: string, db: Pick<Prisma.TransactionClient, 'employeeMonthlyScheduleDay'> = this.prisma) {
    const schedule = await db.employeeMonthlyScheduleDay.findFirst({ where: { frontendUserId, employeeId, date } })
    if (!schedule) throw new ConflictException(`缺少 ${date} 的员工月度排班`)
    return schedule.isWorkday ? this.minutes(schedule.scheduledMinutes) : 0
  }

  private employeeDto(row: any, reveal: boolean) {
    const sensitive = (field: string | null | undefined) => {
      if (!field) return ''
      const value = this.cipher.decrypt(field)
      return reveal ? value : this.cipher.mask(value)
    }
    const { idCardCipher, bankCardCipher, addressCipher, emergencyContactCipher, photoPath, ...safe } = row
    return {
      ...safe,
      idCard: sensitive(idCardCipher), bankCard: sensitive(bankCardCipher), address: sensitive(addressCipher),
      emergencyContact: sensitive(emergencyContactCipher), hasPhoto: Boolean(photoPath)
    }
  }

  private async prepareAttendance(
    frontendUserId: string,
    payload: Partial<AttendanceDto>,
    current: any | undefined,
    db: Pick<Prisma.TransactionClient, 'employeeLeaveRequest' | 'employeeMonthlyScheduleDay'> = this.prisma
  ) {
    const currentActualSegments = (current?.segments || current?.actualSegments || []).map((segment: any) => ({
      checkInAt: segment.checkInAt,
      checkOutAt: segment.checkOutAt
    }))
    const merged = { ...current, ...payload, actualSegments: payload.actualSegments ?? currentActualSegments } as AttendanceDto
    this.assertDate(merged.date)
    const schedule = await db.employeeMonthlyScheduleDay.findFirst({
      where: { frontendUserId, employeeId: merged.employeeId, date: merged.date },
      include: { segments: { orderBy: { sequence: 'asc' } } }
    })
    if (!schedule) throw new ConflictException(`缺少 ${merged.date} 的员工月度排班`)
    if (schedule.isWorkday && this.minutes(schedule.scheduledMinutes) <= 0) throw new BadRequestException('排班工作日时长必须大于 0')
    const actualSegments = this.normalizedActualSegments(merged.actualSegments || [], merged.date)
    const approvedLeaveMinutes = await this.approvedLeaveMinutes(frontendUserId, merged.employeeId, merged.date, schedule.scheduledMinutes, db)
    const explicitAbsenceMinutes = this.minutes(merged.explicitAbsenceMinutes ?? current?.explicitAbsenceMinutes ?? 0)
    const metrics = this.metricsForSchedule(
      schedule,
      actualSegments,
      approvedLeaveMinutes,
      explicitAbsenceMinutes
    )
    const first = actualSegments[0]
    const last = actualSegments.at(-1)
    return {
      data: {
        ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
        ...(payload.date !== undefined ? { date: payload.date } : {}),
        isScheduledWorkday: schedule.isWorkday,
        scheduledMinutes: schedule.isWorkday ? this.minutes(schedule.scheduledMinutes) : 0,
        checkInAt: first?.checkInAt || null,
        checkOutAt: last?.checkOutAt || null,
        explicitAbsenceMinutes,
        ...metrics,
        overtimeMinutes: this.minutes(merged.overtimeMinutes ?? 0),
        ...(payload.remark !== undefined ? { remark: this.optional(payload.remark) } : {})
      },
      actualSegments
    }
  }

  private normalizedActualSegments(input: AttendanceDto['actualSegments'], businessDate: string) {
    if (!Array.isArray(input)) throw new BadRequestException('实际考勤时段必须为数组')
    let previousStart = Number.NEGATIVE_INFINITY
    let previousEnd = Number.NEGATIVE_INFINITY
    return input.map((segment, index) => {
      const checkInAt = this.optionalDateTime(segment?.checkInAt, businessDate, `第 ${index + 1} 段上班时间`)
      const checkOutAt = this.optionalDateTime(segment?.checkOutAt, businessDate, `第 ${index + 1} 段下班时间`)
      if (!checkInAt || !checkOutAt) throw new BadRequestException(`第 ${index + 1} 段必须同时填写上班和下班时间`)
      if (checkOutAt.getTime() <= checkInAt.getTime()) throw new BadRequestException(`第 ${index + 1} 段下班时间必须晚于上班时间`)
      if (checkInAt.getTime() <= previousStart) throw new BadRequestException('实际考勤时段必须严格按上班时间升序')
      if (checkInAt.getTime() < previousEnd) throw new BadRequestException('实际考勤时段不能重叠')
      previousStart = checkInAt.getTime()
      previousEnd = checkOutAt.getTime()
      return { checkInAt, checkOutAt }
    })
  }

  private metricsForSchedule(schedule: any, actualSegments: ActualInterval[], approvedLeaveMinutes: number, explicitAbsenceMinutes: number) {
    if (!schedule.isWorkday) {
      return { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0 }
    }
    const plan = (schedule.segments || []).slice().sort((left: any, right: any) => left.sequence - right.sequence)
      .map((segment: any) => ({ startTime: segment.startTime, endTime: segment.endTime }))
    try {
      return deriveAttendanceMetrics(plan, actualSegments, approvedLeaveMinutes, explicitAbsenceMinutes)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '考勤时段无效')
    }
  }

  private async replaceAttendanceSegments(
    tx: Pick<Prisma.TransactionClient, 'employeeAttendanceSegment'>,
    frontendUserId: string,
    attendanceRecordId: string,
    segments: Array<{ checkInAt: Date; checkOutAt: Date }>
  ) {
    await tx.employeeAttendanceSegment.deleteMany({ where: { frontendUserId, attendanceRecordId } })
    if (segments.length) await tx.employeeAttendanceSegment.createMany({ data: segments.map((segment, sequence) => ({
      frontendUserId, attendanceRecordId, sequence, checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt
    })) })
  }

  private async clearDeletedScheduleAttendance(
    tx: Pick<Prisma.TransactionClient, 'employeeAttendanceRecord'>,
    frontendUserId: string,
    employeeId: string,
    dates: string[]
  ) {
    if (!dates.length) return
    await tx.employeeAttendanceRecord.updateMany({
      where: { frontendUserId, employeeId, date: dates.length === 1 ? dates[0] : { in: dates } },
      data: {
        isScheduledWorkday: false,
        scheduledMinutes: 0,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        absenceMinutes: 0
      }
    })
  }

  private attendanceDto(row: any, explicitSegments?: Array<{ checkInAt: Date; checkOutAt: Date }>) {
    const actualSegments = (explicitSegments || row.segments || []).slice()
      .sort((left: any, right: any) => (left.sequence ?? 0) - (right.sequence ?? 0))
      .map((segment: any) => ({ checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt }))
    const { segments: _segments, ...parent } = row
    return { ...parent, explicitAbsenceMinutes: this.minutes(parent.explicitAbsenceMinutes ?? 0), actualSegments }
  }

  private async currentAttendanceDtos(frontendUserId: string, rows: any[]) {
    if (!rows.length) return []
    const employeeIds = Array.from(new Set(rows.map((row) => row.employeeId)))
    const dates = Array.from(new Set(rows.map((row) => row.date))).sort()
    const [schedules, leaves] = await Promise.all([
      this.prisma.employeeMonthlyScheduleDay.findMany({
        where: { frontendUserId, employeeId: { in: employeeIds }, date: { in: dates } },
        include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      this.prisma.employeeLeaveRequest.findMany({ where: {
        frontendUserId, employeeId: { in: employeeIds }, status: EmployeeLeaveStatus.APPROVED,
        startDate: { lte: dates.at(-1)! }, endDate: { gte: dates[0] }
      } })
    ])
    const scheduleByEmployeeDate = new Map(schedules.map((schedule) => [`${schedule.employeeId}:${schedule.date}`, schedule]))
    return rows.map((row) => {
      const dto = this.attendanceDto(row)
      const schedule = scheduleByEmployeeDate.get(`${row.employeeId}:${row.date}`)
      if (!schedule) return dto
      const actualSegments = (row.segments || []).map((segment: any) => ({ checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt }))
      const approvedLeaveMinutes = this.approvedLeaveMinutesFromRows(leaves, row.employeeId, row.date, schedule.scheduledMinutes)
      const metrics = this.metricsForSchedule(schedule, actualSegments, approvedLeaveMinutes, dto.explicitAbsenceMinutes)
      return {
        ...dto,
        isScheduledWorkday: schedule.isWorkday,
        scheduledMinutes: schedule.isWorkday ? this.minutes(schedule.scheduledMinutes) : 0,
        ...metrics
      }
    })
  }

  private dateWhere(query: AttendanceListQueryDto) {
    this.assertExclusiveDateFilter(query)
    if (query.month) { this.assertMonth(query.month); return { date: { startsWith: query.month } } }
    if (query.startDate) this.assertDate(query.startDate)
    if (query.endDate) this.assertDate(query.endDate)
    return query.startDate || query.endDate ? { date: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } } : {}
  }

  private assertExclusiveDateFilter(query: Pick<AttendanceListQueryDto, 'month' | 'startDate' | 'endDate'>) {
    if (query.month && (query.startDate || query.endDate)) throw new BadRequestException('月份和日期范围不能同时使用')
  }

  private async assertEmployee(frontendUserId: string, employeeId: string) {
    return this.owned(this.prisma.employee, frontendUserId, employeeId, '员工不存在')
  }

  private async owned(delegate: PrismaDelegate, frontendUserId: string, id: string, message: string) {
    const row = await delegate.findFirst({ where: { id, frontendUserId } })
    if (!row) throw new NotFoundException(message)
    return row
  }

  private async assertMonthWritable(frontendUserId: string, dateOrMonth: string, db: Pick<Prisma.TransactionClient, 'employeePayrollRun'> = this.prisma) {
    const month = dateOrMonth.slice(0, 7)
    this.assertMonth(month)
    const confirmed = await db.employeePayrollRun.findFirst({ where: { frontendUserId, month, status: EmployeePayrollStatus.CONFIRMED }, select: { id: true } })
    if (confirmed) throw new ConflictException('该月份工资已确认，不能修改关联数据')
  }

  private async assertRangeWritable(frontendUserId: string, startDate: string, endDate: string, db: Pick<Prisma.TransactionClient, 'employeePayrollRun'> = this.prisma) {
    for (const month of this.monthsBetween(startDate, endDate)) await this.assertMonthWritable(frontendUserId, month, db)
  }

  private async assertMonthsWritable(frontendUserId: string, months: string[], db: Pick<Prisma.TransactionClient, 'employeePayrollRun'>) {
    for (const month of Array.from(new Set(months.map((value) => value.slice(0, 7)))).sort()) {
      await this.assertMonthWritable(frontendUserId, month, db)
    }
  }

  private audit(frontendUserId: string, actorUserId: string, action: EmployeeAuditAction, entityType: string, entityId: string, reason?: string, db: Pick<Prisma.TransactionClient, 'employeeAuditLog'> = this.prisma) {
    return db.employeeAuditLog.create({ data: { frontendUserId, actorUserId, action, entityType, entityId, reason } })
  }

  private atomic<T>(
    frontendUserId: string,
    actorUserId: string,
    action: EmployeeAuditAction,
    entityType: string,
    entityId: string | ((result: any) => string),
    mutation: (tx: Prisma.TransactionClient) => Promise<T>,
    reason?: string,
    payrollMonths: string[] = []
  ) {
    const operation = async (tx: Prisma.TransactionClient) => {
      if (payrollMonths.length) await this.assertMonthsWritable(frontendUserId, payrollMonths, tx)
      const result = await mutation(tx)
      await this.audit(frontendUserId, actorUserId, action, entityType, typeof entityId === 'function' ? entityId(result) : entityId, reason, tx)
      return result
    }
    if (payrollMonths.length) return this.payrollMonthLocks().run(frontendUserId, payrollMonths, operation)
    return this.prisma.$transaction(operation)
  }

  private payrollMonthLocks() {
    return this.monthLocks || new PayrollMonthLockService(this.prisma)
  }

  private async withCurrentPayrollSource<T>(
    frontendUserId: string,
    initialMonths: string[],
    load: (tx: Prisma.TransactionClient) => Promise<any>,
    monthsForCurrent: (current: any) => string[],
    operation: (tx: Prisma.TransactionClient, current: any) => Promise<T>
  ) {
    let planned = Array.from(new Set(initialMonths.map((value) => value.slice(0, 7)))).sort()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.payrollMonthLocks().run(frontendUserId, planned, async (tx) => {
          await this.assertMonthsWritable(frontendUserId, planned, tx)
          const current = await load(tx)
          const actual = Array.from(new Set(monthsForCurrent(current).map((value) => value.slice(0, 7)))).sort()
          if (actual.some((month) => !planned.includes(month))) throw new PayrollLockPlanChanged(actual)
          return operation(tx, current)
        })
      } catch (error) {
        if (!(error instanceof PayrollLockPlanChanged)) throw error
        planned = Array.from(new Set([...planned, ...error.months])).sort()
      }
    }
    throw new ConflictException('记录月份持续变化，请刷新后重试')
  }

  private configurationTransaction<T>(frontendUserId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.payrollMonthLocks().runConfiguration(frontendUserId, operation)
  }

  private configurationAtomic<T>(
    frontendUserId: string,
    actorUserId: string,
    action: EmployeeAuditAction,
    entityType: string,
    entityId: string | ((result: any) => string),
    mutation: (tx: Prisma.TransactionClient) => Promise<T>,
    reason?: string
  ) {
    return this.configurationTransaction(frontendUserId, async (tx) => {
      const result = await mutation(tx)
      await this.audit(frontendUserId, actorUserId, action, entityType, typeof entityId === 'function' ? entityId(result) : entityId, reason, tx)
      return result
    })
  }

  private required(value: unknown, label: string) {
    const text = String(value ?? '').trim()
    if (!text) throw new BadRequestException(`${label}不能为空`)
    return text
  }

  private optional(value: unknown) {
    const text = String(value ?? '').trim()
    return text || null
  }

  private encryptOptional(value: unknown) {
    const text = String(value ?? '').trim()
    return text ? this.cipher.encrypt(text) : null
  }

  private nonnegative(value: unknown, label: string) {
    const numeric = Number(value ?? 0)
    if (!Number.isFinite(numeric) || numeric < 0) throw new BadRequestException(`${label}不能小于 0`)
    return new Prisma.Decimal(numeric)
  }

  private positive(value: unknown, label: string) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) throw new BadRequestException(`${label}必须大于 0`)
    return numeric
  }

  private minutes(value: unknown) {
    const numeric = Number(value ?? 0)
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 10080) throw new BadRequestException('分钟数无效')
    return numeric
  }

  private optionalDateTime(value: unknown, businessDate: string, label: string) {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new BadRequestException('时间格式无效')
      if (this.beijingDate(value) !== businessDate) throw new BadRequestException(`${label}不属于当前北京业务考勤日期`)
      return value
    }
    const text = String(value ?? '').trim()
    if (!text) return null
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) {
      throw new BadRequestException(`${label}必须包含明确时区`)
    }
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) throw new BadRequestException('时间格式无效')
    if (this.beijingDate(date) !== businessDate) throw new BadRequestException(`${label}不属于当前北京业务考勤日期`)
    return date
  }

  private scheduleData(payload: Partial<WeeklyScheduleDto | DateOverrideDto>, current?: any) {
    const isWorkday = payload.isWorkday ?? current?.isWorkday
    if (!isWorkday) return { isWorkday: false, plannedStartTime: null, plannedEndTime: null, scheduledMinutes: 0 }
    const plannedStartTime = payload.plannedStartTime === undefined ? current?.plannedStartTime : this.optional(payload.plannedStartTime)
    const plannedEndTime = payload.plannedEndTime === undefined ? current?.plannedEndTime : this.optional(payload.plannedEndTime)
    if (!plannedStartTime || !plannedEndTime) throw new BadRequestException('工作日必须填写计划上下班时间')
    const start = this.clockMinutes(plannedStartTime)
    const end = this.clockMinutes(plannedEndTime)
    if (end <= start) throw new BadRequestException('本版暂不支持跨日排班，计划下班时间必须晚于上班时间')
    return { isWorkday: true, plannedStartTime, plannedEndTime, scheduledMinutes: end - start }
  }

  private async withMonthlyScheduleSerialization<T>(
    frontendUserId: string,
    employeeId: string,
    datesOrMonths: string[],
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    writableDatesOrMonths: string[] = datesOrMonths
  ) {
    const months = Array.from(new Set(datesOrMonths.map((value) => value.slice(0, 7)))).sort()
    const writableMonths = Array.from(new Set(writableDatesOrMonths.map((value) => value.slice(0, 7)))).sort()
    return this.payrollMonthLocks().run(frontendUserId, months, async (tx) => {
      await this.assertMonthsWritable(frontendUserId, writableMonths, tx)
      await this.owned(tx.employee, frontendUserId, employeeId, '员工不存在')
      return operation(tx)
    })
  }

  private normalizedMonthlySegments(payload: Pick<MonthlySchedulePayload, 'isWorkday' | 'segments'>): ClockInterval[] {
    if (!payload.isWorkday) return []
    try {
      return normalizeClockIntervals(payload.segments || [])
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '排班时段无效')
    }
  }

  private async replaceMonthlyScheduleDay(
    tx: Prisma.TransactionClient,
    frontendUserId: string,
    employeeId: string,
    date: string,
    isWorkday: boolean,
    segments: ClockInterval[],
    remark?: string | null
  ) {
    const row = await tx.employeeMonthlyScheduleDay.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: {
        frontendUserId, employeeId, date, isWorkday, scheduledMinutes: isWorkday ? scheduledMinutes(segments) : 0,
        remark: this.optional(remark)
      },
      update: {
        isWorkday, scheduledMinutes: isWorkday ? scheduledMinutes(segments) : 0, remark: this.optional(remark)
      }
    })
    await tx.employeeScheduleSegment.deleteMany({ where: { frontendUserId, scheduleDayId: row.id } })
    if (segments.length) await tx.employeeScheduleSegment.createMany({ data: segments.map((segment, sequence) => ({
      frontendUserId, scheduleDayId: row.id, sequence, startTime: segment.startTime, endTime: segment.endTime
    })) })
    return row
  }

  private scheduleSegmentsForResponse(segments: ClockInterval[]) {
    return segments.map((segment, sequence) => ({ sequence, startTime: segment.startTime, endTime: segment.endTime }))
  }

  private monthlyScheduleDto(row: any) {
    const segments = (row.segments || []).slice().sort((left: any, right: any) => left.sequence - right.sequence)
      .map((segment: any) => ({ sequence: segment.sequence, startTime: segment.startTime, endTime: segment.endTime }))
    return {
      ...row,
      segments,
      scheduledMinutes: Number(row.scheduledMinutes || 0),
      breakMinutes: row.isWorkday ? breakMinutes(segments) : 0
    }
  }

  private previousMonth(month: string) {
    const [year, monthNumber] = month.split('-').map(Number)
    const date = new Date(Date.UTC(year, monthNumber - 2, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }

  private clockMinutes(value: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new BadRequestException('计划时间必须为 HH:mm 格式')
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }

  private async approvedLeaveMinutes(
    frontendUserId: string,
    employeeId: string,
    date: string,
    scheduled: number,
    db: Pick<Prisma.TransactionClient, 'employeeLeaveRequest'>
  ) {
    const leaves = await db.employeeLeaveRequest.findMany({ where: {
      frontendUserId, employeeId, status: EmployeeLeaveStatus.APPROVED,
      startDate: { lte: date }, endDate: { gte: date }
    } })
    return this.approvedLeaveMinutesFromRows(leaves, employeeId, date, scheduled)
  }

  private approvedLeaveMinutesFromRows(leaves: any[], employeeId: string, date: string, scheduled: number) {
    return Math.min(this.minutes(scheduled), leaves
      .filter((leave) => leave.employeeId === undefined || (leave.employeeId === employeeId && leave.startDate <= date && leave.endDate >= date))
      .reduce((sum, leave: any) => {
      if (leave.unit === EmployeeLeaveUnit.FULL_DAY) return sum + this.minutes(scheduled)
      if (leave.unit === EmployeeLeaveUnit.HALF_DAY) return sum + Math.round(this.minutes(scheduled) / 2)
      const hours = Number(leave.hours)
      return sum + (Number.isFinite(hours) && hours > 0
        ? Math.round(hours * 60)
        : Math.round(this.minutes(scheduled) * Number(leave.countedDays || 0)))
    }, 0))
  }

  private referencedLeaveTypeUpdateAllowed(current: any, payload: Partial<LeaveTypeDto>) {
    return payload.active === false && current.active !== false &&
      (payload.name === undefined || this.required(payload.name, '请假类型') === current.name) &&
      (payload.countsTowardRestQuota === undefined || payload.countsTowardRestQuota === current.countsTowardRestQuota)
  }

  private referencedCommissionTypeUpdateAllowed(current: any, payload: Partial<CommissionTypeDto>) {
    return payload.active === false && current.active !== false &&
      (payload.name === undefined || this.required(payload.name, '提成类型') === current.name) &&
      (payload.unitName === undefined || this.required(payload.unitName, '计量单位') === current.unitName) &&
      (payload.unitPrice === undefined || new Prisma.Decimal(payload.unitPrice).equals(current.unitPrice))
  }

  private beijingDate(value: Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
  }

  private assertWeekday(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 6) throw new BadRequestException('星期必须为 0 至 6')
  }

  private assertDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('日期必须为 YYYY-MM-DD 格式')
    const date = new Date(`${value}T00:00:00Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('日期无效')
  }

  private assertMonth(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value) || Number(value.slice(5, 7)) < 1 || Number(value.slice(5, 7)) > 12) throw new BadRequestException('月份必须为 YYYY-MM 格式')
  }

  private assertDateRange(startDate: string, endDate: string) {
    this.assertDate(startDate); this.assertDate(endDate)
    if (startDate > endDate) throw new BadRequestException('结束日期不能早于开始日期')
  }

  private daysInclusive(startDate: string, endDate: string) {
    return Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1
  }

  private monthDates(month: string) {
    const [year, monthNumber] = month.split('-').map(Number)
    const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
  }

  private monthBounds(month: string) {
    const dates = this.monthDates(month)
    return [dates[0], dates[dates.length - 1]] as const
  }

  private dateRange(startDate: string, endDate: string) {
    const dates: string[] = []
    const cursor = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`).getTime()
    while (cursor.getTime() <= end) {
      dates.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return dates
  }

  private monthsBetween(startDate: string, endDate: string) {
    this.assertDateRange(startDate, endDate)
    const result: string[] = []
    let [year, month] = startDate.slice(0, 7).split('-').map(Number)
    const end = endDate.slice(0, 7)
    while (true) {
      const value = `${year}-${String(month).padStart(2, '0')}`
      result.push(value)
      if (value === end) return result
      month += 1
      if (month === 13) { month = 1; year += 1 }
    }
  }

  private today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  }

  private async cleanupPhoto(photoPath?: string | null) {
    if (!photoPath || !this.photos) return
    try { await this.photos.remove(photoPath) } catch { /* database state stays authoritative; orphan cleanup can be retried */ }
  }

  private rethrowConflict(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(message)
    throw error
  }
}
