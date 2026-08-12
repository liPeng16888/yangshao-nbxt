import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import PrepaidSettlementsPage from './PrepaidSettlementsPage.vue'

const apiMocks = vi.hoisted(() => ({
  createSharedPrepaidStreamTicket: vi.fn().mockResolvedValue({ ticket: 'ticket', expiresAt: Date.now() + 30_000 }),
  createSharedPrepaidEventSource: vi.fn().mockReturnValue(null),
  isSharedPrepaidTerminalAuthError: vi.fn().mockReturnValue(false),
  getPrepaidSettlementPayables: vi.fn(),
  getPrepaidSettlements: vi.fn(),
  getPrepaidSettlement: vi.fn(),
  previewPrepaidSettlement: vi.fn(),
  createPrepaidSettlement: vi.fn(),
  submitPrepaidSettlementPayment: vi.fn(),
  confirmPrepaidSettlement: vi.fn(),
  rejectPrepaidSettlement: vi.fn(),
  cancelPrepaidSettlement: vi.fn()
}))

vi.mock('@/api/sharedPrepaid', () => apiMocks)

const accountA = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }
const accountB = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }

function payable(id: string, direction: 'OUTGOING' | 'INCOMING', amount: number, status = 'PENDING', eligible = true) {
  const outgoing = direction === 'OUTGOING'
  return {
    id, consumptionId: `consumption-${id}`,
    sourceOwnerId: outgoing ? 'front-1' : 'front-2', consumerOwnerId: outgoing ? 'front-2' : 'front-1',
    exactAmount: amount, amount, status, reversalOfId: null, eligible, direction,
    counterpartyFrontendUserId: 'front-2', createdAt: '2026-08-12T03:04:05.000Z', updatedAt: '2026-08-12T03:04:05.000Z',
    sourceOwner: outgoing ? accountA : accountB, consumerOwner: outgoing ? accountB : accountA,
    consumption: {
      id: `consumption-${id}`, memberId: `member-${id}`, phoneSnapshot: '13800000000',
      sampleNumberSnapshot: `S-${id}`, sampleCountSnapshot: outgoing ? 3 : 2,
      elementsSnapshot: outgoing ? ['Au', 'Ag'] : ['Cu'], sheetDate: '2026-08-12',
      createdAt: '2026-08-12T03:04:05.000Z',
      relationLimit: 100, relationTruncated: { allocations: false },
      rechargeBatches: [{ id: `recharge-${id}`, rechargeDate: '2026-08-01', isOpeningBalance: false }]
    },
    relationLimit: 100,
    relationTruncated: { settlementAssociations: false },
    settlementAssociations: status === 'PENDING' ? [] : [{
      id: `line-${id}`, settlementId: 'settlement-old', direction: 'A_TO_B', amount,
      releasedAt: null, createdAt: '2026-08-12T03:04:05.000Z',
      status: 'AWAITING_PAYMENT', settlementCreatedAt: '2026-08-12T03:04:05.000Z'
    }]
  }
}

const rows = [
  payable('payable-out', 'OUTGOING', 90.9),
  payable('payable-in', 'INCOMING', 40.4),
  payable('payable-held', 'OUTGOING', 10, 'HELD', false)
]

function settlementSummary() {
  return {
    id: 'settlement-1', accountAId: 'front-1', accountBId: 'front-2',
    aToBAmount: 90.9, bToAAmount: 40.4, netAmount: 50.5,
    payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2', status: 'AWAITING_PAYMENT',
    createdAt: '2026-08-12T03:04:05.000Z', accountA, accountB
  }
}

function settlementDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...settlementSummary(), actualTransferredAt: null, proofUrls: [], remark: null,
    createdById: 'front-1', paymentSubmittedById: null, paymentSubmittedAt: null,
    receiptConfirmedById: null, receiptConfirmedAt: null, rejectedById: null, rejectedAt: null,
    rejectionReason: null, cancelledById: null, cancelledAt: null, version: 1,
    updatedAt: '2026-08-12T03:04:05.000Z', payerFrontendUser: accountA, receiverFrontendUser: accountB,
    createdBy: accountA, paymentSubmittedBy: null, receiptConfirmedBy: null,
    rejectedBy: null, cancelledBy: null, lines: [], actions: [], ...overrides
  }
}

