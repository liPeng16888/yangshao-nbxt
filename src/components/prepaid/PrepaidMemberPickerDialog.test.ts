import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import PrepaidMemberPickerDialog from './PrepaidMemberPickerDialog.vue'

const storeMocks = vi.hoisted(() => ({
  lookupLabMember: vi.fn()
}))

vi.mock('@/stores/sharedPrepaid', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/stores/sharedPrepaid')>(),
  useSharedPrepaidStore: () => ({ lookupLabMember: storeMocks.lookupLabMember })
}))

let pinia: ReturnType<typeof createPinia>

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['close'],
  template: '<section v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></section>'
})

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(PrepaidMemberPickerDialog, {
    props: {
      visible: true,
      initialPhone: '',
      initialAmount: null,
      ...props
    },
    global: {
      plugins: [pinia, ElementPlus],
      stubs: { ElDialog: DialogStub }
    }
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function setAccount(id: string) {
  const auth = useAuthStore(pinia)
  auth.token = `${id}-token`
  auth.user = {
    id, dataOwnerId: id, account: id, username: `账号 ${id}`, role: 'FRONTEND_USER',
    permissions: ['PREPAID_CONSUMPTIONS'], permissionVersion: 1,
    requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
  }
}

describe('PrepaidMemberPickerDialog', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] || null,
      get length() { return values.size }
    })
    pinia = createPinia()
    setActivePinia(pinia)
    setAccount('account-a')
    storeMocks.lookupLabMember.mockReset()
  })

  it('requires an exact phone lookup before showing balances and confirming one exact deduction', async () => {
    storeMocks.lookupLabMember.mockResolvedValue({ id: 'member-1', phone: '13800000000', currentBalance: 100 })
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="prepaid-member-phone"]').setValue('138')
    await wrapper.get('[data-testid="prepaid-member-search"]').trigger('click')
    expect(storeMocks.lookupLabMember).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入11位会员手机号')

    await wrapper.get('[data-testid="prepaid-member-phone"]').setValue('138 0000-0000')
    await wrapper.get('[data-testid="prepaid-member-search"]').trigger('click')
    await nextTick()

    expect(storeMocks.lookupLabMember).toHaveBeenCalledWith('13800000000')
    expect(wrapper.text()).toContain('当前余额')
    expect(wrapper.text()).toContain('¥100.00')

    await wrapper.get('[data-testid="prepaid-deduction-amount"] input').setValue('30.25')
    await nextTick()

    expect(wrapper.text()).toContain('扣除后余额')
    expect(wrapper.text()).toContain('¥69.75')
    expect(wrapper.text()).toContain('余额仅供参考')
    expect(wrapper.text()).toContain('扣除金额')
    expect(wrapper.text()).not.toContain('扣除次数')

    const confirm = wrapper.get('[data-testid="prepaid-member-confirm"]')
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([[
      { memberId: 'member-1', phone: '13800000000', amount: 30.25, currentBalance: 100 }
    ]])
  })

  it.each([
    '\u00a013800000000',
    '138\u200300000000',
    '13800000000\u00a0'
  ])('rejects Unicode whitespace without stripping it into a lookup phone %j', async (phone) => {
    const wrapper = mountDialog()

    await wrapper.get('[data-testid="prepaid-member-phone"]').setValue(phone)
    await wrapper.get('[data-testid="prepaid-member-search"]').trigger('click')
    await nextTick()

    expect(storeMocks.lookupLabMember).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入11位会员手机号')
  })

  it('disables confirmation when the exact two-decimal deduction exceeds the advisory balance', async () => {
    storeMocks.lookupLabMember.mockResolvedValue({ id: 'member-1', phone: '13800000000', currentBalance: 20 })
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 20.01 })
    await nextTick()
    await nextTick()

    expect(storeMocks.lookupLabMember).toHaveBeenCalledWith('13800000000')
    expect(wrapper.text()).toContain('余额不足')
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('keeps an ordinary same-session lookup failure visible', async () => {
    storeMocks.lookupLabMember.mockRejectedValue(new Error('lookup unavailable'))
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 10 })
    await flushPromises()

    expect(wrapper.text()).toContain('lookup unavailable')
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()
  })

  it('refreshes the current balance and clears stale hidden values before the next opening', async () => {
    storeMocks.lookupLabMember
      .mockResolvedValueOnce({ id: 'member-1', phone: '13800000000', currentBalance: 50 })
      .mockResolvedValueOnce({ id: 'member-1', phone: '13800000000', currentBalance: 40 })
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 10 })
    await nextTick()
    await nextTick()

    await wrapper.get('[data-testid="prepaid-member-refresh"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('¥40.00')

    await wrapper.setProps({ visible: false, initialPhone: '', initialAmount: null })
    await wrapper.setProps({ visible: true })
    await nextTick()

    expect((wrapper.get('[data-testid="prepaid-member-phone"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-testid="prepaid-deduction-amount"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('¥40.00')
  })

  it('ignores a pending lookup when the phone is edited before its response arrives', async () => {
    const pendingLookup = createDeferred<{ id: string; phone: string; currentBalance: number } | null>()
    storeMocks.lookupLabMember.mockReturnValue(pendingLookup.promise)
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 10 })
    await nextTick()

    await wrapper.get('[data-testid="prepaid-member-phone"]').setValue('13900000000')
    pendingLookup.resolve({ id: 'member-a', phone: '13800000000', currentBalance: 100 })
    await pendingLookup.promise
    await nextTick()

    expect((wrapper.get('[data-testid="prepaid-member-phone"]').element as HTMLInputElement).value)
      .toBe('13900000000')
    expect(wrapper.find('[data-testid="prepaid-deduction-amount"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()
  })

  it('ignores a pending lookup when the phone is cleared before its response arrives', async () => {
    const pendingLookup = createDeferred<{ id: string; phone: string; currentBalance: number } | null>()
    storeMocks.lookupLabMember.mockReturnValue(pendingLookup.promise)
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 10 })
    await nextTick()

    await wrapper.get('[data-testid="prepaid-member-phone"]').setValue('')
    pendingLookup.resolve({ id: 'member-a', phone: '13800000000', currentBalance: 100 })
    await pendingLookup.promise
    await nextTick()

    expect((wrapper.get('[data-testid="prepaid-member-phone"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-testid="prepaid-deduction-amount"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()
  })

  it('clears the mounted account-A draft and ignores its delayed lookup success after account B logs in', async () => {
    const pendingLookup = createDeferred<{ id: string; phone: string; currentBalance: number } | null>()
    storeMocks.lookupLabMember.mockReturnValue(pendingLookup.promise)
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 10 })
    await nextTick()
    expect(storeMocks.lookupLabMember).toHaveBeenCalledWith('13800000000')

    setAccount('account-b')
    await nextTick()

    expect((wrapper.get('[data-testid="prepaid-member-phone"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-testid="prepaid-deduction-amount"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()

    pendingLookup.resolve({ id: 'account-a-member', phone: '13800000000', currentBalance: 100 })
    await flushPromises()

    expect((wrapper.get('[data-testid="prepaid-member-phone"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).not.toContain('¥100.00')
    expect(wrapper.find('[data-testid="prepaid-deduction-amount"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()
  })

  it('clears the mounted account-A draft and ignores its delayed lookup failure after account B logs in', async () => {
    const pendingLookup = createDeferred<{ id: string; phone: string; currentBalance: number } | null>()
    storeMocks.lookupLabMember.mockReturnValue(pendingLookup.promise)
    const wrapper = mountDialog({ initialPhone: '13800000000', initialAmount: 10 })
    await nextTick()

    setAccount('account-b')
    await nextTick()
    pendingLookup.reject(new Error('account A lookup failed'))
    await flushPromises()

    expect((wrapper.get('[data-testid="prepaid-member-phone"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).not.toContain('account A lookup failed')
    expect(wrapper.find('[data-testid="prepaid-deduction-amount"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="prepaid-member-confirm"]').attributes('disabled')).toBeDefined()
  })
})
