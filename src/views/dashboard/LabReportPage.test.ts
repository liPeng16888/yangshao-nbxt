import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LabReportPage from './LabReportPage.vue'
import { useAuthStore } from '@/stores/auth'
import { useFrontendPreferencesStore } from '@/stores/frontendPreferences'
import { useTenantRealtimeStore } from '@/stores/tenantRealtime'
import type { FrontendPreferenceRecord, FrontendPreferenceSection } from '@/types/frontendPreference'
import { readFrontendPreferenceCache } from '@/utils/frontendPreferenceCache'
import { defaultLabReportTemplate } from '@/utils/labReport'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn()
}))

vi.mock('@/api/frontendPreferences', () => ({
  listFrontendPreferences: api.list,
  saveFrontendPreference: api.save
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/lab-report/image-template' }),
  useRouter: () => ({ push: vi.fn() })
}))

const ReportPanelStub = defineComponent({
  name: 'LabReportTemplatePanel',
  props: { modelValue: { type: Object, required: true } },
  emits: ['update:modelValue'],
  template: '<button class="edit-report" @click="$emit(\'update:modelValue\', { ...modelValue, title: \'用户修改\' })">修改报告</button>'
})

const SmsPanelStub = defineComponent({
  name: 'LabReportSmsTemplatePanel',
  props: { modelValue: { type: Object, required: true } },
  emits: ['update:modelValue'],
  template: '<button class="edit-sms">修改短信</button>'
})

function record<T>(section: FrontendPreferenceSection, value: T, version = 1): FrontendPreferenceRecord<T> {
  return {
    section,
    value,
    version,
    updatedAt: '2026-08-13T00:00:00.000Z',
    updatedBy: { id: 'main-1', username: '主账号' }
  }
}

async function setup(initialRecords: FrontendPreferenceRecord[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = {
    id: 'main-1', account: 'main-1', username: '主账号', role: 'FRONTEND_USER',
    dataOwnerId: 'main-1', isFrontendMainAccount: true, isFrontendSubAccount: false
  }
  api.list.mockResolvedValueOnce(initialRecords)
  const preferences = useFrontendPreferencesStore()
  await preferences.loadAll()
  const wrapper = mount(LabReportPage, {
    global: {
      plugins: [pinia],
      stubs: {
        LabReportTemplatePanel: ReportPanelStub,
        LabReportSmsTemplatePanel: SmsPanelStub,
        ElTag: { template: '<span class="status-tag"><slot /></span>' },
        ElButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
        }
      }
    }
  })
  await nextTick()
  return { wrapper, auth, preferences }
}

