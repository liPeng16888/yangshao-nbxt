import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSharedPrepaidRealtimeRegistration } from './useSharedPrepaidRealtime'

const storeMocks = vi.hoisted(() => ({
  registerModule: vi.fn(),
  unregister: vi.fn(),
  acknowledgeAndRefresh: vi.fn(),
  refreshPromptModules: [] as string[]
}))

vi.mock('@/stores/sharedPrepaid', () => ({
  useSharedPrepaidStore: () => ({
    registerModule: storeMocks.registerModule,
    acknowledgeAndRefresh: storeMocks.acknowledgeAndRefresh,
    refreshPromptModules: storeMocks.refreshPromptModules
  })
}))

describe('useSharedPrepaidRealtimeRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMocks.refreshPromptModules = []
    storeMocks.registerModule.mockReturnValue(storeMocks.unregister)
  })

  it('registers for the page lifetime, exposes pending state, and provides retry action', async () => {
    const registration = { isDirty: vi.fn(() => false), refresh: vi.fn() }
    let result!: ReturnType<typeof useSharedPrepaidRealtimeRegistration>
    const Component = defineComponent({
      setup() {
        result = useSharedPrepaidRealtimeRegistration('members', registration)
        return () => h('div')
      }
    })

    const wrapper = mount(Component)
    expect(storeMocks.registerModule).toHaveBeenCalledWith('members', registration)
    storeMocks.refreshPromptModules.push('members')
    expect(result.hasPendingRefresh.value).toBe(true)

    await result.retryRefresh()
    expect(storeMocks.acknowledgeAndRefresh).toHaveBeenCalledWith('members')

    wrapper.unmount()
    expect(storeMocks.unregister).toHaveBeenCalledTimes(1)
  })
})
