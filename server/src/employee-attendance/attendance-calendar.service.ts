import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { EmployeeLeaveStatus, EmployeeLeaveUnit } from '@prisma/client'
import { deriveAttendanceMetrics } from './attendance-intervals'
import { deriveAttendanceCalendarDay } from './attendance-calendar'
import { PayrollService } from './payroll.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AttendanceCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService
  ) {}

  async customerView(frontendUserId: string, employeeId: string | undefined, month: string) {
    return this.view({ frontendUserId, employeeId, month, readonly: false })
  }

  async adminView(allowedFrontendUserIds: string[], employeeId: string | undefined, month: string) {
    return this.view({ allowedFrontendUserIds, employeeId, month, readonly: true })
  }

  protected today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  }

  private async view(input: { frontendUserId?: string; allowedFrontendUserIds?: string[]; employeeId?: string; month: string; readonly: boolean }) {
    this.assertMonth(input.month)
    const allowed = input.allowedFrontendUserIds
    const referenceToday = this.today()
    const overview = await this.payroll.calendarOverviewForAccounts(
      input.readonly ? allowed || [] : [input.frontendUserId!],
      input.month,
      referenceToday
    )
    const base = { month: input.month, overview, readonly: input.readonly }
    if (!input.employeeId || (allowed && allowed.length === 0)) return { ...base, employee: null, days: [] }

    const frontendWhere = allowed ? { frontendUserId: { in: allowed } } : { frontendUserId: input.frontendUserId! }
    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, ...frontendWhere },
      select: { id: true, frontendUserId: true, employeeNumber: true, name: true }
    })
    if (!employee) throw new NotFoundException('员工不存在')
    const [schedules, attendance, leaves] = await Promise.all([
      this.prisma.employeeMonthlyScheduleDay.findMany({
        where: { ...frontendWhere, employeeId: employee.id, date: { startsWith: input.month } },
        include: { segments: { orderBy: { sequence: 'asc' } } }, orderBy: { date: 'asc' }
      }),
      this.prisma.employeeAttendanceRecord.findMany({
        where: { ...frontendWhere, employeeId: employee.id, date: { startsWith: input.month } },
        include: { segments: { orderBy: { sequence: 'asc' } } }, orderBy: { date: 'asc' }
      }),
      this.prisma.employeeLeaveRequest.findMany({
        where: { ...frontendWhere, employeeId: employee.id, status: EmployeeLeaveStatus.APPROVED,
          startDate: { lte: this.monthBounds(input.month)[1] }, endDate: { gte: this.monthBounds(input.month)[0] } },
        include: { leaveType: { select: { name: true, countsTowardRestQuota: true } } }, orderBy: { startDate: 'asc' }
      })
    ])
    const schedulesByDate = new Map(schedules.map((row) => [row.date, row]))
    const attendanceByDate = new Map(attendance.map((row) => [row.date, row]))
    const days = this.monthDates(input.month).map((date, index) => {
      const schedule = schedulesByDate.get(date)
      const attendanceRow = attendanceByDate.get(date)
      const plan = (schedule?.segments || []).map((segment) => ({ startTime: segment.startTime, endTime: segment.endTime }))
      const actualSegments = (attendanceRow?.segments || []).map((segment) => ({ checkInAt: segment.checkInAt, checkOutAt: segment.checkOutAt }))
      const scheduledMinutes = schedule?.isWorkday ? schedule.scheduledMinutes : 0
      const approved = leaves.filter((leave) => leave.startDate <= date && leave.endDate >= date)
      const approvedLeaveMinutes = this.leaveMinutesForDate(approved, scheduledMinutes)
      const metrics = schedule?.isWorkday && plan.length
        ? deriveAttendanceMetrics(plan, actualSegments, approvedLeaveMinutes, Number(attendanceRow?.explicitAbsenceMinutes || 0))
        : { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0 }
      const primaryLeave = approved[0]
      const source = {
        date,
        isFuture: date > referenceToday,
        isWorkday: Boolean(schedule?.isWorkday),
        plannedSegments: plan,
        actualSegments,
        scheduledMinutes,
        workedMinutes: metrics.workedMinutes,
        lateMinutes: metrics.lateMinutes,
        earlyLeaveMinutes: metrics.earlyLeaveMinutes,
        absenceMinutes: metrics.absenceMinutes,
        explicitAbsenceMinutes: Number(attendanceRow?.explicitAbsenceMinutes || 0),
        approvedLeaveMinutes,
        overtimeMinutes: Number(attendanceRow?.overtimeMinutes || 0),
        leaveTypeName: primaryLeave?.leaveType.name || '',
        leaveReason: primaryLeave?.reason || '',
        remark: attendanceRow?.remark || schedule?.remark || ''
      }
      return {
        ...deriveAttendanceCalendarDay(source),
        day: index + 1,
        isFuture: source.isFuture,
        schedule: schedule ? {
          id: schedule.id, employeeId: schedule.employeeId, date: schedule.date, isWorkday: schedule.isWorkday,
          scheduledMinutes: schedule.scheduledMinutes, breakMinutes: schedule.breakMinutes,
          remark: schedule.remark || '', segments: plan
        } : null,
        actualSegments
      }
    })
    return { ...base, employee: { id: employee.id, employeeNumber: employee.employeeNumber, name: employee.name }, days }
  }

  private leaveMinutesForDate(leaves: any[], scheduledMinutes: number) {
    return Math.min(Math.max(0, scheduledMinutes), leaves.reduce((total, leave) => {
      if (leave.unit === EmployeeLeaveUnit.FULL_DAY) return total + scheduledMinutes
      if (leave.unit === EmployeeLeaveUnit.HALF_DAY) return total + Math.round(scheduledMinutes / 2)
      const hours = Number(leave.hours)
      return total + (Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : Math.round(scheduledMinutes * Number(leave.countedDays || 0)))
    }, 0))
  }

  private monthDates(month: string) {
    const [year, monthNumber] = month.split('-').map(Number)
    const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
  }

  private monthBounds(month: string) {
    const dates = this.monthDates(month)
    return [dates[0], dates.at(-1)!] as const
  }

  private assertMonth(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('月份必须为 YYYY-MM 格式')
  }
}
