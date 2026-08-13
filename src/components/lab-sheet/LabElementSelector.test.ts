// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError } from 'axios'
import ElementPlus, { ElMessage } from 'element-plus'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthUser } from '@/types/auth'
import type { FrontendPreferenceRecord } from '@/types/frontendPreference'
import { useAuthStore } from '@/stores/auth'
import { useFrontendPreferencesStore } from '@/stores/frontendPreferences'
import { writeFrontendPreferenceCache } from '@/utils/frontendPreferenceCache'
import LabElementSelector from './LabElementSelector.vue'

const api = vi.hoisted(() => ({
  listFrontendPreferences: vi.fn(),
  saveFrontendPreference: vi.fn()
}))

vi.mock('@/api/frontendPreferences', () => api)

type ElementGroup = {
  id: string
  name: string
  elementKeys: Array<'aluminum' | 'silicon' | 'iron'>
}

const PopoverStub = defineComponent({
  name: 'ElPopover',
  props: { visible: Boolean },
  emits: ['update:visible'],
  setup(props, { emit, slots }) {
    return () => h('div', { onClick: () => emit('update:visible', true) }, [
      slots.reference?.(),
      props.visible ? slots.default?.() : null
    ])
  }
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}

function user(): AuthUser {
  return {
    id: 'main-1',
    account: 'main-1',
    username: '主账号',
    role: 'FRONTEND_USER',
    dataOwnerId: 'main-1',
    isFrontendMainAccount: true,
    isFrontendSubAccount: false,
    permissions: [],
    permissionVersion: 1
  }
}

function record(value: ElementGroup[], version = 1): FrontendPreferenceRecord<ElementGroup[]> {
  return {
    section: 'LAB_ELEMENT_GROUPS',
    value,
    version,
    updatedAt: '2026-08-13T00:00:00.000Z',
    updatedBy: { id: 'main-1', username: '主账号' }
  }
}

function installGroups(value: ElementGroup[]) {
  writeFrontendPreferenceCache({ ownerId: 'main-1', section: 'LAB_ELEMENT_GROUPS', server: record(value) })
}

function mountSelector(pinia: Pinia, modelValue: string) {
  return mount(LabElementSelector, {
    attachTo: document.body,
    props: { modelValue },
    global: {
      plugins: [pinia, ElementPlus],
      stubs: {
        ElPopover: PopoverStub,
        ElCheckboxGroup: { template: '<div><slot /></div>' },
        ElCheckbox: { template: '<label><slot /></label>' }
      }
    }
  })
}

async function openSelector(wrapper: VueWrapper) {
  await wrapper.find('.lab-element-selector__trigger').trigger('click')
  await flushPromises()
}

function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((candidate) => candidate.text().includes(text))
  if (!found) throw new Error(`Button not found: ${text}`)
  return found
}

async function enterGroupName(wrapper: VueWrapper, name: string) {
  await wrapper.find('.element-picker__create input').setValue(name)
}

