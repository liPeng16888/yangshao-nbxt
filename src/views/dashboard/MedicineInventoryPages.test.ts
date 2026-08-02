import { defineComponent, nextTick, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessageBox, ElSelect } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import appRouter from '@/router'
import MedicineInventoryInboundPage from './MedicineInventoryInboundPage.vue'
import MedicineInventoryOutboundPage from './MedicineInventoryOutboundPage.vue'
import MedicineInventoryStockPage from './MedicineInventoryStockPage.vue'

const api = vi.hoisted(() => ({
  getMedicineItems: vi.fn(),
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
  api.getMedicineMovements.mockReset()
  api.createMedicineInbound.mockReset()
  api.createMedicineOutbound.mockReset()
  api.correctMedicineMovement.mockReset()
  api.getMedicineItems.mockResolvedValue(items)
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
})

describe('MedicineInventoryInboundPage', () => {
  it('locks the unit for an existing item and blocks a new name without a unit', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()

    const itemSelect = componentByTestId(wrapper, 'inbound-item')
    itemSelect.vm.$emit('update:modelValue', 'item-amoxicillin')
    await nextTick()
    const unitSelect = componentByTestId(wrapper, 'inbound-unit')
    expect(unitSelect.props('disabled')).toBe(true)
    expect(wrapper.text()).toContain('阿莫西林（瓶）')

    itemSelect.vm.$emit('update:modelValue', '新药品')
    await nextTick()
    expect(unitSelect.props('disabled')).toBe(false)
    await wrapper.get('[data-testid="inbound-quantity"]').setValue('2')
    await wrapper.get('[data-testid="inbound-submit"]').trigger('click')
    await flushPromises()

    expect(api.createMedicineInbound).not.toHaveBeenCalled()
  })

  it('confirms a valid inbound and refreshes stock and history', async () => {
    const wrapper = mountPage(MedicineInventoryInboundPage)
    await flushPromises()
    const initialItemLoads = api.getMedicineItems.mock.calls.length
    const initialHistoryLoads = api.getMedicineMovements.mock.calls.length

    componentByTestId(wrapper, 'inbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
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
  it('shows current and remaining stock and disables submission above available quantity', async () => {
    const wrapper = mountPage(MedicineInventoryOutboundPage)
    await flushPromises()

    componentByTestId(wrapper, 'outbound-item').vm.$emit('update:modelValue', 'item-amoxicillin')
    await wrapper.get('[data-testid="outbound-quantity"]').setValue('11')
    await nextTick()

    expect(wrapper.text()).toContain('当前库存 10 瓶')
    expect(wrapper.text()).toContain('出库后剩余 -1 瓶')
    expect(wrapper.get('[data-testid="outbound-submit"]').attributes('disabled')).toBeDefined()
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
