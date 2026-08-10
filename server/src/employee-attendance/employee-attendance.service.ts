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
  MonthlySettingDto,
  WeeklyScheduleDto
} from './employee-attendance.dto'

type PrismaDelegate = { findFirst(args: any): Promise<any> }

@Injectable()
export class EmployeeAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: EmployeeDataCipherService,
    @Optional() private readonly photos?: PrivateEmployeePhotoService
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
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'Employee', (created) => created.id, (tx) => tx.employee.create({ data: {
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
    const current = await this.owned(this.prisma.employee, frontendUserId, id, '员工不存在')
    if (payload.hireDate) this.assertDate(payload.hireDate)
    if (payload.terminationDate) this.assertDate(payload.terminationDate)
    const hireDate = payload.hireDate || current.hireDate
    if (payload.terminationDate && payload.terminationDate < hireDate) throw new BadRequestException('离职日期不能早于入职日期')
    try {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'Employee', id, (tx) => tx.employee.update({ where: { id }, data: {
        ...(payload.employeeNumber !== undefined ? { employeeNumber: this.required(payload.employeeNumber, '员工编号') } : {}),
        ...(payload.name !== undefined ? { name: this.required(payload.name, '员工姓名') } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
        ...(payload.phone !== undefined ? { phone: this.optional(payload.phone) } : {}),
        ...(payload.idCard !== undefined ? { idCardCipher: this.encryptOptional(payload.idCard) } : {}),
        ...(payload.bankCard !== undefined ? { bankCardCipher: this.encryptOptional(payload.bankCard) } : {}),
        ...(payload.address !== undefined ? { addressCipher: this.encryptOptional(payload.address) } : {}),
        ...(payload.emergencyContact !== undefined ? { emergencyContactCipher: this.encryptOptional(payload.emergencyContact) } : {}),
        ...(payload.hireDate !== undefined ? { hireDate: payload.hireDate } : {}),
        ...(payload.terminationDate !== undefined ? { terminationDate: this.optional(payload.terminationDate) } : {}),
        ...(payload.baseSalary !== undefined ? { baseSalary: this.nonnegative(payload.baseSalary, '基本月薪') } : {}),
        ...(payload.attendanceBonus !== undefined ? { attendanceBonus: this.nonnegative(payload.attendanceBonus, '全勤奖') } : {}),
        ...(payload.overtimeHourlyRate !== undefined ? { overtimeHourlyRate: this.nonnegative(payload.overtimeHourlyRate, '加班时薪') } : {}),
        ...(payload.restQuotaDays !== undefined ? { restQuotaDays: this.nonnegative(payload.restQuotaDays, '月休额度') } : {})
      } }))
      return this.employeeDto(row, false)
    } catch (error) { this.rethrowConflict(error, '员工编号已存在') }
  }

  async deleteEmployee(frontendUserId: string, actorUserId: string, id: string) {
    const employee = await this.owned(this.prisma.employee, frontendUserId, id, '员工不存在')
    const historyCounts = await Promise.all([
      this.prisma.employeeAttendanceRecord.count({ where: { frontendUserId, employeeId: id } }),
      this.prisma.employeeLeaveRequest.count({ where: { frontendUserId, employeeId: id } }),
      this.prisma.employeeCommissionRecord.count({ where: { frontendUserId, employeeId: id } }),
      this.prisma.employeeBonus.count({ where: { frontendUserId, employeeId: id } }),
      this.prisma.employeePayrollItem.count({ where: { frontendUserId, employeeId: id } })
    ])
    if (historyCounts.some(Boolean)) {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'Employee', id, (tx) => tx.employee.update({ where: { id }, data: {
        status: EmployeeStatus.INACTIVE,
        terminationDate: employee.terminationDate || this.today()
      } }), '存在历史记录，已停用')
      return this.employeeDto(row, false)
    }
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'Employee', id, (tx) => tx.employee.delete({ where: { id } }))
    await this.cleanupPhoto(employee.photoPath)
    return { ok: true }
  }

  listWeeklySchedules(frontendUserId: string, employeeId?: string) {
    return this.prisma.employeeWeeklySchedule.findMany({ where: { frontendUserId, ...(employeeId ? { employeeId } : {}) }, orderBy: [{ employeeId: 'asc' }, { weekday: 'asc' }] })
  }

  async createWeeklySchedule(frontendUserId: string, actorUserId: string, payload: WeeklyScheduleDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertWeekday(payload.weekday)
    try {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeWeeklySchedule', (created) => created.id,
        (tx) => tx.employeeWeeklySchedule.create({ data: { frontendUserId, ...payload, scheduledMinutes: this.minutes(payload.scheduledMinutes) } }))
      return row
    } catch (error) { this.rethrowConflict(error, '该员工星期排班已存在') }
  }

  async updateWeeklySchedule(frontendUserId: string, actorUserId: string, id: string, payload: Partial<WeeklyScheduleDto>) {
    const current = await this.owned(this.prisma.employeeWeeklySchedule, frontendUserId, id, '排班不存在')
    if (payload.employeeId) await this.assertEmployee(frontendUserId, payload.employeeId)
    if (payload.weekday !== undefined) this.assertWeekday(payload.weekday)
    try {
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeWeeklySchedule', current.id, (tx) => tx.employeeWeeklySchedule.update({ where: { id }, data: {
        ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
        ...(payload.weekday !== undefined ? { weekday: payload.weekday } : {}),
        ...(payload.isWorkday !== undefined ? { isWorkday: payload.isWorkday } : {}),
        ...(payload.scheduledMinutes !== undefined ? { scheduledMinutes: this.minutes(payload.scheduledMinutes) } : {})
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
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeDateOverride', (created) => created.id,
        (tx) => tx.employeeDateOverride.create({ data: { frontendUserId, ...payload, scheduledMinutes: this.minutes(payload.scheduledMinutes), remark: this.optional(payload.remark) } }))
    } catch (error) { this.rethrowConflict(error, '该员工当日已有临时调班') }
  }

  async updateDateOverride(frontendUserId: string, actorUserId: string, id: string, payload: Partial<DateOverrideDto>) {
    const current = await this.owned(this.prisma.employeeDateOverride, frontendUserId, id, '临时调班不存在')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    await this.assertMonthWritable(frontendUserId, current.date)
    if (date.slice(0, 7) !== current.date.slice(0, 7)) await this.assertMonthWritable(frontendUserId, date)
    if (payload.employeeId) await this.assertEmployee(frontendUserId, payload.employeeId)
    const duplicate = await this.prisma.employeeDateOverride.findFirst({ where: {
      frontendUserId, employeeId: payload.employeeId || current.employeeId, date, id: { not: id }
    } })
    if (duplicate) throw new ConflictException('该员工当日已有临时调班')
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeDateOverride', id, (tx) => tx.employeeDateOverride.update({ where: { id }, data: {
        ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
        ...(payload.date !== undefined ? { date: payload.date } : {}),
        ...(payload.isWorkday !== undefined ? { isWorkday: payload.isWorkday } : {}),
        ...(payload.scheduledMinutes !== undefined ? { scheduledMinutes: this.minutes(payload.scheduledMinutes) } : {}),
        ...(payload.remark !== undefined ? { remark: this.optional(payload.remark) } : {})
      } }))
    } catch (error) { this.rethrowConflict(error, '该员工当日已有临时调班') }
  }

  async deleteDateOverride(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeDateOverride, frontendUserId, id, '临时调班不存在')
    await this.assertMonthWritable(frontendUserId, row.date)
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeDateOverride', id, (tx) => tx.employeeDateOverride.delete({ where: { id } }))
    return { ok: true }
  }

  listMonthlySettings(frontendUserId: string, month?: string) {
    if (month) this.assertMonth(month)
    return this.prisma.employeeMonthlySetting.findMany({ where: { frontendUserId, ...(month ? { month } : {}) }, orderBy: [{ month: 'desc' }, { employeeId: 'asc' }] })
  }

  async upsertMonthlySetting(frontendUserId: string, actorUserId: string, payload: MonthlySettingDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertMonth(payload.month)
    await this.assertMonthWritable(frontendUserId, payload.month)
    const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeMonthlySetting', (updated) => updated.id, (tx) => tx.employeeMonthlySetting.upsert({
      where: { employeeId_month: { employeeId: payload.employeeId, month: payload.month } },
      create: { frontendUserId, ...payload, scheduledWorkDays: this.nonnegative(payload.scheduledWorkDays, '应出勤天数'), restQuotaDays: this.nonnegative(payload.restQuotaDays, '月休额度') },
      update: { scheduledWorkDays: this.nonnegative(payload.scheduledWorkDays, '应出勤天数'), restQuotaDays: this.nonnegative(payload.restQuotaDays, '月休额度') }
    }))
    return row
  }

  async deleteMonthlySetting(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeMonthlySetting, frontendUserId, id, '月度设置不存在')
    await this.assertMonthWritable(frontendUserId, row.month)
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeMonthlySetting', id, (tx) => tx.employeeMonthlySetting.delete({ where: { id } }))
    return { ok: true }
  }

  listAttendance(frontendUserId: string, query: AttendanceListQueryDto = {}) {
    return this.prisma.employeeAttendanceRecord.findMany({ where: {
      frontendUserId, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...this.dateWhere(query)
    }, include: { employee: { select: { employeeNumber: true, name: true } } }, orderBy: [{ date: 'desc' }, { employeeId: 'asc' }] })
  }

  async createAttendance(frontendUserId: string, actorUserId: string, payload: AttendanceDto) {
    await this.assertEmployee(frontendUserId, payload.employeeId)
    this.assertDate(payload.date)
    await this.assertMonthWritable(frontendUserId, payload.date)
    const duplicate = await this.prisma.employeeAttendanceRecord.findFirst({ where: { frontendUserId, employeeId: payload.employeeId, date: payload.date } })
    if (duplicate) throw new ConflictException('该员工当日考勤已存在')
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeAttendanceRecord', (created) => created.id, (tx) => tx.employeeAttendanceRecord.create({ data: {
        frontendUserId,
        employeeId: payload.employeeId,
        date: payload.date,
        isScheduledWorkday: payload.isScheduledWorkday,
        scheduledMinutes: this.minutes(payload.scheduledMinutes),
        ...this.attendanceData(payload),
        manuallyEdited: true
      } }))
    } catch (error) { this.rethrowConflict(error, '该员工当日考勤已存在') }
  }

  async updateAttendance(frontendUserId: string, actorUserId: string, id: string, payload: Partial<AttendanceDto>) {
    const current = await this.owned(this.prisma.employeeAttendanceRecord, frontendUserId, id, '考勤记录不存在')
    if (current.payrollLockedAt) throw new ConflictException('该考勤记录已被工资确认锁定')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    await this.assertMonthWritable(frontendUserId, current.date)
    if (date.slice(0, 7) !== current.date.slice(0, 7)) await this.assertMonthWritable(frontendUserId, date)
    if (payload.employeeId) await this.assertEmployee(frontendUserId, payload.employeeId)
    const duplicate = await this.prisma.employeeAttendanceRecord.findFirst({ where: { frontendUserId, employeeId: payload.employeeId || current.employeeId, date, id: { not: id } } })
    if (duplicate) throw new ConflictException('该员工当日考勤已存在')
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeAttendanceRecord', id,
        (tx) => tx.employeeAttendanceRecord.update({ where: { id }, data: { ...this.attendanceData(payload), manuallyEdited: true } }))
    } catch (error) { this.rethrowConflict(error, '该员工当日考勤已存在') }
  }

  async deleteAttendance(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeAttendanceRecord, frontendUserId, id, '考勤记录不存在')
    if (row.payrollLockedAt) throw new ConflictException('该考勤记录已被工资确认锁定')
    await this.assertMonthWritable(frontendUserId, row.date)
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeAttendanceRecord', id, (tx) => tx.employeeAttendanceRecord.delete({ where: { id } }))
    return { ok: true }
  }

  async generateAttendance(frontendUserId: string, actorUserId: string, payload: GenerateAttendanceDto) {
    this.assertMonth(payload.month)
    await this.assertMonthWritable(frontendUserId, payload.month)
    const employeeIds = Array.from(new Set(payload.employeeIds || []))
    if (!employeeIds.length) throw new BadRequestException('请选择员工')
    const employees = await this.prisma.employee.findMany({
      where: { frontendUserId, id: { in: employeeIds } },
      select: { id: true, status: true, hireDate: true, terminationDate: true }
    })
    if (employees.length !== employeeIds.length) throw new NotFoundException('部分员工不存在')
    const [schedules, overrides, existing] = await Promise.all([
      this.prisma.employeeWeeklySchedule.findMany({ where: { frontendUserId, employeeId: { in: employeeIds } } }),
      this.prisma.employeeDateOverride.findMany({ where: { frontendUserId, employeeId: { in: employeeIds }, date: { startsWith: payload.month } } }),
      this.prisma.employeeAttendanceRecord.findMany({ where: { frontendUserId, employeeId: { in: employeeIds }, date: { startsWith: payload.month } } })
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
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeeAttendanceGeneration', payload.month, async (tx) => {
        for (const write of writes) {
          if (write.id) await tx.employeeAttendanceRecord.update({ where: { id: write.id }, data: write.data })
          else await tx.employeeAttendanceRecord.create({ data: write.data })
        }
        return { created, updated, skippedManual }
      })
    } catch (error) { this.rethrowConflict(error, '批量生成考勤时发生并发重复，请刷新后重试') }
  }

  listLeaveTypes(frontendUserId: string) {
    return this.prisma.employeeLeaveType.findMany({ where: { frontendUserId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
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
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeLeaveType', id, (tx) => tx.employeeLeaveType.update({ where: { id }, data: {
        ...(payload.name !== undefined ? { name: this.required(payload.name, '请假类型') } : {}),
        ...(payload.active !== undefined ? { active: payload.active } : {}),
        ...(payload.countsTowardRestQuota !== undefined ? { countsTowardRestQuota: payload.countsTowardRestQuota } : {})
      } }))
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
      frontendUserId, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...(query.status ? { status: query.status } : {}),
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
    const countedDays = await this.countLeaveDays(frontendUserId, payload)
    return this.withLeaveSerialization(frontendUserId, payload.employeeId, async (tx) => {
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
    if (current.payrollLockedAt) throw new ConflictException('该请假记录已被工资确认锁定')
    if (current.status !== EmployeeLeaveStatus.PENDING) throw new ConflictException('仅待审批请假可修改')
    const merged = { ...current, ...payload } as LeaveRequestDto
    this.assertDateRange(current.startDate, current.endDate)
    this.assertDateRange(merged.startDate, merged.endDate)
    await this.assertRangeWritable(frontendUserId, current.startDate, current.endDate)
    await this.assertRangeWritable(frontendUserId, merged.startDate, merged.endDate)
    if (payload.employeeId) await this.assertEmployee(frontendUserId, payload.employeeId)
    if (payload.leaveTypeId) {
      const type = await this.prisma.employeeLeaveType.findFirst({ where: { id: payload.leaveTypeId, frontendUserId, active: true } })
      if (!type) throw new NotFoundException('请假类型不存在或已停用')
    }
    const countedDays = await this.countLeaveDays(frontendUserId, merged)
    return this.withLeaveSerialization(frontendUserId, merged.employeeId, async (tx) => {
      await this.assertNoLeaveOverlap(frontendUserId, merged.employeeId, merged.startDate, merged.endDate, id, tx)
      const row = await tx.employeeLeaveRequest.update({ where: { id }, data: {
        ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
        ...(payload.leaveTypeId !== undefined ? { leaveTypeId: payload.leaveTypeId } : {}),
        ...(payload.startDate !== undefined ? { startDate: payload.startDate } : {}),
        ...(payload.endDate !== undefined ? { endDate: payload.endDate } : {}),
        ...(payload.unit !== undefined ? { unit: payload.unit } : {}),
        hours: merged.unit === EmployeeLeaveUnit.HOUR ? this.positive(merged.hours, '请假小时') : null,
        countedDays,
        ...(payload.reason !== undefined ? { reason: this.required(payload.reason, '请假原因') } : {})
      } })
      await this.audit(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeLeaveRequest', id, undefined, tx)
      return row
    })
  }

  async deleteLeaveRequest(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeLeaveRequest, frontendUserId, id, '请假记录不存在')
    if (row.payrollLockedAt) throw new ConflictException('该请假记录已被工资确认锁定')
    if (row.status !== EmployeeLeaveStatus.PENDING) throw new ConflictException('仅待审批请假可删除')
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeLeaveRequest', id, (tx) => tx.employeeLeaveRequest.delete({ where: { id } }))
    return { ok: true }
  }

  approveLeave(frontendUserId: string, actorUserId: string, id: string, reviewRemark?: string) {
    return this.reviewLeave(frontendUserId, actorUserId, id, EmployeeLeaveStatus.APPROVED, reviewRemark)
  }

  rejectLeave(frontendUserId: string, actorUserId: string, id: string, reviewRemark?: string) {
    return this.reviewLeave(frontendUserId, actorUserId, id, EmployeeLeaveStatus.REJECTED, reviewRemark)
  }

  listCommissionTypes(frontendUserId: string) {
    return this.prisma.employeeCommissionType.findMany({ where: { frontendUserId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
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
      const row = await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeCommissionType', id, (tx) => tx.employeeCommissionType.update({ where: { id }, data: {
        ...(payload.name !== undefined ? { name: this.required(payload.name, '提成类型') } : {}),
        ...(payload.unitName !== undefined ? { unitName: this.required(payload.unitName, '计量单位') } : {}),
        ...(payload.unitPrice !== undefined ? { unitPrice: this.nonnegative(payload.unitPrice, '默认单价') } : {}),
        ...(payload.active !== undefined ? { active: payload.active } : {})
      } }))
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
        (tx) => tx.employeeCommissionRecord.create({ data: { frontendUserId, employeeId: payload.employeeId, commissionTypeId: payload.commissionTypeId, date: payload.date, quantity, unitPriceSnapshot: unitPrice, amount, remark: this.optional(payload.remark) } }))
    } catch (error) { this.rethrowConflict(error, '提成记录重复') }
  }

  async updateCommissionRecord(frontendUserId: string, actorUserId: string, id: string, payload: Partial<CommissionRecordDto>) {
    const current = await this.owned(this.prisma.employeeCommissionRecord, frontendUserId, id, '提成记录不存在')
    if (current.payrollLockedAt) throw new ConflictException('该提成记录已被工资确认锁定')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    await this.assertMonthWritable(frontendUserId, current.date)
    if (date.slice(0, 7) !== current.date.slice(0, 7)) await this.assertMonthWritable(frontendUserId, date)
    if (payload.employeeId) await this.assertEmployee(frontendUserId, payload.employeeId)
    let type = null
    if (payload.commissionTypeId) {
      type = await this.prisma.employeeCommissionType.findFirst({ where: { id: payload.commissionTypeId, frontendUserId, active: true } })
      if (!type) throw new NotFoundException('提成类型不存在或已停用')
    }
    const quantity = this.nonnegative(payload.quantity ?? current.quantity, '提成数量')
    const unitPrice = this.nonnegative(payload.unitPrice ?? (type?.unitPrice ?? current.unitPriceSnapshot), '提成单价')
    try {
      return await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeCommissionRecord', id, (tx) => tx.employeeCommissionRecord.update({ where: { id }, data: {
        ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
        ...(payload.commissionTypeId !== undefined ? { commissionTypeId: payload.commissionTypeId } : {}),
        ...(payload.date !== undefined ? { date: payload.date } : {}), quantity, unitPriceSnapshot: unitPrice,
        amount: new Prisma.Decimal(unitPrice).mul(quantity).toDecimalPlaces(2),
        ...(payload.remark !== undefined ? { remark: this.optional(payload.remark) } : {})
      } }))
    } catch (error) { this.rethrowConflict(error, '提成记录重复') }
  }

  async deleteCommissionRecord(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeCommissionRecord, frontendUserId, id, '提成记录不存在')
    if (row.payrollLockedAt) throw new ConflictException('该提成记录已被工资确认锁定')
    await this.assertMonthWritable(frontendUserId, row.date)
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeCommissionRecord', id, (tx) => tx.employeeCommissionRecord.delete({ where: { id } }))
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
      (tx) => tx.employeeBonus.create({ data: { frontendUserId, employeeId: payload.employeeId, date: payload.date, amount: new Prisma.Decimal(this.positive(payload.amount, '奖金金额')), reason: this.required(payload.reason, '奖金原因') } }))
  }

  async updateBonus(frontendUserId: string, actorUserId: string, id: string, payload: Partial<BonusDto>) {
    const current = await this.owned(this.prisma.employeeBonus, frontendUserId, id, '奖金记录不存在')
    if (current.payrollLockedAt) throw new ConflictException('该奖金记录已被工资确认锁定')
    const date = payload.date || current.date
    this.assertDate(current.date)
    this.assertDate(date)
    await this.assertMonthWritable(frontendUserId, current.date)
    if (date.slice(0, 7) !== current.date.slice(0, 7)) await this.assertMonthWritable(frontendUserId, date)
    if (payload.employeeId) await this.assertEmployee(frontendUserId, payload.employeeId)
    return this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeeBonus', id, (tx) => tx.employeeBonus.update({ where: { id }, data: {
      ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
      ...(payload.date !== undefined ? { date: payload.date } : {}),
      ...(payload.amount !== undefined ? { amount: new Prisma.Decimal(this.positive(payload.amount, '奖金金额')) } : {}),
      ...(payload.reason !== undefined ? { reason: this.required(payload.reason, '奖金原因') } : {})
    } }))
  }

  async deleteBonus(frontendUserId: string, actorUserId: string, id: string) {
    const row = await this.owned(this.prisma.employeeBonus, frontendUserId, id, '奖金记录不存在')
    if (row.payrollLockedAt) throw new ConflictException('该奖金记录已被工资确认锁定')
    await this.assertMonthWritable(frontendUserId, row.date)
    await this.atomic(frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeeBonus', id, (tx) => tx.employeeBonus.delete({ where: { id } }))
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
    if (current.payrollLockedAt) throw new ConflictException('该请假记录已被工资确认锁定')
    if (current.status !== EmployeeLeaveStatus.PENDING) throw new ConflictException('仅待审批请假可审批')
    await this.assertRangeWritable(frontendUserId, current.startDate, current.endDate)
    return this.atomic(
      frontendUserId,
      actorUserId,
      status === EmployeeLeaveStatus.APPROVED ? EmployeeAuditAction.APPROVE : EmployeeAuditAction.REJECT,
      'EmployeeLeaveRequest',
      id,
      (tx) => tx.employeeLeaveRequest.update({ where: { id }, data: { status, reviewRemark: this.optional(reviewRemark), reviewedById: actorUserId, reviewedAt: new Date() } })
    )
  }

  private async assertNoLeaveOverlap(frontendUserId: string, employeeId: string, startDate: string, endDate: string, excludingId?: string, db: Pick<Prisma.TransactionClient, 'employeeLeaveRequest'> = this.prisma) {
    const overlap = await db.employeeLeaveRequest.findFirst({ where: {
      frontendUserId, employeeId, status: { in: [EmployeeLeaveStatus.PENDING, EmployeeLeaveStatus.APPROVED] },
      startDate: { lte: endDate }, endDate: { gte: startDate }, ...(excludingId ? { id: { not: excludingId } } : {})
    } })
    if (overlap) throw new ConflictException('请假时间与已有记录重叠')
  }

  private async withLeaveSerialization<T>(frontendUserId: string, employeeId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            `employee-leave:${frontendUserId}:${employeeId}`
          )
          return operation(tx)
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error
      }
    }
    throw new ConflictException('请假记录并发冲突，请重试')
  }

  private async countLeaveDays(frontendUserId: string, payload: LeaveRequestDto) {
    const days = this.daysInclusive(payload.startDate, payload.endDate)
    if (payload.unit === EmployeeLeaveUnit.HOUR) {
      if (days !== 1) throw new BadRequestException('小时请假必须在同一天')
      const scheduledMinutes = await this.scheduledMinutesForDate(frontendUserId, payload.employeeId, payload.startDate)
      if (scheduledMinutes <= 0) throw new BadRequestException('请假日期不是排班工作日')
      const leaveMinutes = this.positive(payload.hours, '请假小时') * 60
      if (leaveMinutes > scheduledMinutes) throw new BadRequestException('请假小时不能超过当日排班时长')
      return new Prisma.Decimal(leaveMinutes).div(scheduledMinutes).toDecimalPlaces(2)
    }
    if (payload.hours !== undefined) throw new BadRequestException('仅小时请假可填写小时数')
    let workdays = 0
    for (const date of this.dateRange(payload.startDate, payload.endDate)) {
      if (await this.scheduledMinutesForDate(frontendUserId, payload.employeeId, date) > 0) workdays += 1
    }
    if (!workdays) throw new BadRequestException('请假日期不包含排班工作日')
    return new Prisma.Decimal(payload.unit === EmployeeLeaveUnit.HALF_DAY ? workdays * 0.5 : workdays)
  }

  private async scheduledMinutesForDate(frontendUserId: string, employeeId: string, date: string) {
    const override = await this.prisma.employeeDateOverride.findFirst({ where: { frontendUserId, employeeId, date } })
    if (override) return override.isWorkday ? this.minutes(override.scheduledMinutes) : 0
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const weekly = await this.prisma.employeeWeeklySchedule.findFirst({ where: { frontendUserId, employeeId, weekday } })
    if (!weekly) throw new ConflictException(`缺少 ${date} 的员工排班`)
    return weekly.isWorkday ? this.minutes(weekly.scheduledMinutes) : 0
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

  private attendanceData(payload: Partial<AttendanceDto>) {
    return {
      ...(payload.employeeId !== undefined ? { employeeId: payload.employeeId } : {}),
      ...(payload.date !== undefined ? { date: payload.date } : {}),
      ...(payload.isScheduledWorkday !== undefined ? { isScheduledWorkday: payload.isScheduledWorkday } : {}),
      ...(payload.scheduledMinutes !== undefined ? { scheduledMinutes: this.minutes(payload.scheduledMinutes) } : {}),
      ...(payload.checkInAt !== undefined ? { checkInAt: this.optionalDateTime(payload.checkInAt) } : {}),
      ...(payload.checkOutAt !== undefined ? { checkOutAt: this.optionalDateTime(payload.checkOutAt) } : {}),
      ...(payload.workedMinutes !== undefined ? { workedMinutes: this.minutes(payload.workedMinutes) } : {}),
      ...(payload.lateMinutes !== undefined ? { lateMinutes: this.minutes(payload.lateMinutes) } : {}),
      ...(payload.earlyLeaveMinutes !== undefined ? { earlyLeaveMinutes: this.minutes(payload.earlyLeaveMinutes) } : {}),
      ...(payload.absenceMinutes !== undefined ? { absenceMinutes: this.minutes(payload.absenceMinutes) } : {}),
      ...(payload.overtimeMinutes !== undefined ? { overtimeMinutes: this.minutes(payload.overtimeMinutes) } : {}),
      ...(payload.remark !== undefined ? { remark: this.optional(payload.remark) } : {})
    }
  }

  private dateWhere(query: AttendanceListQueryDto) {
    if (query.month) { this.assertMonth(query.month); return { date: { startsWith: query.month } } }
    if (query.startDate) this.assertDate(query.startDate)
    if (query.endDate) this.assertDate(query.endDate)
    return query.startDate || query.endDate ? { date: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } } : {}
  }

  private async assertEmployee(frontendUserId: string, employeeId: string) {
    return this.owned(this.prisma.employee, frontendUserId, employeeId, '员工不存在')
  }

  private async owned(delegate: PrismaDelegate, frontendUserId: string, id: string, message: string) {
    const row = await delegate.findFirst({ where: { id, frontendUserId } })
    if (!row) throw new NotFoundException(message)
    return row
  }

  private async assertMonthWritable(frontendUserId: string, dateOrMonth: string) {
    const month = dateOrMonth.slice(0, 7)
    this.assertMonth(month)
    const confirmed = await this.prisma.employeePayrollRun.findFirst({ where: { frontendUserId, month, status: EmployeePayrollStatus.CONFIRMED }, select: { id: true } })
    if (confirmed) throw new ConflictException('该月份工资已确认，不能修改关联数据')
  }

  private async assertRangeWritable(frontendUserId: string, startDate: string, endDate: string) {
    for (const month of this.monthsBetween(startDate, endDate)) await this.assertMonthWritable(frontendUserId, month)
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
    reason?: string
  ) {
    return this.prisma.$transaction(async (tx) => {
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

  private optionalDateTime(value: unknown) {
    const text = String(value ?? '').trim()
    if (!text) return null
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) throw new BadRequestException('时间格式无效')
    return date
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
