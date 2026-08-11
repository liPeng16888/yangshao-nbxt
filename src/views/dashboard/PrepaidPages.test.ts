import { nextTick, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElDatePicker, ElMessageBox, ElPagination, ElSelect } from 'element-plus'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import type {
  PrepaidConsumptionRow,
  PrepaidMemberDetail,
  PrepaidMemberRow,
  PrepaidRechargeRow
} from '@/types/sharedPrepaid'
import PrepaidRechargePage from './PrepaidRechargePage.vue'
import PrepaidCustomersPage from './PrepaidCustomersPage.vue'
import PrepaidConsumptionsPage from './PrepaidConsumptionsPage.vue'

const api = vi.hoisted(() => ({
  createSharedPrepaidStreamTicket: vi.fn(),
  createSharedPrepaidEventSource: vi.fn(),
  isSharedPrepaidTerminalAuthError: vi.fn(),
  getPrepaidMembers: vi.fn(),
  lookupPrepaidMember: vi.fn(),
  getPrepaidMemberDetail: vi.fn(),
  getPrepaidRecharges: vi.fn(),
  getPrepaidConsumptions: vi.fn(),
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

vi.mock('@/api/sharedPrepaid', () => api)

const accountA = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }
const accountB = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }
const actorB = { id: 'sub-2', account: 'sub-b', username: '子账号 B', displayRemark: null }

const recharge: PrepaidRechargeRow = {
  id: 'recharge-1', memberId: 'member-1', phone: '13800000000',
  ownerFrontendUserId: 'front-1', ownerAccount: 'owner-a', ownerUsername: '主账号 A',
  actorUserId: 'front-1', actorAccount: 'owner-a', actorUsername: '主账号 A',
  rechargeDate: '2026-08-01', paidAmount: 1000, giftAmount: 100, totalAmount: 1100,
  remainingAmount: 1000, isOpeningBalance: true, remark: '期初导入', reversedAt: null,
  reversedByLedgerId: null, createdAt: '2026-08-01T01:02:03.000Z', updatedAt: '2026-08-01T01:02:03.000Z'
}

const consumption: PrepaidConsumptionRow = {
  id: 'consumption-1', memberId: 'member-1', consumingFrontendUserId: 'front-2', actorUserId: 'sub-2',
  kind: 'CONSUMPTION', amount: 100, sheetId: 'sheet-1', sampleBlockId: 'block-1', sampleIndex: 0,
  sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 3,
  elementsSnapshot: [{ name: '金', value: 1.2 }, '银'], phoneSnapshot: '13800000000',
  sheetDate: '2026-08-12', active: true, reversalOfId: null, idempotencyKey: 'consume-1',
  createdAt: '2026-08-12T03:04:05.000Z', consumingFrontendUser: accountB, actorUser: actorB,
  allocations: [{
    id: 'allocation-1', consumptionId: 'consumption-1', rechargeId: 'recharge-1', sourceOwnerId: 'front-1',
    allocatedAmount: 100, paidRatio: 0.9090909091, exactTransferAmount: 90.90909091,
    createdAt: '2026-08-12T03:04:05.100Z', sourceOwner: accountA,
    recharge: {
      id: 'recharge-1', memberId: 'member-1', ownerFrontendUserId: 'front-1', actorUserId: 'front-1',
      rechargeDate: '2026-08-01', paidAmount: 1000, giftAmount: 100, totalAmount: 1100,
      remainingAmount: 1000, isOpeningBalance: true, remark: '期初导入', idempotencyKey: 'recharge-1',
      reversedAt: null, reversedByLedgerId: null, createdAt: '2026-08-01T01:02:03.000Z',
      updatedAt: '2026-08-12T03:04:05.000Z'
    }
  }],
  payables: [{
    id: 'payable-1', consumptionId: 'consumption-1', sourceOwnerId: 'front-1', consumerOwnerId: 'front-2',
    exactAmount: 90.90909091, amount: 90.9, status: 'PENDING', reversalOfId: null,
    createdAt: '2026-08-12T03:04:05.200Z', updatedAt: '2026-08-12T03:04:05.200Z',
    sourceOwner: accountA, consumerOwner: accountB
  }]
}

const member: PrepaidMemberRow = {
  id: 'member-1', phone: '13800000000', paidTotal: 1000, giftTotal: 100, consumedTotal: 100,
  balance: 1000, version: 2,
  ownerComposition: [{
    ownerFrontendUserId: 'front-1', ownerAccount: 'owner-a', ownerUsername: '主账号 A',
    ownerDisplayName: '北京店', balance: 1000
  }],
  latestRechargeTime: '2026-08-01T01:02:03.000Z', latestConsumptionTime: '2026-08-12T03:04:05.000Z',
  createdAt: '2026-08-01T01:02:03.000Z', updatedAt: '2026-08-12T03:04:05.000Z'
}

const detail: PrepaidMemberDetail = {
  ...member,
  recharges: [{ ...recharge }],
  consumptions: [consumption, {
    ...consumption,
    id: 'reversal-1', kind: 'REVERSAL', active: false, reversalOfId: 'consumption-1', amount: -100,
    payables: [], allocations: [], createdAt: '2026-08-13T03:04:05.000Z'
  }],
  ledgerEntries: [{
    id: 'ledger-1', memberId: 'member-1', kind: 'CONSUMPTION_REVERSAL', balanceDelta: 100,
    ownerFrontendUserId: 'front-2', actorUserId: 'front-2', referenceType: 'SharedPrepaidConsumption',
    referenceId: 'reversal-1', idempotencyKey: 'reverse-1', requestFingerprint: null,
    responseSnapshot: null, reason: '样品作废', createdAt: '2026-08-13T03:04:05.000Z'
  }]
}

function setMainAuth(pinia: Pinia, main = true, ownerId = 'front-1') {
  const auth = useAuthStore(pinia)
  auth.token = 'token'
  auth.user = main ? {
    id: ownerId, account: ownerId === 'front-2' ? 'owner-b' : 'owner-a', username: ownerId === 'front-2' ? '主账号 B' : '主账号 A', role: 'FRONTEND_USER', dataOwnerId: ownerId,
    permissions: [], permissionVersion: 1, isFrontendMainAccount: true, isFrontendSubAccount: false
  } : {
    id: 'sub-2', account: 'sub-b', username: '子账号 B', role: 'FRONTEND_SUB_USER', dataOwnerId: 'front-2',
    permissions: ['PREPAID_RECHARGE', 'PREPAID_CUSTOMERS', 'PREPAID_CONSUMPTIONS'], permissionVersion: 1,
    isFrontendMainAccount: false, isFrontendSubAccount: true
  }
}

function mountPage(component: Component, main = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  setMainAuth(pinia, main)
  const wrapper = mount(component, {
    global: { plugins: [pinia, ElementPlus] }
  })
  return { wrapper, pinia, store: useSharedPrepaidStore(pinia) }
}

function input(wrapper: VueWrapper, testId: string) {
  return wrapper.get(`[data-testid="${testId}"]`)
}

beforeEach(() => {
  vi.restoreAllMocks()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] || null,
    get length() { return values.size }
  })
  Object.values(api).forEach((mock) => mock.mockReset())
  api.createSharedPrepaidStreamTicket.mockResolvedValue({ ticket: 'ticket', expiresAt: Date.now() + 30_000 })
  api.createSharedPrepaidEventSource.mockReturnValue(null)
  api.isSharedPrepaidTerminalAuthError.mockReturnValue(false)
  api.getPrepaidMembers.mockResolvedValue({ items: [member], total: 1, page: 1, pageSize: 20 })
  api.lookupPrepaidMember.mockResolvedValue(member)
  api.getPrepaidMemberDetail.mockResolvedValue(detail)
  api.getPrepaidRecharges.mockResolvedValue({ items: [recharge], total: 1, page: 1, pageSize: 20 })
  api.getPrepaidConsumptions.mockResolvedValue({ items: [consumption], total: 1, page: 1, pageSize: 20 })
  api.createPrepaidRecharge.mockResolvedValue({
    id: 'recharge-2', memberId: 'member-1', phone: '13800000000', ownerFrontendUserId: 'front-1',
    actorUserId: 'front-1', rechargeDate: '2026-08-12', paidAmount: 1000, giftAmount: 0,
    totalAmount: 1000, remainingAmount: 1000, balance: 2000, isOpeningBalance: false,
    remark: null, reversedAt: null, createdAt: '2026-08-12T06:07:08.000Z'
  })
  api.reversePrepaidRecharge.mockResolvedValue({})
  api.reversePrepaidConsumption.mockResolvedValue({})
  vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '样品作废', action: 'confirm' } as never)
})

