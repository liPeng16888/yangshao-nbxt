// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { defineComponent, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MobilePrepaidList from '@/components/finance/MobilePrepaidList.vue'
import type { PrepaidCustomerRow, PrepaidDailyUsageRow, PrepaidRechargeRow } from '@/types/financeBills'
import FinancePrepaidAddPage from './FinancePrepaidAddPage.vue'
import FinancePrepaidCustomersPage from './FinancePrepaidCustomersPage.vue'

const mocks = vi.hoisted(() => ({
  mobileLayout: undefined as unknown as ReturnType<typeof ref<boolean>>,
  store: undefined as any,
  routerPush: vi.fn(),
  searchCustomers: vi.fn()
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.mobileLayout })
}))

vi.mock('@/stores/financeBills', () => ({
  useFinanceBillsStore: () => mocks.store
}))

vi.mock('@/api/customer', () => ({ searchCustomers: mocks.searchCustomers }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.routerPush }) }))

const recharges: PrepaidRechargeRow[] = [
  { id: 'recharge-a', rechargeDate: '2026-08-15', customer: '客户甲', amount: 100.5, usableTimes: 5, remark: '很长的备注内容用于验证移动卡片能够安全换行展示' },
  { id: 'recharge-b', rechargeDate: '2026-08-14', customer: '客户乙', amount: 200, usableTimes: 8, remark: '', deleteRequestStatus: 'PENDING' }
]

const customerRows: PrepaidCustomerRow[] = [
  { id: 'customer-a', customer: '客户甲', totalAmount: 300.5, totalUsableTimes: 13, usedTimes: 4, availableTimes: 9, remark: '重点客户' },
  { id: 'customer-b', customer: '客户乙', totalAmount: 100, totalUsableTimes: 5, usedTimes: 2, availableTimes: 3, remark: '' }
]

const usageRows: PrepaidDailyUsageRow[] = [
  { id: 'usage-a', date: '2026-08-15', customer: '客户甲', sampleCount: 3, remark: '甲明细' },
  { id: 'usage-b', date: '2026-08-14', customer: '客户乙', sampleCount: 2, remark: '' }
]

const DialogStub = defineComponent({
  name: 'MobileFullscreenDialog',
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String, fullscreen: Boolean, saving: Boolean },
  emits: ['update:modelValue', 'confirm'],
  template: '<section v-if="modelValue" class="fullscreen-dialog-stub" :data-title="title" :data-fullscreen="String(fullscreen)"><slot /><slot name="footer" :cancel="() => $emit(\'update:modelValue\', false)" /></section>'
})

const TableStub = defineComponent({ name: 'ElTable', props: { data: Array }, template: '<div class="el-table"><slot /></div>' })
const TableColumnStub = defineComponent({ name: 'ElTableColumn', template: '<div class="el-table-column" />' })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mountPage(component: typeof FinancePrepaidAddPage | typeof FinancePrepaidCustomersPage, mobile = true) {
  mocks.mobileLayout.value = mobile
  return mount(component, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        MobileFullscreenDialog: DialogStub,
        ElTable: TableStub,
        ElTableColumn: TableColumnStub,
        ElDatePicker: true,
        ElSelect: true,
        ElOption: true,
        ElInputNumber: true,
        ElInput: true,
        teleport: true
      }
    }
  })
}

async function fillMobileRecharge(wrapper: ReturnType<typeof mountPage>, customer = '客户甲') {
  await wrapper.get('[data-testid="mobile-prepaid-date"]').setValue('2026-08-16')
  await wrapper.get('[data-testid="mobile-prepaid-customer-value"]').setValue(customer)
  await wrapper.get('[data-testid="mobile-prepaid-amount"]').setValue('25.75')
  await wrapper.get('[data-testid="mobile-prepaid-times"]').setValue('3')
  await wrapper.get('[data-testid="mobile-prepaid-remark"]').setValue('移动端充值')
}