function setUser(pinia: ReturnType<typeof createPinia>, role: 'FRONTEND_USER' | 'FRONTEND_SUB_USER' = 'FRONTEND_USER') {
  const auth = useAuthStore(pinia)
  auth.token = 'token'
  auth.user = {
    id: role === 'FRONTEND_USER' ? 'front-1' : 'sub-1', account: 'owner-a', username: '查看人', role,
    dataOwnerId: 'front-1', permissions: ['PREPAID_SETTLEMENTS'], permissionVersion: 1,
    requiresAccessGuardPassword: true,
    isFrontendMainAccount: role === 'FRONTEND_USER', isFrontendSubAccount: role === 'FRONTEND_SUB_USER'
  }
}

function mountPage(role: 'FRONTEND_USER' | 'FRONTEND_SUB_USER' = 'FRONTEND_USER') {
  const pinia = createPinia()
  setActivePinia(pinia)
  setUser(pinia, role)
  return {
    pinia,
    store: useSharedPrepaidStore(pinia),
    wrapper: mount(PrepaidSettlementsPage, {
      attachTo: document.body,
      global: { plugins: [pinia, ElementPlus], stubs: { teleport: true } }
    })
  }
}

describe('PrepaidSettlementsPage', () => {
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
    vi.clearAllMocks()
    apiMocks.createSharedPrepaidStreamTicket.mockResolvedValue({ ticket: 'ticket', expiresAt: Date.now() + 30_000 })
    apiMocks.createSharedPrepaidEventSource.mockReturnValue(null)
    apiMocks.getPrepaidSettlementPayables.mockResolvedValue({ items: rows, total: rows.length, page: 1, pageSize: 20 })
    apiMocks.getPrepaidSettlements.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    apiMocks.previewPrepaidSettlement.mockResolvedValue({
      accountAId: 'front-1', accountBId: 'front-2', aToBAmount: 90.9, bToAAmount: 40.4,
      netAmount: 50.5, payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2', lines: []
    })
  })

  it('groups both gross directions by counterparty and computes authoritative net live without hiding source rows', async () => {
    const { wrapper } = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('与 主账号 B（owner-b）结算')
    expect(wrapper.text()).toContain('A应付B')
    expect(wrapper.text()).toContain('B应付A')
    expect(wrapper.text()).toContain('样品数量 3')
    expect(wrapper.text()).toContain('检测元素 Au、Ag')
    expect(wrapper.text()).toContain('会员 13800000000')
    expect(wrapper.text()).toContain('充值来源 北京店（owner-a）')
    expect(wrapper.text()).toContain('消费账号 主账号 B（owner-b）')
    expect(wrapper.text()).toContain('结算批次 settlement-old')
    expect((wrapper.get('[data-testid="payable-select-payable-held"]').element as HTMLInputElement).disabled).toBe(true)

    await wrapper.get('[data-testid="payable-select-payable-out"]').setValue(true)
    await wrapper.get('[data-testid="payable-select-payable-in"]').setValue(true)
    await flushPromises()

    expect(apiMocks.previewPrepaidSettlement).toHaveBeenLastCalledWith({ payableIds: ['payable-out', 'payable-in'] })
    expect(wrapper.get('[data-testid="settlement-preview"]').text()).toContain('A应付B ¥90.9')
    expect(wrapper.get('[data-testid="settlement-preview"]').text()).toContain('B应付A ¥40.4')
    expect(wrapper.get('[data-testid="settlement-preview"]').text()).toContain('抵扣金额 ¥40.4')
    expect(wrapper.get('[data-testid="settlement-preview"]').text()).toContain('实际转账金额 ¥50.5')
    expect(wrapper.get('[data-testid="settlement-preview"]').text()).toContain('付款方 北京店（owner-a）')
    expect(wrapper.get('[data-testid="settlement-preview"]').text()).toContain('收款方 主账号 B（owner-b）')
  })

  it('shows explicit per-relation truncation notices for bounded payable projections', async () => {
    const truncated = payable('payable-truncated', 'OUTGOING', 90.9)
    truncated.consumption.relationTruncated.allocations = true
    truncated.relationTruncated.settlementAssociations = true
    apiMocks.getPrepaidSettlementPayables.mockResolvedValue({
      items: [truncated], total: 1, page: 1, pageSize: 20
    })

    const { wrapper } = mountPage()
    await flushPromises()

    expect(wrapper.get('[data-testid="payable-allocations-truncated-payable-truncated"]').text())
      .toContain('充值分摊仅展示前 100 条')
    expect(wrapper.get('[data-testid="payable-associations-truncated-payable-truncated"]').text())
      .toContain('历史结算关联仅展示前 100 条')
  })

  it('preserves selection and idempotency key on stale-line 409 while refreshing selected availability', async () => {
    const conflict = { response: { status: 409, data: { message: '部分应转款已被占用' } } }
    apiMocks.createPrepaidSettlement.mockRejectedValueOnce(conflict)
    apiMocks.getPrepaidSettlementPayables
      .mockResolvedValueOnce({ items: rows, total: rows.length, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({
        items: [payable('payable-out', 'OUTGOING', 90.9, 'HELD', false), rows[1]],
        total: 2, page: 1, pageSize: 20
      })
    const { wrapper, store } = mountPage()
    await flushPromises()
    await wrapper.get('[data-testid="payable-select-payable-out"]').setValue(true)
    await wrapper.get('[data-testid="payable-select-payable-in"]').setValue(true)
    await flushPromises()
    await wrapper.get('[data-testid="settlement-create"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="settlement-mutation-error"]').text()).toContain('保留了已选明细')
    expect(store.settlementSelection).toEqual(['payable-out', 'payable-in'])
    expect(store.pendingIdempotencyKeys.createSettlement).toEqual(expect.any(String))
    expect(apiMocks.getPrepaidSettlementPayables).toHaveBeenLastCalledWith(expect.objectContaining({
      payableIds: ['payable-out', 'payable-in']
    }))
    expect(store.settlementPreview).toBeNull()
    expect(wrapper.find('[data-testid="settlement-create"]').exists()).toBe(false)

    const staleCheckbox = wrapper.get('[data-testid="payable-select-payable-out"]')
    expect((staleCheckbox.element as HTMLInputElement).checked).toBe(true)
    expect((staleCheckbox.element as HTMLInputElement).disabled).toBe(false)
    await staleCheckbox.setValue(false)
    await flushPromises()

    expect(store.settlementSelection).toEqual(['payable-in'])
    expect(apiMocks.previewPrepaidSettlement).toHaveBeenLastCalledWith({ payableIds: ['payable-in'] })
    expect(wrapper.find('[data-testid="settlement-create"]').exists()).toBe(true)
  })

  it('preserves multi-page selection and blocks an off-page row invalidated by a 409 until it is unchecked', async () => {
    const pageOne = payable('payable-page-1', 'OUTGOING', 90.9)
    const pageTwo = payable('payable-page-2', 'INCOMING', 40.4)
    const pageOneHeld = payable('payable-page-1', 'OUTGOING', 90.9, 'HELD', false)
    const conflict = { response: { status: 409, data: { message: '部分应转款已被占用' } } }
    let conflicted = false
    apiMocks.getPrepaidSettlementPayables.mockImplementation((query: {
      page?: number
      payableIds?: string[]
    } = {}) => {
      if (query.payableIds) {
        return Promise.resolve({ items: [pageOneHeld, pageTwo], total: 2, page: 1, pageSize: 2 })
      }
      if (query.page === 2) {
        return Promise.resolve({ items: [pageTwo], total: 21, page: 2, pageSize: 20 })
      }
      return Promise.resolve({ items: [conflicted ? pageOneHeld : pageOne], total: 21, page: 1, pageSize: 20 })
    })
    apiMocks.createPrepaidSettlement.mockImplementation(() => {
      conflicted = true
      return Promise.reject(conflict)
    })
    const { wrapper, store } = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="payable-select-payable-page-1"]').setValue(true)
    await flushPromises()
    await store.loadSettlementPayables({ page: 2, pageSize: 20 })
    await flushPromises()
    await wrapper.get('[data-testid="payable-select-payable-page-2"]').setValue(true)
    await flushPromises()

    expect(store.settlementSelection).toEqual(['payable-page-1', 'payable-page-2'])
    await wrapper.get('[data-testid="settlement-create"]').trigger('click')
    await flushPromises()

    expect(store.selectedSettlementPayableRows.map((row) => ({ id: row?.id, eligible: row?.eligible }))).toEqual([
      { id: 'payable-page-1', eligible: false },
      { id: 'payable-page-2', eligible: true }
    ])
    expect(wrapper.find('[data-testid="settlement-create"]').exists()).toBe(false)
    expect((wrapper.get('[data-testid="payable-select-payable-page-2"]').element as HTMLInputElement).checked).toBe(true)

    await store.loadSettlementPayables({ page: 1, pageSize: 20 })
    await flushPromises()
    const invalidOffPage = wrapper.get('[data-testid="payable-select-payable-page-1"]')
    expect((invalidOffPage.element as HTMLInputElement).checked).toBe(true)
    expect((invalidOffPage.element as HTMLInputElement).disabled).toBe(false)
    await invalidOffPage.setValue(false)
    await flushPromises()

    expect(store.settlementSelection).toEqual(['payable-page-2'])
    expect(apiMocks.previewPrepaidSettlement).toHaveBeenLastCalledWith({ payableIds: ['payable-page-2'] })
    expect(wrapper.find('[data-testid="settlement-create"]').exists()).toBe(true)
  })

  it('shows zero-net reconciliation language and gives subaccounts the same data as a view-only page', async () => {
    apiMocks.previewPrepaidSettlement.mockResolvedValue({
      accountAId: 'front-1', accountBId: 'front-2', aToBAmount: 40.4, bToAAmount: 40.4,
      netAmount: 0, payerFrontendUserId: null, receiverFrontendUserId: null, lines: []
    })
    const main = mountPage()
    await flushPromises()
    await main.wrapper.get('[data-testid="payable-select-payable-out"]').setValue(true)
    await main.wrapper.get('[data-testid="payable-select-payable-in"]').setValue(true)
    await flushPromises()
    expect(main.wrapper.get('[data-testid="settlement-create"]').text()).toContain('发起核对')
    expect(main.wrapper.get('[data-testid="settlement-preview"]').text()).toContain('无需转账，需双方主账号核对')

    const sub = mountPage('FRONTEND_SUB_USER')
    await flushPromises()
    expect(sub.wrapper.text()).toContain('子账号仅可查看，结算操作由主账号完成')
    expect((sub.wrapper.get('[data-testid="payable-select-payable-out"]').element as HTMLInputElement).disabled).toBe(true)
    expect(sub.wrapper.find('[data-testid="settlement-create"]').exists()).toBe(false)
  })

  it('registers dirty-aware realtime refresh, preserves inputs, and exposes filters, paging, loading/error/empty states', async () => {
    const { wrapper, store } = mountPage()
    await flushPromises()
    expect(wrapper.find('[aria-label="应转状态筛选"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="结算单状态筛选"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="payables-pagination"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settlements-pagination"]').exists()).toBe(true)

    await wrapper.get('[data-testid="payable-select-payable-out"]').setValue(true)
    await flushPromises()
    await store.handleRealtimeEvent({
      type: 'change', module: 'settlements', entityId: 'settlement-2', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="settlement-refresh-prompt"]').text()).toContain('已保留当前勾选和输入')
    expect((wrapper.get('[data-testid="payable-select-payable-out"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('refreshes an open detail on a clean realtime event but preserves a dirty payment draft', async () => {
    apiMocks.getPrepaidSettlements.mockResolvedValue({
      items: [settlementSummary()], total: 1, page: 1, pageSize: 20
    })
    apiMocks.getPrepaidSettlement.mockResolvedValue(settlementDetail())
    const { wrapper, store } = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="settlement-detail-settlement-1"]').trigger('click')
    await flushPromises()
    expect(apiMocks.getPrepaidSettlement).toHaveBeenCalledTimes(1)

    await store.handleRealtimeEvent({
      type: 'change', module: 'settlements', entityId: 'settlement-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })
    await flushPromises()
    expect(apiMocks.getPrepaidSettlement).toHaveBeenCalledTimes(2)

    const transferTime = wrapper.get('[data-testid="settlement-transfer-time"]')
    await transferTime.setValue('2026-08-12T16:30:00+08:00')
    await store.handleRealtimeEvent({
      type: 'change', module: 'settlements', entityId: 'settlement-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:01:00.000Z'
    })
    await flushPromises()

    expect(apiMocks.getPrepaidSettlement).toHaveBeenCalledTimes(2)
    expect((wrapper.get('[data-testid="settlement-transfer-time"]').element as HTMLInputElement).value)
      .toBe('2026-08-12T16:30:00+08:00')
    expect(wrapper.get('[data-testid="settlement-refresh-prompt"]').text()).toContain('已保留当前勾选和输入')
  })
})
