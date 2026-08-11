import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import PrepaidSettlementDetailDialog from './PrepaidSettlementDetailDialog.vue'

const apiMocks = vi.hoisted(() => ({
  createSharedPrepaidStreamTicket: vi.fn().mockResolvedValue({ ticket: 'ticket', expiresAt: Date.now() + 30_000 }),
  createSharedPrepaidEventSource: vi.fn().mockReturnValue(null),
  isSharedPrepaidTerminalAuthError: vi.fn().mockReturnValue(false),
  submitPrepaidSettlementPayment: vi.fn(),
  confirmPrepaidSettlement: vi.fn(),
  rejectPrepaidSettlement: vi.fn(),
  cancelPrepaidSettlement: vi.fn()
}))
const uploadImages = vi.hoisted(() => vi.fn())

vi.mock('@/api/sharedPrepaid', () => apiMocks)
vi.mock('@/api/upload', () => ({ uploadImages }))

const accountA = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }
const accountB = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }

function payable(id: string, direction: 'A_TO_B' | 'B_TO_A', amount: number) {
  const outgoing = direction === 'A_TO_B'
  return {
    id: `line-${id}`, payableId: id, consumptionId: `consumption-${id}`,
    sourceOwnerId: outgoing ? 'front-1' : 'front-2', consumerOwnerId: outgoing ? 'front-2' : 'front-1',
    direction, amount, payableStatus: 'HELD', releasedAt: null, createdAt: '2026-08-12T03:04:05.000Z',
    payable: {
      id, consumptionId: `consumption-${id}`,
      sourceOwnerId: outgoing ? 'front-1' : 'front-2', consumerOwnerId: outgoing ? 'front-2' : 'front-1',
      exactAmount: amount, amount, status: 'HELD', reversalOfId: null,
      createdAt: '2026-08-12T03:04:05.000Z', updatedAt: '2026-08-12T03:04:05.000Z',
      sourceOwner: outgoing ? accountA : accountB, consumerOwner: outgoing ? accountB : accountA,
      consumption: {
        id: `consumption-${id}`, memberId: `member-${id}`, phoneSnapshot: '13800000000',
        sampleNumberSnapshot: `S-${id}`, sampleCountSnapshot: 3, elementsSnapshot: ['Au', 'Ag'],
        sheetDate: '2026-08-12', createdAt: '2026-08-12T03:04:05.000Z',
        rechargeBatches: [{ id: `recharge-${id}`, rechargeDate: '2026-08-01', isOpeningBalance: false }]
      }
    }
  }
}

function settlement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'settlement-1', accountAId: 'front-1', accountBId: 'front-2',
    aToBAmount: 90.9, bToAAmount: 40.4, netAmount: 50.5,
    payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2', status: 'AWAITING_PAYMENT',
    actualTransferredAt: null, proofUrls: [], remark: null,
    createdById: 'front-1', paymentSubmittedById: null, paymentSubmittedAt: null,
    receiptConfirmedById: null, receiptConfirmedAt: null, rejectedById: null, rejectedAt: null,
    rejectionReason: null, cancelledById: null, cancelledAt: null, version: 1,
    createdAt: '2026-08-12T03:04:05.000Z', updatedAt: '2026-08-12T03:04:05.000Z',
    accountA, accountB, payerFrontendUser: accountA, receiverFrontendUser: accountB,
    createdBy: accountA, paymentSubmittedBy: null, receiptConfirmedBy: null, rejectedBy: null, cancelledBy: null,
    lines: [payable('payable-1', 'A_TO_B', 90.9), payable('payable-2', 'B_TO_A', 40.4)],
    actions: [],
    ...overrides
  }
}

function mountDialog(row: any, userOwner = 'front-1', role: 'FRONTEND_USER' | 'FRONTEND_SUB_USER' = 'FRONTEND_USER') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore(pinia)
  auth.token = 'token'
  auth.user = {
    id: role === 'FRONTEND_USER' ? userOwner : 'sub-1', account: 'viewer', username: '查看人', role,
    dataOwnerId: userOwner, permissions: ['PREPAID_SETTLEMENTS'], permissionVersion: 1,
    requiresAccessGuardPassword: true,
    isFrontendMainAccount: role === 'FRONTEND_USER', isFrontendSubAccount: role === 'FRONTEND_SUB_USER'
  }
  return mount(PrepaidSettlementDetailDialog, {
    props: { modelValue: true, settlement: row },
    global: { plugins: [pinia, ElementPlus] }
  })
}

