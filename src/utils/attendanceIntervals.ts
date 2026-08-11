import type { ScheduleSegment } from '@/types/employeeAttendance'

export interface ClockInterval { startTime: string; endTime: string }
export interface ActualInterval { checkInAt: string | Date; checkOutAt: string | Date }
export interface AttendanceMetrics { workedMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; absenceMinutes: number }

const clockPattern = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/

export function clockMinutes(value: string): number {
  const match = clockPattern.exec(value)
  if (!match) throw new Error('计划时间必须为 HH:mm 格式')
  return value === '24:00' ? 1440 : Number(match[1]) * 60 + Number(match[2])
}

export function normalizeClockIntervals(input: ReadonlyArray<Pick<ScheduleSegment, 'startTime' | 'endTime'>>): ClockInterval[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('工作日必须至少包含一个排班时段')
  let previousStart = -1
  let previousEnd = -1
  return input.map((interval) => {
    const start = clockMinutes(interval.startTime)
    const end = clockMinutes(interval.endTime)
    if (start >= end) throw new Error('计划时段必须在同一自然日内且下班时间晚于上班时间')
    if (start <= previousStart) throw new Error('计划时段必须严格按开始时间升序')
    if (start < previousEnd) throw new Error('计划时段不能重叠')
    previousStart = start
    previousEnd = end
    return { startTime: interval.startTime, endTime: interval.endTime }
  })
}

export function scheduledMinutes(intervals: ReadonlyArray<ClockInterval>): number {
  return intervals.reduce((total, interval) => total + clockMinutes(interval.endTime) - clockMinutes(interval.startTime), 0)
}

export function breakMinutes(intervals: ReadonlyArray<ClockInterval>): number {
  return intervals.slice(1).reduce((total, interval, index) => total + clockMinutes(interval.startTime) - clockMinutes(intervals[index].endTime), 0)
}

const shanghaiClock = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function deriveAttendanceMetrics(planned: ReadonlyArray<ClockInterval>, actual: ReadonlyArray<ActualInterval>, approvedLeaveMinutes: number, explicitAbsenceMinutes: number): AttendanceMetrics {
  const normalizedPlan = normalizeClockIntervals(planned)
  const scheduled = scheduledMinutes(normalizedPlan)
  if (!actual.length) return {
    workedMinutes: scheduled,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    absenceMinutes: Math.max(0, positiveMinutes(explicitAbsenceMinutes) - positiveMinutes(approvedLeaveMinutes))
  }
  let workedMinutes = 0
  let lateMinutes = 0
  let earlyLeaveMinutes = 0
  normalizedPlan.forEach((interval, index) => {
    const actualInterval = actual[index]
    if (!actualInterval) return
    const plannedStart = clockMinutes(interval.startTime)
    const plannedEnd = clockMinutes(interval.endTime)
    const actualStart = instantMinutes(actualInterval.checkInAt)
    const actualEnd = instantMinutes(actualInterval.checkOutAt)
    if (actualEnd < actualStart) throw new Error('实际下班时间必须晚于上班时间')
    lateMinutes += Math.max(0, actualStart - plannedStart)
    earlyLeaveMinutes += Math.max(0, plannedEnd - actualEnd)
    workedMinutes += Math.max(0, Math.min(plannedEnd, actualEnd) - Math.max(plannedStart, actualStart))
  })
  return { workedMinutes, lateMinutes, earlyLeaveMinutes, absenceMinutes: Math.max(0, scheduled - workedMinutes - positiveMinutes(approvedLeaveMinutes)) }
}

function instantMinutes(value: string | Date): number {
  const instant = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(instant.getTime())) throw new Error('实际打卡时间无效')
  const parts = shanghaiClock.formatToParts(instant)
  return Number(parts.find((part) => part.type === 'hour')?.value) * 60 + Number(parts.find((part) => part.type === 'minute')?.value)
}

function positiveMinutes(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0 }
