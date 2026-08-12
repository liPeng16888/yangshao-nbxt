// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AdminApi from './api'

const axiosMock = vi.hoisted(() => {
  const handlers: { rejected?: (error: any) => Promise<never> } = {}
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn((_fulfilled, rejected) => { handlers.rejected = rejected }) }
    },
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn()
  }
  return { handlers, instance, create: vi.fn(() => instance) }
})
const message = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('axios', () => ({ default: { create: axiosMock.create } }))
vi.mock('element-plus', () => ({ ElMessage: message }))

let testStorage: Storage
let adminApi: typeof AdminApi
beforeAll(() => {
  const values = new Map<string, string>()
  testStorage = {
    get length() { return values.size }, clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  } satisfies Storage
})

afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('VITE_ADMIN_USE_MOCKS', 'false')
  testStorage.clear()
  vi.stubGlobal('localStorage', testStorage)
  vi.stubGlobal('window', { localStorage: testStorage, location: { href: '' } })
  adminApi = await import('./api')
})

describe('admin API unauthorized response handling', () => {
  it('preserves the admin session for a password-gated employee reveal 401', async () => {
    window.localStorage.setItem('ys_admin_token', 'token')
    window.localStorage.setItem('ys_admin_user', '{"id":"admin-1"}')
    const error = {
      config: { preserveAdminSessionOnUnauthorized: true },
      response: { status: 401, data: { message: '当前后台账号密码错误' } }
    }

    await expect(axiosMock.handlers.rejected!(error)).rejects.toBe(error)
    expect(window.localStorage.getItem('ys_admin_token')).toBe('token')
    expect(window.localStorage.getItem('ys_admin_user')).toBe('{"id":"admin-1"}')
    expect(message.error).toHaveBeenCalledWith('当前后台账号密码错误')
  })

  it('still clears the admin session for ordinary authentication 401 responses', async () => {
    window.localStorage.setItem('ys_admin_token', 'token')
    window.localStorage.setItem('ys_admin_user', '{"id":"admin-1"}')
    const error = { config: {}, response: { status: 401, data: { message: '登录已失效' } } }

    await expect(axiosMock.handlers.rejected!(error)).rejects.toBe(error)
    expect(window.localStorage.getItem('ys_admin_token')).toBeNull()
    expect(window.localStorage.getItem('ys_admin_user')).toBeNull()
  })

  it('marks the real employee reveal request to preserve the active session on password failure', async () => {
    axiosMock.instance.post.mockResolvedValue({
      id: 'emp-1', frontendUserId: 'front-1', employeeNumber: 'YG001', name: '张三', status: 'ACTIVE', phone: '',
      idCard: '410000199001011234', bankCard: '', address: '', emergencyContact: '', hireDate: '2026-01-01',
      baseSalary: 6000, attendanceBonus: 300, overtimeHourlyRate: 30, restQuotaDays: 4
    })

    await adminApi.revealAdminAttendanceEmployee('emp-1', 'wrong-password', ['front-1'])
    expect(axiosMock.instance.post).toHaveBeenCalledWith(
      '/admin/employee-attendance/employees/emp-1/reveal',
      { password: 'wrong-password' },
      { params: { frontendUserIds: 'front-1' }, preserveAdminSessionOnUnauthorized: true }
    )
  })
})