describe('PrepaidSettlementDetailDialog', () => {
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
    uploadImages.mockResolvedValue(['/uploads/proof.png'])
  })

  it('requires a zoned actual transfer time for the payer and uploads optional proof without hiding gross lines', async () => {
    apiMocks.submitPrepaidSettlementPayment.mockResolvedValue(settlement({ status: 'AWAITING_RECEIPT' }))
    const wrapper = mountDialog(settlement())

    expect(wrapper.text()).toContain('A应付B ¥90.9')
    expect(wrapper.text()).toContain('B应付A ¥40.4')
    expect(wrapper.text()).toContain('实际转账金额 ¥50.5')
    expect(wrapper.text()).toContain('样品数量 3')
    expect(wrapper.text()).toContain('检测元素 Au、Ag')
    expect(wrapper.text()).toContain('充值批次 recharge-payable-1')

    await wrapper.get('[data-testid="settlement-payment-submit"]').trigger('click')
    expect(wrapper.get('[data-testid="settlement-action-error"]').text()).toContain('请选择实际转账时间')
    expect(apiMocks.submitPrepaidSettlementPayment).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="settlement-transfer-time"]').setValue('2026-08-12T16:30:00+08:00')
    await wrapper.get('[data-testid="settlement-payment-remark"]').setValue('网银转账')
    const file = new File(['proof'], 'proof.png', { type: 'image/png' })
    const input = wrapper.get('[data-testid="settlement-proof-input"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await wrapper.get('[data-testid="settlement-payment-submit"]').trigger('click')
    await flushPromises()

    expect(uploadImages).toHaveBeenCalledWith([file])
    expect(apiMocks.submitPrepaidSettlementPayment).toHaveBeenCalledWith('settlement-1', {
      actualTransferredAt: '2026-08-12T16:30:00+08:00',
      proofUrls: ['/uploads/proof.png'], remark: '网银转账'
    }, expect.any(String))
  })

  it('lets only the receiving main confirm or reject with a required reason', async () => {
    const awaitingReceipt = settlement({
      status: 'AWAITING_RECEIPT', actualTransferredAt: '2026-08-12T08:30:00.000Z',
      paymentSubmittedById: 'front-1', paymentSubmittedAt: '2026-08-12T08:31:00.000Z'
    })
    apiMocks.rejectPrepaidSettlement.mockResolvedValue(settlement({ status: 'REJECTED' }))
    const wrapper = mountDialog(awaitingReceipt, 'front-2')

    expect(wrapper.find('[data-testid="settlement-confirm"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settlement-reject-open"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settlement-payment-submit"]').exists()).toBe(false)
    await wrapper.get('[data-testid="settlement-reject-open"]').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('驳回原因')
    await wrapper.get('[data-testid="settlement-reject-submit"]').trigger('click')
    expect(wrapper.get('[data-testid="settlement-reject-error"]').text()).toContain('请填写驳回原因')
    await wrapper.get('[data-testid="settlement-reject-reason"]').setValue('转账金额与结算单不符')
    await wrapper.get('[data-testid="settlement-reject-submit"]').trigger('click')
    await flushPromises()

    expect(apiMocks.rejectPrepaidSettlement).toHaveBeenCalledWith(
      'settlement-1', { reason: '转账金额与结算单不符' }, expect.any(String)
    )
  })

  it('uses counterparty confirmation for zero net without rendering transfer fields', async () => {
    const zero = settlement({
      aToBAmount: 40.4, bToAAmount: 40.4, netAmount: 0,
      payerFrontendUserId: null, receiverFrontendUserId: null, status: 'AWAITING_RECEIPT'
    })
    const wrapper = mountDialog(zero, 'front-2')

    expect(wrapper.text()).toContain('双方金额已抵平')
    expect(wrapper.find('[data-testid="settlement-transfer-time"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="settlement-confirm"]').text()).toContain('确认核对')

    const creator = mountDialog(zero, 'front-1')
    expect(creator.find('[data-testid="settlement-confirm"]').exists()).toBe(false)
  })

  it('renders immutable proof and audit history while keeping subaccounts and completed records action-free', () => {
    const completed = settlement({
      status: 'COMPLETED', actualTransferredAt: '2026-08-12T08:30:00.000Z',
      proofUrls: ['/uploads/proof.png'], remark: '到账备注',
      paymentSubmittedById: 'sub-1', paymentSubmittedAt: '2026-08-12T08:31:00.000Z',
      receiptConfirmedById: 'front-2', receiptConfirmedAt: '2026-08-12T08:35:00.000Z',
      paymentSubmittedBy: { id: 'sub-1', account: 'sub-a', username: '子账号 A', displayRemark: null },
      receiptConfirmedBy: accountB,
      actions: [{
        id: 'action-1', operation: 'SUBMIT_PAYMENT', actorUserId: 'sub-1', actorFrontendUserId: 'front-1',
        createdAt: '2026-08-12T08:31:00.000Z',
        actorUser: { id: 'sub-1', account: 'sub-a', username: '子账号 A', displayRemark: null },
        actorFrontendUser: accountA
      }]
    })
    const wrapper = mountDialog(completed, 'front-1', 'FRONTEND_SUB_USER')

    expect(wrapper.text()).toContain('已完成（不可修改）')
    expect(wrapper.text()).toContain('子账号 A（sub-a）')
    expect(wrapper.text()).toContain('2026-08-12 16:31:00')
    expect(wrapper.get('[data-testid="settlement-proof-0"]').attributes('href')).toBe('/uploads/proof.png')
    expect(wrapper.find('[data-testid="settlement-payment-submit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settlement-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settlement-reject-open"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settlement-cancel-open"]').exists()).toBe(false)
  })
})
