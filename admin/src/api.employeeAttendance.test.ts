// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ADMIN_USER_KEY,
  adminLogin,
  getAdminAttendanceAudit,
  getAdminAttendanceEmployees,
  getAdminAttendanceSchedules,
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

    const employees = await getAdminAttendanceEmployees({ frontendUserIds: ['front-1', 'front-2'] })
    expect(new Set(employees.map((row) => row.frontendUserId))).toEqual(new Set(['front-1']))
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
    for (const path of ['/admin/employee-attendance', '/admin/employee-attendance/leaves/leave-1/approve']) {
      await expect(request.post(path)).rejects.toThrow('只读')
      await expect(request.patch(path, {})).rejects.toThrow('只读')
      await expect(request.put(path, {})).rejects.toThrow('只读')
      await expect(request.delete(path)).rejects.toThrow('只读')
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
    expect(monthFirst).toHaveLength(2)

    const statusIgnored = await getAdminAttendanceSchedules({ frontendUserIds: ['front-1'], status: 'NOPE' })
    expect(statusIgnored).toHaveLength(2)
    expect(statusIgnored.every((row, index, rows) => !index || rows[index - 1].date >= row.date)).toBe(true)
    const workday = statusIgnored.find((row) => row.isWorkday)
    expect(workday).toMatchObject({ date: '2026-08-08', scheduledMinutes: 510, breakMinutes: 60 })
    expect(workday?.segments).toEqual([
      { sequence: 0, startTime: '08:00', endTime: '12:00' },
      { sequence: 1, startTime: '13:00', endTime: '17:30' }
    ])
  })

  it('exposes actualSegments rather than persistence segments from readonly attendance records', async () => {
    const records = await request.get('/admin/employee-attendance/attendance', { params: { frontendUserIds: 'front-1', month: '2026-08' } }) as Array<Record<string, unknown>>
    expect(records[0]).not.toHaveProperty('segments')
    expect(records[0].actualSegments).toEqual([
      { sequence: 0, checkInAt: '2026-08-08T08:00:00+08:00', checkOutAt: '2026-08-08T12:00:00+08:00' },
      { sequence: 1, checkInAt: '2026-08-08T13:00:00+08:00', checkOutAt: '2026-08-08T17:30:00+08:00' }
    ])
  })
})
