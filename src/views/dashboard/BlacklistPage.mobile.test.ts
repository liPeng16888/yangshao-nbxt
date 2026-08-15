// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox, ElUpload } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import BlacklistPage from './BlacklistPage.vue'

const mocks = vi.hoisted(() => ({
  searchBlacklist: vi.fn(),
  createBlacklist: vi.fn(),
  deleteBlacklist: vi.fn(),
  updateBlacklist: vi.fn(),
  uploadImages: vi.fn(),
  mobileLayout: undefined as unknown as ReturnType<typeof ref<boolean>>,
  route: undefined as unknown as { query: { hit?: string | string[] } }
}))

vi.mock('@/api/blacklist', () => ({
  searchBlacklist: mocks.searchBlacklist,
  createBlacklist: mocks.createBlacklist,
  deleteBlacklist: mocks.deleteBlacklist,
  updateBlacklist: mocks.updateBlacklist
}))

vi.mock('@/api/upload', () => ({
  uploadImages: mocks.uploadImages
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.mobileLayout })
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route
}))

const records = [
  {
    id: 'blacklist-own',
    uploadedAt: '2026-08-15T08:30:00.000Z',
    uploadedBy: '当前账号',
    canManage: true,
    phone: '13800000001',
    wechat: 'wechat-own',
    wechatNickname: '张三',
    amount: 12.34,
    images: ['https://example.com/one.png'],
    other: '拒付检测费',
    note: '多次失联'
  },
  {
    id: 'blacklist-other',
    uploadedAt: '2026-08-14T07:20:00.000Z',
    uploadedBy: '当前账号',
    canManage: false,
    phone: '13800000002',
    wechat: 'wechat-other',
    wechatNickname: '李四',
    amount: 20,
    images: [],
    other: '欠款',
    note: '已提醒'
  }
]

const DrawerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="drawer-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

const DialogStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue', 'closed'],
  template: '<section v-if="modelValue" v-bind="$attrs" class="dialog-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

function mountPage(mobile = true) {
  mocks.mobileLayout.value = mobile
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.user = {
    id: 'frontend-1',
    username: '当前账号',
    account: 'front-1',
    role: 'FRONTEND_USER'
  }
  return mount(BlacklistPage, {
    global: {
      plugins: [pinia, ElementPlus],
      directives: { loading: {} },
      stubs: { ElDrawer: DrawerStub, ElDialog: DialogStub, teleport: true }
    }
  })
}

