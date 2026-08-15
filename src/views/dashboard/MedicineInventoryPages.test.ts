import { defineComponent, nextTick, ref, type Component, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElAutocomplete, ElMessage, ElMessageBox, ElSelect } from 'element-plus'
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

const layout = vi.hoisted(() => ({
  isMobileLayout: undefined as unknown as Ref<boolean>
}))

vi.mock('@/api/medicineInventory', () => api)
vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: layout.isMobileLayout })
}))

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
  layout.isMobileLayout = ref(false)
  vi.restoreAllMocks()
  api.getMedicineItems.mockReset()
  api.getMedicineCommonNames.mockReset()
  api.createMedicineCommonName.mockReset()
  api.deleteMedicineCommonName.mockReset()
  api.getMedicineMovements.mockReset()
  api.createMedicineInbound.mockReset()
  api.createMedicineOutbound.mockReset()
  api.correctMedicineMovement.mockReset()
  api.getMedicineItems.mockImplementation(() => Promise.resolve(structuredClone(items)))
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
    expect(wrapper.findAll('.side-nav__child').map((child) => child.attributes('href'))).toEqual([
      '/medicine-inventory/stock', '/medicine-inventory/inbound', '/medicine-inventory/outbound'
    ])
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

  it('renders only mobile stock cards with complete stock fields and filter drawer on mobile', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryStockPage)
    await flushPromises()

    const cards = wrapper.findAll('[data-testid="mobile-medicine-stock-card"]')
    expect(cards).toHaveLength(3)
    expect(cards[0].text()).toContain('阿莫西林')
    expect(cards[0].text()).toContain('10')
    expect(cards[0].text()).toContain('瓶')
    expect(cards[0].text()).toContain('2026-08-02 16:00')
    expect(wrapper.find('.mobile-filter-drawer').exists()).toBe(true)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(wrapper.find('.inventory-control-band').exists()).toBe(false)
  })

  it('keeps a mobile stock filter through an error/retry and ignores a stale request', async () => {
    layout.isMobileLayout.value = true
    let resolveOlder!: (value: typeof items) => void
    const olderRequest = new Promise<typeof items>((resolve) => { resolveOlder = resolve })
    api.getMedicineItems.mockReturnValueOnce(olderRequest)
    const wrapper = mountPage(MedicineInventoryStockPage)
    await nextTick()

    await wrapper.get('.mobile-filter-summary').trigger('click')
    const drawerSelect = wrapper.getComponent(ElSelect)
    drawerSelect.vm.$emit('update:modelValue', ['item-saline'])
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    api.getMedicineItems.mockRejectedValueOnce(new Error('network'))
    await wrapper.get('[data-testid="mobile-stock-refresh"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="stock-load-error"]').text()).toContain('药品库存加载失败')
    expect(wrapper.get('.mobile-filter-summary').text()).toContain('已选 1 项')

    api.getMedicineItems.mockResolvedValueOnce(items)
    await wrapper.get('[data-testid="stock-retry"]').trigger('click')
    await flushPromises()
    resolveOlder([items[0]])
    await flushPromises()

    const cards = wrapper.findAll('[data-testid="mobile-medicine-stock-card"]')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('生理盐水')
  })

  it('switches stock layout without rendering desktop and mobile records together', async () => {
    const wrapper = mountPage(MedicineInventoryStockPage)
    await flushPromises()
    expect(wrapper.find('.inventory-control-band').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-medicine-stock-list"]').exists()).toBe(false)

    layout.isMobileLayout.value = true
    await nextTick()
    expect(wrapper.find('.inventory-control-band').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-medicine-stock-list"]').exists()).toBe(true)
  })

  it('gives the mobile stock filter full-width 44px select controls', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryStockPage)
    await flushPromises()
    await wrapper.get('.mobile-filter-summary').trigger('click')
    await nextTick()
    const select = wrapper.getComponent(ElSelect)
    const selectRoot = select.element as HTMLElement
    const selectWrapper = select.get('.el-select__wrapper').element
    const selectInput = select.get('.el-select__input').element

    expect(getComputedStyle(selectRoot).width).toBe('100%')
    expect(getComputedStyle(selectRoot).maxWidth).toBe('100%')
    expect(getComputedStyle(selectRoot).getPropertyValue('--el-component-size').trim()).toBe('44px')
    expect(selectWrapper.classList).toContain('el-select__wrapper')
    expect(selectInput.classList).toContain('el-select__input')
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
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(false)
    expect(wrapper.find('.mobile-fullscreen-dialog--active').exists()).toBe(false)

    await wrapper.get('[data-testid="correction-submit"]').trigger('click')
    expect(api.correctMedicineMovement).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="correction-reason"]').setValue('录入数量有误')
    await wrapper.get('[data-testid="correction-submit"]').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(api.correctMedicineMovement).toHaveBeenCalledWith('movement-inbound-1', { reason: '录入数量有误' })
  })

  it('uses a collapsed mobile inbound form backed by the same persistent inputs and movement cards', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    const toggle = wrapper.get('[data-testid="mobile-inbound-form-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="mobile-inbound-form"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="mobile-inbound-form"]').isVisible()).toBe(false)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-inbound-card"]')).toHaveLength(1)

    await toggle.trigger('click')
    await wrapper.get('[data-testid="inbound-quantity"]').setValue('2.5')
    expect(wrapper.get('[data-testid="inbound-quantity"]').attributes('inputmode')).toBe('decimal')
    await toggle.trigger('click')
    await toggle.trigger('click')
    expect((wrapper.get('[data-testid="inbound-quantity"]').element as HTMLInputElement).value).toBe('2.5')
  })

  it('keeps a mobile inbound inventory error visible while the form is collapsed', async () => {
    layout.isMobileLayout.value = true
    api.getMedicineItems.mockRejectedValueOnce(new Error('network'))
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-inbound-form-toggle"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('[data-testid="inbound-items-error"]').isVisible()).toBe(true)
  })

  it('submits the exact inbound business payload from the mobile form', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()
    await wrapper.get('[data-testid="mobile-inbound-form-toggle"]').trigger('click')

    const datePicker = wrapper.findAllComponents({ name: 'ElDatePicker' })[0] as VueWrapper<any>
    datePicker.vm.$emit('update:modelValue', '2026-08-14')
    const nameInput = wrapper.getComponent(ElAutocomplete) as unknown as VueWrapper<any>
    nameInput.vm.$emit('update:modelValue', '葡萄糖')
    componentByTestId(wrapper, 'inbound-unit').vm.$emit('update:modelValue', 'MILLILITER')
    await wrapper.get('[data-testid="inbound-quantity"]').setValue('2.125')
    const remark = wrapper.findAllComponents({ name: 'ElInput' }).find((input) => input.props('placeholder') === '可填写入库备注')
    remark?.vm.$emit('update:modelValue', '  移动入库  ')
    await nextTick()
    await wrapper.get('[data-testid="inbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineInbound).toHaveBeenCalledWith({
      occurredOn: '2026-08-14',
      name: '葡萄糖',
      unit: 'MILLILITER',
      quantity: '2.125',
      remark: '移动入库'
    })
  })

  it('keeps mobile history filters on retry and opens a fullscreen correction that retains failed input', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    await wrapper.get('.mobile-filter-summary').trigger('click')
    const historySelect = componentByTestId(wrapper, 'mobile-medicine-history-item-filter')
    historySelect.vm.$emit('update:modelValue', ['item-amoxicillin'])
    api.getMedicineMovements.mockRejectedValueOnce(new Error('network'))
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('.mobile-filter-summary').text()).toContain('已选 1 项')

    await wrapper.get('[data-testid="inbound-history-retry"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="correct-movement-inbound-1"]').trigger('click')
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(true)
    expect(wrapper.find('.mobile-fullscreen-dialog--active').exists()).toBe(true)
    await wrapper.get('[data-testid="correction-submit"]').trigger('click')
    expect(api.correctMedicineMovement).not.toHaveBeenCalled()

    api.correctMedicineMovement.mockRejectedValueOnce(new Error('save failed'))
    await wrapper.get('[data-testid="correction-reason"]').setValue('录入数量有误')
    await wrapper.get('[data-testid="correction-submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="correction-dialog"]').exists()).toBe(true)
    expect((wrapper.get('[data-testid="correction-reason"]').element as HTMLTextAreaElement).value).toBe('录入数量有误')
  })

  it('gives mobile movement filters full-width 44px select and date-range controls', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()
    await wrapper.get('.mobile-filter-summary').trigger('click')
    await nextTick()
    const select = componentByTestId(wrapper, 'mobile-medicine-history-item-filter')
    const dateRange = wrapper.get('.mobile-medicine-movements__filters .el-date-editor--daterange')

    expect(getComputedStyle(select.element).width).toBe('100%')
    expect(getComputedStyle(select.element).maxWidth).toBe('100%')
    expect(getComputedStyle(select.element).getPropertyValue('--el-component-size').trim()).toBe('44px')
    expect(select.get('.el-select__wrapper').classes()).toContain('el-select__wrapper')
    expect(select.get('.el-select__input').classes()).toContain('el-select__input')
    expect(getComputedStyle(dateRange.element).width).toBe('100%')
    expect(getComputedStyle(dateRange.element).maxWidth).toBe('100%')
    expect(getComputedStyle(dateRange.element).getPropertyValue('--el-component-size').trim()).toBe('44px')
    expect(dateRange.findAll('.el-range-input')).toHaveLength(2)
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
      response: { status: 409, data: { item: { currentQuantity: 2 }, message: '库存不足，当前库存为 2 瓶' } }
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

  it('applies a delayed 409 only to the submitted item while preserving a newly selected item and inputs', async () => {
    let rejectOutbound!: (error: unknown) => void
    api.createMedicineOutbound.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOutbound = reject }))
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('8')
    await wrapper.get('[data-testid="outbound-remark"]').setValue('A 请求')
    await nextTick()
    await wrapper.get('[data-testid="outbound-submit"]').trigger('click')
    await flushPromises()
    expect(api.createMedicineOutbound).toHaveBeenCalledWith(expect.objectContaining({ medicineItemId: 'item-amoxicillin' }))

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-saline')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('1.25')
    await wrapper.get('[data-testid="outbound-remark"]').setValue('B 保留')
    await nextTick()
    rejectOutbound({ response: { status: 409, data: { item: { currentQuantity: 2 }, message: 'A 库存不足' } } })
    await flushPromises()

    expect(componentByTestId(wrapper, 'outbound-item').props('modelValue')).toBe('item-saline')
    expect((wrapper.get('[data-testid="outbound-quantity"]').element as HTMLInputElement).value).toBe('1.25')
    expect((wrapper.get('[data-testid="outbound-remark"]').element as HTMLInputElement).value).toBe('B 保留')
    expect(wrapper.text()).toContain('当前库存 250.5 毫升')

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await nextTick()
    expect(wrapper.text()).toContain('当前库存 2 瓶')
  })

  it('captures the outbound request context before asynchronous form validation settles', async () => {
    let resolveValidation!: (valid: boolean) => void
    const validation = new Promise<boolean>((resolve) => { resolveValidation = resolve })
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('2')
    await wrapper.get('[data-testid="outbound-remark"]').setValue('A 提交快照')
    await nextTick()
    const form = wrapper.findAllComponents({ name: 'ElForm' })[0]
    vi.spyOn((form.vm.$ as { exposed: { validate: () => Promise<boolean> } }).exposed, 'validate').mockReturnValue(validation)

    await wrapper.get('[data-testid="outbound-submit"]').trigger('click')
    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-saline')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('1.25')
    await wrapper.get('[data-testid="outbound-remark"]').setValue('B 未提交')
    resolveValidation(true)
    await flushPromises()

    expect(api.createMedicineOutbound).toHaveBeenCalledWith({
      occurredOn: '2026-08-15',
      medicineItemId: 'item-amoxicillin',
      quantity: '2',
      remark: 'A 提交快照'
    })
  })

  it.each([
    ['blank string', ''],
    ['negative', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['object', { value: 2 }],
    ['excess precision', 1.2345],
    ['out of range', 100000000000]
  ])('rejects an invalid explicit conflict quantity (%s), preserves stock, and authoritatively reloads', async (_label, currentQuantity) => {
    api.createMedicineOutbound.mockRejectedValueOnce({
      response: { status: 409, data: { item: { currentQuantity }, message: '库存冲突' } }
    })
    const errorSpy = vi.spyOn(ElMessage, 'error')
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('8')
    await nextTick()
    await wrapper.get('[data-testid="outbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.getMedicineItems).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('当前库存 10 瓶')
    expect(errorSpy).toHaveBeenCalledWith('库存数据无效，已刷新库存，请核对后重试')
  })

  it('ignores an outbound 409 that settles after unmount without refreshing or notifying', async () => {
    let rejectOutbound!: (error: unknown) => void
    api.createMedicineOutbound.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOutbound = reject }))
    const errorSpy = vi.spyOn(ElMessage, 'error')
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('8')
    await nextTick()
    await wrapper.get('[data-testid="outbound-submit"]').trigger('click')
    await flushPromises()
    expect(api.createMedicineOutbound).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    rejectOutbound({ response: { status: 409, data: { item: { currentQuantity: '' }, message: 'late conflict' } } })
    await flushPromises()

    expect(api.getMedicineItems).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('uses a collapsed mobile outbound form and complete movement cards without desktop tables', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    const toggle = wrapper.get('[data-testid="mobile-outbound-form-toggle"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('[data-testid="mobile-outbound-form"]').isVisible()).toBe(false)
    expect(wrapper.find('.el-table').exists()).toBe(false)
    const card = wrapper.get('[data-testid="mobile-outbound-card"]')
    expect(card.text()).toContain('阿莫西林')
    expect(card.text()).toContain('10 瓶')
    expect(card.text()).toContain('剩余库存')
    expect(card.text()).toContain('frontend-1')
    expect(card.text()).toContain('初始入库')
    expect(card.text()).toContain('2026-08-02 16:00')

    await toggle.trigger('click')
    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('1.5')
    expect(wrapper.get('[data-testid="outbound-quantity"]').attributes('inputmode')).toBe('decimal')
    await toggle.trigger('click')
    await toggle.trigger('click')
    expect((wrapper.get('[data-testid="outbound-quantity"]').element as HTMLInputElement).value).toBe('1.5')
  })

  it('preserves mobile outbound fields and updated stock after an insufficient-stock conflict without duplicate submit', async () => {
    layout.isMobileLayout.value = true
    let rejectOutbound!: (error: unknown) => void
    api.createMedicineOutbound.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOutbound = reject }))
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()
    await wrapper.get('[data-testid="mobile-outbound-form-toggle"]').trigger('click')
    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('8')
    await wrapper.get('[data-testid="outbound-remark"]').setValue('紧急出库')
    await nextTick()

    await Promise.all([
      wrapper.get('[data-testid="outbound-submit"]').trigger('click'),
      wrapper.get('[data-testid="outbound-submit"]').trigger('click')
    ])
    await flushPromises()
    expect(api.createMedicineOutbound).toHaveBeenCalledTimes(1)

    rejectOutbound({ response: { status: 409, data: { item: { currentQuantity: 2 }, message: '库存不足' } } })
    await flushPromises()
    expect(wrapper.text()).toContain('当前库存 2 瓶')
    expect(componentByTestId(wrapper, 'outbound-item').props('modelValue')).toBe('item-amoxicillin')
    expect((wrapper.get('[data-testid="outbound-quantity"]').element as HTMLInputElement).value).toBe('8')
    expect((wrapper.get('[data-testid="outbound-remark"]').element as HTMLInputElement).value).toBe('紧急出库')
  })

  it('submits the exact outbound business payload from the mobile form', async () => {
    layout.isMobileLayout.value = true
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()
    await wrapper.get('[data-testid="mobile-outbound-form-toggle"]').trigger('click')

    const datePicker = wrapper.findAllComponents({ name: 'ElDatePicker' })[0] as VueWrapper<any>
    datePicker.vm.$emit('update:modelValue', '2026-08-14')
    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-saline')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('0.125')
    await wrapper.get('[data-testid="outbound-remark"]').setValue('  移动出库  ')
    await nextTick()
    await wrapper.get('[data-testid="outbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineOutbound).toHaveBeenCalledWith({
      occurredOn: '2026-08-14',
      medicineItemId: 'item-saline',
      quantity: '0.125',
      remark: '移动出库'
    })
  })

  it('hides correction actions for correction rows and already-corrected originals on mobile', async () => {
    layout.isMobileLayout.value = true
    api.getMedicineMovements.mockResolvedValueOnce([
      { ...inboundMovement, id: 'outbound-original', type: 'OUTBOUND' },
      { ...inboundMovement, id: 'outbound-correction', type: 'CORRECTION_IN', correctionOfId: 'outbound-original', remark: '库存更正' }
    ])
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    expect(wrapper.find('[data-testid="correct-outbound-original"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="correct-outbound-correction"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="mobile-outbound-card"]').text()).toContain('已更正')
    expect(wrapper.findAll('[data-testid="mobile-outbound-card"]')[1].text()).toContain('更正自 outbound-original')
  })

  it('submits a mobile correction only once when confirmation is clicked repeatedly', async () => {
    layout.isMobileLayout.value = true
    api.getMedicineMovements.mockResolvedValueOnce([{ ...inboundMovement, id: 'outbound-1', type: 'OUTBOUND' }])
    let resolveCorrection!: (value: unknown) => void
    api.correctMedicineMovement.mockReturnValueOnce(new Promise((resolve) => { resolveCorrection = resolve }))
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    await wrapper.get('[data-testid="correct-outbound-1"]').trigger('click')
    await wrapper.get('[data-testid="correction-reason"]').setValue('重复录入')
    await Promise.all([
      wrapper.get('[data-testid="correction-submit"]').trigger('click'),
      wrapper.get('[data-testid="correction-submit"]').trigger('click')
    ])
    await flushPromises()

    expect(api.correctMedicineMovement).toHaveBeenCalledTimes(1)
    resolveCorrection({ item: items[0], movement: inboundMovement })
    await flushPromises()
  })
})
