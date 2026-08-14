export type AttendanceCalendarStatus =
  | 'FUTURE'
  | 'ABSENT'
  | 'LEAVE'
  | 'REST'
  | 'NORMAL'
  | 'OVERTIME'
  | 'SHORT'

export type AttendanceCalendarTone = 'future' | 'normal' | 'leave' | 'absent' | 'rest' | 'overtime' | 'short'

export interface AttendanceCalendarPlanSegment {
  startTime: string
  endTime: string
}

export interface AttendanceCalendarActualSegment {
  checkInAt: string | Date
  checkOutAt: string | Date
}

export interface AttendanceCalendarDaySource {
  date: string
  isFuture: boolean
  isWorkday: boolean
  plannedSegments: AttendanceCalendarPlanSegment[]
  actualSegments: AttendanceCalendarActualSegment[]
  scheduledMinutes: number
  workedMinutes: number
  lateMinutes: number
  earlyLeaveMinutes: number
  absenceMinutes: number
  explicitAbsenceMinutes: number
  approvedLeaveMinutes: number
  overtimeMinutes: number
  leaveTypeName: string
  leaveReason: string
  remark: string
}

export interface AttendanceCalendarDay {
  date: string
  status: AttendanceCalendarStatus
  source: AttendanceCalendarDaySource
  scheduledMinutes: number
  workedMinutes: number
  lateMinutes: number
  earlyLeaveMinutes: number
  absenceMinutes: number
  approvedLeaveMinutes: number
  overtimeMinutes: number
  displayMinutes: number
  shortageMinutes: number
  durationText: string
  leaveTypeName: string
  leaveReason: string
  absenceReason: string
  backgroundTone: AttendanceCalendarTone
  durationTone: AttendanceCalendarTone
}

export function deriveAttendanceCalendarDay(source: AttendanceCalendarDaySource): AttendanceCalendarDay {
  const scheduledMinutes = minutes(source.scheduledMinutes)
  const approvedLeaveMinutes = Math.min(scheduledMinutes, minutes(source.approvedLeaveMinutes))
  const overtimeMinutes = minutes(source.overtimeMinutes)
  const hasActualIntervals = Array.isArray(source.actualSegments) && source.actualSegments.length > 0
  const effectiveAbsenceMinutes = minutes(source.absenceMinutes)
  const workedMinutes = hasActualIntervals
    ? Math.min(scheduledMinutes, minutes(source.workedMinutes))
    : Math.max(0, scheduledMinutes - approvedLeaveMinutes - effectiveAbsenceMinutes)
  const regularCreditedMinutes = Math.min(scheduledMinutes, workedMinutes + approvedLeaveMinutes)
  const shortageMinutes = Math.max(0, scheduledMinutes - regularCreditedMinutes)

  if (source.isFuture) {
    return day(source, 'FUTURE', {
      scheduledMinutes,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      absenceMinutes: 0,
      approvedLeaveMinutes: 0,
      overtimeMinutes: 0,
      displayMinutes: scheduledMinutes,
      shortageMinutes: 0,
      durationText: `${formatDisplayHours(scheduledMinutes)} 小时`,
      backgroundTone: 'future',
      durationTone: 'future'
    })
  }

  if (!source.isWorkday) {
    return day(source, 'REST', {
      scheduledMinutes: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      absenceMinutes: 0,
      approvedLeaveMinutes: 0,
      overtimeMinutes: 0,
      displayMinutes: 0,
      shortageMinutes: 0,
      durationText: '公司排休',
      backgroundTone: 'rest',
      durationTone: 'rest'
    })
  }

  const leaveReason = approvedLeaveMinutes > 0 ? reason(source.leaveReason) : ''
  const absenceReason = effectiveAbsenceMinutes > 0 ? reason(source.remark) : ''
  const isFullAbsence = !hasActualIntervals && approvedLeaveMinutes === 0 && effectiveAbsenceMinutes >= scheduledMinutes && scheduledMinutes > 0
  const status: AttendanceCalendarStatus = isFullAbsence
    ? 'ABSENT'
    : approvedLeaveMinutes > 0
      ? 'LEAVE'
      : shortageMinutes > 0
        ? 'SHORT'
        : overtimeMinutes > 0
          ? 'OVERTIME'
          : 'NORMAL'
  const displayMinutes = regularCreditedMinutes + overtimeMinutes

  return day(source, status, {
    scheduledMinutes,
    workedMinutes,
    lateMinutes: minutes(source.lateMinutes),
    earlyLeaveMinutes: minutes(source.earlyLeaveMinutes),
    absenceMinutes: effectiveAbsenceMinutes,
    approvedLeaveMinutes,
    overtimeMinutes,
    displayMinutes,
    shortageMinutes,
    durationText: durationText({ workedMinutes, approvedLeaveMinutes, overtimeMinutes, displayMinutes }),
    leaveTypeName: approvedLeaveMinutes > 0 ? source.leaveTypeName.trim() : '',
    leaveReason,
    absenceReason,
    backgroundTone: statusTone(status),
    durationTone: durationTone(status, shortageMinutes)
  })
}

export function formatDisplayHours(value: number): string {
  const hours = minutes(value) / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '')
}

function day(source: AttendanceCalendarDaySource, status: AttendanceCalendarStatus, values: Omit<AttendanceCalendarDay, 'date' | 'status' | 'source' | 'leaveTypeName' | 'leaveReason' | 'absenceReason'> & Partial<Pick<AttendanceCalendarDay, 'leaveTypeName' | 'leaveReason' | 'absenceReason'>>): AttendanceCalendarDay {
  return {
    date: source.date,
    status,
    source,
    leaveTypeName: '',
    leaveReason: '',
    absenceReason: '',
    ...values
  }
}

function durationText(values: { workedMinutes: number; approvedLeaveMinutes: number; overtimeMinutes: number; displayMinutes: number }) {
  const parts: string[] = []
  if (values.workedMinutes > 0) parts.push(`工作${formatDisplayHours(values.workedMinutes)}`)
  if (values.approvedLeaveMinutes > 0) parts.push(`请假${formatDisplayHours(values.approvedLeaveMinutes)}`)
  if (values.overtimeMinutes > 0) parts.push(`加班${formatDisplayHours(values.overtimeMinutes)}`)
  return parts.length > 0
    ? `${formatDisplayHours(values.displayMinutes)} 小时（${parts.join('＋')}）`
    : `${formatDisplayHours(values.displayMinutes)} 小时`
}

function statusTone(status: AttendanceCalendarStatus): AttendanceCalendarTone {
  if (status === 'FUTURE') return 'future'
  if (status === 'REST') return 'rest'
  if (status === 'LEAVE') return 'leave'
  if (status === 'ABSENT') return 'absent'
  return 'normal'
}

function durationTone(status: AttendanceCalendarStatus, shortageMinutes: number): AttendanceCalendarTone {
  if (shortageMinutes > 0 && status !== 'ABSENT') return 'short'
  if (status === 'OVERTIME') return 'overtime'
  if (status === 'SHORT') return 'short'
  return statusTone(status)
}

function minutes(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function reason(value: string) {
  return value.trim() || '未填写原因'
}
