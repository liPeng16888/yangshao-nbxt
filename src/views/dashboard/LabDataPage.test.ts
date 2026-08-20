import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import LabDataPage from './LabDataPage.vue'

const mocks = vi.hoisted(() => ({
  route: {
    query: {} as Record<string, string>
  },
  routerPush: vi.fn(),
  accessGuard: {
    loadGroups: vi.fn(),
    requestFeatureAccess: vi.fn(() => true),
    hasFeatureAccess: vi.fn(() => true),
    accessSessionRevision: 0
  },
  preferenceValue: vi.fn(),
  preferenceCanAccess: vi.fn<(_user: unknown, _section: string) => boolean>(() => true),
  authUser: {
    id: 'main-1', account: 'main-1', username: '主账号', role: 'FRONTEND_USER',
    dataOwnerId: 'main-1', isFrontendMainAccount: true, isFrontendSubAccount: false,
    permissions: []
  },
  mobileLayout: {
    isMobileLayout: { __v_isRef: true, value: false }
  },
  labStore: {
    loading: false,
    saving: false,
    applyingParameters: false,
    adding: false,
    autoSaving: false,
    autoSaveStatus: 'idle',
    lastAutoSavedAt: '',
    autoSaveError: '',
    pendingAutoSaveCount: 0,
    conflictBlockIds: [] as string[],
    sheet: { id: 'sheet-1', date: '2026-06-24', readonly: false } as { id?: string; date: string; readonly: boolean } | null,
    currentParameters: null,
    sampleBlocks: [] as any[],
    loadCurrentSheet: vi.fn(),
    loadSheetByDate: vi.fn(),
    saveParameters: vi.fn(),
    patchBlock: vi.fn(),
    commitBlockFieldChange: vi.fn(),
    persistAllBlocks: vi.fn(),
    retryFailedSaves: vi.fn(),
    confirmConflictOverwrite: vi.fn(),
    appendSampleBlocks: vi.fn(),
    createRetests: vi.fn(),
    disconnectRealtime: vi.fn()
  }
}))

const routeState = reactive(mocks.route)
const authUserState = reactive(mocks.authUser)

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: mocks.routerPush })
}))

vi.mock('@/stores/labSheet', () => ({
  useLabSheetStore: () => mocks.labStore
}))

vi.mock('@/stores/accessGuard', () => ({
  useAccessGuardStore: () => mocks.accessGuard
}))

vi.mock('@/stores/frontendPreferences', () => ({
  canAccessFrontendPreference: mocks.preferenceCanAccess,
  useFrontendPreferencesStore: () => ({ value: mocks.preferenceValue })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ get user() { return authUserState } })
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => mocks.mobileLayout
}))

