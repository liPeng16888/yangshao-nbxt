import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from './auth'
import { useSharedPrepaidStore } from './sharedPrepaid'

const apiMocks = vi.hoisted(() => ({
  createSharedPrepaidStreamTicket: vi.fn(),
  createSharedPrepaidEventSource: vi.fn(),
  isSharedPrepaidTerminalAuthError: vi.fn(),
  getPrepaidMembers: vi.fn(),
  lookupPrepaidMember: vi.fn(),
  getPrepaidMemberDetail: vi.fn(),
  getPrepaidRecharges: vi.fn(),
  createPrepaidRecharge: vi.fn(),
  reversePrepaidRecharge: vi.fn(),
  reversePrepaidConsumption: vi.fn(),
  previewPrepaidSettlement: vi.fn(),
  createPrepaidSettlement: vi.fn(),
  submitPrepaidSettlementPayment: vi.fn(),
  confirmPrepaidSettlement: vi.fn(),
  rejectPrepaidSettlement: vi.fn(),
  cancelPrepaidSettlement: vi.fn()
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

async function waitForSource(source: FakeEventSource) {
  await vi.waitFor(() => expect(apiMocks.createSharedPrepaidEventSource).toHaveBeenCalled())
  expect(apiMocks.createSharedPrepaidEventSource).toHaveBeenLastCalledWith('opaque-ticket')
  return source
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
    apiMocks.createSharedPrepaidStreamTicket.mockReset()
    apiMocks.createSharedPrepaidStreamTicket.mockResolvedValue({
      ticket: 'opaque-ticket', expiresAt: Date.now() + 30_000
    })
    apiMocks.createSharedPrepaidEventSource.mockReset()
    apiMocks.isSharedPrepaidTerminalAuthError.mockReset()
    apiMocks.isSharedPrepaidTerminalAuthError.mockReturnValue(false)
    for (const name of [
      'getPrepaidMembers', 'lookupPrepaidMember', 'getPrepaidMemberDetail', 'getPrepaidRecharges',
      'createPrepaidRecharge', 'reversePrepaidRecharge', 'reversePrepaidConsumption',
      'previewPrepaidSettlement', 'createPrepaidSettlement', 'submitPrepaidSettlementPayment',
      'confirmPrepaidSettlement', 'rejectPrepaidSettlement', 'cancelPrepaidSettlement'
    ] as const) apiMocks[name].mockReset()
    const auth = useAuthStore()
    auth.token = 'signed-token'
    auth.user = {
      id: 'front-1', account: 'front-1', username: '主账号', role: 'FRONTEND_USER',
      dataOwnerId: 'front-1', permissions: [], permissionVersion: 1,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
  })

  it('preflights one ticket, uses one EventSource, and refreshes a clean registered page', async () => {
    const source = makeEventSource()
    apiMocks.createSharedPrepaidEventSource.mockReturnValue(source)
    const store = useSharedPrepaidStore()
    const refresh = vi.fn().mockResolvedValue(undefined)
    store.registerModule('members', { isDirty: () => false, refresh })

    await waitForSource(source)
    await store.connectRealtime()
    sendChange(source, 'members')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    expect(apiMocks.createSharedPrepaidStreamTicket).toHaveBeenCalledTimes(1)
    expect(apiMocks.createSharedPrepaidEventSource).toHaveBeenCalledTimes(1)
    expect(store.hasRefreshPrompt).toBe(false)
  })

  it.each([401, 403])('stops reconnect attempts after terminal preflight status %s', async (status) => {
    vi.useFakeTimers()
    const error = { response: { status } }
    apiMocks.createSharedPrepaidStreamTicket.mockRejectedValue(error)
    apiMocks.isSharedPrepaidTerminalAuthError.mockImplementation((candidate) => candidate === error)

    const store = useSharedPrepaidStore()
    await store.connectRealtime()
    await vi.runAllTimersAsync()

    expect(apiMocks.createSharedPrepaidStreamTicket).toHaveBeenCalledTimes(1)
    expect(apiMocks.createSharedPrepaidEventSource).not.toHaveBeenCalled()
    expect(store.realtimeAuthTerminal).toBe(true)
    vi.useRealTimers()
  })

  it('reacquires a fresh ticket after a transient stream failure', async () => {
    vi.useFakeTimers()
    const first = makeEventSource()
    const second = makeEventSource()
    apiMocks.createSharedPrepaidStreamTicket
      .mockResolvedValueOnce({ ticket: 'opaque-ticket', expiresAt: Date.now() + 30_000 })
      .mockResolvedValueOnce({ ticket: 'fresh-ticket', expiresAt: Date.now() + 30_000 })
    apiMocks.createSharedPrepaidEventSource
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    useSharedPrepaidStore()
    await Promise.resolve()
    await Promise.resolve()

    first.onerror?.()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(first.close).toHaveBeenCalledTimes(1)
    expect(apiMocks.createSharedPrepaidStreamTicket).toHaveBeenCalledTimes(2)
    expect(apiMocks.createSharedPrepaidEventSource).toHaveBeenLastCalledWith('fresh-ticket')
    vi.useRealTimers()
  })

  it('stops delivery promptly when a subaccount loses its last prepaid leaf', async () => {
    const source = makeEventSource()
    apiMocks.createSharedPrepaidEventSource.mockReturnValue(source)
    const auth = useAuthStore()
    auth.user = {
      id: 'sub-1', account: 'sub-1', username: '子账号', role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'front-1', permissions: ['PREPAID_RECHARGE'], permissionVersion: 1,
      requiresAccessGuardPassword: true, isFrontendMainAccount: false, isFrontendSubAccount: true
    }
    const store = useSharedPrepaidStore()
    await waitForSource(source)

    auth.user.permissions = []
    await nextTick()

    expect(source.close).toHaveBeenCalledTimes(1)
    expect(store.realtimeAuthTerminal).toBe(true)
  })

  it('keeps a failed invalidation pending and offers a successful retry without rejection', async () => {
    const store = useSharedPrepaidStore()
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined)
    store.registerModule('members', { isDirty: () => false, refresh })

    await expect(store.handleRealtimeEvent({
      type: 'change', module: 'members', entityId: 'member-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })).resolves.toBeUndefined()
    expect(store.refreshPromptModules).toContain('members')

    await expect(store.acknowledgeAndRefresh('members')).resolves.toBeUndefined()
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(store.refreshPromptModules).not.toContain('members')
  })

  it('retains correct trailing refresh behavior when the active refresh fails', async () => {
    let rejectFirst!: (error: Error) => void
    const firstRefresh = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
    const refresh = vi.fn()
      .mockReturnValueOnce(firstRefresh)
      .mockResolvedValueOnce(undefined)
    const store = useSharedPrepaidStore()
    store.registerModule('consumptions', { isDirty: () => false, refresh })

    const first = store.handleRealtimeEvent({
      type: 'change', module: 'consumptions', entityId: 'one', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })
    const trailing = store.handleRealtimeEvent({
      type: 'change', module: 'consumptions', entityId: 'two', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:01.000Z'
    })
    await nextTick()
    rejectFirst(new Error('temporary failure'))

    await expect(Promise.all([first, trailing])).resolves.toBeDefined()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
    expect(store.refreshPromptModules).not.toContain('consumptions')
  })

  it.each(['recharges', 'settlements'] as const)(
    'keeps a dirty %s draft and exposes a visible refresh prompt',
    async (module) => {
      const store = useSharedPrepaidStore()
      const draft = { remark: '尚未提交的输入' }
      const refresh = vi.fn(() => { draft.remark = '被覆盖' })
      store.registerModule(module, { isDirty: () => true, refresh })

      await store.handleRealtimeEvent({
        type: 'change', module, entityId: `${module}-1`, operation: 'update',
        changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
      })

      expect(refresh).not.toHaveBeenCalled()
      expect(draft.remark).toBe('尚未提交的输入')
      expect(store.refreshPromptModules).toContain(module)
      expect(store.hasRefreshPrompt).toBe(true)
    }
  )

  it('closes realtime on logout and ignores a ticket that resolves after logout', async () => {
    let resolveTicket!: (value: { ticket: string; expiresAt: number }) => void
    apiMocks.createSharedPrepaidStreamTicket.mockReturnValue(new Promise((resolve) => {
      resolveTicket = resolve
    }))
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()

    auth.token = ''
    auth.user = null
    await nextTick()
    resolveTicket({ ticket: 'stale-ticket', expiresAt: Date.now() + 30_000 })
    await Promise.resolve()

    expect(apiMocks.createSharedPrepaidEventSource).not.toHaveBeenCalled()
    expect(store.realtimeAuthTerminal).toBe(false)
  })

  it('tracks loading independently for each prepaid page', async () => {
    let finishRecharges!: (value: { items: never[]; total: number; page: number; pageSize: number }) => void
    apiMocks.getPrepaidRecharges.mockReturnValue(new Promise((resolve) => { finishRecharges = resolve }))
    apiMocks.getPrepaidMembers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    const store = useSharedPrepaidStore()

    const recharges = store.loadRecharges()
    expect(store.loadingByPage).toEqual({ recharges: true, members: false, consumptions: false, settlements: false })
    await store.loadMembers()
    expect(store.loadingByPage.recharges).toBe(true)
    expect(store.loadingByPage.members).toBe(false)
    finishRecharges({ items: [], total: 0, page: 1, pageSize: 20 })
    await recharges

    expect(store.loadingByPage).toEqual({ recharges: false, members: false, consumptions: false, settlements: false })
  })

  it('preserves settlement selection, dirty state, and the same key after a 409 retry', async () => {
    const conflict = { response: { status: 409, data: { code: 'PREPAID_WRITE_CONFLICT' } } }
    apiMocks.createPrepaidSettlement
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ id: 'settlement-1', status: 'AWAITING_PAYMENT', lines: [] })
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000009')
    const store = useSharedPrepaidStore()
    store.setSettlementSelection(['payable-1', 'payable-2'])

    await expect(store.createSettlement()).rejects.toBe(conflict)
    expect(store.settlementSelection).toEqual(['payable-1', 'payable-2'])
    expect(store.dirtyByPage.settlements).toBe(true)
    expect(store.pendingIdempotencyKeys.createSettlement).toBe('00000000-0000-4000-8000-000000000009')

    await store.createSettlement()
    expect(apiMocks.createPrepaidSettlement).toHaveBeenNthCalledWith(1, {
      payableIds: ['payable-1', 'payable-2']
    }, '00000000-0000-4000-8000-000000000009')
    expect(apiMocks.createPrepaidSettlement).toHaveBeenNthCalledWith(2, {
      payableIds: ['payable-1', 'payable-2']
    }, '00000000-0000-4000-8000-000000000009')
    expect(store.settlementSelection).toEqual([])
    expect(store.dirtyByPage.settlements).toBe(false)
    expect(store.pendingIdempotencyKeys.createSettlement).toBeUndefined()
  })

  it('allows an explicit action key and preserves a recharge form on conflict', async () => {
    const conflict = { response: { status: 409 } }
    apiMocks.createPrepaidRecharge.mockRejectedValue(conflict)
    const store = useSharedPrepaidStore()
    store.setRechargeDraft({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000,
      giftAmount: 100, isOpeningBalance: false, remark: '待重试'
    })

    await expect(store.createRecharge(undefined, 'explicit-retry-key')).rejects.toBe(conflict)

    expect(apiMocks.createPrepaidRecharge).toHaveBeenCalledWith(store.rechargeDraft, 'explicit-retry-key')
    expect(store.rechargeDraft.remark).toBe('待重试')
    expect(store.dirtyByPage.recharges).toBe(true)
    expect(store.pendingIdempotencyKeys.createRecharge).toBe('explicit-retry-key')
  })
})