describe('LabReportPage shared preferences', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        get length() { return values.size }
      }
    })
  })

  it('hydrates from a later server refresh without scheduling a save', async () => {
    const { wrapper, preferences } = await setup()
    api.list.mockResolvedValueOnce([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '服务器标题' }, 3)
    ])

    await preferences.loadAll()
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '服务器标题' })
    expect(api.save).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('debounces user edits for 500 ms and reports saving then saved', async () => {
    const serverTemplate = { ...defaultLabReportTemplate, title: '服务器标题' }
    const { wrapper } = await setup([record('LAB_REPORT_TEMPLATE', serverTemplate, 3)])
    let resolveSave!: (value: FrontendPreferenceRecord) => void
    api.save.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))

    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(499)
    expect(api.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()

    expect(api.save).toHaveBeenCalledWith(
      'LAB_REPORT_TEMPLATE',
      { ...serverTemplate, title: '用户修改' },
      3
    )
    expect(wrapper.text()).toContain('保存中')

    resolveSave(record('LAB_REPORT_TEMPLATE', { ...serverTemplate, title: '用户修改' }, 4))
    await flushPromises()
    expect(wrapper.text()).toContain('已保存')
    wrapper.unmount()
  })

  it('cancels an outstanding save when the authenticated owner changes', async () => {
    const { wrapper, auth } = await setup([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '账号 A' }, 2)
    ])
    await wrapper.get('.edit-report').trigger('click')

    auth.user = {
      id: 'main-2', account: 'main-2', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'main-2', isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)

    expect(api.save).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('gates an SSE refresh during the debounce and still saves the local draft', async () => {
    const { wrapper, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '服务器旧值' }, 2)
    ])
    const realtime = useTenantRealtimeStore()
    realtime.registerModule('frontend-preferences', {
      isDirty: () => preferences.hasPendingChanges,
      refresh: async () => { await preferences.loadAll() }
    })
    api.save.mockResolvedValueOnce(record(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '用户修改' },
      3
    ))
    await wrapper.get('.edit-report').trigger('click')
    await realtime.handleEvent({
      type: 'change', module: 'frontend-preferences', entityId: 'LAB_REPORT_TEMPLATE',
      operation: 'update', changedById: 'sub-2', updatedAt: '2026-08-13T01:00:00.000Z'
    })
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.save).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '用户修改' })
    wrapper.unmount()
  })

  it('gates an SSE refresh while a save is in flight and keeps the local draft', async () => {
    const serverTemplate = { ...defaultLabReportTemplate, title: '服务器旧值' }
    const { wrapper, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', serverTemplate, 2)
    ])
    const realtime = useTenantRealtimeStore()
    realtime.registerModule('frontend-preferences', {
      isDirty: () => preferences.hasPendingChanges,
      refresh: async () => { await preferences.loadAll() }
    })
    let resolveSave!: (value: FrontendPreferenceRecord) => void
    api.save.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))

    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await realtime.handleEvent({
      type: 'change', module: 'frontend-preferences', entityId: 'LAB_REPORT_TEMPLATE',
      operation: 'update', changedById: 'sub-2', updatedAt: '2026-08-13T01:00:00.000Z'
    })

    expect(api.list).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '用户修改' })
    resolveSave(record(
      'LAB_REPORT_TEMPLATE',
      { ...serverTemplate, title: '用户修改' },
      3
    ))
    await flushPromises()
    expect(wrapper.text()).toContain('已保存')
    wrapper.unmount()
  })

  it('turns a remote response arriving after a local edit into a visible conflict', async () => {
    const serverTemplate = { ...defaultLabReportTemplate, title: '服务器旧值' }
    const { wrapper, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', serverTemplate, 2)
    ])
    let resolveRefresh!: (records: FrontendPreferenceRecord[]) => void
    api.list.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve }))
    const refreshing = preferences.loadAll()

    await wrapper.get('.edit-report').trigger('click')
    resolveRefresh([
      record('LAB_REPORT_TEMPLATE', { ...serverTemplate, title: '他人远程修改' }, 3)
    ])
    await refreshing
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '用户修改' })
    expect(wrapper.text()).toContain('有版本冲突')
    expect(api.save).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps a settled page draft when an older load response arrives after its save', async () => {
    const oldTemplate = { ...defaultLabReportTemplate, title: '旧 GET v2' }
    const savedTemplate = { ...defaultLabReportTemplate, title: '用户修改' }
    const { wrapper, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', oldTemplate, 2)
    ])
    let resolveRefresh!: (records: FrontendPreferenceRecord[]) => void
    api.list.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve }))
    api.save.mockResolvedValueOnce(record('LAB_REPORT_TEMPLATE', savedTemplate, 3))

    const refreshing = preferences.loadAll()
    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(wrapper.text()).toContain('已保存')

    resolveRefresh([record('LAB_REPORT_TEMPLATE', oldTemplate, 2)])
    await refreshing
    await nextTick()

    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject(savedTemplate)
    expect(preferences.records.LAB_REPORT_TEMPLATE).toMatchObject({ version: 3, value: savedTemplate })
    expect(preferences.statuses.LAB_REPORT_TEMPLATE).toBe('saved')
    expect(preferences.conflicts.LAB_REPORT_TEMPLATE).toBeUndefined()
    expect(preferences.hasPendingChanges).toBe(false)
    expect(readFrontendPreferenceCache('main-1', 'LAB_REPORT_TEMPLATE')).toMatchObject({
      server: { version: 3, value: savedTemplate }
    })
    wrapper.unmount()
  })

  it('revokes a dirty edit session on same-owner actor switch and unmount', async () => {
    const { wrapper, auth, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '主账号服务器' }, 2)
    ])
    await wrapper.get('.edit-report').trigger('click')
    expect(preferences.hasPendingChanges).toBe(true)

    auth.user = {
      id: 'sub-1', account: 'sub-1', username: '子账号', role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'main-1', isFrontendMainAccount: false, isFrontendSubAccount: true,
      permissions: ['LAB_REPORT_IMAGE_TEMPLATE']
    }
    await nextTick()

    expect(preferences.hasPendingChanges).toBe(false)
    await wrapper.get('.edit-report').trigger('click')
    expect(preferences.hasPendingChanges).toBe(true)
    wrapper.unmount()
    expect(preferences.hasPendingChanges).toBe(false)
  })

  it('keeps a newer debounced edit when an earlier save response hydrates the store', async () => {
    const serverTemplate = { ...defaultLabReportTemplate, title: '服务器标题' }
    const { wrapper } = await setup([record('LAB_REPORT_TEMPLATE', serverTemplate, 3)])
    let resolveFirstSave!: (value: FrontendPreferenceRecord) => void
    api.save
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirstSave = resolve }))
      .mockResolvedValueOnce(record(
        'LAB_REPORT_TEMPLATE',
        { ...defaultLabReportTemplate, title: '第二次修改' },
        5
      ))

    await wrapper.getComponent(ReportPanelStub).vm.$emit('update:modelValue', {
      ...serverTemplate,
      title: '第一次修改'
    })
    await vi.advanceTimersByTimeAsync(500)
    await wrapper.getComponent(ReportPanelStub).vm.$emit('update:modelValue', {
      ...serverTemplate,
      title: '第二次修改'
    })
    resolveFirstSave(record(
      'LAB_REPORT_TEMPLATE',
      { ...serverTemplate, title: '第一次修改' },
      4
    ))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(api.save).toHaveBeenNthCalledWith(
      2,
      'LAB_REPORT_TEMPLATE',
      { ...serverTemplate, title: '第二次修改' },
      4
    )
    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '第二次修改' })
    wrapper.unmount()
  })

  it('keeps the latest draft, record, and status when two saves resolve out of order', async () => {
    const serverTemplate = { ...defaultLabReportTemplate, title: '服务器标题' }
    const { wrapper, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', serverTemplate, 3)
    ])
    let resolveFirst!: (value: FrontendPreferenceRecord) => void
    let resolveSecond!: (value: FrontendPreferenceRecord) => void
    api.save
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

    wrapper.getComponent(ReportPanelStub).vm.$emit('update:modelValue', {
      ...serverTemplate,
      title: '第一次修改'
    })
    await vi.advanceTimersByTimeAsync(500)
    wrapper.getComponent(ReportPanelStub).vm.$emit('update:modelValue', {
      ...serverTemplate,
      title: '第二次修改'
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(api.save).toHaveBeenCalledTimes(2)

    resolveSecond(record(
      'LAB_REPORT_TEMPLATE',
      { ...serverTemplate, title: '第二次修改' },
      5
    ))
    await flushPromises()
    resolveFirst(record(
      'LAB_REPORT_TEMPLATE',
      { ...serverTemplate, title: '第一次修改' },
      4
    ))
    await flushPromises()

    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '第二次修改' })
    expect(preferences.records.LAB_REPORT_TEMPLATE).toMatchObject({ version: 5 })
    expect(wrapper.text()).toContain('已保存')
    expect(wrapper.text()).not.toContain('离线待同步')
    wrapper.unmount()
  })

  it('retains and saves a newer edit made while conflict overwrite is in flight', async () => {
    const serverCurrent = record(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '他人新内容' },
      5
    )
    const { wrapper } = await setup([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '旧服务器' }, 4)
    ])
    let resolveOverwrite!: (value: FrontendPreferenceRecord) => void
    api.save
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: serverCurrent } },
        isAxiosError: true
      })
      .mockReturnValueOnce(new Promise((resolve) => { resolveOverwrite = resolve }))
      .mockResolvedValueOnce(record(
        'LAB_REPORT_TEMPLATE',
        { ...defaultLabReportTemplate, title: '冲突后继续修改' },
        7
      ))

    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    await Array.from(wrapper.findAll('button')).find((button) => button.text() === '用本机内容覆盖')!.trigger('click')
    wrapper.getComponent(ReportPanelStub).vm.$emit('update:modelValue', {
      ...defaultLabReportTemplate,
      title: '冲突后继续修改'
    })
    await nextTick()

    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    expect(api.save).toHaveBeenNthCalledWith(
      3,
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '冲突后继续修改' },
      5
    )

    resolveOverwrite(record(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '用户修改' },
      6
    ))
    await flushPromises()
    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '冲突后继续修改' })
    expect(wrapper.text()).toContain('已保存')
    wrapper.unmount()
  })

  it('retains the current draft and error status after an HTTP save failure', async () => {
    const serverTemplate = { ...defaultLabReportTemplate, title: '服务器标题' }
    const { wrapper, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', serverTemplate, 3)
    ])
    api.save
      .mockRejectedValueOnce({ response: { status: 500 }, isAxiosError: true })
      .mockResolvedValueOnce(record(
        'LAB_REPORT_TEMPLATE',
        { ...serverTemplate, title: '错误后再次修改' },
        4
      ))

    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '用户修改' })
    expect(wrapper.text()).toContain('保存失败')
    expect(preferences.hasPendingChanges).toBe(true)

    wrapper.getComponent(ReportPanelStub).vm.$emit('update:modelValue', {
      ...serverTemplate,
      title: '错误后再次修改'
    })
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(api.save).toHaveBeenLastCalledWith(
      'LAB_REPORT_TEMPLATE',
      { ...serverTemplate, title: '错误后再次修改' },
      3
    )
    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '错误后再次修改' })
    expect(wrapper.text()).toContain('已保存')
    wrapper.unmount()
  })

  it('makes an old-owner save response inert after the new owner edits and saves', async () => {
    const { wrapper, auth, preferences } = await setup([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '账号 A' }, 2)
    ])
    let resolveOwnerA!: (value: FrontendPreferenceRecord) => void
    api.save
      .mockReturnValueOnce(new Promise((resolve) => { resolveOwnerA = resolve }))
      .mockResolvedValueOnce(record(
        'LAB_REPORT_TEMPLATE',
        { ...defaultLabReportTemplate, title: '账号 B 本机编辑' },
        9
      ))
    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(500)

    auth.user = {
      id: 'main-2', account: 'main-2', username: '账号 B', role: 'FRONTEND_USER',
      dataOwnerId: 'main-2', isFrontendMainAccount: true, isFrontendSubAccount: false
    }
    api.list.mockResolvedValueOnce([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '账号 B 服务器' }, 8)
    ])
    await preferences.loadAll()
    wrapper.getComponent(ReportPanelStub).vm.$emit('update:modelValue', {
      ...defaultLabReportTemplate,
      title: '账号 B 本机编辑'
    })
    await nextTick()

    resolveOwnerA(record(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '账号 A 响应' },
      3
    ))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '账号 B 本机编辑' })
    expect(api.save).toHaveBeenLastCalledWith(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '账号 B 本机编辑' },
      8
    )
    wrapper.unmount()
  })

  it('loads server content after a conflict without scheduling another save', async () => {
    const localBase = { ...defaultLabReportTemplate, title: '旧服务器' }
    const serverCurrent = record(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '他人新内容' },
      5
    )
    const { wrapper } = await setup([record('LAB_REPORT_TEMPLATE', localBase, 4)])
    api.save.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: serverCurrent } },
      isAxiosError: true
    })

    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(wrapper.text()).toContain('有版本冲突')
    await Array.from(wrapper.findAll('button')).find((button) => button.text() === '加载服务器内容')!.trigger('click')
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.getComponent(ReportPanelStub).props('modelValue')).toMatchObject({ title: '他人新内容' })
    expect(api.save).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('overwrites a conflict using the current server version', async () => {
    const serverCurrent = record(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '他人新内容' },
      5
    )
    const { wrapper } = await setup([
      record('LAB_REPORT_TEMPLATE', { ...defaultLabReportTemplate, title: '旧服务器' }, 4)
    ])
    api.save
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'PREFERENCE_VERSION_CONFLICT', current: serverCurrent } },
        isAxiosError: true
      })
      .mockResolvedValueOnce(record(
        'LAB_REPORT_TEMPLATE',
        { ...defaultLabReportTemplate, title: '用户修改' },
        6
      ))

    await wrapper.get('.edit-report').trigger('click')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    await Array.from(wrapper.findAll('button')).find((button) => button.text() === '用本机内容覆盖')!.trigger('click')
    await flushPromises()

    expect(api.save).toHaveBeenLastCalledWith(
      'LAB_REPORT_TEMPLATE',
      { ...defaultLabReportTemplate, title: '用户修改' },
      5
    )
    expect(wrapper.text()).toContain('已保存')
    wrapper.unmount()
  })
})
