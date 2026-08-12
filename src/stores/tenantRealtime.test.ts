import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth'
import { useTenantRealtimeStore } from './tenantRealtime'

vi.mock('element-plus', async (importOriginal) => ({
  ...await importOriginal<typeof import('element-plus')>(),
  ElMessage: { warning: vi.fn() }
}))

describe('tenant realtime dirty-form protection', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] || null,
      get length() { return values.size }
    })
    setActivePinia(createPinia())
    localStorage.clear()
    useAuthStore().user = {
      id: 'sub-current', account: 'current', username: '当前账号', role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'main-1', permissions: ['CUSTOMER_OVERVIEW'], permissionVersion: 1,
      requiresAccessGuardPassword: true, isFrontendMainAccount: false, isFrontendSubAccount: true
    }
  })

  it('refreshes a clean module immediately', async () => {
    const store = useTenantRealtimeStore()
    const refresh = vi.fn()
    store.registerModule('customers', { isDirty: () => false, refresh })

    await store.handleEvent({
      type: 'change', module: 'customers', entityId: 'customer-1', operation: 'update',
      changedById: 'main-1', updatedAt: '2026-08-11T00:00:00.000Z'
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(store.hasRemoteChanges).toBe(false)
  })

  it('preserves dirty input and records a pending remote change', async () => {
    const store = useTenantRealtimeStore()
    const refresh = vi.fn()
    store.registerModule('customers', { isDirty: () => true, refresh })

    await store.handleEvent({
      type: 'change', module: 'customers', entityId: 'customer-1', operation: 'update',
      changedById: 'main-1', updatedAt: '2026-08-11T00:00:00.000Z'
    })

    expect(refresh).not.toHaveBeenCalled()
    expect(store.hasRemoteChanges).toBe(true)
    expect(store.remoteChangeModules).toContain('customers')
  })

  it('ignores events emitted by the current actor', async () => {
    const store = useTenantRealtimeStore()
    const refresh = vi.fn()
    store.registerModule('customers', { isDirty: () => false, refresh })

    await store.handleEvent({
      type: 'change', module: 'customers', entityId: 'customer-1', operation: 'update',
      changedById: 'sub-current', updatedAt: '2026-08-11T00:00:00.000Z'
    })

    expect(refresh).not.toHaveBeenCalled()
    expect(store.hasRemoteChanges).toBe(false)
  })
})