function mountPage() {
  const LabSheetGridStub = defineComponent({
    props: {
      blocks: { type: Array, default: () => [] },
      readonly: { type: Boolean, default: false },
      selectionMode: { type: Boolean, default: false },
      selectedBlockIds: { type: Array, default: () => [] },
      highlightRetestId: { type: String, default: '' }
    },
    emits: ['selectionChange'],
    setup(props, { emit }) {
      return () =>
        h('div', {
          class: 'lab-grid-stub',
          'data-readonly': String(props.readonly),
          'data-highlight-retest-id': props.highlightRetestId
        }, [
          props.selectionMode
            ? h(
                'button',
                {
                  class: 'select-block-1',
                  type: 'button',
                  onClick: () => emit('selectionChange', 'block-1', true)
                },
                '选择001'
              )
            : null
        ])
    }
  })

  const BulkSampleFillDialogStub = defineComponent({
    props: {
      visible: { type: Boolean, default: false },
      selectedCount: { type: Number, default: 0 }
    },
    emits: ['apply', 'close'],
    setup(props, { emit }) {
      return () =>
        props.visible
          ? h('div', { class: 'bulk-fill-dialog-stub', 'data-selected-count': props.selectedCount }, [
              h(
                'button',
                {
                  class: 'bulk-fill-apply',
                  type: 'button',
                  onClick: () => emit('apply', { patch: { price: 20, paymentStatus: '月结款' } })
                },
                '应用批量填写'
              ),
              h(
                'button',
                {
                  class: 'bulk-fill-recipient-apply',
                  type: 'button',
                  onClick: () => emit('apply', {
                    patch: {
                      recipientCustomerId: 'recipient-1',
                      recipientCustomerIds: ['recipient-1'],
                      recipientCustomers: [{ id: 'recipient-1', name: '李总' }],
                      recipientCustomerText: '李总'
                    }
                  })
                },
                '应用数据发送'
              )
            ])
          : null
    }
  })

  const MobileLabSampleListStub = defineComponent({
    props: {
      blocks: { type: Array, default: () => [] },
      readonly: { type: Boolean, default: false },
      selectionMode: { type: Boolean, default: false },
      selectedBlockIds: { type: Array, default: () => [] },
      highlightRetestId: { type: String, default: '' }
    },
    emits: ['selectionChange', 'saveNext'],
    setup(props, { emit }) {
      return () => h('div', {
        class: 'mobile-lab-list-stub',
        'data-readonly': String(props.readonly),
        'data-highlight-retest-id': props.highlightRetestId
      }, [
        props.selectionMode
          ? h('button', { class: 'mobile-select-block-1', onClick: () => emit('selectionChange', 'block-1', true) }, '选择001')
          : null,
        h('button', { class: 'mobile-save-next-stub', onClick: () => emit('saveNext', 'block-1') }, '保存下一项')
      ])
    }
  })

  const SampleCompletionDialogStub = defineComponent({
    props: {
      visible: { type: Boolean, default: false }
    },
    emits: ['apply', 'close'],
    setup(props, { emit }) {
      return () =>
        props.visible
          ? h('div', { class: 'sample-completion-dialog-stub' }, [
              h(
                'button',
                {
                  class: 'sample-completion-apply',
                  type: 'button',
                  onClick: () => emit('apply', { blockIds: ['block-1'], completed: true })
                },
                '确认完成001'
              )
            ])
          : null
    }
  })

  const SampleRetestDialogStub = defineComponent({
    name: 'SampleRetestDialog',
    props: {
      visible: { type: Boolean, default: false },
      saving: { type: Boolean, default: false }
    },
    emits: ['create', 'close'],
    setup(props, { emit }) {
      return () => props.visible
        ? h('div', {
            class: 'sample-retest-dialog-stub',
            'data-saving': String(props.saving)
          }, [
            h('button', {
              class: 'sample-retest-create',
              type: 'button',
              disabled: props.saving,
              onClick: () => emit('create', { sampleBlockIds: ['block-1'] })
            }, '创建001复样')
          ])
        : null
    }
  })

  const LabReportDialogStub = defineComponent({
    props: {
      visible: { type: Boolean, default: false },
      template: { type: Object, required: true },
      mobile: { type: Boolean, default: false }
    },
    setup(props) {
      return () => props.visible
        ? h('div', {
            class: 'lab-report-dialog-stub',
            'data-title': (props.template as any).title,
            'data-mobile': String(props.mobile)
          })
        : null
    }
  })

  const LabSmsDialogStub = defineComponent({
    name: 'LabSmsDialog',
    props: {
      visible: { type: Boolean, default: false },
      template: { type: Object, required: true },
      mobile: { type: Boolean, default: false }
    },
    setup(props) {
      return () => props.visible
        ? h('div', {
            class: 'lab-sms-dialog-stub',
            'data-prefix': (props.template as any).prefix,
            'data-mobile': String(props.mobile)
          })
        : null
    }
  })

  return mount(LabDataPage, {
    global: {
      plugins: [createPinia()],
      directives: {
        loading: {}
      },
      stubs: {
        LabSheetGrid: LabSheetGridStub,
        MobileLabSampleList: MobileLabSampleListStub,
        LabParameterPanel: true,
        LabReportDialog: LabReportDialogStub,
        LabSmsDialog: LabSmsDialogStub,
        BulkSampleFillDialog: BulkSampleFillDialogStub,
        SampleCompletionDialog: SampleCompletionDialogStub,
        SampleRetestDialog: SampleRetestDialogStub,
        BlacklistHitDialog: true,
        ElDatePicker: {
          props: ['modelValue'],
          emits: ['update:modelValue', 'change'],
          template: '<input class="date-picker-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @change="$emit(\'change\', $event.target.value)" />'
        },
        ElTag: { template: '<span><slot /></span>' },
        ElInput: { template: '<input />' },
        ElButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
        }
      }
    }
  })
}

