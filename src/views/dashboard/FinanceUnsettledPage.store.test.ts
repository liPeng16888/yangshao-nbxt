// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnsettledSampleRow } from '@/types/financeBills'
import FinanceUnsettledPage from './FinanceUnsettledPage.vue'
import { useFinanceBillsStore } from '@/stores/financeBills'

const apiMocks = vi.hoisted(() => ({
  createPrepaidRecharge: vi.fn(),
  getIncomeBillReport: vi.fn(),
  getMonthlySettlementReport: vi.fn(),
  getPrepaidRecharges: vi.fn(),
  getPrepaidReport: vi.fn(),
  getUnsettledSamples: vi.fn(),
  markSampleAsPaid: vi.fn(),
  markSamplesAsPaid: vi.fn(),
  requestPrepaidRechargeDeletion: vi.fn(),
  updateMonthlySettlementSummary: vi.fn(),
  updatePrepaidCustomerRemark: vi.fn(),
  updatePrepaidUsageRemark: vi.fn()
}))
const layout = vi.hoisted(() => ({ mobile: undefined as ReturnType<typeof ref<boolean>> | undefined }))
const routerPush = vi.hoisted(() => vi.fn())

vi.mock('@/api/financeBills', () => apiMocks)
vi.mock('@/composables/useMobileLayout', () => ({ useMobileLayout: () => ({ isMobileLayout: layout.mobile! }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))

const rows: UnsettledSampleRow[] = [
  { date: '2026-08-08', sheetId: 'sheet-1', blockId: 'block-1', sequence: '001', sampleNumber: '样品1', customer: '客户甲', amount: 80 },
  { date: '2026-08-08', sheetId: 'sheet-1', blockId: 'block-2', sequence: '002', sampleNumber: '样品2', customer: '客户乙', amount: 120 }
]

const DrawerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>'
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

async function mountPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useFinanceBillsStore()
  store.unsettledRows = rows.map((row) => ({ ...row }))
  apiMocks.getUnsettledSamples.mockResolvedValueOnce(rows.map((row) => ({ ...row })))
  const wrapper = mount(FinanceUnsettledPage, {
    global: { plugins: [pinia, ElementPlus], stubs: { 'el-drawer': DrawerStub, teleport: true } }
  })
  await flushPromises()
  apiMocks.getUnsettledSamples.mockClear()
  return { wrapper, store }
}

describe('FinanceUnsettledPage with the real finance bills store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    layout.mobile = ref(true)
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    apiMocks.markSampleAsPaid.mockResolvedValue({ id: 'block-1' })
    apiMocks.markSamplesAsPaid.mockResolvedValue([{ id: 'block-1' }])
  })

  it('reconciles a settled detached selection on manual refresh without settling it twice', async () => {
    const { wrapper, store } = await mountPage()
    apiMocks.getUnsettledSamples.mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValueOnce([rows[1]])
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)

    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()
    expect(store.unsettledRows.map((row) => row.blockId)).toEqual(['block-2'])
    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('已选 1 项')
    expect(wrapper.get('[data-testid="batch-settle-mobile"]').text()).toContain('刷新对账')

    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()
    expect(apiMocks.markSamplesAsPaid).toHaveBeenCalledTimes(1)
    expect(apiMocks.getUnsettledSamples).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="mobile-unsettled-action-bar"]').exists()).toBe(false)
  })

  it('removes only settled ids after retry and preserves a newer valid selection', async () => {
    const { wrapper } = await mountPage()
    const reconciliation = deferred<UnsettledSampleRow[]>()
    apiMocks.getUnsettledSamples.mockRejectedValueOnce(new Error('refresh failed')).mockReturnValueOnce(reconciliation.promise)
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="select-unsettled-block-2"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    reconciliation.resolve([rows[1]])
    await flushPromises()

    expect(apiMocks.markSamplesAsPaid).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('已选 1 项')
    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('¥120.00')
  })

  it('keeps real store rows and selection unchanged when batch mutation conflicts', async () => {
    apiMocks.markSamplesAsPaid.mockRejectedValueOnce(new Error('部分样品已不是未结款状态，请刷新后重试'))
    const { wrapper, store } = await mountPage()
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)

    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()

    expect(store.unsettledRows.map((row) => row.blockId)).toEqual(['block-1', 'block-2'])
    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('已选 1 项')
    expect(apiMocks.getUnsettledSamples).not.toHaveBeenCalled()
  })

  it('guards duplicate real-store mutation submits and stops the refresh after unmount', async () => {
    const mutation = deferred<any[]>()
    apiMocks.markSamplesAsPaid.mockReturnValueOnce(mutation.promise)
    const { wrapper } = await mountPage()
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()
    expect(apiMocks.markSamplesAsPaid).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    mutation.resolve([{ id: 'block-1' }])
    await flushPromises()
    expect(apiMocks.getUnsettledSamples).not.toHaveBeenCalled()
  })
})
