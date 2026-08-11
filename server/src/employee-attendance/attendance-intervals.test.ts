import { describe, expect, it } from 'vitest'
import { breakMinutes, deriveAttendanceMetrics, normalizeClockIntervals, scheduledMinutes } from './attendance-intervals'

describe('attendance intervals', () => {
  it('sums work and excludes the gap as rest', () => {
    const intervals = normalizeClockIntervals([
      { startTime: '08:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:30' }
    ])
    expect(scheduledMinutes(intervals)).toBe(510)
    expect(breakMinutes(intervals)).toBe(60)
  })

  it.each([
    [[{ startTime: '20:00', endTime: '08:00' }], '同一自然日'],
    [[{ startTime: '08:00', endTime: '12:00' }, { startTime: '11:30', endTime: '15:00' }], '重叠']
  ])('rejects invalid planned intervals', (input, message) => {
    expect(() => normalizeClockIntervals(input)).toThrow(message)
  })

  it('defaults missing actual intervals to normal unless absence is explicit', () => {
    const plan = normalizeClockIntervals([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }])
    expect(deriveAttendanceMetrics(plan, [], 0, 0)).toMatchObject({ workedMinutes: 480, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0 })
    expect(deriveAttendanceMetrics(plan, [], 0, 60).absenceMinutes).toBe(60)
  })

  it('derives late, early and uncovered absence from paired actual intervals', () => {
    const plan = normalizeClockIntervals([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }])
    const actual = [{ checkInAt: '2026-08-11T08:10:00+08:00', checkOutAt: '2026-08-11T11:50:00+08:00' }]
    expect(deriveAttendanceMetrics(plan, actual, 0, 0)).toMatchObject({ lateMinutes: 10, earlyLeaveMinutes: 10, absenceMinutes: 260 })
  })
})
