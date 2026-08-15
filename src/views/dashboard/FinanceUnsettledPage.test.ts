import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, inject, nextTick, provide, ref, type ComputedRef, type PropType } from 'vue'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import type { UnsettledSampleRow } from '@/types/financeBills'
import FinanceUnsettledPage from './FinanceUnsettledPage.vue'

const routerPush = vi.hoisted(() => vi.fn())
const layoutMock = vi.hoisted(() => ({ mobile: undefined as unknown as ReturnType<typeof ref<boolean>> }))
const storeMock = vi.hoisted(() => ({
  unsettledRows: [] as UnsettledSampleRow[],
  loading: false,
  settlingId: '',
  settlingBatch: false,
  isSettling: false,
  loadUnsettledRows: vi.fn(),
  cancelUnsettledLoads: vi.fn(),
  settleRow: vi.fn(),
  settleRows: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush })
}))
vi.mock('@/stores/financeBills', () => ({
  useFinanceBillsStore: () => storeMock
}))
vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: layoutMock.mobile })
}))

const rows: UnsettledSampleRow[] = [
  {
    date: '2026-08-08',
    sheetId: 'sheet-1',
    blockId: 'block-1',
    sequence: '001',
    sampleNumber: '样品1',
    customer: '客户甲',
    amount: 80
  },
  {
    date: '2026-08-08',
    sheetId: 'sheet-1',
    blockId: 'block-2',
    sequence: '002',
    sampleNumber: '样品2',
    customer: '客户乙',
    amount: 120
  }
]

const tableRowsKey = Symbol('tableRows')
const TableStub = defineComponent({
  name: 'ElTable',
  props: {
    data: { type: Array as PropType<UnsettledSampleRow[]>, default: () => [] }
  },
  emits: ['selection-change'],
  setup(props, { emit, expose, slots }) {
    provide(tableRowsKey, computed(() => props.data))
    expose({ clearSelection: () => emit('selection-change', []) })
    return () => h('div', { class: 'table-stub' }, slots.default?.())
  }
})
const TableColumnStub = defineComponent({
  name: 'ElTableColumn',
  setup(_props, { slots }) {
    const tableRows = inject<ComputedRef<UnsettledSampleRow[]>>(tableRowsKey)!
    return () => h('div', { class: 'table-column-stub' }, slots.default
      ? tableRows.value.flatMap((row) => slots.default?.({ row }) || [])
      : [])
  }
})

const SelectStub = defineComponent({
  name: 'ElSelect',
  props: { modelValue: { type: Array as PropType<string[]>, default: () => [] } },
  emits: ['update:modelValue'],
  template: '<div class="select-stub"><slot /></div>'
})
const OptionStub = defineComponent({
  name: 'ElOption',
  template: '<span />'
})

const DrawerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="drawer-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

function mountPage(mobile = false) {
  layoutMock.mobile.value = mobile
  return mount(FinanceUnsettledPage, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-table': TableStub,
        'el-table-column': TableColumnStub,
        'el-select': SelectStub,
        'el-option': OptionStub,
        'el-drawer': DrawerStub,
        teleport: true
      }
    }
  })
}

