// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox, ElUpload } from 'element-plus'
import { defineComponent, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MobileFinanceEntryForm from '@/components/finance/MobileFinanceEntryForm.vue'
import MobileFinanceEntryList from '@/components/finance/MobileFinanceEntryList.vue'
import type { FinanceEntry, FinancePayload } from '@/types/finance'
import FinancePage from './FinancePage.vue'

const mocks = vi.hoisted(() => ({
  mobileLayout: undefined as unknown as ReturnType<typeof ref<boolean>>,
  financeStore: undefined as any,
  uploadImages: vi.fn()
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.mobileLayout })
}))

vi.mock('@/stores/finance', () => ({
  useFinanceStore: () => mocks.financeStore
}))

vi.mock('@/api/upload', () => ({ uploadImages: mocks.uploadImages }))

const entries: FinanceEntry[] = [
  {
    id: 'expense-1', paymentDate: '2026-08-15', item: '标准物质', amount: 12.34, paymentMethod: 'cash',
    screenshotUrl: 'https://example.com/receipt-1.png', screenshotUrls: ['https://example.com/receipt-1.png'], remark: '当日领用'
  },
  {
    id: 'expense-2', paymentDate: '2026-08-14', item: '快递费', amount: 8, paymentMethod: 'online', screenshotUrls: [],
    deleteRequestId: 'request-2', deleteRequestStatus: 'PENDING'
  }
]

const DrawerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="drawer-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

const ImageStub = defineComponent({
  props: { src: String, previewSrcList: Array },
  template: '<img class="image-stub" :src="src" :data-preview-count="previewSrcList?.length" />'
})

function mountOptions() {
  return {
    global: {
      plugins: [ElementPlus],
      stubs: { ElDrawer: DrawerStub, ElImage: ImageStub, teleport: true }
    }
  }
}

function mountPage(mobile = true) {
  mocks.mobileLayout.value = mobile
  return mount(FinancePage, mountOptions())
}

function mountForm(save: (payloads: FinancePayload[]) => Promise<void> = async () => undefined) {
  return mount(MobileFinanceEntryForm, { props: { save }, ...mountOptions() })
}

function draftCard(wrapper: ReturnType<typeof mountForm>, index = 0) {
  return wrapper.findAll('[data-testid="mobile-expense-draft-card"]')[index]
}

