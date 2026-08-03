import { defineComponent, nextTick, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElAutocomplete, ElMessageBox, ElSelect } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import appRouter from '@/router'
import MedicineInventoryInboundPage from './MedicineInventoryInboundPage.vue'
import MedicineInventoryOutboundPage from './MedicineInventoryOutboundPage.vue'
import MedicineInventoryStockPage from './MedicineInventoryStockPage.vue'

const api = vi.hoisted(() => ({
  getMedicineItems: vi.fn(),
  getMedicineCommonNames: vi.fn(),
  createMedicineCommonName: vi.fn(),
  deleteMedicineCommonName: vi.fn(),
  getMedicineMovements: vi.fn(),
  createMedicineInbound: vi.fn(),
  createMedicineOutbound: vi.fn(),
  correctMedicineMovement: vi.fn()
}))

vi.mock('@/api/medicineInventory', () => api)

const DialogStub = defineComponent({
  name: 'ElDialog',
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" data-testid="correction-dialog"><slot /><slot name="footer" /></section>'
})

const items = [
  {
    id: 'item-amoxicillin',
    frontendUserId: 'frontend-1',
    name: '阿莫西林',
    unit: 'BOTTLE' as const,
    unitLabel: '瓶',
    currentQuantity: 10,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-02T08:00:00.000Z'
  },
  {
    id: 'item-saline',
    frontendUserId: 'frontend-1',
    name: '生理盐水',
    unit: 'MILLILITER' as const,
    unitLabel: '毫升',
    currentQuantity: 250.5,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-03T08:00:00.000Z'
  },
  {
    id: 'item-alcohol',
    frontendUserId: 'frontend-1',
    name: '酒精',
    unit: 'LITER' as const,
    unitLabel: '升',
    currentQuantity: 0.3,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-03T08:00:00.000Z'
  }
]

const inboundMovement = {
  id: 'movement-inbound-1',
  frontendUserId: 'frontend-1',
  medicineItemId: 'item-amoxicillin',
  type: 'INBOUND' as const,
  occurredOn: '2026-08-02',
  quantity: 10,
  nameSnapshot: '阿莫西林',
  unitSnapshot: 'BOTTLE' as const,
  unitLabel: '瓶',
  remark: '初始入库',
  correctionOfId: null,
  createdAt: '2026-08-02T08:00:00.000Z'
}

const commonNames = [
  { id: 'common-saline', frontendUserId: 'frontend-1', name: '生理盐水', createdAt: '2026-08-02T08:00:00.000Z', updatedAt: '2026-08-02T08:00:00.000Z' }
]

function mountPage(component: Component) {
  return mount(component, {
    global: {
      plugins: [ElementPlus],
      stubs: { ElDialog: DialogStub }
    }
  })
}

function componentByTestId(wrapper: VueWrapper, testId: string): VueWrapper<any> {
  return wrapper.getComponent(`[data-testid="${testId}"]`) as VueWrapper<any>
}

beforeEach(() => {
  vi.restoreAllMocks()
  api.getMedicineItems.mockReset()
  api.getMedicineCommonNames.mockReset()
  api.createMedicineCommonName.mockReset()
  api.deleteMedicineCommonName.mockReset()
  api.getMedicineMovements.mockReset()
  api.createMedicineInbound.mockReset()
  api.createMedicineOutbound.mockReset()
  api.correctMedicineMovement.mockReset()
  api.getMedicineItems.mockResolvedValue(items)
  api.getMedicineCommonNames.mockResolvedValue(commonNames)
  api.createMedicineCommonName.mockResolvedValue({ id: 'common-hydrochloric', frontendUserId: 'frontend-1', name: '盐酸', createdAt: '2026-08-03T08:00:00.000Z', updatedAt: '2026-08-03T08:00:00.000Z' })
  api.deleteMedicineCommonName.mockResolvedValue(undefined)
  api.getMedicineMovements.mockResolvedValue([inboundMovement])
  api.createMedicineInbound.mockResolvedValue({ item: items[0], movement: inboundMovement })
  api.createMedicineOutbound.mockResolvedValue({ item: items[0], movement: inboundMovement })
  api.correctMedicineMovement.mockResolvedValue({ item: items[0], movement: inboundMovement })
  vi.spyOn(ElMessageBox, 'confirm').mockImplementation(
    () => Promise.resolve(undefined) as unknown as ReturnType<typeof ElMessageBox.confirm>
  )
})