describe('PrepaidRechargePage', () => {
  it('renders the approved required amount fields and accepts a required gift amount of zero', async () => {
    const { wrapper } = mountPage(PrepaidRechargePage)
    await flushPromises()

    expect(wrapper.text()).toContain('会员手机号')
    expect(wrapper.text()).toContain('充值金额')
    expect(wrapper.text()).toContain('赠送金额')
    expect(wrapper.text()).toContain('充值日期')
    expect(wrapper.text()).not.toContain('可使用次数')

    await input(wrapper, 'recharge-phone').setValue('138 0000-0000')
    await input(wrapper, 'recharge-paid').setValue('1000')
    await input(wrapper, 'recharge-gift').setValue('0')
    await wrapper.get('[data-testid="recharge-submit"]').trigger('click')
    await flushPromises()

    expect(api.createPrepaidRecharge).toHaveBeenCalledWith(expect.objectContaining({
      phone: '13800000000', paidAmount: '1000', giftAmount: '0'
    }), expect.any(String))
    expect(wrapper.get('[data-testid="recharge-result"]').text()).toContain('充值金额 ¥1000.00')
    expect(wrapper.get('[data-testid="recharge-result"]').text()).toContain('赠送金额 ¥0.00')
    expect(wrapper.get('[data-testid="recharge-result"]').text()).toContain('可用合计 ¥1000.00')
    expect(wrapper.get('[data-testid="recharge-result"]').text()).toContain('归属主账号')
  })

  it('blocks an invalid phone and keeps the opening-balance control main-account-only', async () => {
    const main = mountPage(PrepaidRechargePage)
    await flushPromises()
    expect(main.wrapper.find('[data-testid="opening-balance-control"]').exists()).toBe(true)
    await input(main.wrapper, 'recharge-phone').setValue('128-0000-0000')
    await input(main.wrapper, 'recharge-paid').setValue('100')
    await input(main.wrapper, 'recharge-gift').setValue('0')
    await main.wrapper.get('[data-testid="recharge-submit"]').trigger('click')
    await flushPromises()
    expect(api.createPrepaidRecharge).not.toHaveBeenCalled()
    expect(main.wrapper.text()).toContain('请输入 11 位中国大陆手机号')
    main.wrapper.unmount()

    const sub = mountPage(PrepaidRechargePage, false)
    await flushPromises()
    expect(sub.wrapper.find('[data-testid="opening-balance-control"]').exists()).toBe(false)
    expect(sub.wrapper.findAll('[data-testid^="reverse-recharge-"]')).toHaveLength(0)
  })

  it('sends normalized paginated date, phone, owner, and opening filters', async () => {
    const { wrapper } = mountPage(PrepaidRechargePage)
    await flushPromises()
    await input(wrapper, 'recharge-filter-phone').setValue('138 0000-0000')
    await input(wrapper, 'recharge-filter-owner').setValue('front-1')
    const datePicker = wrapper.findAllComponents(ElDatePicker).find((node) => node.props('type') === 'daterange')!
    datePicker.vm.$emit('update:modelValue', ['2026-08-01', '2026-08-31'])
    wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', true)
    await nextTick()
    await wrapper.get('[data-testid="recharge-filter-submit"]').trigger('click')
    await flushPromises()
    wrapper.getComponent(ElPagination).vm.$emit('current-change', 2)
    await flushPromises()

    expect(api.getPrepaidRecharges).toHaveBeenLastCalledWith({
      page: 2, pageSize: 20, phone: '13800000000', ownerFrontendUserId: 'front-1',
      startDate: '2026-08-01', endDate: '2026-08-31', isOpeningBalance: true
    })
  })

  it('preserves all form input and the retry key on 409 while showing an actionable error', async () => {
    api.createPrepaidRecharge.mockRejectedValueOnce({
      response: { status: 409, data: { message: '共享余额已变化' } }
    })
    const { wrapper } = mountPage(PrepaidRechargePage)
    await flushPromises()
    await input(wrapper, 'recharge-phone').setValue('13800000000')
    await input(wrapper, 'recharge-paid').setValue('200')
    await input(wrapper, 'recharge-gift').setValue('20')
    await wrapper.get('[data-testid="recharge-remark"]').setValue('待重试')
    await wrapper.get('[data-testid="recharge-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="recharge-mutation-error"]').text()).toContain('保留了当前输入')
    expect(input(wrapper, 'recharge-paid').element).toHaveProperty('value', '200')
    expect(wrapper.get('[data-testid="recharge-remark"]').element).toHaveProperty('value', '待重试')
    const firstKey = api.createPrepaidRecharge.mock.calls[0][1]

    await wrapper.get('[data-testid="recharge-submit"]').trigger('click')
    await flushPromises()
    expect(api.createPrepaidRecharge.mock.calls[1][1]).toBe(firstKey)
    expect(input(wrapper, 'recharge-paid').element).toHaveProperty('value', '')
  })

  it('registers dirty-aware realtime refresh and shows a no-loss refresh prompt', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    setMainAuth(pinia)
    const store = useSharedPrepaidStore(pinia)
    const register = vi.spyOn(store, 'registerModule')
    const wrapper = mount(PrepaidRechargePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    expect(register).toHaveBeenCalledWith('recharges', expect.objectContaining({
      isDirty: expect.any(Function), refresh: expect.any(Function)
    }))
    await input(wrapper, 'recharge-phone').setValue('13800000000')
    const registration = register.mock.calls[0][1]
    expect(registration.isDirty()).toBe(true)
    store.refreshPromptModules = ['recharges']
    await nextTick()
    expect(wrapper.get('[data-testid="recharge-refresh-prompt"]').text()).toContain('已保留尚未提交的内容')
    expect(input(wrapper, 'recharge-phone').element).toHaveProperty('value', '13800000000')
  })
})

