// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_USER_KEY,
  adminLogin,
  getAdminAttendanceAudit,
  getAdminAttendanceEmployees,
  getAdminAttendanceSchedules,
  getAdminScheduleAttendanceOverview,
  getFrontendOptions,
  request,
  revealAdminAttendanceEmployee
} from './api'
import type { AdminRevealedAttendanceEmployee } from './types'

beforeAll(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  } satisfies Storage })
})

beforeEach(() => window.localStorage.clear())

describe('admin employee attendance mock contract', () => {
  it('returns every frontend account to the main admin and only permitted accounts to a sub admin', async () => {
    expect((await getFrontendOptions()).map((row) => row.id)).toEqual(['front-1', 'front-2'])

    await adminLogin({ account: 'sub001', password: 'sub123456' })
    expect(JSON.parse(window.localStorage.getItem(ADMIN_USER_KEY) || '{}')).toMatchObject({ id: 'sub-1', role: 'SUB_ADMIN' })
    expect((await getFrontendOptions()).map((row) => row.id)).toEqual(['front-1'])

    await expect(getAdminAttendanceEmployees({ frontendUserIds: ['front-1', 'front-2'] })).rejects.toThrow('没有访问部分前端账号的权限')
  })

  it('keeps employee fields masked until password verification and records the reveal audit', async () => {
    const [masked] = await getAdminAttendanceEmployees({ frontendUserIds: ['front-1'] })
    expect(masked.idCardMasked).toContain('*')
    expect(masked).not.toHaveProperty('idCard')

    await expect(revealAdminAttendanceEmployee(masked.id, 'wrong-password', ['front-1'])).rejects.toThrow('密码错误')
    const revealPromise: Promise<AdminRevealedAttendanceEmployee> = revealAdminAttendanceEmployee(masked.id, 'admin123456', ['front-1'])
    const revealed = await revealPromise
    expect(revealed.idCard).toBe('410000199001011234')
    expect(revealed.idCardMasked).toContain('*')

    const audits = await getAdminAttendanceAudit({ frontendUserIds: ['front-1'] })
    expect(audits[0]).toMatchObject({ action: 'REVEAL', entityId: masked.id })
  })

  it('rejects every attendance business mutation in Mock mode', async () => {
    for (const path of ['/admin/employee-attendance', '/admin/employee-attendance/leaves/leave-1/approve', '/admin/employee-attendance/schedule-attendance-overview', '/admin/employee-attendance/schedule-attendance-overview/day-1']) {
      await expect(request.post(path)).rejects.toThrow('只读')
      await expect(request.patch(path, {})).rejects.toThrow('只读')
      await expect(request.put(path, {})).rejects.toThrow('只读')
      await expect(request.delete(path)).rejects.toThrow('只读')
    }
  })

  it('returns the account-scoped combined calendar through the new GET-only contract', async () => {
    const result = await getAdminScheduleAttendanceOverview({
      frontendUserIds: ['front-1'], employeeId: 'emp-1', month: '2026-08',
      startDate: '2099-01-01', endDate: '2099-01-31', status: 'NOPE'
    })
    expect(result).toMatchObject({ month: '2026-08', readonly: true, employee: { id: 'emp-1', name: '张三' } })
    expect(result.days).toHaveLength(31)
    expect(result.days.find((day) => day.date === '2026-08-04')).toMatchObject({ status: 'NORMAL', backgroundTone: 'normal', displayMinutes: 600 })
    expect(result.days.find((day) => day.date === '2026-08-08')).toMatchObject({ status: 'OVERTIME', backgroundTone: 'normal', durationTone: 'overtime', displayMinutes: 630 })
    expect(result.days.find((day) => day.date === '2026-08-06')).toMatchObject({ status: 'SHORT', durationTone: 'short', displayMinutes: 540, shortageMinutes: 60 })
    expect(result.days.find((day) => day.date === '2026-08-07')).toMatchObject({ status: 'LEAVE', backgroundTone: 'leave', workedMinutes: 360, approvedLeaveMinutes: 240, displayMinutes: 600, leaveReason: '照顾家人' })
    expect(result.days.find((day) => day.date === '2026-08-09')).toMatchObject({ status: 'ABSENT', backgroundTone: 'absent', absenceReason: '无故未到' })
    expect(result.days.find((day) => day.date === '2026-08-20')).toMatchObject({ status: 'FUTURE', backgroundTone: 'future', schedule: { segments: [{ startTime: '08:00', endTime: '18:00' }] } })

    await adminLogin({ account: 'sub001', password: 'sub123456' })
    await expect(getAdminScheduleAttendanceOverview({ frontendUserIds: ['front-2'], employeeId: 'emp-3', month: '2026-08' })).rejects.toThrow('没有访问部分前端账号的权限')
  })

  it('derives the combined Mock today cards from the same Shanghai snapshot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-08T04:00:00Z'))
    try {
      const result = await getAdminScheduleAttendanceOverview({ frontendUserIds: ['front-1'], month: '2026-08' })
      expect(result.overview).toMatchObject({ todayPresent: 1, todayOnLeave: 0, todayAbsent: 0 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('matches server schedule and audit filter semantics', async () => {
    const schedules = await getAdminAttendanceSchedules({
      frontendUserIds: ['front-1'], startDate: '2099-01-01', endDate: '2099-01-31'
    })
    expect(schedules).toHaveLength(0)

    const [employee] = await getAdminAttendanceEmployees({ frontendUserIds: ['front-1'] })
    await revealAdminAttendanceEmployee(employee.id, 'admin123456', ['front-1'])
    const audits = await request.get('/admin/employee-attendance/audit', { params: {
      frontendUserIds: 'front-1', employeeId: 'not-the-employee', startDate: '2099-01-01', status: 'NOPE'
    } }) as Array<{ id: string; entityId: string }>
    expect(audits.some((row) => row.entityId === employee.id)).toBe(true)
  })

  it('gives the month filter precedence over date range, exposes planned shifts and ignores irrelevant status', async () => {
    const monthFirst = await getAdminAttendanceSchedules({
      frontendUserIds: ['front-1'], month: '2026-08', startDate: '2099-01-01', endDate: '2099-01-31'
    })
    expect(monthFirst.length).toBeGreaterThanOrEqual(7)

    const statusIgnored = await getAdminAttendanceSchedules({ frontendUserIds: ['front-1'], status: 'NOPE' })
    expect(statusIgnored.length).toBeGreaterThanOrEqual(7)
    expect(statusIgnored.every((row, index, rows) => !index || rows[index - 1].date >= row.date)).toBe(true)
    const workday = statusIgnored.find((row) => row.isWorkday)
    expect(workday).toMatchObject({ scheduledMinutes: 600, breakMinutes: 0 })
    expect(workday?.segments).toEqual([{ sequence: 0, startTime: '08:00', endTime: '18:00' }])
  })

  it('exposes actualSegments rather than persistence segments from readonly attendance records', async () => {
    const records = await request.get('/admin/employee-attendance/attendance', { params: { frontendUserIds: 'front-1', month: '2026-08' } }) as Array<Record<string, unknown>>
    expect(records[0]).not.toHaveProperty('segments')
    expect(records[0].actualSegments).toEqual([
      { sequence: 0, checkInAt: '2026-08-08T08:00:00+08:00', checkOutAt: '2026-08-08T18:00:00+08:00' }
    ])
  })
})
