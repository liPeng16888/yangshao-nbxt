import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MobileAttendanceCalendar from './MobileAttendanceCalendar.vue'
import type { AttendanceCalendarDay } from '@/types/employeeAttendance'

const days: AttendanceCalendarDay[] = [
  {
    date: '2026-08-03', day: 3, isFuture: false, status: 'OVERTIME',
    schedule: {
      id: 'schedule-3', employeeId: 'emp-1', date: '2026-08-03', isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '18:00' }],
      scheduledMinutes: 540, breakMinutes: 60
    },
    actualSegments: [{ checkInAt: '2026-08-03T08:10:00+08:00', checkOutAt: '2026-08-03T18:30:00+08:00' }],
    scheduledMinutes: 540, workedMinutes: 570, approvedLeaveMinutes: 0, overtimeMinutes: 30,
    displayMinutes: 570, shortageMinutes: 0, durationText: '9.5 小时（工作9＋加班0.5）',
    leaveTypeName: '', leaveReason: '', absenceReason: '', backgroundTone: 'normal', durationTone: 'overtime'
  },
  {
    date: '2026-08-04', day: 4, isFuture: false, status: 'LEAVE',
    schedule: {
      id: 'schedule-4', employeeId: 'emp-1', date: '2026-08-04', isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '18:00' }], scheduledMinutes: 600, breakMinutes: 0
    },
    actualSegments: [], scheduledMinutes: 600, workedMinutes: 360, approvedLeaveMinutes: 240,
    overtimeMinutes: 0, displayMinutes: 600, shortageMinutes: 0,
    durationText: '10 小时（工作6＋请假4）', leaveTypeName: '事假', leaveReason: '家中有事',
    absenceReason: '', backgroundTone: 'leave', durationTone: 'normal'
  },
  {
    date: '2026-08-05', day: 5, isFuture: false, status: 'SHORT',
    schedule: {
      id: 'schedule-5', employeeId: 'emp-1', date: '2026-08-05', isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '18:00' }], scheduledMinutes: 600, breakMinutes: 0
    },
    actualSegments: [], scheduledMinutes: 600, workedMinutes: 540, approvedLeaveMinutes: 0,
    overtimeMinutes: 0, displayMinutes: 540, shortageMinutes: 60, durationText: '工作 9 小时',
    leaveTypeName: '', leaveReason: '', absenceReason: '早退', backgroundTone: 'normal', durationTone: 'short'
  }
]

describe('MobileAttendanceCalendar', () => {
  it('renders a seven-column touch calendar with server-owned planned, actual, leave, overtime and exception summaries', () => {
    const wrapper = mount(MobileAttendanceCalendar, {
      props: { month: '2026-08', days, selectedDates: [], batchMode: false }
    })

    expect(wrapper.findAll('[data-testid="mobile-calendar-weekday"]')).toHaveLength(7)
    expect(wrapper.findAll('[data-testid="mobile-calendar-day"]')).toHaveLength(31)
    expect(wrapper.get('[data-date="2026-08-03"]').classes()).toContain('mobile-attendance-day--normal')
    expect(wrapper.get('[data-date="2026-08-03"]').text()).toContain('排班 08:00–12:00、13:00–18:00')
    expect(wrapper.get('[data-date="2026-08-03"]').text()).toContain('实际 08:10–18:30')
    expect(wrapper.get('[data-date="2026-08-03"]').text()).toContain('加班 0.5 小时')
    expect(wrapper.get('[data-date="2026-08-04"]').text()).toContain('请假 4 小时 · 事假')
    expect(wrapper.get('[data-date="2026-08-05"]').text()).toContain('异常 出勤不足 1 小时')
    expect(wrapper.findAll('.mobile-touch-target')).toHaveLength(31)
  })

  it('opens a day normally and toggles it instead while batch selecting', async () => {
    const wrapper = mount(MobileAttendanceCalendar, {
      props: { month: '2026-08', days, selectedDates: [], batchMode: false }
    })
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    expect(wrapper.emitted('selectDate')).toEqual([['2026-08-03']])
    expect(wrapper.emitted('toggleDate')).toBeUndefined()

    await wrapper.setProps({ batchMode: true, selectedDates: ['2026-08-03'] })
    expect(wrapper.get('[data-date="2026-08-03"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    expect(wrapper.emitted('toggleDate')).toEqual([['2026-08-03']])
  })
})
