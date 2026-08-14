import { describe, expect, it } from 'vitest'
import { breakMinutes, deriveAttendanceMetrics, normalizeClockIntervals, scheduledMinutes } from './attendanceIntervals'

describe('attendance interval contracts', () => {
  it('preserves ordered work intervals while deriving payable time and breaks', () => {
    const intervals = normalizeClockIntervals([
      { startTime: '08:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' }
    ])

    expect(scheduledMinutes(intervals)).toBe(480)
    expect(breakMinutes(intervals)).toBe(60)
  })

  it('allows 24:00 only as an end and rejects overlapping or reverse work intervals', () => {
    expect(() => normalizeClockIntervals([{ startTime: '08:00', endTime: '12:00' }, { startTime: '11:30', endTime: '17:00' }])).toThrow('重叠')
    expect(() => normalizeClockIntervals([{ startTime: '17:00', endTime: '08:00' }])).toThrow('同一自然日')
    expect(scheduledMinutes(normalizeClockIntervals([{ startTime: '16:00', endTime: '24:00' }]))).toBe(480)
    expect(() => normalizeClockIntervals([{ startTime: '24:00', endTime: '24:00' }])).toThrow('同一自然日')
  })

  it('defaults missing actual intervals to normal attendance and derives absence from partial intervals', () => {
    const planned = normalizeClockIntervals([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }])
    expect(deriveAttendanceMetrics(planned, [], 0, 30)).toEqual({ workedMinutes: 480, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 30 })
    expect(deriveAttendanceMetrics(planned, [], 10, 30).absenceMinutes).toBe(20)
    expect(deriveAttendanceMetrics(planned, [{ checkInAt: '2026-08-03T08:10:00+08:00', checkOutAt: '2026-08-03T11:50:00+08:00' }], 0, 0))
      .toEqual({ workedMinutes: 220, lateMinutes: 10, earlyLeaveMinutes: 10, absenceMinutes: 260 })
  })
})
