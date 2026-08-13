// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError } from 'axios'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { useAuthStore } from '@/stores/auth'
import { useFrontendPreferencesStore } from '@/stores/frontendPreferences'
import type { AuthUser } from '@/types/auth'
import type { FrontendPreferenceRecord } from '@/types/frontendPreference'
import type { SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { writeFrontendPreferenceCache } from '@/utils/frontendPreferenceCache'
import { defaultLabReportTemplate } from '@/utils/labReport'
import LabReportDialog from './LabReportDialog.vue'

const api = vi.hoisted(() => ({
  listFrontendPreferences: vi.fn(),
  saveFrontendPreference: vi.fn()
}))

vi.mock('@/api/frontendPreferences', () => api)

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

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'main-1',
    account: 'main-1',
    username: '主账号',
    role: 'FRONTEND_USER',
    dataOwnerId: 'main-1',
    isFrontendMainAccount: true,
    isFrontendSubAccount: false,
    permissions: [],
    permissionVersion: 1,
    ...overrides
  }
}

function record(value: string[], version = 1): FrontendPreferenceRecord<string[]> {
  return {
    section: 'LAB_REPORT_SAMPLE_UNITS',
    value,
    version,
    updatedAt: '2026-08-13T00:00:00.000Z',
    updatedBy: { id: 'main-1', username: '主账号' }
  }
}

function installUnits(value: string[]) {
  writeFrontendPreferenceCache({ ownerId: 'main-1', section: 'LAB_REPORT_SAMPLE_UNITS', server: record(value) })
}

function makeBlock(): SampleBlock {
  const inputs: SampleBlock['inputs'] = {
    sequence: '001',
    sampleNumber: '',
    customerText: '王庄',
    customerIds: [],
    customers: [],
    paymentStatus: '已结款',
    price: 20,
    elementNote: '铝'
  }
  return {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: defaultLabParameters
  }
}

function mountReportDialog(pinia: Pinia, sampleUnit = '清镇') {
  const block = makeBlock()
  return mount(LabReportDialog, {
    props: {
      visible: true,
      blocks: [block],
      selectedBlockIds: [block.id],
      template: { ...defaultLabReportTemplate, statements: [...defaultLabReportTemplate.statements], sampleUnit },
      date: '2026-08-13'
    },
    global: {
      plugins: [pinia, ElementPlus],
      stubs: {
        ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
        ElSelect: { template: '<div><slot /></div>' },
        ElOption: { template: '<div class="option-stub"><slot /></div>' },
        ElCheckboxGroup: { template: '<div><slot /></div>' },
        ElCheckbox: { template: '<label><slot /></label>' }
      }
    }
  })
}

function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((candidate) => candidate.text().includes(text))
  if (!found) throw new Error(`Button not found: ${text}`)
  return found
}

async function showPreview(wrapper: VueWrapper) {
  await button(wrapper, '生成预览').trigger('click')
  await flushPromises()
}

function sampleUnitInput(wrapper: VueWrapper) {
  return wrapper.findAll('.meta-grid input')[2]
}

