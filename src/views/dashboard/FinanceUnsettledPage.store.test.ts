// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox, ElTable } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick, ref } from 'vue'
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
const SelectStub = defineComponent({
  props: { modelValue: { type: Array, default: () => [] } },
  emits: ['update:modelValue'],
  template: '<div class="select-stub"><slot /></div>'
})
type DesktopTableApi = {
  toggleRowSelection: (row: UnsettledSampleRow, selected: boolean) => void
  getSelectionRows: () => UnsettledSampleRow[]
}

function getDesktopTableApi(wrapper: ReturnType<typeof mount>): DesktopTableApi {
  const table = wrapper.findComponent(ElTable) as any
  return table.vm.$.exposed as DesktopTableApi
}

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
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { 'el-drawer': DrawerStub, 'el-select': SelectStub, 'el-option': true, teleport: true }
    }
  })
  await flushPromises()
  apiMocks.getUnsettledSamples.mockClear()
  return { wrapper, store }
}

describe('FinanceUnsettledPage with the real finance bills store', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
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

  it('preserves a newer desktop table selection across the real Store array replacement', async () => {
    layout.mobile = ref(false)
    const mutation = deferred<any[]>()
    apiMocks.markSamplesAsPaid.mockReturnValueOnce(mutation.promise)
    const { wrapper, store } = await mountPage()
    const tableApi = getDesktopTableApi(wrapper)
    tableApi.toggleRowSelection(store.unsettledRows[0], true)
    await nextTick()

    await wrapper.get('.batch-settle-button').trigger('click')
    await flushPromises()
    tableApi.toggleRowSelection(store.unsettledRows[1], true)
    await nextTick()
    mutation.resolve([{ id: 'block-1' }])
    await flushPromises()
    await nextTick()

    expect(store.unsettledRows.map((row) => row.blockId)).toEqual(['block-2'])
    expect(wrapper.get('.batch-settle-button').text()).toContain('批量确认已结款（1）')
    expect(tableApi.getSelectionRows().map((row) => row.blockId)).toEqual(['block-2'])
  })

  it('clears the unchanged settled desktop selection from reserved Element Plus state', async () => {
    layout.mobile = ref(false)
    const { wrapper, store } = await mountPage()
    const tableApi = getDesktopTableApi(wrapper)
    tableApi.toggleRowSelection(store.unsettledRows[0], true)
    await nextTick()

    await wrapper.get('.batch-settle-button').trigger('click')
    await flushPromises()
    await nextTick()

    expect(store.unsettledRows.map((row) => row.blockId)).toEqual(['block-2'])
    expect(wrapper.get('.batch-settle-button').attributes('disabled')).toBeDefined()
    expect(tableApi.getSelectionRows()).toEqual([])
  })

  it('keeps a valid reserved desktop selection mapped to replacement rows after manual refresh', async () => {
    layout.mobile = ref(false)
    const { wrapper, store } = await mountPage()
    const tableApi = getDesktopTableApi(wrapper)
    tableApi.toggleRowSelection(store.unsettledRows[1], true)
    await nextTick()
    apiMocks.getUnsettledSamples.mockResolvedValueOnce([{ ...rows[1], amount: 130 }])

    const refreshButton = wrapper.findAll('.panel-actions button').find((button) => button.text() === '刷新')
    expect(refreshButton).toBeDefined()
    await refreshButton!.trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.get('.batch-settle-button').text()).toContain('批量确认已结款（1）')
    expect(tableApi.getSelectionRows().map((row) => [row.blockId, row.amount])).toEqual([['block-2', 130]])
  })

  it('keeps the desktop selection unchanged when a manual refresh fails', async () => {
    layout.mobile = ref(false)
    const { wrapper, store } = await mountPage()
    const tableApi = getDesktopTableApi(wrapper)
    tableApi.toggleRowSelection(store.unsettledRows[0], true)
    await nextTick()
    apiMocks.getUnsettledSamples.mockRejectedValueOnce(new Error('desktop refresh failed'))

    const refreshButton = wrapper.findAll('.panel-actions button').find((button) => button.text() === '刷新')
    await refreshButton!.trigger('click')
    await flushPromises()

    expect(wrapper.get('.batch-settle-button').text()).toContain('批量确认已结款（1）')
    expect(tableApi.getSelectionRows().map((row) => row.blockId)).toEqual(['block-1'])
  })

  it('clears reserved desktop table state when the customer filter changes', async () => {
    layout.mobile = ref(false)
    const { wrapper, store } = await mountPage()
    const tableApi = getDesktopTableApi(wrapper)
    tableApi.toggleRowSelection(store.unsettledRows[0], true)
    await nextTick()

    const customerSelect = wrapper.findComponent(SelectStub)
    customerSelect.vm.$emit('update:modelValue', ['客户乙'])
    await nextTick()
    await nextTick()

    expect(wrapper.get('.batch-settle-button').attributes('disabled')).toBeDefined()
    expect(tableApi.getSelectionRows()).toEqual([])
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
