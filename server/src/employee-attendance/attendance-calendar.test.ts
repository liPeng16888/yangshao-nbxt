import { describe, expect, it } from 'vitest'
import {
  deriveAttendanceCalendarDay,
  formatDisplayHours,
  type AttendanceCalendarDaySource
} from './attendance-calendar'

const plannedSegments = [
  { startTime: '08:00', endTime: '12:00' },
  { startTime: '13:00', endTime: '19:00' }
]

function scheduledSource(overrides: Partial<AttendanceCalendarDaySource> = {}): AttendanceCalendarDaySource {
  return {
    date: '2026-08-11',
    isFuture: false,
    isWorkday: true,
    plannedSegments,
    actualSegments: [],
    scheduledMinutes: 600,
    workedMinutes: 600,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    absenceMinutes: 0,
    explicitAbsenceMinutes: 0,
    approvedLeaveMinutes: 0,
    overtimeMinutes: 0,
    leaveTypeName: '',
    leaveReason: '',
    remark: '',
    ...overrides
  }
}

function futureSource() {
  return scheduledSource({ isFuture: true, overtimeMinutes: 30, workedMinutes: 0 })
}

function restDaySource() {
  return scheduledSource({ isWorkday: false, workedMinutes: 600, overtimeMinutes: 30, remark: '公司排休' })
}

function actualSixHours() {
  return [{ checkInAt: '2026-08-11T08:00:00+08:00', checkOutAt: '2026-08-11T14:00:00+08:00' }]
}

function actualNineHours() {
  return [{ checkInAt: '2026-08-11T08:00:00+08:00', checkOutAt: '2026-08-11T17:00:00+08:00' }]
}

describe('deriveAttendanceCalendarDay', () => {
  it.each([
    ['FUTURE', futureSource()],
    ['REST', restDaySource()],
    ['NORMAL', scheduledSource({ actualSegments: [], explicitAbsenceMinutes: 0 })],
    ['OVERTIME', scheduledSource({ overtimeMinutes: 30 })],
    ['SHORT', scheduledSource({ actualSegments: actualSixHours(), workedMinutes: 360 })],
    ['LEAVE', scheduledSource({ workedMinutes: 360, approvedLeaveMinutes: 240, leaveReason: '照顾家人' })],
    ['ABSENT', scheduledSource({ actualSegments: [], explicitAbsenceMinutes: 600, absenceMinutes: 600, remark: '无故未到' })]
  ])('derives %s with explicit precedence', (status, source) => {
    expect(deriveAttendanceCalendarDay(source).status).toBe(status)
  })

  it('keeps a future day planned even when source metrics would otherwise classify it', () => {
    expect(deriveAttendanceCalendarDay(futureSource())).toMatchObject({
      status: 'FUTURE',
      scheduledMinutes: 600,
      workedMinutes: 0,
      displayMinutes: 600,
      durationText: '10 小时'
    })
  })

  it('lets approved leave cover a shortage without marking the same day absent', () => {
    expect(deriveAttendanceCalendarDay(scheduledSource({
      actualSegments: actualSixHours(),
      workedMinutes: 360,
      approvedLeaveMinutes: 240,
      absenceMinutes: 0,
      leaveTypeName: '事假',
      leaveReason: '照顾家人'
    }))).toMatchObject({ status: 'LEAVE', absenceMinutes: 0, shortageMinutes: 0, leaveReason: '照顾家人' })
  })

  it('requires no actual interval and no approved leave before classifying a full absence', () => {
    expect(deriveAttendanceCalendarDay(scheduledSource({
      actualSegments: actualSixHours(),
      workedMinutes: 0,
      absenceMinutes: 600,
      explicitAbsenceMinutes: 600
    })).status).not.toBe('ABSENT')
    expect(deriveAttendanceCalendarDay(scheduledSource({
      approvedLeaveMinutes: 1,
      absenceMinutes: 600,
      explicitAbsenceMinutes: 600
    })).status).toBe('LEAVE')
  })

  it('zeroes effective attendance metrics for a company rest day while preserving raw source data', () => {
    const source = restDaySource()
    const day = deriveAttendanceCalendarDay(source)
    expect(day).toMatchObject({
      status: 'REST', scheduledMinutes: 0, workedMinutes: 0, lateMinutes: 0,
      earlyLeaveMinutes: 0, absenceMinutes: 0, displayMinutes: 0
    })
    expect(day.source).toMatchObject({ actualSegments: source.actualSegments, overtimeMinutes: 30, remark: '公司排休' })
  })

  it('derives display duration without allowing overtime to cover a shortage', () => {
    expect(deriveAttendanceCalendarDay(scheduledSource({ overtimeMinutes: 30 }))).toMatchObject({
      status: 'OVERTIME', displayMinutes: 630, durationText: '10.5 小时（工作10＋加班0.5）'
    })
    expect(deriveAttendanceCalendarDay(scheduledSource({ workedMinutes: 360, approvedLeaveMinutes: 240 }))).toMatchObject({
      status: 'LEAVE', displayMinutes: 600, durationText: '10 小时（工作6＋请假4）'
    })
    expect(deriveAttendanceCalendarDay(scheduledSource({ actualSegments: actualNineHours(), workedMinutes: 540, overtimeMinutes: 120 }))).toMatchObject({
      status: 'SHORT', displayMinutes: 660, shortageMinutes: 60
    })
  })

  it('formats at most one decimal and supplies a reason fallback', () => {
    expect(formatDisplayHours(615)).toBe('10.3')
    expect(deriveAttendanceCalendarDay(scheduledSource({ approvedLeaveMinutes: 60 }))).toMatchObject({
      status: 'LEAVE', leaveReason: '未填写原因'
    })
  })

  it('uses the already-derived effective absence once and keeps residual shortage duration red', () => {
    expect(deriveAttendanceCalendarDay(scheduledSource({
      approvedLeaveMinutes: 120,
      explicitAbsenceMinutes: 240,
      absenceMinutes: 120
    }))).toMatchObject({
      status: 'LEAVE',
      workedMinutes: 360,
      absenceMinutes: 120,
      displayMinutes: 480,
      shortageMinutes: 120,
      durationText: '8 小时（工作6＋请假2）',
      backgroundTone: 'leave',
      durationTone: 'short'
    })
  })

  it('normalizes malformed minute inputs and labels reached work duration', () => {
    expect(deriveAttendanceCalendarDay(scheduledSource({
      scheduledMinutes: 600.4,
      workedMinutes: -5,
      lateMinutes: Number.NaN,
      earlyLeaveMinutes: -1,
      absenceMinutes: -4,
      explicitAbsenceMinutes: -2,
      overtimeMinutes: 30.6
    }))).toMatchObject({
      status: 'OVERTIME',
      scheduledMinutes: 600,
      workedMinutes: 600,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      absenceMinutes: 0,
      overtimeMinutes: 31,
      durationText: '10.5 小时（工作10＋加班0.5）'
    })
    expect(deriveAttendanceCalendarDay(scheduledSource()).durationText).toBe('10 小时（工作10）')
  })
})