describe('Finance prepaid mobile pages', () => {
  beforeEach(() => {
    mocks.mobileLayout = ref(true)
    mocks.routerPush.mockReset()
    mocks.searchCustomers.mockReset().mockResolvedValue([
      { id: 'customer-option-a', name: '客户甲', phone: '13800000000', address: '', remark: '' }
    ])
    mocks.store = {
      prepaidRecharges: recharges.map((row) => ({ ...row })),
      prepaidReport: { customerRows: customerRows.map((row) => ({ ...row })), dailyRows: usageRows.map((row) => ({ ...row })) },
      loading: false,
      prepaidReportLoading: false,
      prepaidSaving: false,
      prepaidRemarkSavingId: '',
      prepaidDeletingId: '',
      loadPrepaidRecharges: vi.fn(async () => true),
      retryPrepaidRecharges: vi.fn(async () => true),
      cancelPrepaidRechargeLoads: vi.fn(),
      addPrepaidRecharge: vi.fn(async () => undefined),
      requestPrepaidDeletion: vi.fn(async () => undefined),
      loadPrepaidReport: vi.fn(async () => true),
      retryPrepaidReport: vi.fn(async () => true),
      cancelPrepaidReportLoads: vi.fn(),
      savePrepaidCustomerRemark: vi.fn(async () => undefined),
      savePrepaidUsageRemark: vi.fn(async () => undefined)
    }
    vi.spyOn(ElMessageBox, 'confirm').mockReset().mockResolvedValue('confirm' as never)
    vi.spyOn(ElMessageBox, 'prompt').mockReset().mockResolvedValue({ value: '重复录入' } as never)
  })

  it('renders mutually exclusive mobile recharge form/cards with numeric keyboards and two-way internal navigation', async () => {
    const wrapper = mountPage(FinancePrepaidAddPage, true)
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-prepaid-form"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="mobile-prepaid-recharge-card"]')).toHaveLength(recharges.length)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(wrapper.get('[data-testid="mobile-prepaid-amount"]').attributes()).toMatchObject({ type: 'number', inputmode: 'decimal', step: '0.01' })
    expect(wrapper.get('[data-testid="mobile-prepaid-times"]').attributes()).toMatchObject({ type: 'number', inputmode: 'numeric', step: '1' })
    expect(getComputedStyle(wrapper.get('[data-testid="mobile-prepaid-submit"]').element).minHeight).toBe('44px')
    expect(wrapper.findAll('[data-testid="mobile-prepaid-recharge-card"]')[0].text()).toContain('¥100.50')
    expect(wrapper.findAll('[data-testid="mobile-prepaid-recharge-card"]')[1].text()).toContain('删除待审核')

    await wrapper.get('[data-testid="mobile-prepaid-customers-link"]').trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/finance/prepaid/customers')

    mocks.mobileLayout.value = false
    await nextTick()
    expect(wrapper.find('.el-table').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-prepaid-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-prepaid-recharge-card"]').exists()).toBe(false)
  })

  it('opens a full-screen searchable customer selector while keeping free-text entry available', async () => {
    const wrapper = mountPage(FinancePrepaidAddPage)
    await flushPromises()

    await wrapper.get('[data-testid="mobile-prepaid-customer-open"]').trigger('click')
    expect(wrapper.get('.fullscreen-dialog-stub').attributes()).toMatchObject({ 'data-title': '选择客户', 'data-fullscreen': 'true' })
    expect(wrapper.findAll('[data-testid="mobile-prepaid-customer-option"]')).toHaveLength(1)

    await wrapper.get('[data-testid="mobile-prepaid-customer-search"]').setValue('新客户')
    await wrapper.get('[data-testid="mobile-prepaid-customer-use-input"]').trigger('click')
    expect((wrapper.get('[data-testid="mobile-prepaid-customer-value"]').element as HTMLInputElement).value).toBe('新客户')
  })

  it.each([
    ['amount', '1.234'],
    ['amount', '0.001'],
    ['times', String(Number.MAX_SAFE_INTEGER + 1)],
    ['times', '1.5']
  ] as const)('rejects unsupported mobile prepaid %s value %s before confirmation', async (field, value) => {
    const wrapper = mountPage(FinancePrepaidAddPage)
    await flushPromises()
    await fillMobileRecharge(wrapper)
    await wrapper.get(field === 'amount' ? '[data-testid="mobile-prepaid-amount"]' : '[data-testid="mobile-prepaid-times"]').setValue(value)

    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(mocks.store.addPrepaidRecharge).not.toHaveBeenCalled()
  })

  it('confirms duplicate-customer accumulated totals, blocks duplicates, and resets only an unchanged successful draft', async () => {
    const save = deferred<void>()
    mocks.store.addPrepaidRecharge.mockReturnValueOnce(save.promise)
    const wrapper = mountPage(FinancePrepaidAddPage)
    await flushPromises()
    await fillMobileRecharge(wrapper)

    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    await flushPromises()
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('原可使用次数 5 次，本次增加 3 次，确认后累计为 8 次'),
      '二次确认提醒',
      expect.any(Object)
    )
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(expect.stringContaining('原累计金额 ¥100.50，本次增加 ¥25.75'), expect.any(String), expect.any(Object))
    expect(mocks.store.addPrepaidRecharge).toHaveBeenCalledWith({
      rechargeDate: '2026-08-16', customer: '客户甲', amount: 25.75, usableTimes: 3, remark: '移动端充值'
    })

    save.resolve()
    await flushPromises()
    expect((wrapper.get('[data-testid="mobile-prepaid-customer-value"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('[data-testid="mobile-prepaid-amount"]').element as HTMLInputElement).value).toBe('')
  })

  it('retains failed and newer recharge drafts and ignores confirmation settlement after unmount', async () => {
    mocks.store.addPrepaidRecharge.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountPage(FinancePrepaidAddPage)
    await flushPromises()
    await fillMobileRecharge(wrapper)
    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    await flushPromises()
    expect((wrapper.get('[data-testid="mobile-prepaid-customer-value"]').element as HTMLInputElement).value).toBe('客户甲')
    expect((wrapper.get('[data-testid="mobile-prepaid-amount"]').element as HTMLInputElement).value).toBe('25.75')

    const save = deferred<void>()
    mocks.store.addPrepaidRecharge.mockReturnValueOnce(save.promise)
    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    await wrapper.get('[data-testid="mobile-prepaid-remark"]').setValue('保存期间继续编辑')
    save.resolve()
    await flushPromises()
    expect((wrapper.get('[data-testid="mobile-prepaid-remark"]').element as HTMLTextAreaElement).value).toBe('保存期间继续编辑')

    const confirm = deferred<unknown>()
    vi.mocked(ElMessageBox.confirm).mockReturnValueOnce(confirm.promise as never)
    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    wrapper.unmount()
    confirm.resolve('confirm')
    await flushPromises()
    expect(mocks.store.addPrepaidRecharge).toHaveBeenCalledTimes(2)
  })

  it('requests the exact recharge deletion with a required reason and guards duplicate prompts', async () => {
    const prompt = deferred<{ value: string }>()
    vi.mocked(ElMessageBox.prompt).mockReturnValueOnce(prompt.promise as never)
    const wrapper = mountPage(FinancePrepaidAddPage)
    await flushPromises()

    const deleteButton = wrapper.get('[data-testid="mobile-prepaid-delete-recharge-a"]')
    await deleteButton.trigger('click')
    await deleteButton.trigger('click')
    expect(ElMessageBox.prompt).toHaveBeenCalledTimes(1)
    expect(ElMessageBox.prompt).toHaveBeenCalledWith(expect.stringContaining('2026-08-15 客户甲'), '删除申请', expect.objectContaining({ inputType: 'textarea' }))
    prompt.resolve({ value: '  重复录入  ' })
    await flushPromises()
    expect(mocks.store.requestPrepaidDeletion).toHaveBeenCalledWith(expect.objectContaining({ id: 'recharge-a' }), '重复录入')
  })

  it('renders customer balances, opens nested full-screen usage, saves blur remarks, and navigates back to add', async () => {
    const wrapper = mountPage(FinancePrepaidCustomersPage)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-prepaid-customer-card"]')).toHaveLength(customerRows.length)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    const first = wrapper.findAll('[data-testid="mobile-prepaid-customer-card"]')[0]
    expect(first.text()).toContain('累计充值 ¥300.50')
    expect(first.text()).toContain('总可用')
    expect(first.text()).toContain('13 次')
    expect(first.text()).toContain('已使用')
    expect(first.text()).toContain('4 次')
    expect(first.text()).toContain('剩余')
    expect(first.text()).toContain('9 次')

    await first.get('[data-testid="mobile-prepaid-customer-usage-customer-a"]').trigger('click')
    expect(wrapper.find('[data-testid="mobile-prepaid-usage-dialog"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="mobile-prepaid-usage-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-prepaid-usage-card"]').text()).toContain('3 个样品')

    await first.get('[data-testid="mobile-prepaid-customer-remark-customer-a"]').setValue('客户新备注')
    await first.get('[data-testid="mobile-prepaid-customer-remark-customer-a"]').trigger('blur')
    await wrapper.get('[data-testid="mobile-prepaid-usage-remark-usage-a"]').setValue('明细新备注')
    await wrapper.get('[data-testid="mobile-prepaid-usage-remark-usage-a"]').trigger('blur')
    expect(mocks.store.savePrepaidCustomerRemark).toHaveBeenCalledWith('客户甲', '客户新备注')
    expect(mocks.store.savePrepaidUsageRemark).toHaveBeenCalledWith('usage-a', '明细新备注')

    await wrapper.get('[data-testid="mobile-prepaid-add-link"]').trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/finance/prepaid/add')
  })

  it('keeps only the latest page load error, retries it, and cancels owned loads on unmount', async () => {
    const initial = deferred<boolean>()
    const refresh = deferred<boolean>()
    mocks.store.loadPrepaidReport.mockReturnValueOnce(initial.promise).mockReturnValueOnce(refresh.promise)
    const wrapper = mountPage(FinancePrepaidCustomersPage)
    await wrapper.get('[data-testid="mobile-prepaid-report-refresh"]').trigger('click')
    refresh.reject(new Error('latest failed'))
    await flushPromises()
    initial.resolve(true)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-prepaid-report-error"]').text()).toContain('加载失败')
    await wrapper.get('[data-testid="mobile-prepaid-report-retry"]').trigger('click')
    expect(mocks.store.retryPrepaidReport).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(mocks.store.cancelPrepaidReportLoads).toHaveBeenCalledTimes(1)
  })
})

describe('MobilePrepaidList remark reconciliation', () => {
  it('preserves dirty and post-submit edits while resyncing clean authoritative rows', async () => {
    const wrapper = mount(MobilePrepaidList, {
      props: { kind: 'customer', rows: customerRows.map((row) => ({ ...row })), savingId: '' }
    })
    const remarkA = wrapper.get('[data-testid="mobile-prepaid-customer-remark-customer-a"]')
    const remarkB = wrapper.get('[data-testid="mobile-prepaid-customer-remark-customer-b"]')
    await remarkA.setValue('甲已提交')
    await remarkA.trigger('blur')
    await remarkA.setValue('甲继续编辑')
    await wrapper.setProps({
      rows: [
        { ...customerRows[0], remark: '甲已提交' },
        { ...customerRows[1], remark: '乙服务端更新' }
      ],
      savingId: 'customer__客户甲'
    })

    expect((remarkA.element as HTMLTextAreaElement).value).toBe('甲继续编辑')
    expect((remarkB.element as HTMLTextAreaElement).value).toBe('乙服务端更新')
    expect(wrapper.emitted('remarkCommit')?.[0]?.slice(0, 2)).toEqual([customerRows[0], '甲已提交'])
    expect(wrapper.emitted('remarkCommit')?.[0]?.[2]).toBeTypeOf('function')
  })

  it('does not erase a dirty customer remark when only authoritative balance totals change', async () => {
    const wrapper = mount(MobilePrepaidList, {
      props: { kind: 'customer', rows: [{ ...customerRows[0] }], savingId: '' }
    })
    const remark = wrapper.get('[data-testid="mobile-prepaid-customer-remark-customer-a"]')
    await remark.setValue('余额刷新期间的草稿')

    await wrapper.setProps({
      rows: [{ ...customerRows[0], totalAmount: 450.5, totalUsableTimes: 18, availableTimes: 14 }]
    })

    expect((remark.element as HTMLTextAreaElement).value).toBe('余额刷新期间的草稿')
  })

  it('keeps a rejected customer snapshot and newer typing retryable through authoritative refreshes', async () => {
    const wrapper = mount(MobilePrepaidList, {
      props: { kind: 'customer', rows: [{ ...customerRows[0] }], savingId: '' }
    })
    const remark = wrapper.get('[data-testid="mobile-prepaid-customer-remark-customer-a"]')
    await remark.setValue('失败的提交快照')
    await remark.trigger('blur')
    const complete = wrapper.emitted('remarkCommit')?.[0]?.[2] as ((result: 'success' | 'failure') => void) | undefined
    await remark.setValue('失败后继续输入')

    complete?.('failure')
    await wrapper.setProps({ rows: [{ ...customerRows[0], remark: '失败的提交快照', totalAmount: 450 }] })

    expect(complete).toBeTypeOf('function')
    expect((remark.element as HTMLTextAreaElement).value).toBe('失败后继续输入')
  })

  it.each([
    { kind: 'customer' as const, row: customerRows[0], testId: 'mobile-prepaid-customer-remark-customer-a' },
    { kind: 'usage' as const, row: usageRows[0], testId: 'mobile-prepaid-usage-remark-usage-a' }
  ])('keeps the exact rejected $kind draft retryable across matching and later authoritative values', async ({ kind, row, testId }) => {
    const typedRows = [{ ...row }] as PrepaidCustomerRow[] | PrepaidDailyUsageRow[]
    const wrapper = mount(MobilePrepaidList, {
      props: { kind, rows: typedRows, savingId: '' }
    })
    const remark = wrapper.get(`[data-testid="${testId}"]`)
    await remark.setValue('精确失败稿')
    await remark.trigger('blur')
    const complete = wrapper.emitted('remarkCommit')?.[0]?.[2] as ((result: 'success' | 'failure') => void)

    complete('failure')
    await wrapper.setProps({ rows: [{ ...row, remark: '精确失败稿' }] as PrepaidCustomerRow[] | PrepaidDailyUsageRow[] })
    await wrapper.setProps({ rows: [{ ...row, remark: '后续外部值' }] as PrepaidCustomerRow[] | PrepaidDailyUsageRow[] })

    expect((remark.element as HTMLTextAreaElement).value).toBe('精确失败稿')
  })

  it('reconciles only a successful usage snapshot, preserves newer typing, and resets re-added row identity', async () => {
    const wrapper = mount(MobilePrepaidList, {
      props: { kind: 'usage', rows: [{ ...usageRows[0] }], savingId: '' }
    })
    const remark = wrapper.get('[data-testid="mobile-prepaid-usage-remark-usage-a"]')
    await remark.setValue('使用明细已提交')
    await remark.trigger('blur')
    const complete = wrapper.emitted('remarkCommit')?.[0]?.[2] as ((result: 'success' | 'failure') => void) | undefined
    await remark.setValue('提交后继续输入')

    complete?.('success')
    await wrapper.setProps({ rows: [{ ...usageRows[0], remark: '使用明细已提交' }] })
    expect(complete).toBeTypeOf('function')
    expect((remark.element as HTMLTextAreaElement).value).toBe('提交后继续输入')

    await wrapper.setProps({ rows: [] })
    await wrapper.setProps({ rows: [{ ...usageRows[0], remark: '重新加入的权威值' }] })
    expect((wrapper.get('[data-testid="mobile-prepaid-usage-remark-usage-a"]').element as HTMLTextAreaElement).value).toBe('重新加入的权威值')
  })
})