function card(wrapper: ReturnType<typeof mountPage>, id: string) {
  const found = wrapper.findAll('[data-testid="mobile-blacklist-card"]').find((candidate) => candidate.attributes('data-record-id') === id)
  if (!found) throw new Error(`Missing blacklist card ${id}`)
  return found
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

function freshRecords() {
  return records.map((row) => ({ ...row, images: [...row.images] }))
}

async function fillCreateForm(wrapper: ReturnType<typeof mountPage>) {
  await wrapper.get('[data-testid="blacklist-create-phone"]').setValue('13900000001')
  await wrapper.get('[data-testid="blacklist-create-wechat"]').setValue('new-wechat')
  await wrapper.get('[data-testid="blacklist-create-nickname"]').setValue('王五')
  await wrapper.get('[data-testid="blacklist-create-amount"]').setValue('45.67')
  await wrapper.get('[data-testid="blacklist-create-other"]').setValue('新增原因')
  await wrapper.get('[data-testid="blacklist-create-note"]').setValue('新增备注')
}

describe('BlacklistPage mobile', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear())
    })
    mocks.searchBlacklist.mockReset().mockImplementation(async () => freshRecords())
    mocks.createBlacklist.mockReset()
    mocks.deleteBlacklist.mockReset()
    mocks.updateBlacklist.mockReset()
    mocks.uploadImages.mockReset().mockResolvedValue(['/uploads/persisted-blacklist.png'])
    mocks.mobileLayout = ref(true)
    mocks.route = reactive({ query: {} })
    vi.spyOn(ElMessageBox, 'confirm').mockReset().mockResolvedValue('confirm' as never)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn().mockReturnValue('blob:blacklist-image') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  })

  it('renders complete mobile cards and create form without desktop controls or secondary navigation', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-blacklist-card"]')).toHaveLength(records.length)
    const own = card(wrapper, 'blacklist-own')
    await own.get('[data-testid="mobile-blacklist-toggle"]').trigger('click')
    expect(own.text()).toContain('张三')
    expect(own.text()).toContain('13800000001')
    expect(own.text()).toContain('wechat-own')
    expect(own.text()).toContain('命中原因')
    expect(own.text()).toContain('多次失联')
    expect(own.text()).toContain('状态')
    expect(own.text()).toContain('黑名单记录')
    expect(own.text()).toContain('¥12.34')
    expect(own.text()).toContain('当前账号')
    expect(own.text()).toContain('2026')
    expect(own.findComponent({ name: 'BlacklistImagePreview' }).exists()).toBe(true)
    expect(wrapper.get('[data-testid="mobile-blacklist-create"]').element).toBeTruthy()
    expect(wrapper.find('.blacklist-table').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'BlacklistUploadForm' }).exists()).toBe(false)
    expect(wrapper.find('.mobile-secondary-nav').exists()).toBe(false)
  })

  it('uses the desktop table and existing upload form exclusively after a layout switch', async () => {
    const wrapper = mountPage()
    await flushPromises()
    mocks.mobileLayout.value = false
    await nextTick()

    expect(wrapper.find('.blacklist-table').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'BlacklistUploadForm' }).exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-blacklist-card"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-blacklist-create"]').exists()).toBe(false)
  })

  it('keeps management actions restricted to records uploaded by the current account', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(card(wrapper, 'blacklist-own').find('[data-testid="supplement-blacklist-own"]').exists()).toBe(true)
    expect(card(wrapper, 'blacklist-own').find('[data-testid="delete-blacklist-own"]').exists()).toBe(true)
    expect(card(wrapper, 'blacklist-other').text()).toContain('仅查看')
    expect(card(wrapper, 'blacklist-other').find('[data-testid="delete-blacklist-other"]').exists()).toBe(false)
  })

  it('stages a 44px search drawer and retains the applied keyword when loading fails', async () => {
    mocks.searchBlacklist.mockResolvedValueOnce(records).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([records[0]])
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('.mobile-filter-summary').trigger('click')
    const input = wrapper.get('[data-testid="mobile-blacklist-keyword"]')
    expect(getComputedStyle(input.element).minHeight).toBe('44px')
    await input.setValue('张三')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    await flushPromises()

    expect(mocks.searchBlacklist.mock.calls.at(-1)?.[0]).toBe('张三')
    expect(wrapper.get('[data-testid="mobile-blacklist-filter-summary"]').text()).toContain('张三')
    expect(wrapper.get('[data-testid="mobile-blacklist-load-error"]').text()).toContain('加载失败')

    await wrapper.get('[data-testid="mobile-blacklist-retry"]').trigger('click')
    await flushPromises()
    expect(mocks.searchBlacklist.mock.calls.at(-1)?.[0]).toBe('张三')
    expect(wrapper.findAll('[data-testid="mobile-blacklist-card"]')).toHaveLength(1)

    mocks.route.query.hit = 'blacklist-other'
    await flushPromises()
    expect(mocks.searchBlacklist.mock.calls.at(-1)?.[0]).toBe('')
    expect(card(wrapper, 'blacklist-other').classes()).toContain('mobile-blacklist-card--highlight')
  })

  it('matches hit ids exactly, expands and scrolls the card after render, and handles route changes safely', async () => {
    mocks.route.query.hit = 'blacklist-own'
    const wrapper = mountPage()
    await flushPromises()

    expect(card(wrapper, 'blacklist-own').classes()).toContain('mobile-blacklist-card--highlight')
    expect(card(wrapper, 'blacklist-own').classes()).toContain('mobile-record-card--expanded')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1)

    await wrapper.get('.mobile-filter-summary').trigger('click')
    await wrapper.findAll('.mobile-filter-drawer__actions button')[1].trigger('click')
    await flushPromises()
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1)

    mocks.route.query.hit = 'blacklist-other'
    await flushPromises()
    expect(card(wrapper, 'blacklist-other').classes()).toContain('mobile-blacklist-card--highlight')
    expect(card(wrapper, 'blacklist-own').classes()).not.toContain('mobile-blacklist-card--highlight')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(2)

    mocks.route.query.hit = 'blacklist-own\"] .not-a-selector'
    await flushPromises()
    expect(wrapper.find('.mobile-blacklist-card--highlight').exists()).toBe(false)
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(2)

    mocks.mobileLayout.value = false
    await nextTick()
    mocks.route.query.hit = 'blacklist-own'
    await flushPromises()
    mocks.mobileLayout.value = true
    await flushPromises()
    expect(card(wrapper, 'blacklist-own').classes()).toContain('mobile-blacklist-card--highlight')
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(3)

    delete mocks.route.query.hit
    await flushPromises()
    expect(wrapper.find('.mobile-blacklist-card--highlight').exists()).toBe(false)
  })

  it('awaits create, locks duplicate submits, retains every field and image on failure, and clears only after success', async () => {
    const firstSave = deferred<(typeof records)[number]>()
    mocks.createBlacklist.mockImplementationOnce(() => firstSave.promise)
    const wrapper = mountPage()
    await flushPromises()
    await fillCreateForm(wrapper)

    const create = wrapper.get('[data-testid="mobile-blacklist-create"]')
    const upload = create.findComponent(ElUpload)
    const image = new File(['image'], 'evidence.png', { type: 'image/png' })
    await (upload.props('onChange') as Function)({ name: image.name, raw: image }, [{ name: image.name, raw: image }])
    expect(create.get('[data-testid="blacklist-create-image-count"]').text()).toContain('1')

    await create.get('[data-testid="blacklist-create-save"]').trigger('click')
    await create.get('[data-testid="blacklist-create-save"]').trigger('click')
    expect(mocks.createBlacklist).toHaveBeenCalledTimes(1)
    firstSave.reject(new Error('save failed'))
    await flushPromises()

    expect((create.get('[data-testid="blacklist-create-phone"]').element as HTMLInputElement).value).toBe('13900000001')
    expect((create.get('[data-testid="blacklist-create-wechat"]').element as HTMLInputElement).value).toBe('new-wechat')
    expect((create.get('[data-testid="blacklist-create-nickname"]').element as HTMLInputElement).value).toBe('王五')
    expect((create.get('[data-testid="blacklist-create-amount"]').element as HTMLInputElement).value).toBe('45.67')
    expect((create.get('[data-testid="blacklist-create-other"]').element as HTMLInputElement).value).toBe('新增原因')
    expect((create.get('[data-testid="blacklist-create-note"]').element as HTMLTextAreaElement).value).toBe('新增备注')
    expect(create.get('[data-testid="blacklist-create-image-count"]').text()).toContain('1')

    mocks.createBlacklist.mockResolvedValueOnce({
      ...records[0], id: 'created', phone: '13900000001', images: ['/uploads/persisted-blacklist.png']
    })
    await create.get('[data-testid="blacklist-create-save"]').trigger('click')
    await flushPromises()

    expect(mocks.createBlacklist).toHaveBeenLastCalledWith({
      phone: '13900000001',
      wechat: 'new-wechat',
      wechatNickname: '王五',
      amount: 45.67,
      images: ['/uploads/persisted-blacklist.png'],
      other: '新增原因',
      note: '新增备注'
    })
    expect(mocks.uploadImages).toHaveBeenCalledTimes(1)
    expect(mocks.uploadImages).toHaveBeenCalledWith([image])
    expect((create.get('[data-testid="blacklist-create-phone"]').element as HTMLInputElement).value).toBe('')
    expect(create.get('[data-testid="blacklist-create-image-count"]').text()).toContain('0')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:blacklist-image')
  })

  it('uses decimal money input and keeps valid images when an invalid or excess selection is rejected', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const create = wrapper.get('[data-testid="mobile-blacklist-create"]')
    const amount = create.get('[data-testid="blacklist-create-amount"]')
    expect(amount.attributes('inputmode')).toBe('decimal')
    expect(amount.attributes('step')).toBe('0.01')
    const upload = create.findComponent(ElUpload)
    const onChange = upload.props('onChange') as Function
    const first = new File(['one'], 'one.png', { type: 'image/png' })
    const invalid = new File(['bad'], 'bad.txt', { type: 'text/plain' })
    const svg = new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })
    await onChange({ name: first.name, raw: first }, [{ name: first.name, raw: first }])
    await onChange({ name: invalid.name, raw: invalid }, [{ name: first.name, raw: first, url: 'blob:blacklist-image' }, { name: invalid.name, raw: invalid }])
    await onChange({ name: svg.name, raw: svg }, [{ name: first.name, raw: first, url: 'blob:blacklist-image' }, { name: svg.name, raw: svg }])
    await onChange({ name: oversized.name, raw: oversized }, [{ name: first.name, raw: first, url: 'blob:blacklist-image' }, { name: oversized.name, raw: oversized }])
    expect(create.get('[data-testid="blacklist-create-image-count"]').text()).toContain('1')

    const second = new File(['two'], 'two.png', { type: 'image/png' })
    const third = new File(['three'], 'three.png', { type: 'image/png' })
    await onChange({ name: second.name, raw: second }, [
      { name: first.name, raw: first, url: 'blob:blacklist-image' },
      { name: second.name, raw: second }
    ])
    await (upload.props('onExceed') as Function)([{ name: third.name, raw: third }], [])
    expect(create.get('[data-testid="blacklist-create-image-count"]').text()).toContain('2')
  })

  it.each(['-1', '1.999'])('rejects invalid create amount %s before upload or save', async (amountValue) => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('[data-testid="blacklist-create-phone"]').setValue('13900000001')
    await wrapper.get('[data-testid="blacklist-create-amount"]').setValue(amountValue)
    await wrapper.get('[data-testid="blacklist-create-save"]').trigger('click')
    await flushPromises()

    expect(mocks.uploadImages).not.toHaveBeenCalled()
    expect(mocks.createBlacklist).not.toHaveBeenCalled()
  })

  it('uses one mobile fullscreen supplement form, retains failed edits, then resets after a successful save', async () => {
    mocks.route.query.hit = 'blacklist-own'
    mocks.updateBlacklist.mockRejectedValueOnce(new Error('update failed'))
    const wrapper = mountPage()
    await flushPromises()
    await card(wrapper, 'blacklist-own').get('[data-testid="supplement-blacklist-own"]').trigger('click')

    const dialog = wrapper.get('.mobile-fullscreen-dialog')
    expect(dialog.classes()).toContain('mobile-fullscreen-dialog--active')
    await dialog.get('[data-testid="blacklist-supplement-phone"]').setValue('13700000000')
    await dialog.get('[data-testid="blacklist-supplement-note"]').setValue('补充备注')
    await dialog.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    await flushPromises()

    expect((dialog.get('[data-testid="blacklist-supplement-phone"]').element as HTMLInputElement).value).toBe('13700000000')
    expect((dialog.get('[data-testid="blacklist-supplement-note"]').element as HTMLTextAreaElement).value).toBe('补充备注')
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(true)

    mocks.updateBlacklist.mockResolvedValueOnce({ ...records[0], phone: '13700000000', note: '补充备注' })
    await dialog.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    await flushPromises()
    expect(mocks.updateBlacklist).toHaveBeenLastCalledWith('blacklist-own', expect.objectContaining({ phone: '13700000000', note: '补充备注' }))
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(false)
  })

  it('enforces two supplement images across existing and new files and locks duplicate saves without losing the draft', async () => {
    const update = deferred<(typeof records)[number]>()
    mocks.updateBlacklist.mockImplementationOnce(() => update.promise)
    const wrapper = mountPage()
    await flushPromises()
    await card(wrapper, 'blacklist-own').get('[data-testid="supplement-blacklist-own"]').trigger('click')
    const dialog = wrapper.get('.mobile-fullscreen-dialog')
    const upload = dialog.findComponent(ElUpload)
    const svg = new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })
    await (upload.props('onChange') as Function)({ name: svg.name, raw: svg }, [
      { name: 'existing', url: 'https://example.com/one.png' },
      { name: svg.name, raw: svg }
    ])
    await (upload.props('onChange') as Function)({ name: oversized.name, raw: oversized }, [
      { name: 'existing', url: 'https://example.com/one.png' },
      { name: oversized.name, raw: oversized }
    ])
    expect(dialog.text()).toContain('已选 1 / 2 张')
    const added = new File(['new'], 'new.png', { type: 'image/png' })
    await (upload.props('onChange') as Function)({ name: added.name, raw: added }, [
      { name: 'existing', url: 'https://example.com/one.png' },
      { name: added.name, raw: added }
    ])
    expect(dialog.text()).toContain('已选 2 / 2 张')
    await (upload.props('onExceed') as Function)([new File(['third'], 'third.png', { type: 'image/png' })], [])
    expect(dialog.text()).toContain('已选 2 / 2 张')

    await dialog.get('[data-testid="blacklist-supplement-note"]').setValue('在途保留')
    await dialog.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    await dialog.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    expect(mocks.updateBlacklist).toHaveBeenCalledTimes(1)
    expect(mocks.updateBlacklist).toHaveBeenCalledWith('blacklist-own', expect.objectContaining({
      images: ['https://example.com/one.png', '/uploads/persisted-blacklist.png'], note: '在途保留'
    }))
    expect(mocks.uploadImages).toHaveBeenCalledWith([added])
    update.reject(new Error('update failed'))
    await flushPromises()
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(true)
    expect(dialog.text()).toContain('已选 2 / 2 张')
    expect((dialog.get('[data-testid="blacklist-supplement-note"]').element as HTMLTextAreaElement).value).toBe('在途保留')

    mocks.updateBlacklist.mockResolvedValueOnce({ ...records[0], images: ['https://example.com/one.png', '/uploads/persisted-blacklist.png'], note: '在途保留' })
    await dialog.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    await flushPromises()
    expect(mocks.uploadImages).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(false)
  })

  it('resets supplement edits on cancel and closes the active dialog when the layout changes', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await card(wrapper, 'blacklist-own').get('[data-testid="supplement-blacklist-own"]').trigger('click')
    await wrapper.get('[data-testid="blacklist-supplement-phone"]').setValue('10086')
    await wrapper.get('.mobile-fullscreen-dialog__cancel').trigger('click')
    await nextTick()
    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(false)

    await card(wrapper, 'blacklist-own').get('[data-testid="supplement-blacklist-own"]').trigger('click')
    expect((wrapper.get('[data-testid="blacklist-supplement-phone"]').element as HTMLInputElement).value).toBe('13800000001')
    mocks.mobileLayout.value = false
    await nextTick()
    expect(wrapper.find('.dialog-stub').exists()).toBe(false)
  })

  it('retains an in-flight create draft and raw image when the layout changes before rejection', async () => {
    const request = deferred<(typeof records)[number]>()
    mocks.createBlacklist.mockImplementationOnce(() => request.promise)
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('[data-testid="blacklist-create-phone"]').setValue('13900000009')
    const create = wrapper.get('[data-testid="mobile-blacklist-create"]')
    const upload = create.findComponent(ElUpload)
    const image = new File(['png'], 'layout.png', { type: 'image/png' })
    await (upload.props('onChange') as Function)({ name: image.name, raw: image }, [{ name: image.name, raw: image }])
    await create.get('[data-testid="blacklist-create-save"]').trigger('click')
    expect(create.get('[data-testid="blacklist-create-phone"]').attributes('disabled')).toBeDefined()

    mocks.mobileLayout.value = false
    await nextTick()
    request.reject(new Error('offline'))
    await flushPromises()
    mocks.mobileLayout.value = true
    await nextTick()

    const restored = wrapper.get('[data-testid="mobile-blacklist-create"]')
    expect((restored.get('[data-testid="blacklist-create-phone"]').element as HTMLInputElement).value).toBe('13900000009')
    expect(restored.get('[data-testid="blacklist-create-image-count"]').text()).toContain('1')
  })

  it('keeps a pending supplement draft open across a layout change and rejection', async () => {
    const request = deferred<(typeof records)[number]>()
    mocks.updateBlacklist.mockImplementationOnce(() => request.promise)
    const wrapper = mountPage()
    await flushPromises()
    await card(wrapper, 'blacklist-own').get('[data-testid="supplement-blacklist-own"]').trigger('click')
    await wrapper.get('[data-testid="blacklist-supplement-note"]').setValue('跨布局保留')
    await wrapper.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    await nextTick()

    mocks.mobileLayout.value = false
    await nextTick()
    expect(wrapper.find('.dialog-stub').exists()).toBe(true)
    request.reject(new Error('offline'))
    await flushPromises()
    mocks.mobileLayout.value = true
    await nextTick()

    expect(wrapper.find('.mobile-fullscreen-dialog').exists()).toBe(true)
    expect((wrapper.get('[data-testid="blacklist-supplement-note"]').element as HTMLTextAreaElement).value).toBe('跨布局保留')
  })

  it('uses the same nullable decimal amount contract when a mobile supplement clears an existing amount', async () => {
    mocks.updateBlacklist.mockResolvedValueOnce({ ...records[0], amount: undefined })
    const wrapper = mountPage()
    await flushPromises()
    await card(wrapper, 'blacklist-own').get('[data-testid="supplement-blacklist-own"]').trigger('click')
    await wrapper.get('[data-testid="blacklist-supplement-amount"]').setValue('')
    await wrapper.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    await flushPromises()

    expect(mocks.updateBlacklist).toHaveBeenCalledWith('blacklist-own', expect.objectContaining({ amount: null }))
  })

  it.each(['-1', '1.999'])('rejects invalid supplement amount %s before upload or save', async (amountValue) => {
    const wrapper = mountPage()
    await flushPromises()
    await card(wrapper, 'blacklist-own').get('[data-testid="supplement-blacklist-own"]').trigger('click')
    await wrapper.get('[data-testid="blacklist-supplement-amount"]').setValue(amountValue)
    await wrapper.get('.mobile-fullscreen-dialog__confirm').trigger('click')
    await flushPromises()

    expect(mocks.uploadImages).not.toHaveBeenCalled()
    expect(mocks.updateBlacklist).not.toHaveBeenCalled()
  })

  it('does not apply or report a load that settles after the page is unmounted', async () => {
    const request = deferred<typeof records>()
    mocks.searchBlacklist.mockImplementationOnce(() => request.promise)
    const wrapper = mountPage()
    const store = (wrapper.vm as unknown as { $: { setupState: { blacklistStore: { records: unknown[] }; loadError: string } } }).$.setupState
    await nextTick()

    wrapper.unmount()
    request.resolve(records)
    await flushPromises()

    expect(store.blacklistStore.records).toEqual([])
    expect(store.loadError).toBe('')
  })

  it('confirms the exact record once and never removes it when deletion fails', async () => {
    const firstDelete = deferred<(typeof records)[number]>()
    mocks.deleteBlacklist.mockImplementationOnce(() => firstDelete.promise)
    const wrapper = mountPage()
    await flushPromises()
    const deleteButton = card(wrapper, 'blacklist-own').get('[data-testid="delete-blacklist-own"]')
    await deleteButton.trigger('click')
    await deleteButton.trigger('click')

    expect(ElMessageBox.confirm).toHaveBeenCalledWith('确认删除这条黑名单记录？删除后不可恢复。', '删除黑名单', expect.objectContaining({ confirmButtonText: '删除' }))
    expect(mocks.deleteBlacklist).toHaveBeenCalledTimes(1)
    firstDelete.reject(new Error('delete failed'))
    await flushPromises()
    expect(card(wrapper, 'blacklist-own').exists()).toBe(true)

    mocks.deleteBlacklist.mockResolvedValueOnce(records[0])
    await card(wrapper, 'blacklist-own').get('[data-testid="delete-blacklist-own"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="mobile-blacklist-card"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('李四')
  })
})
