import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from './auth'
import { useSharedPrepaidStore } from './sharedPrepaid'
import type {
  PrepaidPage,
  PrepaidRechargeRow,
  PrepaidSettlementPayableListRow,
  PrepaidSettlementRow
} from '@/types/sharedPrepaid'

const apiMocks = vi.hoisted(() => ({
  createSharedPrepaidStreamTicket: vi.fn(),
  createSharedPrepaidEventSource: vi.fn(),
  isSharedPrepaidTerminalAuthError: vi.fn(),
  getPrepaidMembers: vi.fn(),
  lookupPrepaidMember: vi.fn(),
  getPrepaidMemberDetail: vi.fn(),
  getPrepaidRecharges: vi.fn(),
  getPrepaidConsumptions: vi.fn(),
  getPrepaidConsumptionFilterOptions: vi.fn(),
  getPrepaidSettlementPayables: vi.fn(),
  getPrepaidSettlements: vi.fn(),
  getPrepaidSettlement: vi.fn(),
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function settlementRowFixture(id: string): PrepaidSettlementRow {
  return {
    id,
    accountAId: 'front-1',
    accountBId: 'front-2',
    aToBAmount: 90.9,
    bToAAmount: 0,
    netAmount: 90.9,
    payerFrontendUserId: 'front-1',
    receiverFrontendUserId: 'front-2',
    status: 'AWAITING_PAYMENT',
    actualTransferredAt: null,
    proofUrls: [],
    remark: null,
    createdById: 'front-1',
    paymentSubmittedById: null,
    paymentSubmittedAt: null,
    receiptConfirmedById: null,
    receiptConfirmedAt: null,
    rejectedById: null,
    rejectedAt: null,
    rejectionReason: null,
    cancelledById: null,
    cancelledAt: null,
    version: 1,
    createdAt: '2026-08-12T08:00:00.000Z',
    updatedAt: '2026-08-12T08:00:00.000Z',
    lines: []
  }
}

function settlementPayableFixture(
  id: string,
  direction: 'OUTGOING' | 'INCOMING',
  eligible = true
): PrepaidSettlementPayableListRow {
  const accountA = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }
  const accountB = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }
  const outgoing = direction === 'OUTGOING'
  return {
    id,
    consumptionId: `consumption-${id}`,
    sourceOwnerId: outgoing ? 'front-1' : 'front-2',
    consumerOwnerId: outgoing ? 'front-2' : 'front-1',
    exactAmount: 50,
    amount: 50,
    status: eligible ? 'PENDING' : 'HELD',
    reversalOfId: null,
    eligible,
    direction,
    counterpartyFrontendUserId: 'front-2',
    createdAt: '2026-08-12T03:04:05.000Z',
    updatedAt: '2026-08-12T03:04:05.000Z',
    sourceOwner: outgoing ? accountA : accountB,
    consumerOwner: outgoing ? accountB : accountA,
    consumption: {
      id: `consumption-${id}`,
      memberId: `member-${id}`,
      phoneSnapshot: '13800000000',
      sampleNumberSnapshot: `S-${id}`,
      sampleCountSnapshot: 1,
      elementsSnapshot: ['Au'],
      sheetDate: '2026-08-12',
      createdAt: '2026-08-12T03:04:05.000Z',
      relationLimit: 100,
      relationTruncated: { allocations: false },
      rechargeBatches: []
    },
    relationLimit: 100,
    relationTruncated: { settlementAssociations: false },
    settlementAssociations: []
  }
}

function rechargeRowFixture(id: string): PrepaidRechargeRow {
  return {
    id,
    memberId: 'member-1',
    phone: '13800000000',
    ownerFrontendUserId: 'front-1',
    ownerAccount: 'front-1',
    ownerUsername: '主账号',
    actorUserId: 'front-1',
    actorAccount: 'front-1',
    actorUsername: '主账号',
    rechargeDate: '2026-08-12',
    paidAmount: 1000,
    giftAmount: 100,
    totalAmount: 1100,
    remainingAmount: 1100,
    isOpeningBalance: false,
    remark: null,
    reversedAt: null,
    reversedByLedgerId: null,
    createdAt: '2026-08-12T08:00:00.000Z',
    updatedAt: '2026-08-12T08:00:00.000Z'
  }
}

function rechargePageFixture(id: string, page: number): PrepaidPage<PrepaidRechargeRow> {
  return { items: [rechargeRowFixture(id)], total: 1, page, pageSize: 10 }
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
      'getPrepaidConsumptions',
      'getPrepaidConsumptionFilterOptions',
      'getPrepaidSettlementPayables', 'getPrepaidSettlements', 'getPrepaidSettlement',
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

  it('does not surface a delayed account-A realtime refresh failure to account B', async () => {
    const accountARefresh = deferred<void>()
    const refresh = vi.fn()
      .mockReturnValueOnce(accountARefresh.promise)
      .mockResolvedValueOnce(undefined)
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()
    store.registerModule('members', { isDirty: () => false, refresh })
    const event = {
      type: 'change' as const, module: 'members' as const, entityId: 'member-1', operation: 'update' as const,
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    }

    const delayed = store.handleRealtimeEvent(event)
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    auth.token = 'account-b-token'
    auth.user = {
      id: 'account-b', account: 'account-b', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'account-b', permissions: [], permissionVersion: 2,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    await store.handleRealtimeEvent(event)
    expect(refresh).toHaveBeenCalledTimes(2)

    accountARefresh.reject(new Error('account A realtime failed'))
    await delayed

    expect(store.refreshPromptModules).toEqual([])
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

  it('loads the independently paginated global consumption list with exact filters', async () => {
    apiMocks.getPrepaidConsumptions.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 })
    const store = useSharedPrepaidStore()
    const query = {
      page: 2, pageSize: 10, phone: '13800000000', sourceOwnerId: 'front-1',
      consumingFrontendUserId: 'front-2', startDate: '2026-08-01', endDate: '2026-08-31',
      status: 'REVERSED' as const, payableStatus: 'COMPLETED' as const
    }

    await store.loadConsumptions(query)

    expect(apiMocks.getPrepaidConsumptions).toHaveBeenCalledWith(query)
    expect(store.consumptionsPage).toEqual({ items: [], total: 0, page: 2, pageSize: 10 })
    expect(store.loadingByPage.consumptions).toBe(false)
  })

  it('loads safe discoverable consumption account filter options', async () => {
    const options = {
      sourceOwners: [{ id: 'front-1', account: 'owner-a', label: '北京店（owner-a）' }],
      consumingOwners: [{ id: 'front-2', account: 'owner-b', label: '主账号 B（owner-b）' }]
    }
    apiMocks.getPrepaidConsumptionFilterOptions.mockResolvedValue(options)
    const store = useSharedPrepaidStore()

    await store.loadConsumptionFilterOptions()

    expect(store.consumptionFilterOptions).toEqual(options)
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

  it('uses a new key after a conflict when the selected payable request changes', async () => {
    const conflict = { response: { status: 409 } }
    apiMocks.createPrepaidSettlement
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(settlementRowFixture('settlement-2'))
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000031')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000032')
    const store = useSharedPrepaidStore()
    store.setSettlementSelection(['payable-stale', 'payable-valid'])

    await expect(store.createSettlement()).rejects.toBe(conflict)
    store.setSettlementSelection(['payable-valid'])
    await store.createSettlement()

    expect(apiMocks.createPrepaidSettlement.mock.calls.map((call) => call[1])).toEqual([
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000032'
    ])
  })

  it('reuses the prepared key after a possibly committed lost response for every money mutation', async () => {
    const transportErrors = [
      new Error('Network Error'),
      Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }),
      Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
      { response: { status: 503 } },
      { response: { status: 500 } },
      new Error('Network Error'),
      { response: { status: 502 } },
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    ]
    const store = useSharedPrepaidStore()
    store.setRechargeDraft({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000,
      giftAmount: 100, isOpeningBalance: false, remark: 'lost response'
    })
    store.setSettlementSelection(['payable-1'])
    store.setSettlementPaymentDraftFor('settlement-pay', {
      actualTransferredAt: '2026-08-12T16:00:00+08:00', remark: 'lost response'
    })

    const cases = [
      {
        slot: 'createRecharge', mock: apiMocks.createPrepaidRecharge,
        invoke: () => store.createRecharge(), result: { id: 'recharge-1' }
      },
      {
        slot: 'reverseRecharge:recharge-1', mock: apiMocks.reversePrepaidRecharge,
        invoke: () => store.reverseRecharge('recharge-1', '误充值'), result: { id: 'recharge-1' }
      },
      {
        slot: 'reverseConsumption:consumption-1', mock: apiMocks.reversePrepaidConsumption,
        invoke: () => store.reverseConsumption('consumption-1', '误扣款'), result: { id: 'reversal-1' }
      },
      {
        slot: 'createSettlement', mock: apiMocks.createPrepaidSettlement,
        invoke: () => store.createSettlement(['payable-1']), result: settlementRowFixture('settlement-create')
      },
      {
        slot: 'submitPayment:settlement-pay', mock: apiMocks.submitPrepaidSettlementPayment,
        invoke: () => store.submitSettlementPayment('settlement-pay'), result: settlementRowFixture('settlement-pay')
      },
      {
        slot: 'confirmSettlement:settlement-confirm', mock: apiMocks.confirmPrepaidSettlement,
        invoke: () => store.confirmSettlement('settlement-confirm'), result: settlementRowFixture('settlement-confirm')
      },
      {
        slot: 'rejectSettlement:settlement-reject', mock: apiMocks.rejectPrepaidSettlement,
        invoke: () => store.rejectSettlement('settlement-reject', '未到账'), result: settlementRowFixture('settlement-reject')
      },
      {
        slot: 'cancelSettlement:settlement-cancel', mock: apiMocks.cancelPrepaidSettlement,
        invoke: () => store.cancelSettlement('settlement-cancel'), result: settlementRowFixture('settlement-cancel')
      }
    ] as const

    let preparedKeySequence = 0
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => (
      `00000000-0000-4000-8000-${String(++preparedKeySequence).padStart(12, '0')}` as ReturnType<typeof crypto.randomUUID>
    ))
    for (const [index, testCase] of cases.entries()) {
      testCase.mock.mockRejectedValueOnce(transportErrors[index]).mockResolvedValueOnce(testCase.result)

      await expect(testCase.invoke()).rejects.toBe(transportErrors[index])
      const preparedKey = store.pendingIdempotencyKeys[testCase.slot]
      expect(preparedKey).toMatch(/^00000000-0000-4000-8000-/)

      await testCase.invoke()
      const keyArgumentIndex = testCase.mock === apiMocks.confirmPrepaidSettlement ||
        testCase.mock === apiMocks.cancelPrepaidSettlement ? 1 : 2
      if (testCase.mock === apiMocks.createPrepaidRecharge || testCase.mock === apiMocks.createPrepaidSettlement) {
        expect(testCase.mock.mock.calls.slice(-2).map((call) => call[1])).toEqual([preparedKey, preparedKey])
      } else {
        expect(testCase.mock.mock.calls.slice(-2).map((call) => call[keyArgumentIndex])).toEqual([preparedKey, preparedKey])
      }
      expect(store.pendingIdempotencyKeys[testCase.slot]).toBeUndefined()
    }
  })

  it('uses a canonical payload fingerprint so key ordering cannot rotate a lost-response key', async () => {
    const lostResponse = new Error('socket closed after commit')
    apiMocks.createPrepaidRecharge
      .mockRejectedValueOnce(lostResponse)
      .mockResolvedValueOnce({ id: 'recharge-1' })
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000041')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000042')
    const store = useSharedPrepaidStore()
    const first = {
      phone: '138 0000-0000', rechargeDate: '2026-08-12', paidAmount: '1000.0',
      giftAmount: 100, isOpeningBalance: false, remark: '  同一笔充值  '
    }
    const equivalent = {
      remark: '同一笔充值', isOpeningBalance: false, giftAmount: '100.00',
      paidAmount: 1000, rechargeDate: '2026-08-12', phone: '13800000000'
    }

    await expect(store.createRecharge(first)).rejects.toBe(lostResponse)
    await store.createRecharge(equivalent)

    expect(apiMocks.createPrepaidRecharge.mock.calls.map((call) => call[1])).toEqual([
      '00000000-0000-4000-8000-000000000041',
      '00000000-0000-4000-8000-000000000041'
    ])
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it.each([
    '\u00a013800000000',
    '138\u200300000000',
    '13800000000\u00a0'
  ])('validates a phone before preparing its mutation fingerprint or key %j', async (phone) => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
    const store = useSharedPrepaidStore()

    await expect(store.createRecharge({
      phone, rechargeDate: '2026-08-12', paidAmount: 1000,
      giftAmount: 100, isOpeningBalance: false, remark: ''
    })).rejects.toThrow('会员手机号必须为中国大陆 11 位手机号')

    expect(apiMocks.createPrepaidRecharge).not.toHaveBeenCalled()
    expect(randomUUID).not.toHaveBeenCalled()
    expect(store.pendingIdempotencyKeys.createRecharge).toBeUndefined()
  })

  it('scopes every retained mutation identity and in-flight promise to the authenticated account', async () => {
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()
    let keySequence = 100
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => (
      `00000000-0000-4000-8000-${String(++keySequence).padStart(12, '0')}` as ReturnType<typeof crypto.randomUUID>
    ))

    const rechargeDraft = {
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000,
      giftAmount: 100, isOpeningBalance: false, remark: 'account-scoped retry'
    }
    const paymentDraft = {
      actualTransferredAt: '2026-08-12T16:00:00+08:00', remark: 'account-scoped retry'
    }
    const cases = [
      {
        name: 'recharge', slot: 'createRecharge', mock: apiMocks.createPrepaidRecharge,
        prepare: () => store.setRechargeDraft(rechargeDraft),
        invoke: () => store.createRecharge(rechargeDraft),
        oldResult: { id: 'old-recharge' }, nextResult: { id: 'new-recharge' }, keyIndex: 1
      },
      {
        name: 'recharge reversal', slot: 'reverseRecharge:recharge-1', mock: apiMocks.reversePrepaidRecharge,
        prepare: () => undefined,
        invoke: () => store.reverseRecharge('recharge-1', '误充值'),
        oldResult: { id: 'old-recharge-reversal' }, nextResult: { id: 'new-recharge-reversal' }, keyIndex: 2
      },
      {
        name: 'consumption reversal', slot: 'reverseConsumption:consumption-1', mock: apiMocks.reversePrepaidConsumption,
        prepare: () => undefined,
        invoke: () => store.reverseConsumption('consumption-1', '误扣款'),
        oldResult: { id: 'old-consumption-reversal' }, nextResult: { id: 'new-consumption-reversal' }, keyIndex: 2
      },
      {
        name: 'settlement create', slot: 'createSettlement', mock: apiMocks.createPrepaidSettlement,
        prepare: () => store.setSettlementSelection(['payable-1']),
        invoke: () => store.createSettlement(['payable-1']),
        oldResult: settlementRowFixture('old-settlement-create'),
        nextResult: settlementRowFixture('new-settlement-create'), keyIndex: 1
      },
      {
        name: 'settlement payment', slot: 'submitPayment:settlement-pay', mock: apiMocks.submitPrepaidSettlementPayment,
        prepare: () => store.setSettlementPaymentDraftFor('settlement-pay', paymentDraft),
        invoke: () => store.submitSettlementPayment('settlement-pay', paymentDraft),
        oldResult: settlementRowFixture('old-settlement-payment'),
        nextResult: settlementRowFixture('new-settlement-payment'), keyIndex: 2
      },
      {
        name: 'settlement confirmation', slot: 'confirmSettlement:settlement-confirm', mock: apiMocks.confirmPrepaidSettlement,
        prepare: () => undefined,
        invoke: () => store.confirmSettlement('settlement-confirm'),
        oldResult: settlementRowFixture('old-settlement-confirm'),
        nextResult: settlementRowFixture('new-settlement-confirm'), keyIndex: 1
      },
      {
        name: 'settlement rejection', slot: 'rejectSettlement:settlement-reject', mock: apiMocks.rejectPrepaidSettlement,
        prepare: () => undefined,
        invoke: () => store.rejectSettlement('settlement-reject', '未到账'),
        oldResult: settlementRowFixture('old-settlement-reject'),
        nextResult: settlementRowFixture('new-settlement-reject'), keyIndex: 2
      },
      {
        name: 'settlement cancellation', slot: 'cancelSettlement:settlement-cancel', mock: apiMocks.cancelPrepaidSettlement,
        prepare: () => undefined,
        invoke: () => store.cancelSettlement('settlement-cancel'),
        oldResult: settlementRowFixture('old-settlement-cancel'),
        nextResult: settlementRowFixture('new-settlement-cancel'), keyIndex: 1
      }
    ] as const

    for (const [index, testCase] of cases.entries()) {
      testCase.mock.mockReset()
      auth.token = `account-a-token-${index}`
      auth.user = {
        id: `account-a-${index}`, dataOwnerId: `owner-a-${index}`, account: `account-a-${index}`,
        username: '账号 A', role: 'FRONTEND_USER', permissionVersion: index + 1,
        permissions: [], isFrontendMainAccount: true, isFrontendSubAccount: false
      }
      testCase.prepare()
      const oldAttempt = deferred<never>()
      const newFailedAttempt = deferred<never>()
      const accountBFailure = new Error(`${testCase.name} account B lost response`)
      testCase.mock
        .mockReturnValueOnce(oldAttempt.promise)
        .mockReturnValueOnce(newFailedAttempt.promise)
        .mockResolvedValueOnce(testCase.nextResult)

      const oldRequest = testCase.invoke()
      await vi.waitFor(() => expect(testCase.mock).toHaveBeenCalledTimes(1))

      auth.token = `account-b-token-${index}`
      auth.user = {
        id: `account-b-${index}`, dataOwnerId: `owner-b-${index}`, account: `account-b-${index}`,
        username: '账号 B', role: 'FRONTEND_USER', permissionVersion: index + 101,
        permissions: [], isFrontendMainAccount: true, isFrontendSubAccount: false
      }
      store.setRechargeDraft({ ...rechargeDraft, remark: `账号 B 草稿 ${testCase.name}` })
      testCase.prepare()
      const failedRequest = testCase.invoke()
      await vi.waitFor(() => expect(testCase.mock).toHaveBeenCalledTimes(2))
      store.setRechargeDraft({ ...rechargeDraft, remark: `账号 B 草稿 ${testCase.name}` })
      if (testCase.name === 'settlement create') store.setSettlementSelection(['payable-b-draft'])
      if (testCase.name === 'settlement payment') {
        store.setSettlementPaymentDraftFor('settlement-pay', {
          ...paymentDraft, remark: '账号 B 付款草稿'
        })
      }
      const failedAssertion = expect(failedRequest).rejects.toBe(accountBFailure)
      newFailedAttempt.reject(accountBFailure)
      await failedAssertion

      const firstKey = testCase.mock.mock.calls[0][testCase.keyIndex]
      const accountBKey = testCase.mock.mock.calls[1][testCase.keyIndex]
      expect(accountBKey, testCase.name).not.toBe(firstKey)
      expect(store.pendingIdempotencyKeys[testCase.slot], testCase.name).toBe(accountBKey)

      oldAttempt.resolve(testCase.oldResult as never)
      await oldRequest

      expect(store.pendingIdempotencyKeys[testCase.slot], testCase.name).toBe(accountBKey)
      expect(store.rechargeDraft.remark, testCase.name).toContain('账号 B')
      expect(store.settlements.some((row) => row.id.startsWith('old-settlement')), testCase.name).toBe(false)
      if (testCase.name === 'settlement create') {
        expect(store.settlementSelection).toEqual(['payable-b-draft'])
      }
      if (testCase.name === 'settlement payment') {
        expect(store.getSettlementPaymentDraft('settlement-pay')).toEqual({
          ...paymentDraft, remark: '账号 B 付款草稿'
        })
      }

      await testCase.invoke()
      expect(testCase.mock.mock.calls[2][testCase.keyIndex], testCase.name).toBe(accountBKey)
      expect(store.pendingIdempotencyKeys[testCase.slot], testCase.name).toBeUndefined()
    }
  })

  it('does not let an old-account mutation completion decrement the new account loading state', async () => {
    const accountARequest = deferred<PrepaidSettlementRow>()
    const accountBRequest = deferred<PrepaidSettlementRow>()
    apiMocks.confirmPrepaidSettlement
      .mockReturnValueOnce(accountARequest.promise)
      .mockReturnValueOnce(accountBRequest.promise)
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()

    const oldMutation = store.confirmSettlement('shared-settlement')
    await vi.waitFor(() => expect(apiMocks.confirmPrepaidSettlement).toHaveBeenCalledTimes(1))
    auth.token = 'account-b-token'
    auth.user = {
      id: 'account-b', account: 'account-b', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'account-b', permissions: [], permissionVersion: 2,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    const newMutation = store.confirmSettlement('shared-settlement')
    await vi.waitFor(() => expect(apiMocks.confirmPrepaidSettlement).toHaveBeenCalledTimes(2))
    expect(store.loadingByPage.settlements).toBe(true)

    accountARequest.resolve(settlementRowFixture('account-a-result'))
    await oldMutation
    expect(store.loadingByPage.settlements).toBe(true)

    accountBRequest.resolve(settlementRowFixture('account-b-result'))
    await newMutation
    expect(store.loadingByPage.settlements).toBe(false)
  })

  it('loads independently paginated settlement reads and refreshes only selected payable availability', async () => {
    const first = {
      items: [
        { id: 'payable-1', status: 'PENDING', eligible: true },
        { id: 'payable-2', status: 'PENDING', eligible: true },
        { id: 'payable-3', status: 'COMPLETED', eligible: false }
      ],
      total: 3, page: 2, pageSize: 10
    }
    apiMocks.getPrepaidSettlementPayables
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({
        items: [{ id: 'payable-1', status: 'HELD', eligible: false }],
        total: 1, page: 1, pageSize: 1
      })
    apiMocks.getPrepaidSettlements.mockResolvedValue({
      items: [settlementRowFixture('settlement-1')], total: 1, page: 1, pageSize: 20
    })
    apiMocks.getPrepaidSettlement.mockResolvedValue(settlementRowFixture('settlement-1'))
    const store = useSharedPrepaidStore()

    await store.loadSettlementPayables({ page: 2, pageSize: 10, status: 'PENDING' })
    await store.loadSettlements({ page: 1, pageSize: 20 })
    await store.loadSettlementDetail('settlement-1')
    await store.refreshSelectedSettlementPayables(['payable-1'])

    expect(apiMocks.getPrepaidSettlementPayables).toHaveBeenNthCalledWith(1, {
      page: 2, pageSize: 10, status: 'PENDING'
    })
    expect(apiMocks.getPrepaidSettlementPayables).toHaveBeenNthCalledWith(2, {
      page: 1, pageSize: 1, payableIds: ['payable-1']
    })
    expect(store.settlementPayablesPage).toMatchObject({
      page: 2, total: 3,
      items: [
        { id: 'payable-1', status: 'HELD', eligible: false },
        { id: 'payable-2', status: 'PENDING', eligible: true },
        { id: 'payable-3', status: 'COMPLETED', eligible: false }
      ]
    })
    expect(store.settlementsPage.items[0]).toMatchObject({ id: 'settlement-1' })
    expect(store.selectedSettlement).toMatchObject({ id: 'settlement-1' })
  })

  it('keeps selected payable rows across pages and refreshes off-page availability by ID', async () => {
    const pageOne = settlementPayableFixture('payable-page-1', 'OUTGOING')
    const pageTwo = settlementPayableFixture('payable-page-2', 'INCOMING')
    const pageOneHeld = settlementPayableFixture('payable-page-1', 'OUTGOING', false)
    apiMocks.getPrepaidSettlementPayables
      .mockResolvedValueOnce({ items: [pageOne], total: 21, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({ items: [pageTwo], total: 21, page: 2, pageSize: 20 })
      .mockResolvedValueOnce({ items: [pageOneHeld, pageTwo], total: 2, page: 1, pageSize: 2 })
    const store = useSharedPrepaidStore()

    await store.loadSettlementPayables({ page: 1, pageSize: 20 })
    store.setSettlementSelection(['payable-page-1'])
    await store.loadSettlementPayables({ page: 2, pageSize: 20 })
    store.setSettlementSelection(['payable-page-1', 'payable-page-2'])

    expect(store.selectedSettlementPayableRows.map((row) => row?.id)).toEqual([
      'payable-page-1', 'payable-page-2'
    ])

    await store.refreshSelectedSettlementPayables(['payable-page-1', 'payable-page-2'])

    expect(store.selectedSettlementPayableRows.map((row) => ({ id: row?.id, eligible: row?.eligible }))).toEqual([
      { id: 'payable-page-1', eligible: false },
      { id: 'payable-page-2', eligible: true }
    ])
    expect(store.settlementPayablesPage.items).toEqual([pageTwo])

    store.setSettlementSelection(['payable-page-2'])
    expect(store.selectedSettlementPayableRows.map((row) => row?.id)).toEqual(['payable-page-2'])
    store.setSettlementSelection([])
    expect(store.selectedSettlementPayableRows).toEqual([])
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

  it('coalesces identical create clicks under one request/key and clears the successful selection once', async () => {
    const first = deferred<PrepaidSettlementRow>()
    apiMocks.createPrepaidSettlement.mockReturnValue(first.promise)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000011')
    const store = useSharedPrepaidStore()
    store.setSettlementSelection(['payable-1'])

    const firstCall = store.createSettlement()
    const secondCall = store.createSettlement()
    await Promise.resolve()
    expect(apiMocks.createPrepaidSettlement).toHaveBeenCalledTimes(1)

    first.resolve(settlementRowFixture('settlement-1'))
    await expect(Promise.all([firstCall, secondCall])).resolves.toEqual([
      expect.objectContaining({ id: 'settlement-1' }),
      expect.objectContaining({ id: 'settlement-1' })
    ])

    expect(apiMocks.createPrepaidSettlement.mock.calls.map((call) => call[1])).toEqual([
      '00000000-0000-4000-8000-000000000011'
    ])
    expect(store.settlementSelection).toEqual([])
    expect(store.dirtyByPage.settlements).toBe(false)
    expect(store.pendingIdempotencyKeys.createSettlement).toBeUndefined()
  })

  it('does not let an earlier conflict overwrite a later successful same-slot mutation', async () => {
    const first = deferred<PrepaidSettlementRow>()
    const second = deferred<PrepaidSettlementRow>()
    const conflict = { response: { status: 409 } }
    apiMocks.createPrepaidSettlement
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000013')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000014')
    const store = useSharedPrepaidStore()
    store.setSettlementSelection(['payable-2'])

    const firstCall = store.createSettlement()
    store.setSettlementSelection(['payable-3'])
    const secondCall = store.createSettlement()
    await Promise.resolve()
    const firstResult = expect(firstCall).rejects.toBe(conflict)
    first.reject(conflict)
    await firstResult
    await vi.waitFor(() => expect(apiMocks.createPrepaidSettlement).toHaveBeenCalledTimes(2))
    second.resolve(settlementRowFixture('settlement-2'))
    await secondCall

    expect(store.settlementSelection).toEqual([])
    expect(store.dirtyByPage.settlements).toBe(false)
    expect(store.pendingIdempotencyKeys.createSettlement).toBeUndefined()
  })

  it('derives settlement dirty state independently from selection and payment draft', async () => {
    apiMocks.createPrepaidSettlement.mockResolvedValue({
      id: 'settlement-1', status: 'AWAITING_PAYMENT', lines: []
    })
    apiMocks.submitPrepaidSettlementPayment.mockResolvedValue({
      id: 'settlement-1', status: 'AWAITING_RECEIPT', lines: []
    })
    const store = useSharedPrepaidStore()
    store.setSettlementSelection(['payable-1'])
    store.setSettlementPaymentDraftFor('settlement-1', {
      actualTransferredAt: '2026-08-12T16:00:00+08:00', remark: '待提交付款'
    })

    await store.createSettlement()
    expect(store.settlementSelection).toEqual([])
    expect(store.getSettlementPaymentDraft('settlement-1').remark).toBe('待提交付款')
    expect(store.dirtyByPage.settlements).toBe(true)

    store.setSettlementSelection(['payable-2'])
    await store.submitSettlementPayment('settlement-1')
    expect(store.settlementSelection).toEqual(['payable-2'])
    expect(store.getSettlementPaymentDraft('settlement-1')).toEqual({ actualTransferredAt: '' })
    expect(store.dirtyByPage.settlements).toBe(true)

    store.setSettlementSelection([])
    expect(store.dirtyByPage.settlements).toBe(false)
  })

  it('preserves the entire payment draft and key on 409, then clears only that draft on retry success', async () => {
    const conflict = { response: { status: 409, data: { code: 'PREPAID_SETTLEMENT_STATE_CONFLICT' } } }
    apiMocks.submitPrepaidSettlementPayment
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(settlementRowFixture('settlement-1'))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000019')
    const store = useSharedPrepaidStore()
    store.setSettlementSelection(['payable-other'])
    store.setSettlementPaymentDraftFor('settlement-1', {
      actualTransferredAt: '2026-08-12T16:00:00+08:00',
      proofUrls: ['/uploads/proof.png'], remark: '网银备注'
    })

    await expect(store.submitSettlementPayment('settlement-1')).rejects.toBe(conflict)
    expect(store.getSettlementPaymentDraft('settlement-1')).toEqual({
      actualTransferredAt: '2026-08-12T16:00:00+08:00',
      proofUrls: ['/uploads/proof.png'], remark: '网银备注'
    })
    expect(store.pendingIdempotencyKeys['submitPayment:settlement-1']).toBe('00000000-0000-4000-8000-000000000019')

    await store.submitSettlementPayment('settlement-1')
    expect(apiMocks.submitPrepaidSettlementPayment.mock.calls.map((call) => call[2])).toEqual([
      '00000000-0000-4000-8000-000000000019',
      '00000000-0000-4000-8000-000000000019'
    ])
    expect(store.getSettlementPaymentDraft('settlement-1')).toEqual({ actualTransferredAt: '' })
    expect(store.settlementSelection).toEqual(['payable-other'])
    expect(store.dirtyByPage.settlements).toBe(true)
  })

  it('scopes payment drafts by settlement so one detail never inherits another settlement metadata', () => {
    const store = useSharedPrepaidStore()

    store.setSettlementPaymentDraftFor('settlement-a', {
      actualTransferredAt: '2026-08-12T16:00:00+08:00',
      proofUrls: ['/uploads/a.png'], remark: 'A 的付款'
    })
    store.setSettlementPaymentDraftFor('settlement-b', {
      actualTransferredAt: '2026-08-13T16:00:00+08:00', remark: 'B 的付款'
    })

    expect(store.getSettlementPaymentDraft('settlement-a')).toEqual({
      actualTransferredAt: '2026-08-12T16:00:00+08:00',
      proofUrls: ['/uploads/a.png'], remark: 'A 的付款'
    })
    expect(store.getSettlementPaymentDraft('settlement-b')).toEqual({
      actualTransferredAt: '2026-08-13T16:00:00+08:00', remark: 'B 的付款'
    })
    expect(store.getSettlementPaymentDraft('settlement-c')).toEqual({ actualTransferredAt: '' })
  })

  it('coalesces duplicate settlement actions so rapid clicks use one promise and idempotency key', async () => {
    const pending = deferred<PrepaidSettlementRow>()
    apiMocks.confirmPrepaidSettlement.mockReturnValue(pending.promise)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000021')
    const store = useSharedPrepaidStore()

    const first = store.confirmSettlement('settlement-1')
    const second = store.confirmSettlement('settlement-1')
    await Promise.resolve()

    expect(apiMocks.confirmPrepaidSettlement).toHaveBeenCalledTimes(1)
    pending.resolve(settlementRowFixture('settlement-1'))
    await Promise.all([first, second])
    expect(apiMocks.confirmPrepaidSettlement).toHaveBeenCalledWith(
      'settlement-1', '00000000-0000-4000-8000-000000000021'
    )
  })

  it('keeps stale selected rows visible after a conflict but clears the now-invalid preview', async () => {
    apiMocks.previewPrepaidSettlement.mockResolvedValue({
      accountAId: 'front-1', accountBId: 'front-2', aToBAmount: 90.9, bToAAmount: 0,
      netAmount: 90.9, payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2', lines: []
    })
    apiMocks.getPrepaidSettlementPayables.mockResolvedValue({
      items: [{ id: 'payable-1', status: 'HELD', eligible: false }], total: 1, page: 1, pageSize: 1
    })
    const store = useSharedPrepaidStore()
    store.setSettlementSelection(['payable-1'])
    await store.previewSettlement()

    await store.refreshSelectedSettlementPayables(['payable-1'])

    expect(store.settlementSelection).toEqual(['payable-1'])
    expect(store.settlementPreview).toBeNull()
  })

  it('keeps the newest recharge page when older requests resolve out of order', async () => {
    const first = deferred<PrepaidPage<PrepaidRechargeRow>>()
    const second = deferred<PrepaidPage<PrepaidRechargeRow>>()
    apiMocks.getPrepaidRecharges
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const store = useSharedPrepaidStore()

    const oldRequest = store.loadRecharges({ phone: 'old' })
    const newRequest = store.loadRecharges({ phone: 'new' })
    second.resolve(rechargePageFixture('new', 2))
    await newRequest
    first.resolve(rechargePageFixture('old', 1))
    await oldRequest

    expect(store.rechargesPage).toMatchObject({ items: [{ id: 'new' }], page: 2 })
  })

  it('does not apply a delayed account-A page after account B logs in', async () => {
    const accountARead = deferred<PrepaidPage<PrepaidRechargeRow>>()
    apiMocks.getPrepaidRecharges.mockReturnValueOnce(accountARead.promise)
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()

    const delayed = store.loadRecharges({ phone: '13800000000' })
    auth.token = 'account-b-token'
    auth.user = {
      id: 'account-b', account: 'account-b', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'account-b', permissions: [], permissionVersion: 2,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }

    accountARead.resolve(rechargePageFixture('account-a-recharge', 1))
    await delayed

    expect(store.rechargesPage).toEqual({ items: [], total: 0, page: 1, pageSize: 20 })
  })

  it('does not expose a delayed account-A read error or loading state to account B', async () => {
    const accountARead = deferred<PrepaidPage<PrepaidRechargeRow>>()
    apiMocks.getPrepaidRecharges.mockReturnValueOnce(accountARead.promise)
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()

    const delayed = store.loadRecharges()
    expect(store.loadingByPage.recharges).toBe(true)
    auth.token = 'account-b-token'
    auth.user = {
      id: 'account-b', account: 'account-b', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'account-b', permissions: [], permissionVersion: 2,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    expect(store.loadingByPage.recharges).toBe(false)

    const staleFailure = expect(delayed).rejects.toThrow('account A read failed')
    accountARead.reject(new Error('account A read failed'))
    await staleFailure

    expect(store.errorsByPage.recharges).toBe('')
    expect(store.loadingByPage.recharges).toBe(false)
  })

  it('clears every account-derived page, detail, preview, selection, and draft on auth change', () => {
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()
    const selectedPayable = settlementPayableFixture('account-a-payable', 'OUTGOING')

    store.membersPage = { items: [{ id: 'account-a-member' }] as never, total: 1, page: 2, pageSize: 20 }
    store.rechargesPage = rechargePageFixture('account-a-recharge', 2)
    store.selectedMember = { id: 'account-a-member' } as never
    store.consumptionsPage = { items: [{ id: 'account-a-consumption' }] as never, total: 1, page: 2, pageSize: 20 }
    store.consumptionFilterOptions = {
      sourceOwners: [{ id: 'account-a', account: 'a', label: 'A' }], consumingOwners: []
    }
    store.consumptions = [{ id: 'account-a-consumption' }] as never
    store.payables = [{ id: 'account-a-payable' }] as never
    store.settlementPayablesPage = { items: [selectedPayable], total: 1, page: 2, pageSize: 20 }
    store.settlements = [settlementRowFixture('account-a-settlement')]
    store.settlementsPage = {
      items: [settlementRowFixture('account-a-settlement')] as never, total: 1, page: 2, pageSize: 20
    }
    store.selectedSettlement = settlementRowFixture('account-a-settlement') as never
    store.setRechargeDraft({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 100,
      giftAmount: 0, isOpeningBalance: false, remark: '账号 A 充值草稿'
    })
    store.setSettlementSelection([selectedPayable.id])
    store.settlementPreview = {
      accountAId: 'front-1', accountBId: 'front-2', aToBAmount: 50, bToAAmount: 0,
      netAmount: 50, payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2', lines: []
    }
    store.setSettlementPaymentDraftFor('account-a-settlement', {
      actualTransferredAt: '2026-08-12T16:00:00+08:00', remark: '账号 A 付款草稿'
    })

    auth.token = 'account-b-token'
    auth.user = {
      id: 'account-b', account: 'account-b', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'account-b', permissions: [], permissionVersion: 2,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }

    expect(store.membersPage.items).toEqual([])
    expect(store.rechargesPage.items).toEqual([])
    expect(store.selectedMember).toBeNull()
    expect(store.consumptionsPage.items).toEqual([])
    expect(store.consumptionFilterOptions).toEqual({ sourceOwners: [], consumingOwners: [] })
    expect(store.consumptions).toEqual([])
    expect(store.payables).toEqual([])
    expect(store.settlementPayablesPage.items).toEqual([])
    expect(store.settlements).toEqual([])
    expect(store.settlementsPage.items).toEqual([])
    expect(store.selectedSettlement).toBeNull()
    expect(store.settlementPreview).toBeNull()
    expect(store.settlementSelection).toEqual([])
    expect(store.selectedSettlementPayableRows).toEqual([])
    expect(store.rechargeDraft).toEqual({
      phone: '', rechargeDate: '', paidAmount: '', giftAmount: '', isOpeningBalance: false, remark: ''
    })
    expect(store.getSettlementPaymentDraft('account-a-settlement')).toEqual({ actualTransferredAt: '' })
    expect(store.dirtyByPage).toEqual({ recharges: false, members: false, consumptions: false, settlements: false })
  })

  it('does not apply an account-A settlement preview after account B logs in', async () => {
    const accountAPreview = deferred<never>()
    apiMocks.previewPrepaidSettlement.mockReturnValueOnce(accountAPreview.promise)
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()
    store.setSettlementSelection(['account-a-payable'])

    const delayed = store.previewSettlement()
    auth.token = 'account-b-token'
    auth.user = {
      id: 'account-b', account: 'account-b', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'account-b', permissions: [], permissionVersion: 2,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    accountAPreview.resolve({
      accountAId: 'front-1', accountBId: 'front-2', aToBAmount: 50, bToAAmount: 0,
      netAmount: 50, payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2', lines: []
    } as never)
    await delayed

    expect(store.settlementPreview).toBeNull()
    expect(store.settlementSelection).toEqual([])
  })

  it('does not let an account-A selected-payable refresh overwrite the same ID for account B', async () => {
    const accountARow = settlementPayableFixture('shared-payable', 'OUTGOING')
    const staleAccountARow = settlementPayableFixture('shared-payable', 'OUTGOING', false)
    const accountBRow = settlementPayableFixture('shared-payable', 'INCOMING', true)
    const accountARefresh = deferred<PrepaidPage<PrepaidSettlementPayableListRow>>()
    apiMocks.getPrepaidSettlementPayables
      .mockResolvedValueOnce({ items: [accountARow], total: 1, page: 1, pageSize: 20 })
      .mockReturnValueOnce(accountARefresh.promise)
      .mockResolvedValueOnce({ items: [accountBRow], total: 1, page: 1, pageSize: 20 })
    const store = useSharedPrepaidStore()
    const auth = useAuthStore()

    await store.loadSettlementPayables()
    store.setSettlementSelection(['shared-payable'])
    const delayed = store.refreshSelectedSettlementPayables(['shared-payable'])
    auth.token = 'account-b-token'
    auth.user = {
      id: 'account-b', account: 'account-b', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'account-b', permissions: [], permissionVersion: 2,
      requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    await store.loadSettlementPayables()
    store.setSettlementSelection(['shared-payable'])

    accountARefresh.resolve({ items: [staleAccountARow], total: 1, page: 1, pageSize: 1 })
    await delayed

    expect(store.settlementPayablesPage.items).toEqual([accountBRow])
    expect(store.selectedSettlementPayableRows).toEqual([accountBRow])
  })

  it('ignores an older recharge error after a newer request succeeds', async () => {
    const first = deferred<PrepaidPage<PrepaidRechargeRow>>()
    const second = deferred<PrepaidPage<PrepaidRechargeRow>>()
    apiMocks.getPrepaidRecharges
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const store = useSharedPrepaidStore()

    const oldRequest = store.loadRecharges({ phone: 'old' })
    const newRequest = store.loadRecharges({ phone: 'new' })
    second.resolve(rechargePageFixture('new', 2))
    await newRequest
    const oldResult = expect(oldRequest).rejects.toThrow('stale failure')
    first.reject(new Error('stale failure'))
    await oldResult

    expect(store.rechargesPage).toMatchObject({ items: [{ id: 'new' }], page: 2 })
    expect(store.errorsByPage.recharges).toBe('')
  })
})
