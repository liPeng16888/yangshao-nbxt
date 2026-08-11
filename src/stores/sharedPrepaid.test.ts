import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from './auth'
import { useSharedPrepaidStore } from './sharedPrepaid'

const apiMocks = vi.hoisted(() => ({
  createSharedPrepaidEventSource: vi.fn()
}))

vi.mock('@/api/sharedPrepaid', () => apiMocks)
vi.mock('element-plus', async (importOriginal) => ({
  ...await importOriginal<typeof import('element-plus')>(),
  ElMessage: { warning: vi.fn() }
}))

type FakeEventSource = {
  close: ReturnType<typeof vi.fn>
  onopen: (() => unknown) | null
  onmessage: ((event: MessageEvent) => unknown) | null
  onerror: (() => unknown) | null
}

function makeEventSource(): FakeEventSource {
  return { close: vi.fn(), onopen: null, onmessage: null, onerror: null }
}

function sendChange(source: FakeEventSource, module: 'recharges' | 'members' | 'consumptions' | 'settlements') {
  source.onmessage?.({
    data: JSON.stringify({
      type: 'change', module, entityId: `${module}-1`, operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })
  } as MessageEvent)
}

describe('shared prepaid realtime refresh', () => {
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
    apiMocks.createSharedPrepaidEventSource.mockReset()
    const auth = useAuthStore()
    auth.token = 'signed-token'
    auth.user = {
      id: 'front-1', account: 'front-1', username: '主账号', role: 'FRONTEND_USER',
      dataOwnerId: 'front-1', permissions: [], permissionVersion: 1,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
  })

  it('uses one EventSource and refreshes a clean registered page', async () => {
    const source = makeEventSource()
    apiMocks.createSharedPrepaidEventSource.mockReturnValue(source)
    const store = useSharedPrepaidStore()
    const refresh = vi.fn().mockResolvedValue(undefined)
    store.registerModule('members', { isDirty: () => false, refresh })

    store.connectRealtime()
    store.connectRealtime()
    sendChange(source, 'members')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    expect(apiMocks.createSharedPrepaidEventSource).toHaveBeenCalledTimes(1)
    expect(store.hasRefreshPrompt).toBe(false)
  })

  it('connects when created for a logged-in frontend session', () => {
    const source = makeEventSource()
    apiMocks.createSharedPrepaidEventSource.mockReturnValue(source)

    useSharedPrepaidStore()

    expect(apiMocks.createSharedPrepaidEventSource).toHaveBeenCalledTimes(1)
  })

  it('refreshes another tab even when the change actor is the same account', async () => {
    const source = makeEventSource()
    apiMocks.createSharedPrepaidEventSource.mockReturnValue(source)
    const store = useSharedPrepaidStore()
    const refresh = vi.fn().mockResolvedValue(undefined)
    store.registerModule('members', { isDirty: () => false, refresh })

    source.onmessage?.({
      data: JSON.stringify({
        type: 'change', module: 'members', entityId: 'member-1', operation: 'update',
        changedById: 'front-1', updatedAt: '2026-08-12T08:00:00.000Z'
      })
    } as MessageEvent)

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it.each(['recharges', 'settlements'] as const)(
    'keeps a dirty %s draft and exposes a visible refresh prompt',
    async (module) => {
      const source = makeEventSource()
      apiMocks.createSharedPrepaidEventSource.mockReturnValue(source)
      const store = useSharedPrepaidStore()
      const draft = { remark: '尚未提交的输入' }
      const refresh = vi.fn(() => { draft.remark = '被覆盖' })
      store.registerModule(module, { isDirty: () => true, refresh })
      store.connectRealtime()

      sendChange(source, module)
      await nextTick()

      expect(refresh).not.toHaveBeenCalled()
      expect(draft.remark).toBe('尚未提交的输入')
      expect(store.refreshPromptModules).toContain(module)
      expect(store.hasRefreshPrompt).toBe(true)
    }
  )

  it('coalesces a burst into one active refresh and at most one trailing refresh', async () => {
    const source = makeEventSource()
    apiMocks.createSharedPrepaidEventSource.mockReturnValue(source)
    let release!: () => void
    const firstRefresh = new Promise<void>((resolve) => { release = resolve })
    const refresh = vi.fn()
      .mockReturnValueOnce(firstRefresh)
      .mockResolvedValue(undefined)
    const store = useSharedPrepaidStore()
    store.registerModule('consumptions', { isDirty: () => false, refresh })
    store.connectRealtime()

    sendChange(source, 'consumptions')
    sendChange(source, 'consumptions')
    sendChange(source, 'consumptions')
    await nextTick()
    expect(refresh).toHaveBeenCalledTimes(1)

    release()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
  })

  it('closes realtime on logout and store disposal', async () => {
    const firstSource = makeEventSource()
    const secondSource = makeEventSource()
    apiMocks.createSharedPrepaidEventSource
      .mockReturnValueOnce(firstSource)
      .mockReturnValueOnce(secondSource)
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()
    store.connectRealtime()

    auth.token = ''
    auth.user = null
    await nextTick()
    expect(firstSource.close).toHaveBeenCalledTimes(1)

    auth.token = 'new-token'
    auth.user = {
      id: 'front-1', account: 'front-1', username: '主账号', role: 'FRONTEND_USER',
      dataOwnerId: 'front-1', permissions: [], permissionVersion: 1,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    store.connectRealtime()
    store.$dispose()
    expect(secondSource.close).toHaveBeenCalledTimes(1)
  })
})