describe('LabElementSelector shared common groups', () => {
  let pinia: Pinia

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
    pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore(pinia).user = user()
    api.listFrontendPreferences.mockReset()
    api.saveFrontendPreference.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('shows owner groups and updates only the selector for the clicked sample', async () => {
    installGroups([{ id: 'group-1', name: '铝硅铁', elementKeys: ['aluminum', 'silicon', 'iron'] }])
    const first = mountSelector(pinia, '碳')
    const second = mountSelector(pinia, '硫')

    await openSelector(first)
    expect(first.text()).toContain('铝硅铁')
    expect(first.text()).toContain('铝、硅、铁')

    await button(first, '铝硅铁').trigger('click')

    expect(first.emitted('update:modelValue')).toContainEqual(['铝、硅、铁'])
    expect(second.emitted('update:modelValue')).toBeUndefined()
    expect(second.props('modelValue')).toBe('硫')
  })

  it('serializes rapid saves and sends a normalized catalogue copy', async () => {
    installGroups([{ id: 'group-1', name: '旧组合', elementKeys: ['iron', 'iron'] }])
    const wrapper = mountSelector(pinia, '铝、硅、铁')
    await openSelector(wrapper)
    await enterGroupName(wrapper, '  新组合  ')
    let resolveSave!: (saved: FrontendPreferenceRecord<ElementGroup[]>) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存当前选择为组合').trigger('click')
    await button(wrapper, '保存当前选择为组合').trigger('click')

    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(1)
    const submitted = api.saveFrontendPreference.mock.calls[0][1] as ElementGroup[]
    expect(submitted).toEqual([
      { id: 'group-1', name: '旧组合', elementKeys: ['iron'] },
      expect.objectContaining({ name: '新组合', elementKeys: ['aluminum', 'silicon', 'iron'] })
    ])
    expect(submitted[1].id).toMatch(/^(?:group-|[0-9a-f]{8}-)/)

    resolveSave(record(submitted, 2))
    await flushPromises()
    expect(success).toHaveBeenCalledWith('常用组合已保存')
  })

  it('serializes rapid deletes so a stale catalogue is not submitted twice', async () => {
    installGroups([{ id: 'group-1', name: '铝硅铁', elementKeys: ['aluminum', 'silicon', 'iron'] }])
    const wrapper = mountSelector(pinia, '')
    await openSelector(wrapper)
    let resolveSave!: (saved: FrontendPreferenceRecord<ElementGroup[]>) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))

    await button(wrapper, '删除').trigger('click')
    await button(wrapper, '删除').trigger('click')

    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(1)
    expect(api.saveFrontendPreference).toHaveBeenCalledWith('LAB_ELEMENT_GROUPS', [], 1)
    resolveSave(record([], 2))
    await flushPromises()
  })

  it('keeps the queued copy visible and reports that it still needs synchronization', async () => {
    const wrapper = mountSelector(pinia, '铝')
    await openSelector(wrapper)
    await enterGroupName(wrapper, '离线组合')
    api.saveFrontendPreference.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    const warning = vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as never)
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存当前选择为组合').trigger('click')
    await flushPromises()

    expect(useFrontendPreferencesStore(pinia).value('LAB_ELEMENT_GROUPS', [])).toEqual([
      expect.objectContaining({ name: '离线组合', elementKeys: ['aluminum'] })
    ])
    expect(wrapper.text()).toContain('离线组合')
    expect(useFrontendPreferencesStore(pinia).statuses.LAB_ELEMENT_GROUPS).toBe('queued')
    expect(warning).toHaveBeenCalledWith('已保存到本机，联网后请确认同步')
    expect(success).not.toHaveBeenCalled()
  })

  it('keeps the group draft on conflict and exposes the store conflict without a success toast', async () => {
    const wrapper = mountSelector(pinia, '铝')
    await openSelector(wrapper)
    await enterGroupName(wrapper, '冲突组合')
    api.saveFrontendPreference.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: record([]) } }
    })
    const warning = vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as never)
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存当前选择为组合').trigger('click')
    await flushPromises()

    expect((wrapper.find('.element-picker__create input').element as HTMLInputElement).value).toBe('冲突组合')
    expect(useFrontendPreferencesStore(pinia).conflicts.LAB_ELEMENT_GROUPS).toBeDefined()
    expect(warning).toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('leaves an unauthorized catalogue empty when the server rejects a save', async () => {
    const wrapper = mountSelector(pinia, '铝')
    await openSelector(wrapper)
    await enterGroupName(wrapper, '无权组合')
    api.saveFrontendPreference.mockRejectedValueOnce({ response: { status: 403 } })
    const error = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as never)
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存当前选择为组合').trigger('click')
    await flushPromises()

    expect(useFrontendPreferencesStore(pinia).value('LAB_ELEMENT_GROUPS', [])).toEqual([])
    expect(wrapper.text()).toContain('暂无常用组合')
    expect(error).toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })
})
