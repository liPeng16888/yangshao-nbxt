import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MonthlyScheduleCalendar from './MonthlyScheduleCalendar.vue'
import type { AttendanceCalendarDay, AttendanceCalendarStatus, AttendanceCalendarTone } from '@/types/employeeAttendance'

function day(
  date: string,
  status: AttendanceCalendarStatus,
  backgroundTone: AttendanceCalendarTone,
  durationTone: AttendanceCalendarTone,
  overrides: Partial<AttendanceCalendarDay> = {}
): AttendanceCalendarDay {
  const dayNumber = Number(date.slice(-2))
  return {
    date,
    day: dayNumber,
    isFuture: status === 'FUTURE',
    status,
    schedule: status === 'REST' ? {
      id: `schedule-${date}`, employeeId: 'emp-1', date, isWorkday: false, segments: [], scheduledMinutes: 0, breakMinutes: 0
    } : {
      id: `schedule-${date}`, employeeId: 'emp-1', date, isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '18:00' }], scheduledMinutes: 600, breakMinutes: 90
    },
    actualSegments: [], scheduledMinutes: status === 'REST' ? 0 : 600,
    workedMinutes: status === 'SHORT' ? 540 : 600, approvedLeaveMinutes: 0,
    overtimeMinutes: status === 'OVERTIME' ? 30 : 0,
    displayMinutes: status === 'OVERTIME' ? 630 : status === 'SHORT' ? 540 : 600,
    shortageMinutes: status === 'SHORT' ? 60 : 0,
    durationText: status === 'OVERTIME' ? '10.5 小时（工作10＋加班0.5）' : status === 'SHORT' ? '工作 9 小时' : '工作 10 小时',
    leaveTypeName: '', leaveReason: '', absenceReason: '', backgroundTone, durationTone,
    ...overrides
  }
}

describe('MonthlyScheduleCalendar', () => {
  it('renders every server-owned semantic state, duration and accessible legend', () => {
    const days = [
      day('2026-08-01', 'FUTURE', 'future', 'future'),
      day('2026-08-02', 'NORMAL', 'normal', 'normal'),
      day('2026-08-03', 'OVERTIME', 'normal', 'overtime'),
      day('2026-08-04', 'SHORT', 'normal', 'short'),
      day('2026-08-05', 'LEAVE', 'leave', 'normal', {
        workedMinutes: 360, approvedLeaveMinutes: 240, displayMinutes: 600,
        durationText: '10 小时（工作6＋请假4）', leaveTypeName: '事假', leaveReason: '家中有事'
      }),
      day('2026-08-06', 'ABSENT', 'absent', 'short', {
        workedMinutes: 0, displayMinutes: 0, shortageMinutes: 600,
        durationText: '0 小时', absenceReason: '未到岗'
      }),
      day('2026-08-07', 'REST', 'rest', 'rest', { durationText: '公司排休' })
    ]
    const wrapper = mount(MonthlyScheduleCalendar, {
      props: { month: '2026-08', days, selectedDates: [], batchMode: false }
    })

    for (const tone of ['future', 'normal', 'leave', 'absent', 'rest']) {
      expect(wrapper.find(`.calendar-day--${tone}`).exists()).toBe(true)
    }
    expect(wrapper.get('[data-date="2026-08-01"]').text()).toContain('08:00–18:00')
    expect(wrapper.get('[data-date="2026-08-03"] .calendar-day__duration').classes()).toContain('calendar-day__duration--overtime')
    expect(wrapper.get('[data-date="2026-08-03"]').text()).toContain('10.5 小时（工作10＋加班0.5）')
    expect(wrapper.get('[data-date="2026-08-04"] .calendar-day__duration').classes()).toContain('calendar-day__duration--short')
    expect(wrapper.get('[data-date="2026-08-04"]').text()).toContain('工作 9 小时')
    expect(wrapper.get('[data-date="2026-08-05"]').text()).toContain('事假')
    expect(wrapper.get('[data-date="2026-08-05"]').text()).toContain('家中有事')
    expect(wrapper.get('[data-date="2026-08-06"]').text()).toContain('旷工')
    expect(wrapper.get('[data-date="2026-08-06"]').text()).toContain('未到岗')
    expect(wrapper.get('[data-date="2026-08-07"]').text()).toContain('公司排休')
    expect(wrapper.find('.calendar-day__segment--planned').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(/休息\s+\d+\s*分钟/)
    expect(wrapper.get('[data-testid="attendance-calendar-legend"]').text()).toContain('未来排班')
    expect(wrapper.get('[data-testid="attendance-calendar-legend"]').text()).toContain('旷工')
  })
})