async function settleMountedPage() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('LabDataPage table layout', () => {
  beforeEach(() => {
    mocks.labStore.loadCurrentSheet.mockReset()
    mocks.labStore.loadCurrentSheet.mockResolvedValue(undefined)
    mocks.labStore.loadSheetByDate.mockReset()
    mocks.labStore.loadSheetByDate.mockResolvedValue(undefined)
    mocks.labStore.saveParameters.mockReset()
    mocks.labStore.patchBlock.mockReset()
    mocks.labStore.commitBlockFieldChange.mockReset()
    mocks.labStore.persistAllBlocks.mockReset()
    mocks.labStore.persistAllBlocks.mockResolvedValue({ success: true, failedBlockIds: [], conflictBlockIds: [] })
    mocks.labStore.retryFailedSaves.mockReset()
    mocks.labStore.retryFailedSaves.mockResolvedValue({ success: true, failedBlockIds: [], conflictBlockIds: [] })
    mocks.labStore.confirmConflictOverwrite.mockReset()
    mocks.labStore.confirmConflictOverwrite.mockResolvedValue({ success: true, failedBlockIds: [], conflictBlockIds: [] })
    mocks.labStore.appendSampleBlocks.mockResolvedValue(undefined)
    mocks.labStore.createRetests.mockReset()
    mocks.labStore.createRetests.mockResolvedValue([
      { id: 'retest-1', sampleBlockId: 'block-1', sequence: 1 }
    ])
    mocks.labStore.disconnectRealtime.mockReset()
    mocks.accessGuard.loadGroups.mockReset()
    mocks.accessGuard.requestFeatureAccess.mockReset()
    mocks.accessGuard.requestFeatureAccess.mockReturnValue(true)
    mocks.accessGuard.hasFeatureAccess.mockReset()
    mocks.accessGuard.hasFeatureAccess.mockReturnValue(true)
    mocks.preferenceValue.mockReset()
    mocks.preferenceValue.mockImplementation((_section: string, fallback: unknown) => JSON.parse(JSON.stringify(fallback)))
    mocks.preferenceCanAccess.mockReset()
    mocks.preferenceCanAccess.mockReturnValue(true)
    mocks.labStore.autoSaveStatus = 'idle'
    mocks.labStore.applyingParameters = false
    mocks.labStore.autoSaveError = ''
    mocks.labStore.conflictBlockIds = []
    mocks.labStore.sheet = { id: 'sheet-1', date: '2026-06-24', readonly: false }
    mocks.labStore.sampleBlocks = [
      {
        id: 'block-1',
        index: 1,
        readonly: false,
        inputs: { sequence: '001', price: null, paymentStatus: '' },
        results: {},
        parameterSnapshot: {},
        retests: []
      },
      {
        id: 'block-2',
        index: 2,
        readonly: false,
        inputs: { sequence: '002', price: null, paymentStatus: '' },
        results: {},
        parameterSnapshot: {},
        retests: []
      }
    ]
    mocks.mobileLayout.isMobileLayout.value = false
    routeState.query = {}
    Object.assign(authUserState, {
      id: 'main-1', account: 'main-1', username: '主账号', role: 'FRONTEND_USER',
      dataOwnerId: 'main-1', isFrontendMainAccount: true, isFrontendSubAccount: false,
      permissions: []
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the previous business date before 04:00 Beijing time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
    mocks.labStore.sheet = null as any
    mocks.labStore.loadCurrentSheet.mockImplementation(async () => {
      mocks.labStore.sheet = { date: '2026-07-30', readonly: false }
      return true
    })

    const wrapper = mountPage()
    await settleMountedPage()

    expect((wrapper.find('.date-picker-stub').element as HTMLInputElement).value).toBe('2026-07-30')
    wrapper.unmount()
  })

  it('does not treat the active pre-04:00 business date as history', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
    mocks.labStore.sheet = { date: '2026-07-30', readonly: false }
    mocks.labStore.loadSheetByDate.mockResolvedValue(true)

    const wrapper = mountPage()
    await settleMountedPage()
    await wrapper.find('.date-picker-stub').setValue('2026-07-30')
    await Promise.resolve()

    expect(mocks.accessGuard.requestFeatureAccess).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('treats the previous date as history from 04:00 Beijing time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T20:00:00.000Z'))
    mocks.labStore.sheet = { date: '2026-07-31', readonly: false }
    mocks.labStore.loadSheetByDate.mockResolvedValue(true)

    const wrapper = mountPage()
    await settleMountedPage()
    await wrapper.find('.date-picker-stub').setValue('2026-07-30')
    await Promise.resolve()

    expect(mocks.accessGuard.requestFeatureAccess).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('loads the new business day when the page crosses 04:00 Beijing time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
    mocks.labStore.sheet = { date: '2026-07-30', readonly: false }
    mocks.labStore.loadCurrentSheet.mockImplementation(async () => {
      mocks.labStore.sheet = { date: '2026-07-31', readonly: false }
      return true
    })

    const wrapper = mountPage()
    await settleMountedPage()
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()

    expect(mocks.labStore.loadCurrentSheet).toHaveBeenCalledTimes(1)
    expect((wrapper.find('.date-picker-stub').element as HTMLInputElement).value).toBe('2026-07-31')
    wrapper.unmount()
  })

  it('recovers a missed 04:00 switch when the page opens after the boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T20:01:00.000Z'))
    mocks.labStore.sheet = { date: '2026-07-30', readonly: false }
    mocks.labStore.loadCurrentSheet.mockImplementation(async () => {
      mocks.labStore.sheet = { date: '2026-07-31', readonly: false }
      return true
    })

    const wrapper = mountPage()
    await settleMountedPage()

    expect(mocks.labStore.loadCurrentSheet).toHaveBeenCalledTimes(1)
    expect((wrapper.find('.date-picker-stub').element as HTMLInputElement).value).toBe('2026-07-31')
    wrapper.unmount()
  })

  it('keeps the previous table visible when the business-day switch cannot save', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
    mocks.labStore.sheet = { date: '2026-07-30', readonly: false }
    mocks.labStore.loadCurrentSheet.mockResolvedValue(false)
    const errorSpy = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as any)

    const wrapper = mountPage()
    await settleMountedPage()
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()

    expect((wrapper.find('.date-picker-stub').element as HTMLInputElement).value).toBe('2026-07-30')
    expect(errorSpy).toHaveBeenCalledWith('仍有数据未保存，已保留当前表格，请保存成功后再切换业务日')
    wrapper.unmount()
    errorSpy.mockRestore()
  })

  it('uses the grid internal scrollbar without rendering an external mirror scrollbar', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    expect(wrapper.find('.lab-grid-stub').exists()).toBe(true)
    expect(wrapper.find('.table-scroll-panel').exists()).toBe(false)
    expect(wrapper.find('.table-scrollbar').exists()).toBe(false)
    expect(wrapper.find('.append-panel').exists()).toBe(true)
  })

  it('mounts exactly one mobile card editor or desktop grid from the shared layout state', async () => {
    const desktop = mountPage()
    await settleMountedPage()
    expect(desktop.find('.lab-grid-stub').exists()).toBe(true)
    expect(desktop.find('.mobile-lab-list-stub').exists()).toBe(false)
    expect(desktop.getComponent({ name: 'LabSmsDialog' }).props('mobile')).toBe(false)
    expect(desktop.find('.mobile-toolbar-summary').exists()).toBe(false)
    expect(desktop.get('.toolbar-content').text()).toContain('生成化验报告')
    desktop.unmount()

    mocks.mobileLayout.isMobileLayout.value = true
    const mobile = mountPage()
    await settleMountedPage()
    expect(mobile.find('.mobile-lab-list-stub').exists()).toBe(true)
    expect(mobile.find('.lab-grid-stub').exists()).toBe(false)
    expect(mobile.find('.append-submit').exists()).toBe(true)
    expect(mobile.getComponent({ name: 'LabSmsDialog' }).props('mobile')).toBe(true)
    expect(mobile.get('.mobile-toolbar-summary').attributes('aria-expanded')).toBe('false')
    mobile.unmount()
  })

  it('starts the mobile toolbar as a compact summary and expands and collapses the existing controls', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    const wrapper = mountPage()
    await settleMountedPage()

    const summary = wrapper.get('.mobile-toolbar-summary')
    expect(summary.attributes('aria-expanded')).toBe('false')
    expect(summary.text()).toContain('2026-06-24')
    expect(summary.text()).toContain('当前表可编辑')
    expect(summary.text()).toContain('自动保存开启')
    expect(wrapper.find('.toolbar-content').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === '生成化验报告')).toBe(false)

    await summary.trigger('click')
    await nextTick()
    expect(wrapper.get('.mobile-toolbar-summary').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.toolbar-content').text()).toContain('生成化验报告')
    expect(wrapper.get('.toolbar-content').text()).toContain('生成化验短信')

    await wrapper.get('.mobile-toolbar-summary').trigger('click')
    await nextTick()
    expect(wrapper.find('.toolbar-content').exists()).toBe(false)
  })

  it('gives the mobile toolbar summary a complete accessible name and politely announces save failures and conflicts', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    const wrapper = mountPage()
    await settleMountedPage()

    const idleSummary = wrapper.get('.mobile-toolbar-summary')
    expect(idleSummary.attributes('aria-label')).toContain('展开数据计算操作')
    expect(idleSummary.attributes('aria-label')).toContain('2026-06-24')
    expect(idleSummary.attributes('aria-label')).toContain('当前表可编辑')
    expect(idleSummary.attributes('aria-label')).toContain('自动保存开启')
    expect(wrapper.find('.mobile-toolbar-live-status').exists()).toBe(false)
    wrapper.unmount()

    mocks.labStore.autoSaveStatus = 'error'
    const errorWrapper = mountPage()
    await settleMountedPage()
    expect(errorWrapper.get('.mobile-toolbar-summary').attributes('aria-label')).toContain('自动保存失败，请手动保存')
    expect(errorWrapper.get('.mobile-toolbar-live-status').attributes('role')).toBe('status')
    expect(errorWrapper.get('.mobile-toolbar-live-status').attributes('aria-live')).toBe('polite')
    expect(errorWrapper.get('.mobile-toolbar-live-status').text()).toContain('自动保存失败，请手动保存')
    errorWrapper.unmount()

    mocks.labStore.autoSaveStatus = 'conflict'
    const conflictWrapper = mountPage()
    await settleMountedPage()
    expect(conflictWrapper.get('.mobile-toolbar-summary').attributes('aria-label')).toContain('保存冲突，本机内容已保留')
    expect(conflictWrapper.get('.mobile-toolbar-live-status').text()).toContain('保存冲突，本机内容已保留')
  })

  it('automatically collapses the expanded mobile toolbar when selection mode starts', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    const wrapper = mountPage()
    await settleMountedPage()

    await wrapper.get('.mobile-toolbar-summary').trigger('click')
    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await nextTick()

    expect(wrapper.get('.mobile-toolbar-summary').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.toolbar-content').exists()).toBe(false)
    expect(wrapper.get('.mobile-selection-bar').text()).toContain('已选 0 个样品')
  })

  it('returns focus to the collapsed mobile toolbar summary after entering selection mode', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    const wrapper = mountPage()
    await settleMountedPage()

    const summary = wrapper.get('.mobile-toolbar-summary')
    const focusSpy = vi.spyOn(summary.element as HTMLButtonElement, 'focus')
    await summary.trigger('click')
    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await nextTick()
    await nextTick()
    await nextTick()
    await Promise.resolve()

    expect(focusSpy).toHaveBeenCalledTimes(1)
    focusSpy.mockRestore()
  })

  it('shows that parameters are being applied in the mobile toolbar summary', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    mocks.labStore.applyingParameters = true
    const wrapper = mountPage()
    await settleMountedPage()

    expect(wrapper.get('.mobile-toolbar-summary').text()).toContain('正在应用参数')
    expect(wrapper.get('.mobile-toolbar-summary').attributes('aria-label')).toContain('正在应用参数')
  })

  it('keeps save failures visible in the collapsed mobile summary and recovery available after expanding', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    mocks.labStore.autoSaveStatus = 'error'
    const wrapper = mountPage()
    await settleMountedPage()

    expect(wrapper.get('.mobile-toolbar-summary').text()).toContain('自动保存失败，请手动保存')
    await wrapper.get('.mobile-toolbar-summary').trigger('click')
    await findButtonByText(wrapper, '重试保存').trigger('click')
    await Promise.resolve()
    expect(mocks.labStore.retryFailedSaves).toHaveBeenCalledTimes(1)
  })

  it('keeps the mobile save recovery button at the 44px touch target', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    mocks.labStore.autoSaveStatus = 'error'
    const wrapper = mountPage()
    await settleMountedPage()

    await wrapper.get('.mobile-toolbar-summary').trigger('click')
    const recoveryButton = findButtonByText(wrapper, '重试保存')
    expect(recoveryButton.classes()).toContain('mobile-toolbar-recovery')
    expect(recoveryButton.classes()).toContain('mobile-touch-target')
  })

  it('enlarges only the mobile append-count input to the shared touch target', async () => {
    const desktop = mountPage()
    await settleMountedPage()
    expect(desktop.get('.append-input').classes()).not.toContain('mobile-touch-target')
    desktop.unmount()

    mocks.mobileLayout.isMobileLayout.value = true
    const mobile = mountPage()
    await settleMountedPage()
    expect(mobile.get('.append-input').classes()).toContain('mobile-touch-target')
    mobile.unmount()
  })

  it('scrolls a routed mobile sample header into view after expanding its card', async () => {
    vi.useFakeTimers()
    mocks.mobileLayout.isMobileLayout.value = true
    routeState.query = { block: 'block-2' }
    const card = document.createElement('article')
    card.dataset.blockId = 'block-2'
    const header = document.createElement('header')
    header.className = 'mobile-sample-card__header'
    const scrollIntoView = vi.fn()
    header.scrollIntoView = scrollIntoView
    card.appendChild(header)
    document.body.appendChild(card)

    const wrapper = mountPage()
    await settleMountedPage()
    await vi.advanceTimersByTimeAsync(120)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    wrapper.unmount()
    card.remove()
  })

  it('moves mobile selection actions into a full-width bottom bar with the selected count', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    const wrapper = mountPage()
    await settleMountedPage()

    await wrapper.get('.mobile-toolbar-summary').trigger('click')
    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await nextTick()
    expect(wrapper.get('.mobile-selection-bar').text()).toContain('已选 0 个样品')

    await wrapper.get('.mobile-select-block-1').trigger('click')
    await nextTick()
    expect(wrapper.get('.mobile-selection-bar').text()).toContain('已选 1 个样品')
    expect(wrapper.get('.mobile-selection-primary').text()).toContain('填写已选1个样品')

    await wrapper.get('.mobile-selection-primary').trigger('click')
    await nextTick()
    expect(wrapper.find('.bulk-fill-dialog-stub').exists()).toBe(true)
  })

  it('makes the data grid readonly and hides append controls while parameters are being applied', async () => {
    mocks.labStore.applyingParameters = true
    const wrapper = mountPage()
    await settleMountedPage()

    expect(wrapper.get('.lab-grid-stub').attributes('data-readonly')).toBe('true')
    expect(wrapper.find('.append-panel').exists()).toBe(false)
  })

  it('appends sample blocks from the controls below the table', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    await wrapper.find('.append-body button').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(mocks.labStore.appendSampleBlocks).toHaveBeenCalledWith('1')
  })

  it('enters bulk fill selection mode from the toolbar', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await nextTick()

    expect(wrapper.find('.select-block-1').exists()).toBe(true)
    expect(wrapper.text()).toContain('请选择样品')
  })

  it('warns when opening bulk fill without selected samples', async () => {
    const warningSpy = vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as any)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await findButtonByText(wrapper, '请选择样品').trigger('click')

    expect(warningSpy).toHaveBeenCalledWith('请先选择至少一个样品')
    warningSpy.mockRestore()
  })

  it('opens the bulk fill dialog after selecting samples', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '填写已选1个样品').trigger('click')
    await nextTick()

    expect(wrapper.find('.bulk-fill-dialog-stub').exists()).toBe(true)
    expect(wrapper.find('.bulk-fill-dialog-stub').attributes('data-selected-count')).toBe('1')
  })

  it('applies bulk fill only to selected samples and persists immediately', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '填写已选1个样品').trigger('click')
    await wrapper.find('.bulk-fill-apply').trigger('click')
    await Promise.resolve()

    expect(mocks.labStore.patchBlock).toHaveBeenCalledWith('block-1', { price: 20, paymentStatus: '月结款' })
    expect(mocks.labStore.patchBlock).not.toHaveBeenCalledWith('block-2', expect.anything())
    expect(mocks.labStore.commitBlockFieldChange).toHaveBeenCalledWith('block-1', 'price', null, 20)
    expect(mocks.labStore.commitBlockFieldChange).toHaveBeenCalledWith('block-1', 'paymentStatus', '', '月结款')
    expect(mocks.labStore.persistAllBlocks).toHaveBeenCalledWith({ silent: true })
  })

  it('clears prepaid member fields when bulk fill changes an existing prepaid sample to another status', async () => {
    mocks.labStore.sampleBlocks[0].inputs = {
      sequence: '001',
      price: 30.25,
      paymentStatus: '预存款',
      prepaidMemberId: 'member-1',
      prepaidMemberPhone: '13800000000'
    }
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '填写已选1个样品').trigger('click')
    await wrapper.find('.bulk-fill-apply').trigger('click')
    await Promise.resolve()

    expect(mocks.labStore.patchBlock.mock.calls[0]).toStrictEqual([
      'block-1',
      {
        price: 20,
        paymentStatus: '月结款',
        prepaidMemberId: undefined,
        prepaidMemberPhone: undefined
      }
    ])
    expect(mocks.labStore.patchBlock).not.toHaveBeenCalledWith('block-2', expect.anything())
    expect(mocks.labStore.persistAllBlocks).toHaveBeenCalledWith({ silent: true })
  })

  it('records and saves recipient customers during bulk fill', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '批量填写样品').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '填写已选1个样品').trigger('click')
    await wrapper.find('.bulk-fill-recipient-apply').trigger('click')
    await Promise.resolve()

    expect(mocks.labStore.patchBlock).toHaveBeenCalledWith('block-1', expect.objectContaining({
      recipientCustomerText: '李总'
    }))
    expect(mocks.labStore.commitBlockFieldChange).toHaveBeenCalledWith(
      'block-1',
      'recipientCustomerText',
      null,
      '李总'
    )
    expect(mocks.labStore.persistAllBlocks).toHaveBeenCalledWith({ silent: true })
  })

  it('marks the selected sample as completed and persists immediately', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '标记样品完成').trigger('click')
    await nextTick()
    expect(wrapper.find('.sample-completion-dialog-stub').exists()).toBe(true)

    await wrapper.find('.sample-completion-apply').trigger('click')
    await Promise.resolve()

    expect(mocks.labStore.commitBlockFieldChange).toHaveBeenCalledWith('block-1', 'completed', false, true)
    expect(mocks.labStore.patchBlock).toHaveBeenCalledWith('block-1', { completed: true })
    expect(mocks.labStore.patchBlock).not.toHaveBeenCalledWith('block-2', expect.anything())
    expect(mocks.labStore.persistAllBlocks).toHaveBeenCalledWith({ silent: true })
  })

  it('places 样品复样 immediately before 标记样品完成 and creates the selected parents', async () => {
    const successSpy = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as any)
    const wrapper = mountPage()
    await settleMountedPage()
    const labels = wrapper.findAll('.toolbar-right button').map((button) => button.text())

    expect(labels.indexOf('样品复样')).toBe(labels.indexOf('标记样品完成') - 1)

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(mocks.labStore.createRetests).toHaveBeenCalledWith(['block-1'])
    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(false)
    expect(wrapper.get('.lab-grid-stub').attributes('data-highlight-retest-id')).toBe('retest-1')
    expect(successSpy).toHaveBeenCalledWith('已创建 1 组复样')
    successSpy.mockRestore()
    wrapper.unmount()
  })

  it('locks the creation dialog until the request settles', async () => {
    let resolveCreation: (value: any[]) => void = () => undefined
    mocks.labStore.createRetests.mockReturnValue(new Promise((resolve) => { resolveCreation = resolve }))
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    await nextTick()

    expect(wrapper.get('.sample-retest-dialog-stub').attributes('data-saving')).toBe('true')
    expect(wrapper.get('.sample-retest-create').attributes('disabled')).toBeDefined()
    resolveCreation([{ id: 'retest-1', sampleBlockId: 'block-1', sequence: 1 }])
    await Promise.resolve()
    await nextTick()
    wrapper.unmount()
  })

  it('keeps the selected dialog open and reports a creation error', async () => {
    const errorSpy = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as any)
    mocks.labStore.createRetests.mockRejectedValue(new Error('没有复样权限'))
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(true)
    expect(wrapper.get('.sample-retest-dialog-stub').attributes('data-saving')).toBe('false')
    expect(errorSpy).toHaveBeenCalledWith('没有复样权限')
    errorSpy.mockRestore()
    wrapper.unmount()
  })

  it('passes the first created retest highlight to the mobile sample list', async () => {
    mocks.mobileLayout.isMobileLayout.value = true
    const wrapper = mountPage()
    await settleMountedPage()

    await wrapper.get('.mobile-toolbar-summary').trigger('click')
    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.get('.mobile-lab-list-stub').attributes('data-highlight-retest-id')).toBe('retest-1')
    wrapper.unmount()
  })

  it('clears the created retest highlight when switching dates', async () => {
    mocks.labStore.loadSheetByDate.mockResolvedValue(true)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    await Promise.resolve()
    await nextTick()
    expect(wrapper.get('.lab-grid-stub').attributes('data-highlight-retest-id')).toBe('retest-1')

    await wrapper.get('.date-picker-stub').setValue('2026-06-23')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.get('.lab-grid-stub').attributes('data-highlight-retest-id')).toBe('')
    wrapper.unmount()
  })

  it('ignores a stale creation success after the date and sheet change without closing the new-context dialog', async () => {
    let resolveCreation: (value: any[]) => void = () => undefined
    mocks.labStore.createRetests.mockReturnValue(new Promise((resolve) => { resolveCreation = resolve }))
    mocks.labStore.loadSheetByDate.mockImplementation(async (date: string) => {
      mocks.labStore.sheet = { id: 'sheet-2', date, readonly: false }
      return true
    })
    const successSpy = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as any)
    const errorSpy = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as any)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    await wrapper.get('.date-picker-stub').setValue('2026-06-23')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(false)
    await findButtonByText(wrapper, '样品复样').trigger('click')
    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(true)

    resolveCreation([{ id: 'stale-retest', sampleBlockId: 'block-1', sequence: 1 }])
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(true)
    expect(wrapper.get('.lab-grid-stub').attributes('data-highlight-retest-id')).toBe('')
    expect(successSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    successSpy.mockRestore()
    errorSpy.mockRestore()
    wrapper.unmount()
  })

  it('ignores a stale creation error and resets dialog locking after the actor and owner change', async () => {
    let rejectCreation: (reason: Error) => void = () => undefined
    mocks.labStore.createRetests.mockReturnValue(new Promise((_resolve, reject) => { rejectCreation = reject }))
    const successSpy = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as any)
    const errorSpy = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as any)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    authUserState.id = 'sub-2'
    authUserState.dataOwnerId = 'main-2'
    await nextTick()

    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(false)
    await findButtonByText(wrapper, '样品复样').trigger('click')
    expect(wrapper.get('.sample-retest-dialog-stub').attributes('data-saving')).toBe('false')

    rejectCreation(new Error('旧账号请求失败'))
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(true)
    expect(successSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    successSpy.mockRestore()
    errorSpy.mockRestore()
    wrapper.unmount()
  })

  it('closes the retest dialog and clears its highlight when the route sheet context changes', async () => {
    mocks.labStore.loadSheetByDate.mockResolvedValue(true)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    await Promise.resolve()
    await nextTick()
    await findButtonByText(wrapper, '样品复样').trigger('click')
    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(true)
    expect(wrapper.get('.lab-grid-stub').attributes('data-highlight-retest-id')).toBe('retest-1')

    routeState.query = { date: '2026-06-23' }
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(false)
    expect(wrapper.get('.lab-grid-stub').attributes('data-highlight-retest-id')).toBe('')
    wrapper.unmount()
  })

  it('closes the retest dialog when the automatic business day switch begins', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
    mocks.labStore.sheet = { id: 'sheet-old', date: '2026-07-30', readonly: false }
    mocks.labStore.loadCurrentSheet.mockImplementation(async () => {
      mocks.labStore.sheet = { id: 'sheet-new', date: '2026-07-31', readonly: false }
      return true
    })
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()

    expect(wrapper.find('.sample-retest-dialog-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('silently ignores a delayed retest creation success after the page unmounts', async () => {
    let resolveCreation: (value: any[]) => void = () => undefined
    mocks.labStore.createRetests.mockReturnValue(new Promise((resolve) => { resolveCreation = resolve }))
    const successSpy = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as any)
    const errorSpy = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as any)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    const setupState = (wrapper.vm as any).$?.setupState as {
      highlightRetestId: string
      retestDialogVisible: boolean
    }
    wrapper.unmount()

    resolveCreation([{ id: 'late-retest', sampleBlockId: 'block-1', sequence: 1 }])
    await Promise.resolve()
    await nextTick()

    expect(setupState.retestDialogVisible).toBe(false)
    expect(setupState.highlightRetestId).toBe('')
    expect(successSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(mocks.labStore.disconnectRealtime).toHaveBeenCalledTimes(1)
    successSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('silently handles a delayed retest creation rejection after the page unmounts', async () => {
    let rejectCreation: (reason: Error) => void = () => undefined
    mocks.labStore.createRetests.mockReturnValue(new Promise((_resolve, reject) => { rejectCreation = reject }))
    const successSpy = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as any)
    const errorSpy = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as any)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '样品复样').trigger('click')
    await wrapper.get('.sample-retest-create').trigger('click')
    const setupState = (wrapper.vm as any).$?.setupState as {
      highlightRetestId: string
      retestDialogVisible: boolean
    }
    wrapper.unmount()

    rejectCreation(new Error('页面退出后的旧请求失败'))
    await Promise.resolve()
    await nextTick()

    expect(setupState.retestDialogVisible).toBe(false)
    expect(setupState.highlightRetestId).toBe('')
    expect(successSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(mocks.labStore.disconnectRealtime).toHaveBeenCalledTimes(1)
    successSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('reads the latest shared report template immediately before opening the report dialog', async () => {
    mocks.preferenceValue.mockImplementation((section: string, fallback: unknown) => (
      section === 'LAB_REPORT_TEMPLATE'
        ? { ...(fallback as Record<string, unknown>), title: '服务器最新报告模板' }
        : JSON.parse(JSON.stringify(fallback))
    ))
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '生成化验报告').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '选择元素生成报告').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.get('.lab-report-dialog-stub').attributes('data-title')).toBe('服务器最新报告模板')
    expect(mocks.preferenceValue).toHaveBeenCalledWith('LAB_REPORT_TEMPLATE', expect.any(Object))
    wrapper.unmount()
  })

  it('reads the latest shared SMS template immediately before opening the SMS dialog', async () => {
    mocks.preferenceValue.mockImplementation((section: string, fallback: unknown) => (
      section === 'LAB_REPORT_SMS_TEMPLATE'
        ? { prefix: '服务器最新短信前缀', suffix: '' }
        : JSON.parse(JSON.stringify(fallback))
    ))
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '生成化验短信').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '选择元素生成短信').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.get('.lab-sms-dialog-stub').attributes('data-prefix')).toBe('服务器最新短信前缀')
    expect(mocks.preferenceValue).toHaveBeenCalledWith('LAB_REPORT_SMS_TEMPLATE', expect.any(Object))
    wrapper.unmount()
  })

  it('does not read or use an owner-cached report template without actor permission', async () => {
    mocks.preferenceCanAccess.mockImplementation((_user: unknown, section: string) => section !== 'LAB_REPORT_TEMPLATE')
    mocks.preferenceValue.mockImplementation((section: string, fallback: unknown) => (
      section === 'LAB_REPORT_TEMPLATE'
        ? { ...(fallback as Record<string, unknown>), title: '无权不应消费的缓存模板' }
        : JSON.parse(JSON.stringify(fallback))
    ))
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '生成化验报告').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '选择元素生成报告').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.get('.lab-report-dialog-stub').attributes('data-title')).not.toBe('无权不应消费的缓存模板')
    expect(mocks.preferenceValue).not.toHaveBeenCalledWith('LAB_REPORT_TEMPLATE', expect.anything())
    wrapper.unmount()
  })

  it('does not read or use an owner-cached SMS template without actor permission', async () => {
    mocks.preferenceCanAccess.mockImplementation((_user: unknown, section: string) => section !== 'LAB_REPORT_SMS_TEMPLATE')
    mocks.preferenceValue.mockImplementation((section: string, fallback: unknown) => (
      section === 'LAB_REPORT_SMS_TEMPLATE'
        ? { prefix: '无权不应消费的缓存短信', suffix: '' }
        : JSON.parse(JSON.stringify(fallback))
    ))
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '生成化验短信').trigger('click')
    await wrapper.find('.select-block-1').trigger('click')
    await findButtonByText(wrapper, '选择元素生成短信').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.get('.lab-sms-dialog-stub').attributes('data-prefix')).not.toBe('无权不应消费的缓存短信')
    expect(mocks.preferenceValue).not.toHaveBeenCalledWith('LAB_REPORT_SMS_TEMPLATE', expect.anything())
    wrapper.unmount()
  })

  it('disables the sample completion action for readonly history sheets', async () => {
    mocks.labStore.sheet = { date: '2026-06-24', readonly: true }
    const wrapper = mountPage()
    await settleMountedPage()

    expect(findButtonByText(wrapper, '标记样品完成').attributes('disabled')).toBeDefined()
    expect(findButtonByText(wrapper, '样品复样').attributes('disabled')).toBeDefined()
  })

  it('retries unsaved fields from the toolbar after a save failure', async () => {
    mocks.labStore.autoSaveStatus = 'error'
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '重试保存').trigger('click')
    await Promise.resolve()

    expect(mocks.labStore.retryFailedSaves).toHaveBeenCalledTimes(1)
  })

  it('requires confirmation before overwriting conflicting server fields', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    mocks.labStore.autoSaveStatus = 'conflict'
    mocks.labStore.conflictBlockIds = ['block-1']
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '确认保存本机内容').trigger('click')
    await Promise.resolve()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(mocks.labStore.confirmConflictOverwrite).toHaveBeenCalledTimes(1)
    confirmSpy.mockRestore()
  })
})

function findButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text)
  if (!button) throw new Error(`未找到按钮：${text}`)
  return button
}
