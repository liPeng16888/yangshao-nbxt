import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AppLayout from './AppLayout.vue'

const stores = vi.hoisted(() => ({
  loadGroups: vi.fn(),
  tenantConnect: vi.fn(),
  tenantDisconnect: vi.fn(),
  sharedConnect: vi.fn(),
  sharedDisconnect: vi.fn()
}))

vi.mock('@/stores/accessGuard', () => ({
  useAccessGuardStore: () => ({ loadGroups: stores.loadGroups })
}))
vi.mock('@/stores/tenantRealtime', () => ({
  useTenantRealtimeStore: () => ({
    hasRemoteChanges: false,
    connect: stores.tenantConnect,
    disconnect: stores.tenantDisconnect
  })
}))
vi.mock('@/stores/sharedPrepaid', () => ({
  useSharedPrepaidStore: () => ({
    connectRealtime: stores.sharedConnect,
    disconnectRealtime: stores.sharedDisconnect
  })
}))

describe('AppLayout authenticated realtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
