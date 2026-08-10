// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  ADMIN_USER_KEY,
  adminLogin,
  getAdminAttendanceAudit,
  getAdminAttendanceEmployees,
  getFrontendOptions,
  request,
  revealAdminAttendanceEmployee
} from './api'

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
    const revealed = await revealAdminAttendanceEmployee(masked.id, 'admin123456', ['front-1'])
    expect(revealed.idCard).toBe('410000199001011234')

    const audits = await getAdminAttendanceAudit({ frontendUserIds: ['front-1'] })
    expect(audits[0]).toMatchObject({ action: 'REVEAL', entityId: masked.id })
  })

  it('rejects every attendance business mutation in Mock mode', async () => {
    await expect(request.post('/admin/employee-attendance/leaves/leave-1/approve')).rejects.toThrow('只读')
    await expect(request.patch('/admin/employee-attendance/employees/emp-1', {})).rejects.toThrow('只读')
    await expect(request.delete('/admin/employee-attendance/attendance/attendance-1')).rejects.toThrow('只读')
  })
})
