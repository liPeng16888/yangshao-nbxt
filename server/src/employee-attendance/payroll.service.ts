import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common'
import {
  EmployeeAuditAction,
  EmployeeLeaveStatus,
  EmployeeLeaveUnit,
  EmployeePayrollStatus,
  EmployeeStatus,
  Prisma,
  UserRole
} from '@prisma/client'
import type { CurrentUser } from '../auth/current-user'
import { PasswordService } from '../auth/password.service'
import { PrismaService } from '../prisma/prisma.service'
import type { AdminEmployeeAttendanceQueryDto } from './employee-attendance.dto'
import { EmployeeDataCipherService } from './employee-data-cipher.service'
import { breakMinutes, deriveAttendanceMetrics } from './attendance-intervals'
import { deriveAttendanceCalendarDay } from './attendance-calendar'
import { calculatePayroll, type PayrollCalculationInput } from './payroll-calculator'
import { PayrollMonthLockService } from './payroll-month-lock.service'

type Db = Prisma.TransactionClient | PrismaService
type PayrollSource = {
  input: PayrollCalculationInput
  issues: string[]
  employee: any
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: EmployeeDataCipherService,
    private readonly passwords: PasswordService,
    @Optional() private readonly monthLocks?: PayrollMonthLockService
  ) {}

  async overview(frontendUserId: string, month: string) {
    this.assertMonth(month)
    const today = this.today()
    const [monthStart, monthEnd] = this.monthBounds(month)
    const [workforce, todayRows, monthRows, todaySchedules, monthSchedules, todayLeaves, monthLeaves, pendingLeave, payroll] = await Promise.all([
      this.prisma.employee.count({ where: { frontendUserId, status: EmployeeStatus.ACTIVE } }),
      this.prisma.employeeAttendanceRecord.findMany({
        where: { frontendUserId, date: today }, include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      this.prisma.employeeAttendanceRecord.findMany({
        where: { frontendUserId, date: { startsWith: month } }, include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      this.prisma.employeeMonthlyScheduleDay.findMany({ where: {
        frontendUserId, date: today, isWorkday: true, scheduledMinutes: { gt: 0 },
        employee: {
          status: EmployeeStatus.ACTIVE, hireDate: { lte: today },
          OR: [{ terminationDate: null }, { terminationDate: { gte: today } }]
        }
      }, include: { segments: { orderBy: { sequence: 'asc' } } } }),
      this.prisma.employeeMonthlyScheduleDay.findMany({
        where: { frontendUserId, date: { startsWith: month } },
        include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      this.prisma.employeeLeaveRequest.findMany({ where: {
        frontendUserId, status: EmployeeLeaveStatus.APPROVED,
        startDate: { lte: today }, endDate: { gte: today }
      } }),
      this.prisma.employeeLeaveRequest.findMany({ where: {
        frontendUserId, status: EmployeeLeaveStatus.APPROVED,
        startDate: { lte: monthEnd }, endDate: { gte: monthStart }
      } }),
      this.prisma.employeeLeaveRequest.count({ where: {
        frontendUserId, status: EmployeeLeaveStatus.PENDING,
        startDate: { lte: monthEnd }, endDate: { gte: monthStart }
      } }),
      this.prisma.employeePayrollRun.findFirst({
        where: { frontendUserId, month },
        include: { items: { select: { payableAmount: true, issues: true } } }
      })
    ])
    const projectedPayroll = (payroll?.items || []).reduce((sum, item) => sum.plus(item.payableAmount), new Prisma.Decimal(0))
    const payrollIssues = (payroll?.items || []).flatMap((item) => this.jsonIssues(item.issues))
    const monthScheduleByEmployeeDate = new Map(monthSchedules.map((schedule) => [`${schedule.employeeId}:${schedule.date}`, schedule]))
    const liveMonthRows = monthRows.map((row) => {
      const schedule = monthScheduleByEmployeeDate.get(`${row.employeeId}:${row.date}`)
      return schedule ? this.metricsForAttendance(schedule, row, monthLeaves) : row
    })
    const lateDays = liveMonthRows.filter((row) => row.lateMinutes > 0).length
    const earlyDays = liveMonthRows.filter((row) => row.earlyLeaveMinutes > 0).length
    const reminders = lateDays || earlyDays ? [`本月考勤提醒：迟到 ${lateDays} 天，早退 ${earlyDays} 天（不自动扣薪）`] : []
    const attendanceByEmployee = new Map(todayRows.map((row) => [row.employeeId, row]))
    const todayClassifications = new Map<string, 'PRESENT' | 'LEAVE' | 'ABSENT'>()
    for (const schedule of todaySchedules) {
      const leaveMinutes = this.leaveMinutesForDate(todayLeaves.filter((leave) => leave.employeeId === schedule.employeeId), today, schedule.scheduledMinutes)
      if (leaveMinutes > 0) {
        todayClassifications.set(schedule.employeeId, 'LEAVE')
        continue
      }
      const metrics = this.metricsForAttendance(schedule, attendanceByEmployee.get(schedule.employeeId), todayLeaves)
      todayClassifications.set(schedule.employeeId, metrics.absenceMinutes > 0 ? 'ABSENT' : 'PRESENT')
    }
    const todayAttendance = Array.from(todayClassifications.values()).filter((value) => value === 'PRESENT').length
    const todayLeave = Array.from(todayClassifications.values()).filter((value) => value === 'LEAVE').length
    const todayAbsence = Array.from(todayClassifications.values()).filter((value) => value === 'ABSENT').length
    return {
      month,
      workforce,
      todayAttendance,
      todayLeave,
      todayAbsence,
      overtimeMinutes: monthRows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
      pendingLeave,
      projectedPayroll: projectedPayroll.toDecimalPlaces(2).toNumber(),
      issueCount: payrollIssues.length + pendingLeave + reminders.length,
      issues: [...payrollIssues, ...(pendingLeave ? [`${pendingLeave} 条请假待审批`] : []), ...reminders]
    }
  }

  async calendarOverviewForAccounts(frontendUserIds: string[], month: string, referenceToday = this.today()) {
    this.assertMonth(month)
    if (!frontendUserIds.length) {
      return { month, workforce: 0, todayAttendance: 0, todayLeave: 0, todayAbsence: 0, overtimeMinutes: 0, pendingLeave: 0, projectedPayroll: 0, issueCount: 0, issues: [] }
    }
    const today = referenceToday
    const [monthStart, monthEnd] = this.monthBounds(month)
    const accountWhere = { frontendUserId: { in: frontendUserIds } }
    const [workforce, todayRows, monthRows, todaySchedules, monthSchedules, approvedLeaves, pendingLeave, payrollRuns] = await Promise.all([
      this.prisma.employee.count({ where: { ...accountWhere, status: EmployeeStatus.ACTIVE } }),
      this.prisma.employeeAttendanceRecord.findMany({ where: { ...accountWhere, date: today }, include: { segments: { orderBy: { sequence: 'asc' } } } }),
      this.prisma.employeeAttendanceRecord.findMany({ where: { ...accountWhere, date: { startsWith: month } }, include: { segments: { orderBy: { sequence: 'asc' } } } }),
      this.prisma.employeeMonthlyScheduleDay.findMany({ where: {
        ...accountWhere, date: today, isWorkday: true, scheduledMinutes: { gt: 0 }, employee: {
          status: EmployeeStatus.ACTIVE, hireDate: { lte: today }, OR: [{ terminationDate: null }, { terminationDate: { gte: today } }]
        }
      }, include: { segments: { orderBy: { sequence: 'asc' } } } }),
      this.prisma.employeeMonthlyScheduleDay.findMany({ where: { ...accountWhere, date: { startsWith: month } }, include: { segments: { orderBy: { sequence: 'asc' } } } }),
      this.prisma.employeeLeaveRequest.findMany({ where: { ...accountWhere, status: EmployeeLeaveStatus.APPROVED, startDate: { lte: monthEnd }, endDate: { gte: monthStart } } }),
      this.prisma.employeeLeaveRequest.count({ where: { ...accountWhere, status: EmployeeLeaveStatus.PENDING, startDate: { lte: monthEnd }, endDate: { gte: monthStart } } }),
      this.prisma.employeePayrollRun.findMany({ where: { ...accountWhere, month }, include: { items: { select: { payableAmount: true, issues: true } } } })
    ])
    const monthScheduleByKey = new Map(monthSchedules.map((schedule) => [`${schedule.frontendUserId}:${schedule.employeeId}:${schedule.date}`, schedule]))
    const liveMonthRows = monthRows.map((row) => {
      const schedule = monthScheduleByKey.get(`${row.frontendUserId}:${row.employeeId}:${row.date}`)
      const leaves = approvedLeaves.filter((leave) => leave.frontendUserId === row.frontendUserId)
      return schedule ? this.metricsForAttendance(schedule, row, leaves) : row
    })
    const attendanceByKey = new Map(todayRows.map((row) => [`${row.frontendUserId}:${row.employeeId}`, row]))
    const classifications = todaySchedules.map((schedule) => {
      const leaves = approvedLeaves.filter((leave) => leave.frontendUserId === schedule.frontendUserId && leave.employeeId === schedule.employeeId)
      const attendance = attendanceByKey.get(`${schedule.frontendUserId}:${schedule.employeeId}`)
      const leaveMinutes = this.leaveMinutesForDate(leaves, today, schedule.scheduledMinutes)
      const metrics = this.metricsForAttendance(schedule, attendance, leaves)
      const status = deriveAttendanceCalendarDay({
        date: today,
        isFuture: false,
        isWorkday: schedule.isWorkday,
        plannedSegments: (schedule.segments || []).map((segment: any) => ({ startTime: segment.startTime, endTime: segment.endTime })),
        actualSegments: (attendance?.segments || []).map((segment: any) => ({ checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt })),
        scheduledMinutes: schedule.scheduledMinutes,
        workedMinutes: metrics.workedMinutes,
        lateMinutes: metrics.lateMinutes,
        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
        absenceMinutes: metrics.absenceMinutes,
        explicitAbsenceMinutes: Number(attendance?.explicitAbsenceMinutes || 0),
        approvedLeaveMinutes: leaveMinutes,
        overtimeMinutes: Number(attendance?.overtimeMinutes || 0),
        leaveTypeName: '',
        leaveReason: '',
        remark: attendance?.remark || ''
      }).status
      return status === 'LEAVE' ? 'LEAVE' : status === 'ABSENT' ? 'ABSENT' : 'PRESENT'
    })
    const lateDays = liveMonthRows.filter((row) => row.lateMinutes > 0).length
    const earlyDays = liveMonthRows.filter((row) => row.earlyLeaveMinutes > 0).length
    const reminders = lateDays || earlyDays ? [`本月考勤提醒：迟到 ${lateDays} 天，早退 ${earlyDays} 天（不自动扣薪）`] : []
    const payrollItems = payrollRuns.flatMap((run) => run.items || [])
    const projectedPayroll = payrollItems.reduce((sum, item) => sum.plus(item.payableAmount), new Prisma.Decimal(0))
    const payrollIssues = payrollItems.flatMap((item) => this.jsonIssues(item.issues))
    return {
      month,
      workforce,
      todayAttendance: classifications.filter((value) => value === 'PRESENT').length,
      todayLeave: classifications.filter((value) => value === 'LEAVE').length,
      todayAbsence: classifications.filter((value) => value === 'ABSENT').length,
      overtimeMinutes: monthRows.reduce((sum, row) => sum + row.overtimeMinutes, 0),
      pendingLeave,
      projectedPayroll: projectedPayroll.toDecimalPlaces(2).toNumber(),
      issueCount: payrollIssues.length + pendingLeave + reminders.length,
      issues: [...payrollIssues, ...(pendingLeave ? [`${pendingLeave} 条请假待审批`] : []), ...reminders]
    }
  }

  async generate(frontendUserId: string, actorUserId: string, month: string) {
    this.assertMonth(month)
    return this.serializedMonth(frontendUserId, month, async (tx) => {
      const existing = await tx.employeePayrollRun.findFirst({ where: { frontendUserId, month } })
      if (existing?.status === EmployeePayrollStatus.CONFIRMED) throw new ConflictException('该月份工资已确认')
      const run = existing || await tx.employeePayrollRun.create({ data: { frontendUserId, month } })
      const items = await this.refreshDraft(tx, run)
      await this.audit(tx, frontendUserId, actorUserId, existing ? EmployeeAuditAction.UPDATE : EmployeeAuditAction.CREATE, 'EmployeePayrollRun', run.id, '生成工资草稿')
      return { ...run, items }
    })
  }

  getPayroll(frontendUserId: string, month: string) {
    this.assertMonth(month)
    return this.prisma.employeePayrollRun.findFirst({
      where: { frontendUserId, month },
      include: { items: { include: { adjustments: true }, orderBy: { employeeNumberSnapshot: 'asc' } } }
    })
  }

  async createAdjustment(frontendUserId: string, actorUserId: string, payrollItemId: string, amount: number, reason: string) {
    const normalized = this.adjustment(amount, reason)
    const owned = await this.prisma.employeePayrollItem.findFirst({ where: { id: payrollItemId, frontendUserId }, include: { payrollRun: { select: { month: true } } } })
    if (!owned) throw new NotFoundException('工资明细不存在')
    return this.serializedMonth(frontendUserId, owned.payrollRun.month, async (tx) => {
      const item = await this.draftItem(tx, frontendUserId, payrollItemId)
      const row = await tx.employeePayrollAdjustment.create({ data: {
        frontendUserId, payrollItemId, employeeId: item.employeeId, ...normalized
      } })
      await this.recalculateItem(tx, item)
      await this.audit(tx, frontendUserId, actorUserId, EmployeeAuditAction.CREATE, 'EmployeePayrollAdjustment', row.id, normalized.reason)
      return row
    })
  }

  async updateAdjustment(frontendUserId: string, actorUserId: string, id: string, amount: number, reason: string) {
    const normalized = this.adjustment(amount, reason)
    const owned = await this.prisma.employeePayrollAdjustment.findFirst({ where: { id, frontendUserId }, include: { payrollItem: { include: { payrollRun: { select: { month: true } } } } } })
    if (!owned) throw new NotFoundException('工资调整不存在')
    return this.serializedMonth(frontendUserId, owned.payrollItem.payrollRun.month, async (tx) => {
      const current = await tx.employeePayrollAdjustment.findFirst({ where: { id, frontendUserId } })
      if (!current) throw new NotFoundException('工资调整不存在')
      const item = await this.draftItem(tx, frontendUserId, current.payrollItemId)
      const row = await tx.employeePayrollAdjustment.update({ where: { id }, data: normalized })
      await this.recalculateItem(tx, item)
      await this.audit(tx, frontendUserId, actorUserId, EmployeeAuditAction.UPDATE, 'EmployeePayrollAdjustment', id, normalized.reason)
      return row
    })
  }

  async deleteAdjustment(frontendUserId: string, actorUserId: string, id: string) {
    const owned = await this.prisma.employeePayrollAdjustment.findFirst({ where: { id, frontendUserId }, include: { payrollItem: { include: { payrollRun: { select: { month: true } } } } } })
    if (!owned) throw new NotFoundException('工资调整不存在')
    return this.serializedMonth(frontendUserId, owned.payrollItem.payrollRun.month, async (tx) => {
      const current = await tx.employeePayrollAdjustment.findFirst({ where: { id, frontendUserId } })
      if (!current) throw new NotFoundException('工资调整不存在')
      const item = await this.draftItem(tx, frontendUserId, current.payrollItemId)
      await tx.employeePayrollAdjustment.delete({ where: { id } })
      await this.recalculateItem(tx, item)
      await this.audit(tx, frontendUserId, actorUserId, EmployeeAuditAction.DELETE, 'EmployeePayrollAdjustment', id, current.reason)
      return { ok: true }
    })
  }

  async confirm(frontendUserId: string, actorUserId: string, id: string) {
    const known = await this.prisma.employeePayrollRun.findFirst({ where: { id, frontendUserId } })
    if (!known) throw new NotFoundException('工资草稿不存在')
    return this.serializedMonth(frontendUserId, known.month, async (tx) => {
      const run = await tx.employeePayrollRun.findFirst({ where: { id, frontendUserId } })
      if (!run) throw new NotFoundException('工资草稿不存在')
      if (run.status !== EmployeePayrollStatus.DRAFT) throw new ConflictException('该月份工资已确认')
      const pendingLeave = await tx.employeeLeaveRequest.count({ where: {
        frontendUserId, status: EmployeeLeaveStatus.PENDING,
        startDate: { lte: this.monthBounds(run.month)[1] }, endDate: { gte: this.monthBounds(run.month)[0] }
      } })
      if (pendingLeave) throw new ConflictException(`存在 ${pendingLeave} 条待审批请假`)
      const items = await this.refreshDraft(tx, run)
      const blockers = items.flatMap((item: any) => this.jsonIssues(item.issues))
      if (blockers.length) throw new ConflictException(`工资确认被阻止：${Array.from(new Set(blockers)).join('；')}`)
      const confirmedAt = new Date()
      const won = await tx.employeePayrollRun.updateMany({
        where: { id, frontendUserId, status: EmployeePayrollStatus.DRAFT },
        data: { status: EmployeePayrollStatus.CONFIRMED, confirmedById: actorUserId, confirmedAt, reopenReason: null, reopenedAt: null }
      })
      if (won.count !== 1) throw new ConflictException('工资已被其他请求确认，请刷新')
      await this.setLocks(tx, frontendUserId, run.month, confirmedAt)
      await this.audit(tx, frontendUserId, actorUserId, EmployeeAuditAction.CONFIRM, 'EmployeePayrollRun', id)
      return tx.employeePayrollRun.findFirst({
        where: { id, frontendUserId }, include: { items: { include: { adjustments: true }, orderBy: { employeeNumberSnapshot: 'asc' } } }
      })
    })
  }

  async reopen(frontendUserId: string, actorUserId: string, id: string, reason: string) {
    const normalizedReason = String(reason || '').trim()
    if (!normalizedReason) throw new BadRequestException('撤销原因不能为空')
    const known = await this.prisma.employeePayrollRun.findFirst({ where: { id, frontendUserId } })
    if (!known) throw new NotFoundException('工资记录不存在')
    return this.serializedMonth(frontendUserId, known.month, async (tx) => {
      const run = await tx.employeePayrollRun.findFirst({ where: { id, frontendUserId } })
      if (!run) throw new NotFoundException('工资记录不存在')
      if (run.status !== EmployeePayrollStatus.CONFIRMED) throw new ConflictException('只能撤销已确认工资')
      const reopenedAt = new Date()
      const row = await tx.employeePayrollRun.update({ where: { id }, data: {
        status: EmployeePayrollStatus.DRAFT, confirmedById: null, confirmedAt: null,
        reopenReason: normalizedReason, reopenedAt
      } })
      await this.setLocks(tx, frontendUserId, run.month, null)
      await this.audit(tx, frontendUserId, actorUserId, EmployeeAuditAction.REOPEN, 'EmployeePayrollRun', id, normalizedReason)
      return row
    })
  }

  async adminOverview(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    const month = query.month || this.today().slice(0, 7)
    this.assertMonth(month)
    const [monthStart, monthEnd] = this.monthBounds(month)
    const [employees, attendance, leaves, payroll] = await Promise.all([
      this.prisma.employee.count({ where: { frontendUserId: { in: frontendUserIds }, status: EmployeeStatus.ACTIVE } }),
      this.prisma.employeeAttendanceRecord.count({ where: { frontendUserId: { in: frontendUserIds }, date: { startsWith: month } } }),
      this.prisma.employeeLeaveRequest.count({ where: {
        frontendUserId: { in: frontendUserIds }, status: EmployeeLeaveStatus.PENDING,
        startDate: { lte: monthEnd }, endDate: { gte: monthStart }
      } }),
      this.prisma.employeePayrollRun.count({ where: { frontendUserId: { in: frontendUserIds }, month } })
    ])
    return { month, workforce: employees, attendanceRecords: attendance, pendingLeave: leaves, payrollRuns: payroll, readonly: true }
  }

  async adminEmployees(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    if (query.status && !Object.values(EmployeeStatus).includes(query.status as EmployeeStatus)) throw new BadRequestException('员工状态无效')
    const status = query.status as EmployeeStatus | undefined
    const rows = await this.prisma.employee.findMany({ where: {
      frontendUserId: { in: frontendUserIds }, ...(query.employeeId ? { id: query.employeeId } : {}), ...(status ? { status } : {})
    }, include: { frontendUser: { select: { account: true, username: true, displayRemark: true } } }, orderBy: [{ frontendUserId: 'asc' }, { employeeNumber: 'asc' }] })
    return rows.map((row) => this.safeEmployee(row, false))
  }

  async adminSchedules(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    const rows = await this.prisma.employeeMonthlyScheduleDay.findMany({
      where: { ...this.adminEmployeeWhere(frontendUserIds, query), ...this.adminScheduleDateWhere(query) },
      include: {
        segments: { orderBy: { sequence: 'asc' } },
        employee: { select: { employeeNumber: true, name: true } },
        frontendUser: { select: { account: true, username: true, displayRemark: true } }
      },
      orderBy: [{ date: 'desc' }, { employeeId: 'asc' }]
    })
    return rows.map((row) => ({ ...row, breakMinutes: breakMinutes(row.segments) }))
  }

  async adminAttendance(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    const rows = await this.prisma.employeeAttendanceRecord.findMany({ where: {
      ...this.adminEmployeeWhere(frontendUserIds, query), ...this.adminDateWhere(query)
    }, include: {
      employee: { select: { employeeNumber: true, name: true } },
      segments: { orderBy: { sequence: 'asc' } }
    }, orderBy: [{ date: 'desc' }, { employeeId: 'asc' }] })
    if (!rows.length) return []
    const employeeIds = Array.from(new Set(rows.map((row) => row.employeeId)))
    const dates = Array.from(new Set(rows.map((row) => row.date))).sort()
    const [schedules, leaves] = await Promise.all([
      this.prisma.employeeMonthlyScheduleDay.findMany({
        where: { frontendUserId: { in: frontendUserIds }, employeeId: { in: employeeIds }, date: { in: dates } },
        include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      this.prisma.employeeLeaveRequest.findMany({ where: {
        frontendUserId: { in: frontendUserIds }, employeeId: { in: employeeIds }, status: EmployeeLeaveStatus.APPROVED,
        startDate: { lte: dates.at(-1)! }, endDate: { gte: dates[0] }
      } })
    ])
    const scheduleByKey = new Map(schedules.map((schedule) => [`${schedule.frontendUserId}:${schedule.employeeId}:${schedule.date}`, schedule]))
    return rows.map(({ segments, ...row }) => {
      const actualSegments = segments.slice().sort((left, right) => left.sequence - right.sequence).map((segment) => ({
        sequence: segment.sequence, checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt
      }))
      const schedule = scheduleByKey.get(`${row.frontendUserId}:${row.employeeId}:${row.date}`)
      if (!schedule) return { ...row, explicitAbsenceMinutes: Number(row.explicitAbsenceMinutes || 0), actualSegments }
      const metrics = this.metricsForAttendance(schedule, { ...row, segments }, leaves.filter((leave) => leave.frontendUserId === row.frontendUserId))
      return {
        ...row,
        isScheduledWorkday: schedule.isWorkday,
        scheduledMinutes: schedule.isWorkday ? schedule.scheduledMinutes : 0,
        explicitAbsenceMinutes: Number(row.explicitAbsenceMinutes || 0),
        ...metrics,
        actualSegments
      }
    })
  }

  adminLeaves(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    const overlap = this.adminOverlapWhere(query)
    return this.prisma.employeeLeaveRequest.findMany({ where: {
      ...this.adminEmployeeWhere(frontendUserIds, query), ...overlap,
      ...(query.status && Object.values(EmployeeLeaveStatus).includes(query.status as EmployeeLeaveStatus) ? { status: query.status as EmployeeLeaveStatus } : {})
    }, include: { employee: { select: { employeeNumber: true, name: true } }, leaveType: true }, orderBy: { startDate: 'desc' } })
  }

  adminCommissions(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    return this.prisma.employeeCommissionRecord.findMany({ where: {
      ...this.adminEmployeeWhere(frontendUserIds, query), ...this.adminDateWhere(query)
    }, include: { employee: { select: { employeeNumber: true, name: true } }, commissionType: true }, orderBy: { date: 'desc' } })
  }

  adminBonuses(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    return this.prisma.employeeBonus.findMany({ where: {
      ...this.adminEmployeeWhere(frontendUserIds, query), ...this.adminDateWhere(query)
    }, include: { employee: { select: { employeeNumber: true, name: true } } }, orderBy: { date: 'desc' } })
  }

  adminPayroll(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    if (query.month) this.assertMonth(query.month)
    const status = query.status && Object.values(EmployeePayrollStatus).includes(query.status as EmployeePayrollStatus) ? query.status as EmployeePayrollStatus : undefined
    return this.prisma.employeePayrollRun.findMany({ where: {
      frontendUserId: { in: frontendUserIds }, ...(query.month ? { month: query.month } : {}), ...(status ? { status } : {}),
      ...(query.employeeId ? { items: { some: { employeeId: query.employeeId } } } : {})
    }, include: {
      frontendUser: { select: { account: true, username: true, displayRemark: true } },
      items: { where: query.employeeId ? { employeeId: query.employeeId } : {}, include: { adjustments: true }, orderBy: { employeeNumberSnapshot: 'asc' } }
    }, orderBy: [{ month: 'desc' }, { frontendUserId: 'asc' }] })
  }

  adminAudit(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    return this.prisma.employeeAuditLog.findMany({ where: {
      frontendUserId: { in: frontendUserIds }, ...this.adminCreatedWhere(query)
    }, include: { actorUser: { select: { account: true, username: true, role: true } } }, orderBy: { createdAt: 'desc' } })
  }

  async adminRevealEmployee(admin: CurrentUser, frontendUserIds: string[], employeeId: string, password: string) {
    if (admin.role !== UserRole.ROOT_ADMIN && admin.role !== UserRole.SUB_ADMIN) throw new UnauthorizedException('没有后台查看权限')
    const current = await this.prisma.user.findUnique({ where: { id: admin.id }, select: { id: true, passwordHash: true, deletedAt: true, disabled: true } })
    if (!current || current.deletedAt || current.disabled || !await this.passwords.verify(String(password || ''), current.passwordHash)) {
      throw new UnauthorizedException('当前后台账号密码错误')
    }
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, frontendUserId: { in: frontendUserIds } } })
    if (!employee) throw new NotFoundException('员工不存在或无权查看')
    const revealed = this.safeEmployee(employee, true)
    await this.prisma.employeeAuditLog.create({ data: {
      frontendUserId: employee.frontendUserId, actorUserId: admin.id, action: EmployeeAuditAction.REVEAL,
      entityType: 'Employee', entityId: employee.id, reason: '后台敏感信息二次验证查看'
    } })
    return revealed
  }

  private async refreshDraft(tx: Prisma.TransactionClient, run: any) {
    const existing = await tx.employeePayrollItem.findMany({ where: { payrollRunId: run.id, frontendUserId: run.frontendUserId }, include: { adjustments: true } })
    const adjustments = new Map(existing.map((item: any) => [item.employeeId, item.adjustments || []]))
    const sources = await this.payrollSources(tx, run.frontendUserId, run.month, adjustments, existing.map((item: any) => item.employeeId))
    const keptIds: string[] = []
    const rows: any[] = []
    for (const source of sources) {
      const current = existing.find((item: any) => item.employeeId === source.employee.id)
      const data = this.payrollItemData(run, source)
      const row = current
        ? await tx.employeePayrollItem.update({ where: { id: current.id }, data })
        : await tx.employeePayrollItem.create({ data })
      if (row) { keptIds.push(row.id); rows.push({ ...row, adjustments: adjustments.get(source.employee.id) || [] }) }
    }
    for (const current of existing) {
      if (!keptIds.includes(current.id)) rows.push(current)
    }
    return rows
  }

  private async payrollSources(db: Db, frontendUserId: string, month: string, adjustments: Map<string, any[]>, preservedEmployeeIds: string[] = []) {
    const [monthStart, monthEnd] = this.monthBounds(month)
    const employees = await db.employee.findMany({ where: {
      frontendUserId, OR: [
        { id: { in: preservedEmployeeIds } },
        { AND: [{ hireDate: { lte: monthEnd } }, { OR: [
          { status: EmployeeStatus.ACTIVE, terminationDate: null },
          { terminationDate: { gte: monthStart } }
        ] }] }
      ]
    }, orderBy: { employeeNumber: 'asc' } })
    const employeeIds = employees.map((employee) => employee.id)
    const [settings, schedules, attendance, leaves, commissions, bonuses] = await Promise.all([
      db.employeeMonthlySetting.findMany({ where: { frontendUserId, month, employeeId: { in: employeeIds } } }),
      db.employeeMonthlyScheduleDay.findMany({
        where: { frontendUserId, date: { startsWith: month }, employeeId: { in: employeeIds } },
        include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      db.employeeAttendanceRecord.findMany({
        where: { frontendUserId, date: { startsWith: month }, employeeId: { in: employeeIds } },
        include: { segments: { orderBy: { sequence: 'asc' } } }
      }),
      db.employeeLeaveRequest.findMany({ where: {
        frontendUserId, employeeId: { in: employeeIds }, status: EmployeeLeaveStatus.APPROVED,
        startDate: { lte: monthEnd }, endDate: { gte: monthStart }
      }, include: { leaveType: true } }),
      db.employeeCommissionRecord.findMany({ where: { frontendUserId, date: { startsWith: month }, employeeId: { in: employeeIds } } }),
      db.employeeBonus.findMany({ where: { frontendUserId, date: { startsWith: month }, employeeId: { in: employeeIds } } })
    ])
    return employees.map((employee): PayrollSource => {
      const setting = settings.find((item) => item.employeeId === employee.id)
      const employeeAttendance = attendance.filter((item) => item.employeeId === employee.id)
      const employeeLeaves = leaves.filter((item) => item.employeeId === employee.id)
      const employeeSchedules = schedules.filter((item) => item.employeeId === employee.id &&
        item.date >= employee.hireDate && (!employee.terminationDate || item.date <= employee.terminationDate))
      const validWorkdays = employeeSchedules.filter((item) => item.isWorkday && item.scheduledMinutes > 0)
      const countedLeaveDays = employeeLeaves
        .filter((item) => item.leaveType.countsTowardRestQuota)
        .reduce((sum, item) => sum.plus(this.leavePortion(item, monthStart, monthEnd, validWorkdays)), new Prisma.Decimal(0))
      const attendanceByDate = new Map(employeeAttendance.map((item) => [item.date, item]))
      const attendanceEvaluations = validWorkdays.map((schedule) => {
        const item = attendanceByDate.get(schedule.date)
        if (!item) return { absenceDays: new Prisma.Decimal(0), hasLonePunch: false }
        const approvedLeaveMinutes = this.leaveMinutesForDate(employeeLeaves, schedule.date, schedule.scheduledMinutes)
        const actualSegments = (item.segments || []).map((segment: any) => ({ checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt }))
        const plan = (schedule.segments || []).map((segment: any) => ({ startTime: segment.startTime, endTime: segment.endTime }))
        const rawExplicitAbsence = Math.max(0, item.explicitAbsenceMinutes || 0)
        const effectiveAbsence = plan.length
          ? deriveAttendanceMetrics(plan, actualSegments, approvedLeaveMinutes, rawExplicitAbsence).absenceMinutes
          : Math.max(0, rawExplicitAbsence - approvedLeaveMinutes)
        const hasLonePunch = Boolean(item.checkInAt) !== Boolean(item.checkOutAt)
        return {
          absenceDays: Prisma.Decimal.min(new Prisma.Decimal(effectiveAbsence).div(schedule.scheduledMinutes), new Prisma.Decimal(1)),
          hasLonePunch
        }
      })
      const absenceDays = attendanceEvaluations.reduce((sum, evaluation) => sum.plus(evaluation.absenceDays), new Prisma.Decimal(0))
      const input: PayrollCalculationInput = {
        baseSalary: employee.baseSalary.toString(),
        attendanceBonus: employee.attendanceBonus.toString(),
        scheduledWorkDays: validWorkdays.length,
        restQuotaDays: setting?.restQuotaDays?.toString() || employee.restQuotaDays.toString(),
        countedLeaveDays: countedLeaveDays.toString(),
        absenceDays: absenceDays.toString(),
        overtimeMinutes: employeeAttendance.reduce((sum, item) => sum + item.overtimeMinutes, 0),
        overtimeHourlyRate: employee.overtimeHourlyRate.toString(),
        commissionAmount: commissions.filter((item) => item.employeeId === employee.id).reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)).toString(),
        bonusAmount: bonuses.filter((item) => item.employeeId === employee.id).reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)).toString(),
        adjustments: (adjustments.get(employee.id) || []).map((item) => ({ amount: item.amount.toString() }))
      }
      const result = calculatePayroll(input)
      const issues = [...result.issues]
      if (!employeeSchedules.length) issues.push('缺少员工月度排班')
      const invalidSchedules = employeeSchedules.filter((schedule) => schedule.isWorkday && schedule.scheduledMinutes <= 0).length
      if (invalidSchedules) issues.push(`有 ${invalidSchedules} 天排班工作日时长必须大于 0`)
      const lonePunches = attendanceEvaluations.filter((evaluation) => evaluation.hasLonePunch).length
      if (lonePunches) issues.push(`有 ${lonePunches} 天打卡必须成对`)
      return { input, issues: Array.from(new Set(issues)), employee }
    })
  }

  private payrollItemData(run: any, source: PayrollSource) {
    const result = calculatePayroll(source.input)
    const snapshot = { input: this.plainInput(source.input), result: { ...result, issues: source.issues }, generatedAt: new Date().toISOString() }
    return {
      frontendUserId: run.frontendUserId, payrollRunId: run.id, employeeId: source.employee.id,
      employeeNumberSnapshot: source.employee.employeeNumber, employeeNameSnapshot: source.employee.name,
      baseSalary: this.money(source.input.baseSalary), attendanceBonus: this.money(result.attendanceBonus),
      scheduledWorkDays: this.decimal(source.input.scheduledWorkDays), restQuotaDays: this.decimal(source.input.restQuotaDays),
      countedLeaveDays: this.decimal(source.input.countedLeaveDays), excessLeaveDays: this.decimal(result.excessLeaveDays),
      absenceDays: this.decimal(source.input.absenceDays), dailyRate: this.money(result.dailyRate),
      leaveDeduction: this.money(result.leaveDeduction), absenceDeduction: this.money(result.absenceDeduction),
      overtimeMinutes: Math.max(0, Math.round(Number(source.input.overtimeMinutes))), overtimeHourlyRate: this.money(source.input.overtimeHourlyRate),
      overtimePay: this.money(result.overtimePay), commissionAmount: this.money(result.commissionAmount), bonusAmount: this.money(result.bonusAmount),
      adjustmentAmount: this.money(result.adjustmentAmount), payableAmount: this.money(result.payableAmount),
      issues: source.issues, calculationSnapshot: snapshot
    }
  }

  private async draftItem(tx: Prisma.TransactionClient, frontendUserId: string, id: string) {
    const item = await tx.employeePayrollItem.findFirst({ where: { id, frontendUserId }, include: { payrollRun: true } })
    if (!item) throw new NotFoundException('工资明细不存在')
    if (item.payrollRun.status !== EmployeePayrollStatus.DRAFT) throw new ConflictException('已确认工资不能调整')
    return item
  }

  private async recalculateItem(tx: Prisma.TransactionClient, item: any) {
    const snapshot = item.calculationSnapshot as any
    if (!snapshot?.input) throw new ConflictException('工资计算快照缺失')
    const adjustments = await tx.employeePayrollAdjustment.findMany({ where: { payrollItemId: item.id, frontendUserId: item.frontendUserId } })
    const input = { ...snapshot.input, adjustments: adjustments.map((adjustment) => ({ amount: adjustment.amount.toString() })) }
    const result = calculatePayroll(input)
    const issues = this.jsonIssues(item.issues)
    return tx.employeePayrollItem.update({ where: { id: item.id }, data: {
      attendanceBonus: this.money(result.attendanceBonus), excessLeaveDays: this.decimal(result.excessLeaveDays),
      dailyRate: this.money(result.dailyRate), leaveDeduction: this.money(result.leaveDeduction), absenceDeduction: this.money(result.absenceDeduction),
      overtimePay: this.money(result.overtimePay), adjustmentAmount: this.money(result.adjustmentAmount), payableAmount: this.money(result.payableAmount),
      calculationSnapshot: { input: this.plainInput(input), result: { ...result, issues }, generatedAt: new Date().toISOString() }
    } })
  }

  private async setLocks(tx: Prisma.TransactionClient, frontendUserId: string, month: string, value: Date | null) {
    const [start, end] = this.monthBounds(month)
    const data = { payrollLockedAt: value }
    await tx.employeeMonthlyScheduleDay.updateMany({ where: { frontendUserId, date: { startsWith: month } }, data })
    await tx.employeeAttendanceRecord.updateMany({ where: { frontendUserId, date: { startsWith: month } }, data })
    await tx.employeeLeaveRequest.updateMany({ where: { frontendUserId, startDate: { lte: end }, endDate: { gte: start } }, data })
    await tx.employeeCommissionRecord.updateMany({ where: { frontendUserId, date: { startsWith: month } }, data })
    await tx.employeeBonus.updateMany({ where: { frontendUserId, date: { startsWith: month } }, data })
  }

  private async serializedMonth<T>(frontendUserId: string, month: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return (this.monthLocks || new PayrollMonthLockService(this.prisma)).run(frontendUserId, [month], operation)
  }

  private audit(tx: Db, frontendUserId: string, actorUserId: string, action: EmployeeAuditAction, entityType: string, entityId: string, reason?: string) {
    return tx.employeeAuditLog.create({ data: { frontendUserId, actorUserId, action, entityType, entityId, reason } })
  }

  private adjustment(amount: number, reason: string) {
    const value = Number(amount)
    if (!Number.isFinite(value) || value === 0) throw new BadRequestException('调整金额必须为非零数字')
    const normalizedReason = String(reason || '').trim()
    if (!normalizedReason) throw new BadRequestException('调整原因不能为空')
    return { amount: this.money(value), reason: normalizedReason }
  }

  private safeEmployee(row: any, reveal: boolean) {
    const sensitive = (ciphertext?: string | null) => {
      if (!ciphertext) return ''
      const value = this.cipher.decrypt(ciphertext)
      return reveal ? value : this.cipher.mask(value)
    }
    const { idCardCipher, bankCardCipher, addressCipher, emergencyContactCipher, photoPath, ...safe } = row
    return { ...safe, idCard: sensitive(idCardCipher), bankCard: sensitive(bankCardCipher), address: sensitive(addressCipher), emergencyContact: sensitive(emergencyContactCipher), hasPhoto: Boolean(photoPath) }
  }

  private leavePortion(leave: any, start: string, end: string, scheduleDays: any[]) {
    const overlapStart = leave.startDate > start ? leave.startDate : start
    const overlapEnd = leave.endDate < end ? leave.endDate : end
    if (overlapStart > overlapEnd) return new Prisma.Decimal(0)
    const scheduledDays = scheduleDays.filter((item) => item.date >= overlapStart && item.date <= overlapEnd).length
    if (!scheduledDays) return new Prisma.Decimal(0)
    if (leave.unit === EmployeeLeaveUnit.HOUR) return new Prisma.Decimal(leave.countedDays)
    return new Prisma.Decimal(scheduledDays).times(leave.unit === EmployeeLeaveUnit.HALF_DAY ? 0.5 : 1)
  }

  private metricsForAttendance(schedule: any, attendance: any | undefined, leaves: any[]) {
    if (!schedule.isWorkday) {
      return { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0 }
    }
    const approvedLeaveMinutes = this.leaveMinutesForDate(
      leaves.filter((leave) => leave.employeeId === schedule.employeeId),
      schedule.date,
      schedule.scheduledMinutes
    )
    const actualSegments = (attendance?.segments || []).map((segment: any) => ({
      checkInAt: segment.checkInAt,
      checkOutAt: segment.checkOutAt
    }))
    const plan = (schedule.segments || []).map((segment: any) => ({ startTime: segment.startTime, endTime: segment.endTime }))
    const explicitAbsenceMinutes = Math.max(0, Number(attendance?.explicitAbsenceMinutes || 0))
    if (!plan.length) {
      return {
        workedMinutes: 0,
        lateMinutes: Number(attendance?.lateMinutes || 0),
        earlyLeaveMinutes: Number(attendance?.earlyLeaveMinutes || 0),
        absenceMinutes: Math.max(0, explicitAbsenceMinutes - approvedLeaveMinutes)
      }
    }
    return deriveAttendanceMetrics(plan, actualSegments, approvedLeaveMinutes, explicitAbsenceMinutes)
  }

  private leaveMinutesForDate(leaves: any[], date: string, scheduledMinutes: number) {
    return Math.min(scheduledMinutes, leaves
      .filter((leave) => leave.startDate <= date && leave.endDate >= date)
      .reduce((total, leave) => {
        if (leave.unit === EmployeeLeaveUnit.FULL_DAY) return total + scheduledMinutes
        if (leave.unit === EmployeeLeaveUnit.HALF_DAY) return total + Math.round(scheduledMinutes / 2)
        const hours = Number(leave.hours)
        return total + (Number.isFinite(hours) && hours > 0
          ? Math.round(hours * 60)
          : Math.round(scheduledMinutes * Number(leave.countedDays || 0)))
      }, 0))
  }

  private adminEmployeeWhere(frontendUserIds: string[], query: AdminEmployeeAttendanceQueryDto) {
    return { frontendUserId: { in: frontendUserIds }, ...(query.employeeId ? { employeeId: query.employeeId } : {}) }
  }

  private adminDateWhere(query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    if (query.month) { this.assertMonth(query.month); return { date: { startsWith: query.month } } }
    return query.startDate || query.endDate ? { date: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } } : {}
  }

  private adminScheduleDateWhere(query: AdminEmployeeAttendanceQueryDto) {
    if (query.month) {
      this.assertMonth(query.month)
      return { date: { startsWith: query.month } }
    }
    return query.startDate || query.endDate
      ? { date: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
      : {}
  }

  private adminOverlapWhere(query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    if (query.month) {
      this.assertMonth(query.month)
      const [start, end] = this.monthBounds(query.month)
      return { startDate: { lte: end }, endDate: { gte: start } }
    }
    return { ...(query.endDate ? { startDate: { lte: query.endDate } } : {}), ...(query.startDate ? { endDate: { gte: query.startDate } } : {}) }
  }

  private adminCreatedWhere(query: AdminEmployeeAttendanceQueryDto) {
    this.assertExclusiveDateFilter(query)
    if (!query.month) return {}
    this.assertMonth(query.month)
    const [start, end] = this.monthBounds(query.month)
    const next = new Date(`${end}T00:00:00+08:00`)
    next.setDate(next.getDate() + 1)
    return { createdAt: { gte: new Date(`${start}T00:00:00+08:00`), lt: next } }
  }

  private assertExclusiveDateFilter(query: Pick<AdminEmployeeAttendanceQueryDto, 'month' | 'startDate' | 'endDate'>) {
    if (query.month && (query.startDate || query.endDate)) throw new BadRequestException('月份和日期范围不能同时使用')
  }

  private plainInput(input: PayrollCalculationInput) {
    return {
      baseSalary: Number(input.baseSalary), attendanceBonus: Number(input.attendanceBonus), scheduledWorkDays: Number(input.scheduledWorkDays),
      restQuotaDays: Number(input.restQuotaDays), countedLeaveDays: Number(input.countedLeaveDays), absenceDays: Number(input.absenceDays),
      overtimeMinutes: Number(input.overtimeMinutes), overtimeHourlyRate: Number(input.overtimeHourlyRate), commissionAmount: Number(input.commissionAmount),
      bonusAmount: Number(input.bonusAmount), adjustments: (input.adjustments || []).map((item) => ({ amount: Number(item.amount) }))
    }
  }

  private jsonIssues(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  private decimal(value: unknown) {
    try { return Prisma.Decimal.max(new Prisma.Decimal(value as any), new Prisma.Decimal(0)) } catch { return new Prisma.Decimal(0) }
  }

  private money(value: unknown) {
    return this.decimalSigned(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  }

  private decimalSigned(value: unknown) {
    try { return new Prisma.Decimal(value as any) } catch { return new Prisma.Decimal(0) }
  }

  private assertMonth(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12) throw new BadRequestException('月份必须为 YYYY-MM 格式')
  }

  private monthBounds(month: string) {
    const [year, monthNumber] = month.split('-').map(Number)
    return [`${month}-01`, `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`] as const
  }

  private daysInclusive(startDate: string, endDate: string) {
    if (startDate > endDate) return 0
    return Math.round((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1
  }

  private today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  }
}