describe('FinanceUnsettledPage batch payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    layoutMock.mobile = ref(false)
    storeMock.unsettledRows = [...rows]
    storeMock.loading = false
    storeMock.settlingId = ''
    storeMock.settlingBatch = false
    storeMock.isSettling = false
    storeMock.loadUnsettledRows.mockResolvedValue(true)
    storeMock.settleRow.mockResolvedValue(undefined)
    storeMock.settleRows.mockResolvedValue(undefined)
  })

  it('keeps the batch button disabled until rows are selected', async () => {
    const wrapper = mountPage()
    const button = wrapper.find('.batch-settle-button')

    expect(button.attributes('disabled')).toBeDefined()

    wrapper.findComponent(TableStub).vm.$emit('selection-change', [rows[0], rows[1]])
    await nextTick()

    expect(button.text()).toContain('批量确认已结款（2）')
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('confirms the selected count and total before settling the batch', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountPage()
    wrapper.findComponent(TableStub).vm.$emit('selection-change', rows)
    await nextTick()

    await wrapper.find('.batch-settle-button').trigger('click')

    expect(confirm).toHaveBeenCalledWith(
      '确认将选中的 2 个样品标记为已结款？合计金额 ¥200.00。',
      '批量确认结款',
      expect.objectContaining({ type: 'warning' })
    )
    expect(storeMock.settleRows).toHaveBeenCalledWith(rows)
  })

  it('clears selected rows when the customer filter changes', async () => {
    const wrapper = mountPage()
    const table = wrapper.findComponent(TableStub)
    table.vm.$emit('selection-change', rows)
    await nextTick()

    wrapper.findComponent(SelectStub).vm.$emit('update:modelValue', ['客户甲'])
    await nextTick()

    expect(wrapper.find('.batch-settle-button').attributes('disabled')).toBeDefined()
  })

  it('keeps the existing single-row payment action', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountPage()
    const checkboxes = wrapper.findAllComponents({ name: 'ElCheckbox' })

    checkboxes[checkboxes.length - 1].vm.$emit('change', true)
    await nextTick()

    expect(storeMock.settleRow).toHaveBeenCalledWith(rows[1])
  })

  it('renders mobile cards instead of the desktop table and filters customers through a drawer', async () => {
    const wrapper = mountPage(true)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-unsettled-card"]')).toHaveLength(2)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    await wrapper.get('[data-testid="mobile-unsettled-filter-summary"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-unsettled-filter-客户甲"]').setValue(true)
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    expect(wrapper.findAll('[data-testid="mobile-unsettled-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-unsettled-card"]').text()).toContain('客户甲')
  })

  it('shows selected count and exact total in the mobile action bar', async () => {
    const wrapper = mountPage(true)
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)

    const actionBar = wrapper.get('[data-testid="mobile-unsettled-action-bar"]')
    expect(actionBar.text()).toContain('已选 1 项')
    expect(actionBar.text()).toContain('¥80.00')
    expect(getComputedStyle(wrapper.get('[data-testid="batch-settle-mobile"]').element).minHeight).toBe('44px')
  })

  it('uses the existing single-settlement confirmation, store mutation, and successful refresh', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountPage(true)
    storeMock.loadUnsettledRows.mockClear()

    await wrapper.get('[data-testid="settle-unsettled-block-1"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(
      '确认将 2026-08-08 的样品 样品1 标记为已结款？',
      '确认结款',
      expect.objectContaining({ type: 'warning' })
    )
    expect(storeMock.settleRow).toHaveBeenCalledWith(rows[0])
    expect(storeMock.loadUnsettledRows).toHaveBeenCalledTimes(1)
  })

  it('confirms a mobile batch, refreshes, and clears only the unchanged successful selection', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountPage(true)
    storeMock.loadUnsettledRows.mockClear()
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="select-unsettled-block-2"]').setValue(true)

    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()

    expect(storeMock.settleRows).toHaveBeenCalledWith(rows)
    expect(storeMock.loadUnsettledRows).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="mobile-unsettled-action-bar"]').exists()).toBe(false)
  })

  it('preserves mobile selection when settlement or its refresh fails', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    storeMock.settleRows.mockRejectedValueOnce(new Error('conflict'))
    const wrapper = mountPage(true)
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('已选 1 项')

    storeMock.settleRows.mockResolvedValueOnce(undefined)
    storeMock.loadUnsettledRows.mockRejectedValueOnce(new Error('refresh failed'))
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('已选 1 项')
  })

  it('does not clear a newer mobile selection edited while an older batch is in flight', async () => {
    let resolveRefresh!: () => void
    const refresh = new Promise<void>((resolve) => { resolveRefresh = resolve })
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    storeMock.loadUnsettledRows.mockReturnValueOnce(refresh)
    const wrapper = mountPage(true)
    storeMock.loadUnsettledRows.mockClear()
    storeMock.loadUnsettledRows.mockReturnValueOnce(refresh)
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="select-unsettled-block-2"]').setValue(true)
    resolveRefresh()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('已选 2 项')
    expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('¥200.00')
  })

  it('guards duplicate batch submits while confirmation is pending', async () => {
    let resolveConfirm!: (value: string) => void
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve }) as never)
    const wrapper = mountPage(true)
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    expect(confirm).toHaveBeenCalledTimes(1)
    resolveConfirm('confirm')
    await flushPromises()
  })

  it('jumps from a mobile card with the existing data route query', async () => {
    const wrapper = mountPage(true)
    await wrapper.get('[data-testid="jump-unsettled-block-2"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith({ path: '/data', query: { date: '2026-08-08', block: 'block-2' } })
  })

  it('does not refresh or report success after an in-flight settlement is unmounted', async () => {
    let resolveSettle!: () => void
    const settle = new Promise<void>((resolve) => { resolveSettle = resolve })
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const success = vi.spyOn(ElMessage, 'success')
    storeMock.settleRows.mockReturnValueOnce(settle)
    const wrapper = mountPage(true)
    storeMock.loadUnsettledRows.mockClear()
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()
    wrapper.unmount()
    resolveSettle()
    await flushPromises()

    expect(storeMock.cancelUnsettledLoads).toHaveBeenCalledTimes(1)
    expect(storeMock.loadUnsettledRows).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('invalidates mobile settlement UI effects when layout changes in flight', async () => {
    let resolveSettle!: () => void
    const settle = new Promise<void>((resolve) => { resolveSettle = resolve })
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const success = vi.spyOn(ElMessage, 'success')
    storeMock.settleRows.mockReturnValueOnce(settle)
    const wrapper = mountPage(true)
    storeMock.loadUnsettledRows.mockClear()
    await wrapper.get('[data-testid="select-unsettled-block-1"]').setValue(true)
    await wrapper.get('[data-testid="batch-settle-mobile"]').trigger('click')
    await flushPromises()

    layoutMock.mobile.value = false
    await nextTick()
    resolveSettle()
    await flushPromises()

    expect(wrapper.find('.table-stub').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-unsettled-action-bar"]').exists()).toBe(false)
    expect(storeMock.loadUnsettledRows).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })
})