describe('PrepaidCustomersPage', () => {
  it('shows global balance composition and immutable recharge, consumption, reversal, and audit history', async () => {
    const { wrapper } = mountPage(PrepaidCustomersPage)
    await flushPromises()
    expect(wrapper.text()).toContain('会员手机号')
    expect(wrapper.text()).toContain('充值本金')
    expect(wrapper.text()).toContain('赠送总额')
    expect(wrapper.text()).toContain('充值合计')
    expect(wrapper.text()).toContain('消费总额')
    expect(wrapper.text()).toContain('当前余额')
    expect(wrapper.text()).toContain('北京店')
    await wrapper.get('[data-testid="member-detail-member-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('充值批次与剩余金额')
    expect(wrapper.text()).toContain('期初余额')
    expect(wrapper.text()).toContain('2026-08-01 09:02:03')
    expect(wrapper.text()).toContain('消费与冲正历史')
    expect(wrapper.text()).toContain('样品作废')
    expect(wrapper.text()).not.toMatch(/\b(编辑|删除)\b/)
    expect(wrapper.text()).not.toContain('可使用次数')
  })

  it('normalizes the phone filter and preserves accurate server pagination', async () => {
    const { wrapper } = mountPage(PrepaidCustomersPage)
    await flushPromises()
    await input(wrapper, 'member-filter-phone').setValue('138 0000-0000')
    await wrapper.get('[data-testid="member-filter-submit"]').trigger('click')
    await flushPromises()
    wrapper.getComponent(ElPagination).vm.$emit('current-change', 3)
    await flushPromises()
    expect(api.getPrepaidMembers).toHaveBeenLastCalledWith({ page: 3, pageSize: 20, phone: '13800000000' })
  })
})

describe('PrepaidConsumptionsPage', () => {
  it('renders precise sample, source account, consuming account, allocation, payable, and reversal detail', async () => {
    const { wrapper } = mountPage(PrepaidConsumptionsPage)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('会员手机号')
    expect(text).toContain('充值来源账号')
    expect(text).toContain('消费账号')
    expect(text).toContain('样品数量')
    expect(text).toContain('检测元素')
    expect(text).toContain('实际消费时间')
    expect(text).toContain('2026-08-12 11:04:05')
    expect(text).toContain('A-001')
    const expand = wrapper.find('.el-table__expand-icon')
    expect(expand.exists()).toBe(true)
    await expand.trigger('click')
    await nextTick()
    const expanded = wrapper.text()
    expect(expanded).toContain('充值批次 recharge-1')
    expect(expanded).toContain('分摊本金 ¥90.91')
    expect(expanded).toContain('分摊赠送 ¥9.09')
    expect(expanded).toContain('应转金额 ¥90.90')
    expect(expanded).toContain('待结算')
    expect(expanded).not.toMatch(/\b(编辑|删除)\b/)
  })

  it('sends every global filter and server pagination without requiring the customer leaf', async () => {
    const { wrapper } = mountPage(PrepaidConsumptionsPage, false)
    await flushPromises()
    await input(wrapper, 'consumption-filter-phone').setValue('138 0000-0000')
    await input(wrapper, 'consumption-filter-source').setValue('front-1')
    await input(wrapper, 'consumption-filter-consumer').setValue('front-2')
    const datePicker = wrapper.getComponent(ElDatePicker)
    datePicker.vm.$emit('update:modelValue', ['2026-08-01', '2026-08-31'])
    const selects = wrapper.findAllComponents(ElSelect)
    selects[0].vm.$emit('update:modelValue', 'ACTIVE')
    selects[1].vm.$emit('update:modelValue', 'PENDING')
    await nextTick()
    await wrapper.get('[data-testid="consumption-filter-submit"]').trigger('click')
    await flushPromises()
    wrapper.getComponent(ElPagination).vm.$emit('current-change', 2)
    await flushPromises()

    expect(api.getPrepaidConsumptions).toHaveBeenLastCalledWith({
      page: 2, pageSize: 20, phone: '13800000000', sourceOwnerId: 'front-1',
      consumingFrontendUserId: 'front-2', startDate: '2026-08-01', endDate: '2026-08-31',
      status: 'ACTIVE', payableStatus: 'PENDING'
    })
    expect(api.getPrepaidMembers).not.toHaveBeenCalled()
    expect(api.getPrepaidMemberDetail).not.toHaveBeenCalled()
    expect(wrapper.findAll('[data-testid^="reverse-consumption-"]')).toHaveLength(0)
  })

  it('requires a reason through the immutable reversal confirmation', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    setMainAuth(pinia, true, 'front-2')
    const wrapper = mount(PrepaidConsumptionsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="reverse-consumption-consumption-1"]').trigger('click')
    await flushPromises()
    expect(ElMessageBox.prompt).toHaveBeenCalledWith(expect.stringContaining('不会修改或删除原流水'), expect.any(String), expect.objectContaining({
      inputPattern: /\S+/
    }))
    expect(api.reversePrepaidConsumption).toHaveBeenCalledWith('consumption-1', { reason: '样品作废' }, expect.any(String))
  })
})
