// @vitest-environment jsdom
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getAccessGuardGroups: vi.fn(),
  verifyAccessGuardGroup: vi.fn()
}))

vi.mock('@/api/accessGuard', async (importOriginal) => ({ ...await importOriginal<Record<string, unknown>>(), ...api }))

import AccessGuardDialog from './AccessGuardDialog.vue'
import { useAccessGuardStore } from '@/stores/accessGuard'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size }, clear: () => values.clear(), getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value)
  }
}

describe('AccessGuardDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
  })

  it('closes and invalidates the owned prompt when its visible Cancel button emits a MouseEvent', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    api.getAccessGuardGroups.mockResolvedValue([{
      id: 'attendance-group', name: '员工考勤', enabled: true, ttlMinutes: 5, password: '1234',
      recoveryPrompt: '', recoveryAnswer: '', grantVersion: 2, features: ['EMPLOYEE_ATTENDANCE']
    }])
    api.verifyAccessGuardGroup.mockResolvedValue({
      groupId: 'attendance-group', grantVersion: 2, expiresAt: Date.now() + 60_000,
      token: 'must-not-be-written', features: ['EMPLOYEE_ATTENDANCE']
    })
    const store = useAccessGuardStore(pinia)
    await store.loadGroups()
    const action = vi.fn()
    store.requestFeatureAccess('EMPLOYEE_ATTENDANCE', {
      title: '员工敏感信息验证', message: '请输入密码', owner: Symbol('employee-page'), onSuccess: action
    })
    const wrapper = mount(AccessGuardDialog, { global: { plugins: [pinia, ElementPlus], stubs: { teleport: true } } })
    await nextTick()

    const cancel = wrapper.findAll('button').find((button) => button.text() === '取消')!
    expect(cancel.isVisible()).toBe(true)
    await cancel.trigger('click')
    await flushPromises()

    expect(store.dialogVisible).toBe(false)
    await expect(store.verifyPassword('1234')).resolves.toMatchObject({ ok: false })
    expect(api.verifyAccessGuardGroup).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem('ys_access_guard_group_sessions') || '{}')).toEqual({})
    expect(action).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
