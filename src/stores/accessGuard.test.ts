// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getAccessGuardGroups: vi.fn(), createAccessGuardGroup: vi.fn(), updateAccessGuardGroup: vi.fn(),
  deleteAccessGuardGroup: vi.fn(), verifyAccessGuardGroup: vi.fn()
}))

vi.mock('@/api/accessGuard', async (importOriginal) => ({ ...await importOriginal<Record<string, unknown>>(), ...api }))

import { useAccessGuardStore } from './accessGuard'

const group = {
  id: 'attendance-group', name: '员工考勤', enabled: true, ttlMinutes: 5, password: '1234',
  recoveryPrompt: '提示', recoveryAnswer: '答案', grantVersion: 2, features: ['EMPLOYEE_ATTENDANCE'] as const
}
const otherGroup = {
  id: 'other', name: '财务', enabled: true, ttlMinutes: 5, password: '1234', recoveryPrompt: '提示', recoveryAnswer: '答案',
  grantVersion: 1, features: ['FINANCE'] as const
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value)
  }
}

function readSessions() {
  return JSON.parse(window.localStorage.getItem('ys_access_guard_group_sessions') || '{}') as Record<string, unknown>
}

describe('accessGuard store revocation-safe sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
    setActivePinia(createPinia())
    api.getAccessGuardGroups.mockResolvedValue([group, otherGroup])
    api.updateAccessGuardGroup.mockResolvedValue({ ...group, grantVersion: 3 })
    api.deleteAccessGuardGroup.mockResolvedValue(undefined)
  })

  it('does not grant a feature from a session with the wrong feature or stale version', async () => {
    const store = useAccessGuardStore()
    await store.loadGroups()
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      'attendance-group': { groupId: 'attendance-group', grantVersion: 2, expiresAt: Date.now() + 60_000, token: 'wrong-feature', features: ['FINANCE'] }
    }))
    expect(store.hasFeatureAccess('EMPLOYEE_ATTENDANCE')).toBe(false)

    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      'attendance-group': { groupId: 'attendance-group', grantVersion: 1, expiresAt: Date.now() + 60_000, token: 'stale-version', features: ['EMPLOYEE_ATTENDANCE'] }
    }))
    expect(store.hasFeatureAccess('EMPLOYEE_ATTENDANCE')).toBe(false)
  })

  it('clears only the edited group session after a successful update', async () => {
    const store = useAccessGuardStore()
    await store.loadGroups()
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      'attendance-group': { groupId: 'attendance-group', grantVersion: 2, expiresAt: Date.now() + 60_000, token: 'old', features: ['EMPLOYEE_ATTENDANCE'] },
      other: { groupId: 'other', grantVersion: 1, expiresAt: Date.now() + 60_000, token: 'other', features: ['FINANCE'] }
    }))

    await store.saveGroup({ name: group.name, enabled: true, ttlMinutes: 5, password: '5678', recoveryPrompt: '提示', recoveryAnswer: '答案', features: ['EMPLOYEE_ATTENDANCE'] }, group.id)

    expect(readSessions()).not.toHaveProperty('attendance-group')
    expect(readSessions()).toHaveProperty('other')
    expect(store.accessSessionRevision).toBeGreaterThan(0)
  })

  it('clears a deleted group session but preserves it when the mutation fails', async () => {
    const store = useAccessGuardStore()
    await store.loadGroups()
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      'attendance-group': { groupId: 'attendance-group', grantVersion: 2, expiresAt: Date.now() + 60_000, token: 'old', features: ['EMPLOYEE_ATTENDANCE'] }
    }))
    await store.removeGroup(group.id)
    expect(readSessions()).not.toHaveProperty('attendance-group')

    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      'attendance-group': { groupId: 'attendance-group', grantVersion: 2, expiresAt: Date.now() + 60_000, token: 'still-valid', features: ['EMPLOYEE_ATTENDANCE'] }
    }))
    api.updateAccessGuardGroup.mockRejectedValueOnce(new Error('保存失败'))
    await expect(store.saveGroup({ name: group.name, enabled: true, ttlMinutes: 5, password: '5678', recoveryPrompt: '提示', recoveryAnswer: '答案', features: ['EMPLOYEE_ATTENDANCE'] }, group.id)).rejects.toThrow('保存失败')
    expect(readSessions()).toHaveProperty('attendance-group')
  })

  it('cancels only the access prompt owned by the matching consumer', async () => {
    const store = useAccessGuardStore()
    await store.loadGroups()
    const attendanceOwner = Symbol('attendance-page')
    const financeOwner = Symbol('finance-page')
    const attendanceAction = vi.fn()
    const financeAction = vi.fn()
    store.requestFeatureAccess('EMPLOYEE_ATTENDANCE', {
      title: '员工考勤', message: '员工验证', owner: attendanceOwner, onSuccess: attendanceAction
    })
    store.requestFeatureAccess('FINANCE', {
      title: '财务', message: '财务验证', owner: financeOwner, onSuccess: financeAction
    })

    expect(store.cancelAccess(attendanceOwner)).toBe(false)
    expect(store.dialogVisible).toBe(true)
    api.verifyAccessGuardGroup.mockResolvedValueOnce({
      groupId: 'other', grantVersion: 1, expiresAt: Date.now() + 60_000, token: 'finance-grant', features: ['FINANCE']
    })
    await expect(store.verifyPassword('1234')).resolves.toMatchObject({ ok: true })
    expect(attendanceAction).not.toHaveBeenCalled()
    expect(financeAction).toHaveBeenCalledTimes(1)
  })

  it('does not persist a grant or run an action when its prompt is cancelled during verification', async () => {
    const store = useAccessGuardStore()
    await store.loadGroups()
    const owner = Symbol('employee-directory')
    const action = vi.fn()
    let resolveVerification!: (value: any) => void
    api.verifyAccessGuardGroup.mockReturnValueOnce(new Promise((resolve) => { resolveVerification = resolve }))
    store.requestFeatureAccess('EMPLOYEE_ATTENDANCE', {
      title: '员工敏感信息', message: '请输入密码', owner, onSuccess: action
    })

    const result = store.verifyPassword('1234')
    expect(store.cancelAccess(owner)).toBe(true)
    resolveVerification({
      groupId: 'attendance-group', grantVersion: 2, expiresAt: Date.now() + 60_000,
      token: 'stale-attendance-grant', features: ['EMPLOYEE_ATTENDANCE']
    })

    await expect(result).resolves.toMatchObject({ ok: false })
    expect(readSessions()).not.toHaveProperty('attendance-group')
    expect(action).not.toHaveBeenCalled()
    expect(store.dialogVisible).toBe(false)
  })
})