describe('medicine inventory navigation', () => {
  it('places the expandable medicine inventory entry between reports and customer overview', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: defineComponent({ template: '<div />' }) }]
    })
    await router.push('/medicine-inventory/stock')
    await router.isReady()
    const wrapper = mount(AppSidebar, {
      props: { collapsed: false },
      global: { plugins: [router, ElementPlus] }
    })
    const navigationText = wrapper.text()

    expect(navigationText.indexOf('报表')).toBeLessThan(navigationText.indexOf('药品库存'))
    expect(navigationText.indexOf('药品库存')).toBeLessThan(navigationText.indexOf('客户总览'))
    expect(wrapper.findAll('.side-nav__child').map((child) => child.text())).toEqual(['药品库存', '药品入库', '药品出库'])
    expect(appRouter.getRoutes().map((route) => route.path)).toEqual(expect.arrayContaining([
      '/medicine-inventory/stock',
      '/medicine-inventory/inbound',
      '/medicine-inventory/outbound'
    ]))
  })
})

describe('MedicineInventoryStockPage', () => {
  it('loads all items and filters one or multiple selected medicine items', async () => {
    const wrapper = mountPage(MedicineInventoryStockPage)
    await flushPromises()

    expect(wrapper.text()).toContain('阿莫西林')
    expect(wrapper.text()).toContain('生理盐水')
    expect(wrapper.text()).toContain('2026-08-02 16:00')
    const medicineSelect = wrapper.getComponent(ElSelect)
    expect(medicineSelect.props('multiple')).toBe(true)

    medicineSelect.vm.$emit('update:modelValue', ['item-amoxicillin'])
    await nextTick()
    expect(wrapper.text()).toContain('阿莫西林')
    expect(wrapper.text()).not.toContain('生理盐水')

    medicineSelect.vm.$emit('update:modelValue', ['item-amoxicillin', 'item-saline'])
    await nextTick()
    expect(wrapper.text()).toContain('生理盐水')
  })

  it('keeps a persistent load error visible and retries stock loading in the page', async () => {
    api.getMedicineItems.mockRejectedValueOnce(new Error('network'))
    const wrapper = mountPage(MedicineInventoryStockPage)
    await flushPromises()

    expect(wrapper.get('[data-testid="stock-load-error"]').text()).toContain('药品库存加载失败')
    await wrapper.get('[data-testid="stock-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="stock-load-error"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('阿莫西林')
  })
})

describe('MedicineInventoryInboundPage', () => {
  it('accepts a directly typed medicine name and saves personal common names', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    const medicineInput = wrapper.getComponent(ElAutocomplete) as unknown as VueWrapper<any>
    medicineInput.vm.$emit('update:modelValue', '盐酸')
    componentByTestId(wrapper, 'inbound-unit').vm.$emit('update:modelValue', 'BOTTLE')
    await wrapper.get('[data-testid="inbound-quantity"]').setValue('2')
    await nextTick()
    await wrapper.get('[data-testid="inbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineInbound).toHaveBeenCalledWith(expect.objectContaining({ name: '盐酸', unit: 'BOTTLE' }))

    await wrapper.get('[data-testid="common-name-input"]').setValue('盐酸')
    await wrapper.get('[data-testid="common-name-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineCommonName).toHaveBeenCalledWith({ name: '盐酸' })
  })

  it('marks quantity as required and blocks an empty inbound submission', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    const quantityItem = wrapper.findAll('.el-form-item').find((item) => item.text().includes('数量'))
    expect(quantityItem?.classes()).toContain('is-required')
    const quantityFormItem = wrapper.findAllComponents({ name: 'ElFormItem' })
      .find((item) => item.find('[data-testid="inbound-quantity"]').exists())
    expect(quantityFormItem?.props('required')).toBe(true)

    const itemSelect = wrapper.getComponent(ElAutocomplete) as unknown as VueWrapper<any>
    itemSelect.vm.$emit('select', { value: '阿莫西林', item: items[0] })
    await nextTick()
    await wrapper.get('[data-testid="inbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineInbound).not.toHaveBeenCalled()
  })

  it('locks the unit for an existing item and blocks a new name without a unit', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()
    expect(wrapper.text()).toContain('2026-08-02 16:00')

    const itemSelect = wrapper.getComponent(ElAutocomplete) as unknown as VueWrapper<any>
    itemSelect.vm.$emit('select', { value: '阿莫西林', item: items[0] })
    await nextTick()
    const unitSelect = componentByTestId(wrapper, 'inbound-unit')
    expect(unitSelect.props('disabled')).toBe(true)
    expect(itemSelect.props('modelValue')).toBe('阿莫西林')

    itemSelect.vm.$emit('update:modelValue', '新药品')
    itemSelect.vm.$emit('input', '新药品')
    await nextTick()
    expect(unitSelect.props('disabled')).toBe(false)
    await wrapper.get('[data-testid="inbound-quantity"]').setValue('2')
    await wrapper.get('[data-testid="inbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineInbound).not.toHaveBeenCalled()
  })

  it('reloads all inbound history after the date range is cleared', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()
    const historyDatePicker = wrapper.findAllComponents({ name: 'ElDatePicker' })[1] as VueWrapper<any>

    historyDatePicker.vm.$emit('update:modelValue', ['2026-08-01', '2026-08-02'])
    await flushPromises()
    expect(api.getMedicineMovements).toHaveBeenLastCalledWith('inbound', {
      startDate: '2026-08-01',
      endDate: '2026-08-02'
    })

    historyDatePicker.vm.$emit('update:modelValue', undefined)
    await flushPromises()
    expect(api.getMedicineMovements).toHaveBeenLastCalledWith('inbound', {})
  })

  it('clears stale inbound history after a filter request fails and retries in the page', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()
    expect(wrapper.text()).toContain('初始入库')
    api.getMedicineMovements.mockRejectedValueOnce(new Error('network'))
    const historySelect = wrapper.findAllComponents(ElSelect)[1]

    historySelect.vm.$emit('update:modelValue', ['item-saline'])
    historySelect.vm.$emit('change')
    await flushPromises()

    expect(wrapper.text()).not.toContain('初始入库')
    expect(wrapper.get('[data-testid="inbound-history-error"]').text()).toContain('入库明细加载失败')
    await wrapper.get('[data-testid="inbound-history-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('初始入库')
  })

  it('keeps an inbound item load error visible and retries its inventory items', async () => {
    api.getMedicineItems.mockRejectedValueOnce(new Error('network'))
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    expect(wrapper.get('[data-testid="inbound-items-error"]').text()).toContain('药品库存加载失败')
    await wrapper.get('[data-testid="inbound-items-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="inbound-items-error"]').exists()).toBe(false)
    expect(api.getMedicineItems).toHaveBeenCalledTimes(2)
  })

  it('confirms a valid inbound and refreshes stock and history', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()
    const initialItemLoads = api.getMedicineItems.mock.calls.length
    const initialHistoryLoads = api.getMedicineMovements.mock.calls.length

    ;(wrapper.getComponent(ElAutocomplete) as unknown as VueWrapper<any>).vm.$emit('select', { value: '阿莫西林', item: items[0] })
    await wrapper.get('[data-testid="inbound-quantity"]').setValue('2')
    await nextTick()
    await wrapper.get('[data-testid="inbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineInbound).toHaveBeenCalledWith({
      occurredOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      name: '阿莫西林',
      unit: 'BOTTLE',
      quantity: '2',
      remark: ''
    })
    expect(api.getMedicineItems.mock.calls.length).toBeGreaterThan(initialItemLoads)
    expect(api.getMedicineMovements.mock.calls.length).toBeGreaterThan(initialHistoryLoads)
  })

  it('requires a correction reason and asks for a second confirmation before creating it', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    await wrapper.get('[data-testid="correct-movement-inbound-1"]').trigger('click')
    expect(wrapper.find('[data-testid="correction-dialog"]').exists()).toBe(true)

    await wrapper.get('[data-testid="correction-submit"]').trigger('click')
    expect(api.correctMedicineMovement).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="correction-reason"]').setValue('录入数量有误')
    await wrapper.get('[data-testid="correction-submit"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(api.correctMedicineMovement).toHaveBeenCalledWith('movement-inbound-1', { reason: '录入数量有误' })
  })
})