describe('LabReportDialog shared sample-unit shortcuts', () => {
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

  it('saves a normalized unit catalogue through the owner preference store', async () => {
    installUnits(['王庄', ' 王庄 ', ''])
    const wrapper = mountReportDialog(pinia)
    await showPreview(wrapper)
    let resolveSave!: (saved: FrontendPreferenceRecord<string[]>) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存名称').trigger('click')
    await button(wrapper, '保存名称').trigger('click')

    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(1)
    expect(api.saveFrontendPreference).toHaveBeenCalledWith(
      'LAB_REPORT_SAMPLE_UNITS',
      ['清镇', '王庄'],
      1
    )
    resolveSave(record(['清镇', '王庄'], 2))
    await flushPromises()
    expect(success).toHaveBeenCalledWith('来样单位名称已保存')
  })

  it('serializes rapid deletes and saves the filtered shared catalogue once', async () => {
    installUnits(['王庄', '清镇'])
    const wrapper = mountReportDialog(pinia)
    await showPreview(wrapper)
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    let resolveSave!: (saved: FrontendPreferenceRecord<string[]>) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const deleteButton = wrapper.findAll('button[title="删除快捷名称"]')[0]

    await deleteButton.trigger('click')
    await deleteButton.trigger('click')

    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(1)
    expect(api.saveFrontendPreference).toHaveBeenCalledWith('LAB_REPORT_SAMPLE_UNITS', ['清镇'], 1)
    resolveSave(record(['清镇'], 2))
    await flushPromises()
  })

  it('shows queued units from the local preference cache and asks for later sync confirmation', async () => {
    installUnits(['王庄'])
    const wrapper = mountReportDialog(pinia)
    await showPreview(wrapper)
    api.saveFrontendPreference.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
    const warning = vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as never)
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存名称').trigger('click')
    await flushPromises()

    expect(useFrontendPreferencesStore(pinia).value('LAB_REPORT_SAMPLE_UNITS', [])).toEqual(['清镇', '王庄'])
    expect(wrapper.findAll('.option-stub').map((option) => option.text())).toEqual(['清镇', '王庄'])
    expect(warning).toHaveBeenCalledWith('已保存到本机，联网后请确认同步')
    expect(success).not.toHaveBeenCalled()
  })

  it('keeps the report draft on conflict and leaves resolution to the store controls', async () => {
    installUnits(['王庄'])
    const wrapper = mountReportDialog(pinia)
    await showPreview(wrapper)
    api.saveFrontendPreference.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: record(['他人单位'], 2) } }
    })
    const warning = vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as never)
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存名称').trigger('click')
    await flushPromises()

    expect((sampleUnitInput(wrapper).element as HTMLInputElement).value).toBe('清镇')
    expect(useFrontendPreferencesStore(pinia).conflicts.LAB_REPORT_SAMPLE_UNITS).toBeDefined()
    expect(wrapper.find('.sample-unit-conflict').text()).toContain('来样单位快捷名称存在同步冲突')
    expect(button(wrapper, '保存名称').attributes('disabled')).toBeDefined()
    await button(wrapper, '保存名称').trigger('click')
    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('loads server units explicitly and confirms before overwriting local conflict', async () => {
    const store = useFrontendPreferencesStore(pinia)
    api.saveFrontendPreference.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: record(['服务器单位'], 4) } }
    })
    await store.save('LAB_REPORT_SAMPLE_UNITS', ['本机单位'])
    const wrapper = mountReportDialog(pinia)
    await showPreview(wrapper)

    await button(wrapper, '加载服务器内容').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.option-stub').map((option) => option.text())).toEqual(['服务器单位'])
    expect(store.conflicts.LAB_REPORT_SAMPLE_UNITS).toBeUndefined()

    api.saveFrontendPreference
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: record(['服务器单位'], 5) } }
      })
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: record(['服务器单位'], 6) } }
      })
      .mockResolvedValueOnce(record(['本机单位'], 7))
    await store.save('LAB_REPORT_SAMPLE_UNITS', ['本机单位'])
    await flushPromises()
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')

    await button(wrapper, '用本机内容覆盖').trigger('click')
    await flushPromises()
    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(2)
    expect(store.conflicts.LAB_REPORT_SAMPLE_UNITS).toBeDefined()

    confirm.mockResolvedValueOnce('confirm' as never)
    await button(wrapper, '用本机内容覆盖').trigger('click')
    await flushPromises()
    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(3)
    expect(store.conflicts.LAB_REPORT_SAMPLE_UNITS).toBeDefined()
    expect(wrapper.find('.sample-unit-conflict').exists()).toBe(true)

    confirm.mockResolvedValueOnce('confirm' as never)
    await button(wrapper, '用本机内容覆盖').trigger('click')
    await flushPromises()
    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(4)
    expect(store.conflicts.LAB_REPORT_SAMPLE_UNITS).toBeUndefined()
    expect(wrapper.findAll('.option-stub').map((option) => option.text())).toEqual(['本机单位'])
  })

  it('ignores an in-flight unit save after close and reopen with a new draft', async () => {
    installUnits(['王庄'])
    const wrapper = mountReportDialog(pinia, '旧草稿')
    await showPreview(wrapper)
    let resolveSave!: (saved: FrontendPreferenceRecord<string[]>) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存名称').trigger('click')
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({
      visible: true,
      template: { ...defaultLabReportTemplate, statements: [...defaultLabReportTemplate.statements], sampleUnit: '新草稿' }
    })
    await showPreview(wrapper)
    resolveSave(record(['旧草稿', '王庄'], 2))
    await flushPromises()

    expect((sampleUnitInput(wrapper).element as HTMLInputElement).value).toBe('新草稿')
    expect(wrapper.findAll('.option-stub').map((option) => option.text())).toEqual(['王庄'])
    expect(success).not.toHaveBeenCalled()
  })

  it('ignores an in-flight unit save after a same-owner actor switch', async () => {
    installUnits(['王庄'])
    const wrapper = mountReportDialog(pinia, '旧账号草稿')
    await showPreview(wrapper)
    let resolveSave!: (saved: FrontendPreferenceRecord<string[]>) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存名称').trigger('click')
    useAuthStore(pinia).user = user({
      id: 'sub-1',
      account: 'sub-1',
      role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'main-1',
      isFrontendMainAccount: false,
      isFrontendSubAccount: true,
      permissions: ['LAB_REPORT_IMAGE_TEMPLATE']
    })
    await flushPromises()
    await sampleUnitInput(wrapper).setValue('新账号草稿')
    resolveSave(record(['旧账号草稿', '王庄'], 2))
    await flushPromises()

    expect((sampleUnitInput(wrapper).element as HTMLInputElement).value).toBe('新账号草稿')
    expect(wrapper.findAll('.option-stub').map((option) => option.text())).toEqual(['王庄'])
    expect(success).not.toHaveBeenCalled()
  })

  it('hides same-owner cached units and blocks mutation after actor permission loss', async () => {
    installUnits(['共享单位'])
    const wrapper = mountReportDialog(pinia, '当前草稿')
    await showPreview(wrapper)
    expect(wrapper.findAll('.option-stub').map((option) => option.text())).toEqual(['共享单位'])

    useAuthStore(pinia).user = user({
      id: 'sub-1',
      account: 'sub-1',
      role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'main-1',
      isFrontendMainAccount: false,
      isFrontendSubAccount: true,
      permissions: []
    })
    await flushPromises()

    expect(wrapper.findAll('.option-stub')).toHaveLength(0)
    expect(button(wrapper, '保存名称').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.sample-unit-conflict').exists()).toBe(false)
    await button(wrapper, '保存名称').trigger('click')
    expect(api.saveFrontendPreference).not.toHaveBeenCalled()
    expect((sampleUnitInput(wrapper).element as HTMLInputElement).value).toBe('当前草稿')
  })

  it('keeps the report draft and shared catalogue unchanged on an error', async () => {
    installUnits(['王庄'])
    const wrapper = mountReportDialog(pinia)
    await showPreview(wrapper)
    api.saveFrontendPreference.mockRejectedValueOnce({ response: { status: 403 } })
    const error = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as never)
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)

    await button(wrapper, '保存名称').trigger('click')
    await flushPromises()

    expect((sampleUnitInput(wrapper).element as HTMLInputElement).value).toBe('清镇')
    expect(useFrontendPreferencesStore(pinia).value('LAB_REPORT_SAMPLE_UNITS', [])).toEqual(['王庄'])
    expect(error).toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })
})
