// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElSelect } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import CustomerOverviewPage from './CustomerOverviewPage.vue'

const mocks = vi.hoisted(() => ({
  getCustomerOverview: vi.fn(),
  mobileLayout: undefined as unknown as ReturnType<typeof ref<boolean>>
}))

vi.mock('@/api/customerOverview', () => ({
  getCustomerOverview: mocks.getCustomerOverview
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.mobileLayout })
}))

const rows = [
  {
    customerKey: 'a',
    customer: '客户甲',
    customerDisplay: '客户甲 13800000001 wx-a',
    sampleCount: 3,
    totalAmount: 60,
    firstDetectionDate: '2026-07-01',
    lastDetectionDate: '2026-07-03'
  },
  {
    customerKey: 'b',
    customer: '客户乙',
    customerDisplay: '客户乙 13800000002',
    sampleCount: 1,
    totalAmount: 100,
    firstDetectionDate: '2026-07-02',
    lastDetectionDate: '2026-07-04'
  }
]

const DrawerStub = defineComponent({
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

const DialogStub = defineComponent({
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

function mountPage() {
  return mount(CustomerOverviewPage, {
    global: {
      plugins: [ElementPlus],
      directives: { loading: {} },
      stubs: { ElDrawer: DrawerStub, ElDialog: DialogStub }
    }
  })
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

function customerCard(wrapper: ReturnType<typeof mountPage>, customer: string) {
  const card = wrapper.findAll('[data-testid="mobile-customer-card"]').find((candidate) => candidate.text().includes(customer))
  if (!card) throw new Error(`Missing card for ${customer}`)
  return card
}

describe('CustomerOverviewPage', () => {
  beforeEach(() => {
    mocks.getCustomerOverview.mockReset()
    mocks.getCustomerOverview.mockResolvedValue(rows)
    mocks.mobileLayout = ref(false)
  })

  it('loads complete customer rows and supports one or multiple customer filters', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('客户甲 13800000001 wx-a')
    expect(wrapper.text()).toContain('客户乙 13800000002')
    const customerSelect = wrapper.findAllComponents(ElSelect)[0]
    expect(customerSelect.props('multiple')).toBe(true)

    customerSelect.vm.$emit('update:modelValue', ['a'])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('客户甲 13800000001 wx-a')
    expect(wrapper.text()).not.toContain('客户乙 13800000002')

    customerSelect.vm.$emit('update:modelValue', ['a', 'b'])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('客户乙 13800000002')
  })

  it('shows summary totals for the currently filtered rows', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[data-summary="customers"]').text()).toContain('2')
    expect(wrapper.find('[data-summary="samples"]').text()).toContain('4')
    expect(wrapper.find('[data-summary="amount"]').text()).toContain('160.00')
    expect(wrapper.find('[data-testid="mobile-customer-filter-summary"]').exists()).toBe(false)
  })

  it('uses cards rather than the desktop table in the mobile layout', async () => {
    mocks.mobileLayout.value = true
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-customer-overview-list"]').text()).toContain('客户甲')
    expect(wrapper.get('[data-testid="mobile-customer-overview-list"]').text()).toContain('3 个样品')
    expect(wrapper.find('.el-table').exists()).toBe(false)
  })

  it('shows the active sort and selected filter in the mobile summary without secondary navigation', async () => {
    mocks.mobileLayout.value = true
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-customer-filter-summary"]').text()).toContain('最后检测时间')
    expect(wrapper.find('.mobile-secondary-nav').exists()).toBe(false)
  })

  it('uses isolated 44px mobile poppers for customer and sort options and a 44px customer tag remove target', async () => {
    mocks.mobileLayout.value = true
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-customer-filter-summary"] .mobile-filter-summary').trigger('click')
    const [customerSelect, sortSelect] = wrapper.findAllComponents(ElSelect)
    expect(customerSelect.props('popperClass')).toBe('mobile-customer-overview-popper')
    expect(sortSelect.props('popperClass')).toBe('mobile-customer-overview-sort-popper')

    customerSelect.vm.$emit('update:modelValue', ['a'])
    await nextTick()
    const removeTarget = wrapper.get('[data-testid="mobile-customer-tag-remove"]')
    expect(removeTarget.classes()).toContain('mobile-touch-target')
    expect(getComputedStyle(removeTarget.element).minWidth).toBe('44px')
    expect(getComputedStyle(removeTarget.element).minHeight).toBe('44px')
    await removeTarget.trigger('click')
    expect(wrapper.find('[data-testid="mobile-customer-tag-remove"]').exists()).toBe(false)
  })

  it('disables mobile refresh and retry controls while the page is loading', async () => {
    mocks.mobileLayout.value = true
    const request = deferred<typeof rows>()
    mocks.getCustomerOverview.mockImplementationOnce(() => request.promise)
    const wrapper = mountPage()
    await nextTick()

    expect(wrapper.get('[data-testid="mobile-customer-refresh"]').attributes('disabled')).toBeDefined()
    const setupState = (wrapper.vm as unknown as { $: { setupState: { loadError: string; loading: boolean } } }).$.setupState
    setupState.loadError = '加载失败，请重试'
    await nextTick()
    expect(wrapper.get('[data-testid="mobile-customer-retry"]').attributes('disabled')).toBeDefined()
    request.resolve(rows)
    await flushPromises()
  })

  it('stages customer filters until apply, resets only selections, and keeps the selected sort in the mobile summary', async () => {
    mocks.mobileLayout.value = true
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-customer-filter-summary"] .mobile-filter-summary').trigger('click')
    const [customerSelect, sortSelect] = wrapper.findAllComponents(ElSelect)
    customerSelect.vm.$emit('update:modelValue', ['a'])
    sortSelect.vm.$emit('update:modelValue', 'sampleCount')
    wrapper.findAllComponents({ name: 'ElRadioGroup' })[0].vm.$emit('update:modelValue', 'asc')
    wrapper.findComponent(DrawerStub).vm.$emit('update:modelValue', false)
    await nextTick()

    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-customer-filter-summary"]').text()).toContain('最后检测时间')

    await wrapper.get('[data-testid="mobile-customer-filter-summary"] .mobile-filter-summary').trigger('click')
    const [draftCustomerSelect, draftSortSelect] = wrapper.findAllComponents(ElSelect)
    draftCustomerSelect.vm.$emit('update:modelValue', ['a'])
    draftSortSelect.vm.$emit('update:modelValue', 'sampleCount')
    wrapper.findAllComponents({ name: 'ElRadioGroup' })[0].vm.$emit('update:modelValue', 'asc')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')

    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-customer-filter-summary"]').text()).toContain('样品数量 · 升序')

    await wrapper.get('[data-testid="mobile-customer-filter-summary"] .mobile-filter-summary').trigger('click')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[0].trigger('click')
    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-customer-filter-summary"]').text()).toContain('样品数量 · 升序')
  })

  it('keeps selected customer keys after a failed mobile refresh and offers retry', async () => {
    mocks.mobileLayout.value = true
    mocks.getCustomerOverview.mockResolvedValueOnce(rows).mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(rows)
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('[data-testid="mobile-customer-filter-summary"] .mobile-filter-summary').trigger('click')
    const [customerSelect, sortSelect] = wrapper.findAllComponents(ElSelect)
    customerSelect.vm.$emit('update:modelValue', ['a'])
    sortSelect.vm.$emit('update:modelValue', 'sampleCount')
    wrapper.findAllComponents({ name: 'ElRadioGroup' })[0].vm.$emit('update:modelValue', 'asc')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    await wrapper.get('[data-testid="mobile-customer-refresh"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-customer-load-error"]').text()).toContain('加载失败')
    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(0)
    expect(wrapper.get('[data-testid="mobile-customer-filter-summary"]').text()).toContain('样品数量 · 升序')
    await wrapper.get('[data-testid="mobile-customer-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="mobile-customer-load-error"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-customer-filter-summary"]').text()).toContain('样品数量 · 升序')
  })

  it('renders mobile card contact, dates, sample count, and exact money precision', async () => {
    mocks.mobileLayout.value = true
    const wrapper = mountPage()
    await flushPromises()

    const card = customerCard(wrapper, '客户甲')
    expect(card.text()).toContain('13800000001 wx-a')
    expect(card.text()).toContain('3 个样品')
    expect(card.text()).toContain('2026-07-01')
    expect(card.text()).toContain('2026-07-03')
    expect(card.text()).toContain('¥60.00')
  })

  it('uses the mobile contact fallback when a customer row has no display contact', async () => {
    mocks.mobileLayout.value = true
    mocks.getCustomerOverview.mockResolvedValueOnce([
      { ...rows[0], customerDisplay: '' }
    ])
    const wrapper = mountPage()
    await flushPromises()

    expect(customerCard(wrapper, '客户甲').text()).toContain('暂无联系方式')
  })

  it('keeps an open detail tied to its customer key so a refresh shows current values and filtering it out closes it', async () => {
    mocks.mobileLayout.value = true
    const refreshedRows = rows.map((row) => row.customerKey === 'a'
      ? { ...row, totalAmount: 61.25, lastDetectionDate: '2026-07-05' }
      : row
    )
    mocks.getCustomerOverview.mockResolvedValueOnce(rows).mockResolvedValueOnce(refreshedRows)
    const wrapper = mountPage()
    await flushPromises()

    await customerCard(wrapper, '客户甲').get('button').trigger('click')
    expect(wrapper.get('.mobile-fullscreen-dialog').text()).toContain('¥60.00')

    await wrapper.get('[data-testid="mobile-customer-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.mobile-fullscreen-dialog').text()).toContain('¥61.25')
    expect(wrapper.get('.mobile-fullscreen-dialog').text()).toContain('2026-07-05')

    await wrapper.get('[data-testid="mobile-customer-filter-summary"] .mobile-filter-summary').trigger('click')
    wrapper.findAllComponents(ElSelect)[0].vm.$emit('update:modelValue', ['b'])
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(false)
  })

  it('closes a detail removed by reload or a mobile-to-desktop layout switch and can reopen a current row', async () => {
    mocks.mobileLayout.value = true
    mocks.getCustomerOverview.mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[1]])
    const wrapper = mountPage()
    await flushPromises()

    await customerCard(wrapper, '客户甲').get('button').trigger('click')
    await wrapper.get('[data-testid="mobile-customer-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(false)

    await customerCard(wrapper, '客户乙').get('button').trigger('click')
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(true)
    mocks.mobileLayout.value = false
    await nextTick()
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(false)

    mocks.mobileLayout.value = true
    await nextTick()
    await customerCard(wrapper, '客户乙').get('button').trigger('click')
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(true)
  })

  it('does not render the empty status behind an initial mobile load failure', async () => {
    mocks.mobileLayout.value = true
    mocks.getCustomerOverview.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-customer-load-error"]').attributes('role')).toBe('alert')
    expect(wrapper.find('.mobile-customer-overview-state.empty-text').exists()).toBe(false)
  })

  it('ignores a deferred customer success that settles after the page unmounts', async () => {
    mocks.mobileLayout.value = true
    const request = deferred<typeof rows>()
    mocks.getCustomerOverview.mockImplementationOnce(() => request.promise)
    const wrapper = mountPage()
    await nextTick()
    const setupState = (wrapper.vm as unknown as { $: { setupState: { rows: unknown[]; loading: boolean; loadError: string } } }).$.setupState

    wrapper.unmount()
    request.resolve(rows)
    await flushPromises()

    expect(setupState.rows).toEqual([])
    expect(setupState.loading).toBe(true)
    expect(setupState.loadError).toBe('')
  })

  it('ignores a deferred customer failure that settles after the page unmounts', async () => {
    mocks.mobileLayout.value = true
    const request = deferred<typeof rows>()
    mocks.getCustomerOverview.mockImplementationOnce(() => request.promise)
    const wrapper = mountPage()
    await nextTick()
    const setupState = (wrapper.vm as unknown as { $: { setupState: { rows: unknown[]; loading: boolean; loadError: string } } }).$.setupState

    wrapper.unmount()
    request.reject(new Error('late failure'))
    await flushPromises()

    expect(setupState.rows).toEqual([])
    expect(setupState.loading).toBe(true)
    expect(setupState.loadError).toBe('')
  })
})
