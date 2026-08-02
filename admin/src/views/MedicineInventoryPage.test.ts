import { defineComponent, h, nextTick, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MedicineInventoryPage from './MedicineInventoryPage.vue'

const api = vi.hoisted(() => ({
  getFrontendOptions: vi.fn(),
  getAdminMedicineItems: vi.fn(),
  getAdminMedicineInbounds: vi.fn(),
  getAdminMedicineOutbounds: vi.fn()
}))

vi.mock('../api', () => api)

const SelectStub = defineComponent({
  name: 'ElSelect',
  props: { modelValue: { type: Array as PropType<string[]>, default: () => [] } },
  emits: ['update:modelValue', 'change'],
  template: '<div class="el-select-stub"><slot /></div>'
})

const TabsStub = defineComponent({
  name: 'ElTabs',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue', 'tab-change'],
  template: '<div class="el-tabs-stub"><slot /></div>'
})

const TabPaneStub = defineComponent({
  name: 'ElTabPane',
  props: { label: { type: String, default: '' } },
  template: '<section>{{ label }}<slot /></section>'
})

const DatePickerStub = defineComponent({
  name: 'ElDatePicker',
  props: { modelValue: { type: Array as PropType<string[]>, default: () => [] } },
  emits: ['update:modelValue', 'change'],
  template: '<div class="el-date-picker-stub" />'
})

const TableStub = defineComponent({
  name: 'ElTable',
  props: { data: { type: Array as PropType<Record<string, unknown>[]>, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', { class: 'el-table-stub' }, [
      props.data.map((row) => String(row.name || row.nameSnapshot || '')).join(' '),
      slots.default?.()
    ])
  }
})

const ButtonStub = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
})

const stubs = {
  ElSelect: SelectStub,
  ElOption: defineComponent({ name: 'ElOption', template: '<div />' }),
  ElTabs: TabsStub,
  ElTabPane: TabPaneStub,
  ElDatePicker: DatePickerStub,
  ElTable: TableStub,
  ElTableColumn: defineComponent({ name: 'ElTableColumn', template: '<div />' }),
  ElTag: defineComponent({ name: 'ElTag', template: '<span><slot /></span>' }),
  ElButton: ButtonStub
}

const frontendOptions = [
  { id: 'front-1', account: 'kaili001', name: '凯里化验室', disabled: false },
  { id: 'front-2', account: 'yangshao002', name: '仰韶客户二', disabled: false }
]

const stockRows = [
  {
    id: 'item-acid',
    frontendUserId: 'front-1',
    name: '盐酸',
    unit: 'BOTTLE',
    unitLabel: '瓶',
    currentQuantity: 12,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T08:00:00.000Z'
  },
  {
    id: 'item-alcohol',
    frontendUserId: 'front-2',
    name: '酒精',
    unit: 'LITER',
    unitLabel: '升',
    currentQuantity: 2.5,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T09:00:00.000Z'
  }
]

const inboundRows = [{
  id: 'inbound-1',
  frontendUserId: 'front-1',
  medicineItemId: 'item-acid',
  type: 'INBOUND',
  occurredOn: '2026-08-02',
  quantity: 12,
  nameSnapshot: '盐酸',
  unitSnapshot: 'BOTTLE',
  unitLabel: '瓶',
  remark: '首次入库',
  correctionOfId: null,
  createdAt: '2026-08-02T08:00:00.000Z'
}]

function mountPage() {
  return mount(MedicineInventoryPage, {
    global: {
      stubs,
      directives: { loading: () => undefined }
    }
  })
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getFrontendOptions.mockResolvedValue(frontendOptions)
  api.getAdminMedicineItems.mockResolvedValue(stockRows)
  api.getAdminMedicineInbounds.mockResolvedValue(inboundRows)
  api.getAdminMedicineOutbounds.mockResolvedValue([{ ...inboundRows[0], id: 'outbound-1', type: 'OUTBOUND', nameSnapshot: '酒精' }])
})

