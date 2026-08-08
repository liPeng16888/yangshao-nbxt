import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, inject, nextTick, provide, type ComputedRef, type PropType } from 'vue'
import ElementPlus, { ElMessageBox, ElSelect } from 'element-plus'
import type { UnsettledSampleRow } from '@/types/financeBills'
import FinanceUnsettledPage from './FinanceUnsettledPage.vue'

const routerPush = vi.hoisted(() => vi.fn())
const storeMock = vi.hoisted(() => ({
  unsettledRows: [] as UnsettledSampleRow[],
  loading: false,
  settlingId: '',
  settlingBatch: false,
  isSettling: false,
  loadUnsettledRows: vi.fn(),
  settleRow: vi.fn(),
  settleRows: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush })
}))
vi.mock('@/stores/financeBills', () => ({
  useFinanceBillsStore: () => storeMock
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

function mountPage() {
  return mount(FinanceUnsettledPage, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-table': TableStub,
        'el-table-column': TableColumnStub
      }
    }
  })
}

describe('FinanceUnsettledPage batch payment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMock.unsettledRows = [...rows]
    storeMock.loading = false
    storeMock.settlingId = ''
    storeMock.settlingBatch = false
    storeMock.isSettling = false
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

    wrapper.findComponent(ElSelect).vm.$emit('update:modelValue', ['客户甲'])
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
})