async function fillDraft(wrapper: ReturnType<typeof mountForm>, values = { item: '标准物质', amount: '12.34', method: 'cash' }) {
  const card = draftCard(wrapper)
  await card.get('[data-testid="mobile-expense-item"]').setValue(values.item)
  await card.get('[data-testid="mobile-expense-amount"]').setValue(values.amount)
  await card.get('[data-testid="mobile-expense-payment-method"]').setValue(values.method)
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

describe('FinancePage mobile', () => {
  beforeEach(() => {
    mocks.mobileLayout = ref(true)
    mocks.financeStore = {
      month: '2026-08',
      entries: entries.map((row) => ({ ...row, screenshotUrls: [...(row.screenshotUrls || [])] })),
      loading: false,
      deletingId: '',
      loadEntries: vi.fn(async () => undefined),
      addEntries: vi.fn(async () => undefined),
      requestEntryDeletion: vi.fn(async () => undefined)
    }
    mocks.uploadImages.mockReset().mockImplementation(async (files: File[]) => files.map((file) => `/uploads/${file.name}`))
    vi.spyOn(ElMessageBox, 'prompt').mockReset().mockResolvedValue({ value: '重复录入' } as never)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file: File) => `blob:finance-${file.name}`)
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  it('mounts mutually exclusive mobile form/cards and keeps the desktop form/table for desktop layout', async () => {
    const wrapper = mountPage(true)
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-finance-entry-form"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="mobile-expense-draft-card"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="mobile-expense-card"]')).toHaveLength(entries.length)
    expect(wrapper.find('.expense-entry-table').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'FinanceEntryForm' }).exists()).toBe(false)

    mocks.mobileLayout.value = false
    await nextTick()
    expect(wrapper.find('.expense-entry-table').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'FinanceEntryForm' }).exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-finance-entry-form"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-expense-card"]').exists()).toBe(false)
  })

  it('adds and removes draft cards while preserving one row and exposes mobile decimal/touch inputs', async () => {
    const wrapper = mountForm()
    await wrapper.get('[data-testid="mobile-finance-add-count"]').setValue('2')
    await wrapper.get('[data-testid="mobile-finance-add-rows"]').trigger('click')
    expect(wrapper.findAll('[data-testid="mobile-expense-draft-card"]')).toHaveLength(3)

    await draftCard(wrapper, 2).get('[data-testid="mobile-expense-remove"]').trigger('click')
    await draftCard(wrapper, 1).get('[data-testid="mobile-expense-remove"]').trigger('click')
    expect(wrapper.findAll('[data-testid="mobile-expense-draft-card"]')).toHaveLength(1)
    expect(draftCard(wrapper).get('[data-testid="mobile-expense-remove"]').attributes('disabled')).toBeDefined()
    const amount = draftCard(wrapper).get('[data-testid="mobile-expense-amount"]')
    expect(amount.attributes()).toMatchObject({ type: 'number', inputmode: 'decimal', step: '0.01' })
    expect(getComputedStyle(wrapper.get('[data-testid="mobile-finance-save"]').element).minHeight).toBe('44px')
  })

  it('rejects missing item, non-positive amount, and missing payment method before save', async () => {
    const save = vi.fn(async () => undefined)
    const wrapper = mountForm(save)
    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    await fillDraft(wrapper, { item: '试剂', amount: '0', method: '' })
    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    await fillDraft(wrapper, { item: '试剂', amount: '1.25', method: '' })
    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    expect(save).not.toHaveBeenCalled()
  })

  it('awaits parent save, guards duplicate submits, and does not erase newer edits after a successful older snapshot', async () => {
    const pending = deferred<void>()
    const save = vi.fn((_payloads: FinancePayload[]) => pending.promise)
    const wrapper = mountForm(save)
    await fillDraft(wrapper)

    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual([expect.objectContaining({ item: '标准物质', amount: 12.34, paymentMethod: 'cash' })])

    await draftCard(wrapper).get('[data-testid="mobile-expense-item"]').setValue('用户继续编辑')
    pending.resolve()
    await flushPromises()
    expect(draftCard(wrapper).get('[data-testid="mobile-expense-item"]').element).toHaveProperty('value', '用户继续编辑')
    expect(wrapper.get('[data-testid="mobile-finance-save"]').attributes('disabled')).toBeUndefined()
  })

  it('retains the draft on rejection and resets an unchanged successful draft to exactly one row', async () => {
    const save = vi.fn((_payloads: FinancePayload[]) => Promise.resolve())
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    const wrapper = mountForm(save)
    await fillDraft(wrapper)
    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    await flushPromises()
    expect(draftCard(wrapper).get('[data-testid="mobile-expense-item"]').element).toHaveProperty('value', '标准物质')

    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="mobile-expense-draft-card"]')).toHaveLength(1)
    expect(draftCard(wrapper).get('[data-testid="mobile-expense-item"]').element).toHaveProperty('value', '')
  })

  it('previews at most ten screenshots and revokes owned blob URLs on removal and unmount', async () => {
    const wrapper = mountForm()
    const upload = draftCard(wrapper).findComponent(ElUpload)
    const files = Array.from({ length: 10 }, (_, index) => {
      const raw = new File([String(index)], `receipt-${index}.png`, { type: 'image/png' })
      return { name: raw.name, uid: index + 1, raw }
    })
    await (upload.props('onChange') as Function)(files[0], files)
    await nextTick()
    expect(draftCard(wrapper).get('[data-testid="mobile-expense-image-count"]').text()).toContain('10 / 10')
    expect(draftCard(wrapper).findAll('.el-upload-list__item')).toHaveLength(10)

    await (upload.props('onExceed') as Function)([new File(['11'], 'receipt-11.png', { type: 'image/png' })], files)
    await (upload.props('onRemove') as Function)(files[0], files.slice(1))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:finance-receipt-0.png')
    wrapper.unmount()
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining(
      files.map((file) => `blob:finance-${file.name}`)
    ))
  })

  it('does not deliver a late uploaded payload after the mobile form unmounts', async () => {
    const uploadPending = deferred<string[]>()
    mocks.uploadImages.mockReturnValueOnce(uploadPending.promise)
    const save = vi.fn(async (_payloads: FinancePayload[]) => undefined)
    const wrapper = mountForm(save)
    await fillDraft(wrapper)
    const raw = new File(['receipt'], 'late.png', { type: 'image/png' })
    const upload = draftCard(wrapper).findComponent(ElUpload)
    await (upload.props('onChange') as Function)({ name: raw.name, uid: 1, raw }, [{ name: raw.name, uid: 1, raw }])
    await wrapper.get('[data-testid="mobile-finance-save"]').trigger('click')
    expect(mocks.uploadImages).toHaveBeenCalledWith([raw])

    wrapper.unmount()
    uploadPending.resolve(['/uploads/late.png'])
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:finance-late.png')
  })

  it('uses a month drawer, screenshot preview, pending badge, and reason-confirmed delete request', async () => {
    const wrapper = mountPage(true)
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-finance-month-summary"]').text()).toContain('2026-08')
    await wrapper.get('[data-testid="mobile-finance-month-summary"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-finance-month-input"]').setValue('2026-07')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    expect(mocks.financeStore.loadEntries).toHaveBeenLastCalledWith('2026-07')

    const cards = wrapper.findAll('[data-testid="mobile-expense-card"]')
    expect(cards[0].find('img.image-stub').attributes()).toMatchObject({ src: 'https://example.com/receipt-1.png', 'data-preview-count': '1' })
    expect(cards[1].text()).toContain('删除待审核')
    expect(cards[1].find('[data-testid="mobile-expense-delete"]').exists()).toBe(false)

    await cards[0].get('[data-testid="mobile-expense-delete"]').trigger('click')
    await flushPromises()
    expect(ElMessageBox.prompt).toHaveBeenCalled()
    expect(mocks.financeStore.requestEntryDeletion).toHaveBeenCalledWith(expect.objectContaining({ id: 'expense-1' }), '重复录入')
  })

  it('emits the selected month and the exact expense row from the mobile list contract', async () => {
    const wrapper = mount(MobileFinanceEntryList, {
      props: { month: '2026-08', entries, loading: false, deletingId: '' },
      ...mountOptions()
    })
    await wrapper.get('[data-testid="mobile-finance-month-summary"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-finance-month-input"]').setValue('2026-06')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    await wrapper.findAll('[data-testid="mobile-expense-card"]')[0].get('[data-testid="mobile-expense-delete"]').trigger('click')
    expect(wrapper.emitted('monthChange')).toEqual([['2026-06']])
    expect(wrapper.emitted('deleteRequest')).toEqual([[entries[0]]])
  })
})