describe('MedicineInventoryPage', () => {
  it('loads stock for all permitted accounts and sends account, medicine, and date filters to the active tab', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(api.getAdminMedicineItems).toHaveBeenCalledWith(['front-1', 'front-2'])
    expect(wrapper.findComponent(DatePickerStub).exists()).toBe(false)

    const [accountSelect, medicineSelect] = wrapper.findAllComponents(SelectStub)
    accountSelect.vm.$emit('update:modelValue', ['front-1'])
    accountSelect.vm.$emit('change')
    await flushPromises()
    medicineSelect.vm.$emit('update:modelValue', ['item-acid', 'item-alcohol'])
    medicineSelect.vm.$emit('change')
    await flushPromises()

    expect(api.getAdminMedicineItems).toHaveBeenLastCalledWith(['front-1'], ['item-acid', 'item-alcohol'])

    const tabs = wrapper.getComponent(TabsStub)
    tabs.vm.$emit('update:modelValue', 'inbound')
    tabs.vm.$emit('tab-change', 'inbound')
    await flushPromises()

    expect(api.getAdminMedicineInbounds).toHaveBeenLastCalledWith(['front-1'], ['item-acid', 'item-alcohol'], undefined, undefined)
    const datePicker = wrapper.getComponent(DatePickerStub)
    datePicker.vm.$emit('update:modelValue', ['2026-08-01', '2026-08-02'])
    datePicker.vm.$emit('change')
    await flushPromises()
    expect(api.getAdminMedicineInbounds).toHaveBeenLastCalledWith(['front-1'], ['item-acid', 'item-alcohol'], '2026-08-01', '2026-08-02')

    tabs.vm.$emit('update:modelValue', 'outbound')
    tabs.vm.$emit('tab-change', 'outbound')
    await flushPromises()
    expect(api.getAdminMedicineOutbounds).toHaveBeenLastCalledWith(['front-1'], ['item-acid', 'item-alcohol'], '2026-08-01', '2026-08-02')

    tabs.vm.$emit('update:modelValue', 'stock')
    tabs.vm.$emit('tab-change', 'stock')
    await flushPromises()
    expect(api.getAdminMedicineItems).toHaveBeenLastCalledWith(['front-1'], ['item-acid', 'item-alcohol'])
    expect(wrapper.findComponent(DatePickerStub).exists()).toBe(false)
  })

  it('renders no inventory mutation controls', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('当前库存')
    expect(wrapper.text()).not.toMatch(/新增|编辑|删除|更正|提交|操作/)
  })

  it('keeps an explicit error visible and retries the failed active request', async () => {
    api.getAdminMedicineItems.mockRejectedValueOnce(new Error('请求超时'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('[data-testid="medicine-inventory-load-error"]').text()).toContain('请求超时')
    await wrapper.get('[data-testid="medicine-inventory-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="medicine-inventory-load-error"]').exists()).toBe(false)
    expect(api.getAdminMedicineItems).toHaveBeenCalledTimes(2)
  })

  it('does not replace a newer stock result with an older fast-filter response', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const older = deferred<typeof stockRows>()
    const newer = deferred<typeof stockRows>()
    api.getAdminMedicineItems.mockImplementationOnce(() => older.promise)
    api.getAdminMedicineItems.mockImplementationOnce(() => newer.promise)

    const accountSelect = wrapper.getComponent(SelectStub)
    accountSelect.vm.$emit('update:modelValue', ['front-1'])
    accountSelect.vm.$emit('change')
    await nextTick()
    accountSelect.vm.$emit('update:modelValue', ['front-2'])
    accountSelect.vm.$emit('change')
    await nextTick()

    const freshRows = [{ ...stockRows[1], name: '最新库存' }]
    newer.resolve(freshRows)
    await flushPromises()
    older.resolve([{ ...stockRows[0], name: '过期库存' }])
    await flushPromises()

    expect(wrapper.getComponent(TableStub).props('data')).toEqual(freshRows)
  })
})
