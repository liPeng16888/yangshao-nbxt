import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppLayout from './AppLayout.vue'

const stores = vi.hoisted(() => ({
  loadGroups: vi.fn(),
  tenantConnect: vi.fn(),
  tenantDisconnect: vi.fn(),
  tenantRegister: vi.fn(),
  unregisterPreferences: vi.fn(),
  sharedConnect: vi.fn(),
  sharedDisconnect: vi.fn(),
  preferenceLoadAll: vi.fn(),
  preferenceStore: { hasPendingChanges: false }
}))

vi.mock('@/stores/accessGuard', () => ({
  useAccessGuardStore: () => ({ loadGroups: stores.loadGroups })
}))
vi.mock('@/stores/tenantRealtime', () => ({
  useTenantRealtimeStore: () => ({
    hasRemoteChanges: false,
    connect: stores.tenantConnect,
    disconnect: stores.tenantDisconnect,
    registerModule: stores.tenantRegister
  })
}))
vi.mock('@/stores/sharedPrepaid', () => ({
  useSharedPrepaidStore: () => ({
    connectRealtime: stores.sharedConnect,
    disconnectRealtime: stores.sharedDisconnect
  })
}))
vi.mock('@/stores/frontendPreferences', () => ({
  useFrontendPreferencesStore: () => ({
    get hasPendingChanges() { return stores.preferenceStore.hasPendingChanges },
    loadAll: stores.preferenceLoadAll
  })
}))

describe('AppLayout authenticated realtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.preferenceStore.hasPendingChanges = false
    stores.preferenceLoadAll.mockResolvedValue('loaded')
    stores.tenantRegister.mockReturnValue(stores.unregisterPreferences)
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] || null,
      get length() { return values.size }
    })
  })

  it('starts shared prepaid realtime on mount and stops it on unmount', () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          AppSidebar: true,
          AppTopbar: true,
          RouterView: true,
          ElAlert: true
        }
      }
    })

    expect(stores.sharedConnect).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(stores.sharedDisconnect).toHaveBeenCalledTimes(1)
  })

  it('loads frontend preferences once and registers owner sync with tenant realtime', async () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          AppSidebar: true,
          AppTopbar: true,
          RouterView: true,
          ElAlert: true
        }
      }
    })

    expect(stores.preferenceLoadAll).toHaveBeenCalledTimes(1)
    expect(stores.tenantRegister).toHaveBeenCalledWith(
      'frontend-preferences',
      expect.objectContaining({
        isDirty: expect.any(Function),
        refresh: expect.any(Function)
      })
    )
    const registration = stores.tenantRegister.mock.calls[0][1]
    expect(registration.isDirty()).toBe(false)
    stores.preferenceStore.hasPendingChanges = true
    expect(registration.isDirty()).toBe(true)
    await expect(registration.refresh()).resolves.toBeUndefined()
    expect(stores.preferenceLoadAll).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    expect(stores.unregisterPreferences).toHaveBeenCalledTimes(1)
  })
})
