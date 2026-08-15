// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FinancePrepaidAddPage from './FinancePrepaidAddPage.vue'

const apiMocks = vi.hoisted(() => ({
  createPrepaidRecharge: vi.fn(),
  getPrepaidRecharges: vi.fn(),
  getPrepaidReport: vi.fn(),
  getIncomeBillReport: vi.fn(),
  getMonthlySettlementReport: vi.fn(),
  getUnsettledSamples: vi.fn(),
  markSampleAsPaid: vi.fn(),
  markSamplesAsPaid: vi.fn(),
  requestPrepaidRechargeDeletion: vi.fn(),
  updateMonthlySettlementSummary: vi.fn(),
  updatePrepaidCustomerRemark: vi.fn(),
  updatePrepaidUsageRemark: vi.fn()
}))

vi.mock('@/api/financeBills', () => apiMocks)
vi.mock('@/api/customer', () => ({ searchCustomers: vi.fn(async () => []) }))
vi.mock('@/composables/useMobileLayout', () => ({ useMobileLayout: () => ({ isMobileLayout: ref(true) }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const DialogStub = defineComponent({
  name: 'MobileFullscreenDialog',
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue"><slot /><slot name="footer" :cancel="() => $emit(\'update:modelValue\', false)" /></section>'
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mountPage() {
  return mount(FinancePrepaidAddPage, {
    global: {
      plugins: [createPinia(), ElementPlus],
      stubs: { MobileFullscreenDialog: DialogStub, teleport: true }
    }
  })
}

async function fill(wrapper: ReturnType<typeof mountPage>, remark = '初始草稿') {
  await wrapper.get('[data-testid="mobile-prepaid-date"]').setValue('2026-08-16')
  await wrapper.get('[data-testid="mobile-prepaid-customer-value"]').setValue('客户甲')
  await wrapper.get('[data-testid="mobile-prepaid-amount"]').setValue('25.75')
  await wrapper.get('[data-testid="mobile-prepaid-times"]').setValue('3')
  await wrapper.get('[data-testid="mobile-prepaid-remark"]').setValue(remark)
}

describe('FinancePrepaidAddPage real Store lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    apiMocks.getPrepaidRecharges.mockResolvedValue([])
    apiMocks.createPrepaidRecharge.mockResolvedValue({
      id: 'saved-recharge', rechargeDate: '2026-08-16', customer: '客户甲', amount: 25.75, usableTimes: 3, remark: '初始草稿'
    })
    vi.spyOn(ElMessageBox, 'confirm').mockReset().mockResolvedValue('confirm' as never)
    vi.spyOn(ElMessage, 'success').mockReset()
  })

  it('treats a successful POST as final and retries only the failed report refresh', async () => {
    apiMocks.getPrepaidReport
      .mockRejectedValueOnce(new Error('report refresh failed'))
      .mockResolvedValueOnce({ customerRows: [], dailyRows: [] })
    const wrapper = mountPage()
    await flushPromises()
    await fill(wrapper)

    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    await flushPromises()

    expect(apiMocks.createPrepaidRecharge).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
    expect((wrapper.get('[data-testid="mobile-prepaid-customer-value"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('[data-testid="mobile-prepaid-post-save-report-error"]').text()).toContain('汇总刷新失败')
    expect(wrapper.findAll('[data-testid="mobile-prepaid-recharge-card"]')).toHaveLength(1)

    await wrapper.get('[data-testid="mobile-prepaid-post-save-report-retry"]').trigger('click')
    await flushPromises()

    expect(apiMocks.createPrepaidRecharge).toHaveBeenCalledTimes(1)
    expect(apiMocks.getPrepaidReport).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="mobile-prepaid-post-save-report-error"]').exists()).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
  })

  it('keeps newer edits after POST success while exposing only the refresh failure', async () => {
    const post = deferred<any>()
    apiMocks.createPrepaidRecharge.mockReturnValueOnce(post.promise)
    apiMocks.getPrepaidReport.mockRejectedValueOnce(new Error('report refresh failed'))
    const wrapper = mountPage()
    await flushPromises()
    await fill(wrapper)
    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')
    await wrapper.get('[data-testid="mobile-prepaid-remark"]').setValue('POST 期间的新草稿')

    post.resolve({ id: 'saved-recharge', rechargeDate: '2026-08-16', customer: '客户甲', amount: 25.75, usableTimes: 3, remark: '初始草稿' })
    await flushPromises()

    expect((wrapper.get('[data-testid="mobile-prepaid-remark"]').element as HTMLTextAreaElement).value).toBe('POST 期间的新草稿')
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="mobile-prepaid-post-save-report-error"]').exists()).toBe(true)
  })

  it('does not start a report refresh or announce success when the POST settles after unmount', async () => {
    const post = deferred<any>()
    apiMocks.createPrepaidRecharge.mockReturnValueOnce(post.promise)
    const wrapper = mountPage()
    await flushPromises()
    await fill(wrapper)
    await wrapper.get('[data-testid="mobile-prepaid-submit"]').trigger('click')

    wrapper.unmount()
    post.resolve({ id: 'saved-recharge', rechargeDate: '2026-08-16', customer: '客户甲', amount: 25.75, usableTimes: 3, remark: '初始草稿' })
    await flushPromises()

    expect(apiMocks.createPrepaidRecharge).toHaveBeenCalledTimes(1)
    expect(apiMocks.getPrepaidReport).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })
})