describe('MedicineInventoryOutboundPage', () => {
  it('marks quantity as required and blocks an empty outbound submission', async () => {
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    const quantityItem = wrapper.findAll('.el-form-item')
      .find((item) => item.find('[data-testid="outbound-quantity"]').exists())
    expect(quantityItem?.classes()).toContain('is-required')
    const quantityFormItem = wrapper.findAllComponents({ name: 'ElFormItem' })
      .find((item) => item.find('[data-testid="outbound-quantity"]').exists())
    expect(quantityFormItem?.props('required')).toBe(true)

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await nextTick()
    expect(wrapper.get('[data-testid="outbound-submit"]').attributes('disabled')).toBeDefined()
    expect(api.createMedicineOutbound).not.toHaveBeenCalled()
  })

  it('shows current and remaining stock and disables submission above available quantity', async () => {
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('11')
    await nextTick()

    expect(wrapper.text()).toContain('当前库存 10 瓶')
    expect(wrapper.text()).toContain('出库后剩余 -1 瓶')
    expect(wrapper.text()).toContain('2026-08-02 16:00')
    expect(wrapper.get('[data-testid="outbound-submit"]').attributes('disabled')).toBeDefined()
  })

  it('formats a decimal remaining quantity without floating-point tails', async () => {
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-alcohol')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('0.2')
    await nextTick()

    expect(wrapper.text()).toContain('出库后剩余 0.1 升')
    expect(wrapper.text()).not.toContain('0.09999999999999998')
  })

  it('reloads all outbound history after the date range is cleared', async () => {
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()
    const historyDatePicker = wrapper.findAllComponents({ name: 'ElDatePicker' })[1] as VueWrapper<any>

    historyDatePicker.vm.$emit('update:modelValue', ['2026-08-01', '2026-08-02'])
    await flushPromises()
    expect(api.getMedicineMovements).toHaveBeenLastCalledWith('outbound', {
      startDate: '2026-08-01',
      endDate: '2026-08-02'
    })

    historyDatePicker.vm.$emit('update:modelValue', undefined)
    await flushPromises()
    expect(api.getMedicineMovements).toHaveBeenLastCalledWith('outbound', {})
  })

  it('keeps an outbound item load error visible and retries its inventory items', async () => {
    api.getMedicineItems.mockRejectedValueOnce(new Error('network'))
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    expect(wrapper.get('[data-testid="outbound-items-error"]').text()).toContain('药品库存加载失败')
    await wrapper.get('[data-testid="outbound-items-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="outbound-items-error"]').exists()).toBe(false)
    expect(api.getMedicineItems).toHaveBeenCalledTimes(2)
  })

  it('preserves the outbound form after a 409 and updates the displayed current stock', async () => {
    api.createMedicineOutbound.mockRejectedValueOnce({
      response: { status: 409, data: { message: '库存不足，当前库存为 2 瓶' } }
    })
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('8')
    await wrapper.get('[data-testid="outbound-remark"]').setValue('紧急出库')
    await nextTick()
    await wrapper.get('[data-testid="outbound-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('当前库存 2 瓶')
    expect(componentByTestId(wrapper, 'outbound-item').props('modelValue')).toBe('item-amoxicillin')
    expect((wrapper.get('[data-testid="outbound-quantity"]').element as HTMLInputElement).value).toBe('8')
    expect((wrapper.get('[data-testid="outbound-remark"]').element as HTMLInputElement).value).toBe('紧急出库')
  })
})
