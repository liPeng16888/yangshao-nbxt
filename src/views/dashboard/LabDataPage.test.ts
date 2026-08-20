import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'
import LabDataPage from './LabDataPage.vue'
import type { CreateLabSampleChangeRequestPayload, LabSampleChangeRequestDetail, LabSampleChangeRequestSummary } from '@/types/labSampleChangeRequest'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  accessGuard: {
    loadGroups: vi.fn(),
    requestFeatureAccess: vi.fn(() => true),
    hasFeatureAccess: vi.fn(() => true),
    accessSessionRevision: 0
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
    sheet: { date: '2026-06-24', readonly: false },
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
    disconnectRealtime: vi.fn()
  },
  changeRequestStore: {
    requests: [] as LabSampleChangeRequestSummary[],
    pendingByBlock: {} as Record<string, LabSampleChangeRequestSummary>,
    detail: null as LabSampleChangeRequestDetail | null,
    loading: false,
    submitting: false,
    loadingDetail: false,
    withdrawing: false,
    load: vi.fn(),
    submit: vi.fn(),
    loadDetail: vi.fn(),
    withdraw: vi.fn(),
    reset: vi.fn()
  }
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mocks.routerPush })
}))

vi.mock('@/stores/labSheet', () => ({
  useLabSheetStore: () => mocks.labStore
}))

vi.mock('@/stores/accessGuard', () => ({
  useAccessGuardStore: () => mocks.accessGuard
}))

vi.mock('@/stores/labSampleChangeRequest', () => ({
  useLabSampleChangeRequestStore: () => mocks.changeRequestStore
}))

function mountPage() {
  const LabSheetGridStub = defineComponent({
    name: 'LabSheetGrid',
    props: {
      blocks: { type: Array, default: () => [] },
      readonly: { type: Boolean, default: false },
      selectionMode: { type: Boolean, default: false },
      selectedBlockIds: { type: Array, default: () => [] },
      sheetDate: { type: String, default: '' },
      sampleChangeRequests: { type: Object, default: () => ({}) },
      sampleChangeLoading: { type: Boolean, default: false }
    },
    emits: ['selectionChange', 'requestSampleChange', 'viewSampleChangeRequest', 'withdrawSampleChangeRequest'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: 'lab-grid-stub', 'data-readonly': String(props.readonly) }, [
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

  const HistoricalSampleChangeDialogStub = defineComponent({
    name: 'HistoricalSampleChangeDialog',
    props: {
      modelValue: { type: Boolean, default: false },
      block: { type: Object, default: null },
      submitting: { type: Boolean, default: false }
    },
    emits: ['update:modelValue', 'submit'],
    template: '<div class="sample-change-dialog-stub" :data-visible="String(modelValue)" :data-submitting="String(submitting)" />'
  })

  const LabSampleChangeRequestDrawerStub = defineComponent({
    name: 'LabSampleChangeRequestDrawer',
    props: {
      modelValue: { type: Boolean, default: false },
      rows: { type: Array, default: () => [] },
      detail: { type: Object, default: null },
      loading: { type: Boolean, default: false },
      withdrawingId: { type: String, default: '' }
    },
    emits: ['update:modelValue', 'select', 'withdraw'],
    template: '<div class="sample-change-drawer-stub" :data-visible="String(modelValue)" />'
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

  return mount(LabDataPage, {
    global: {
      plugins: [createPinia()],
      directives: {
        loading: {}
      },
      stubs: {
        LabSheetGrid: LabSheetGridStub,
        LabParameterPanel: true,
        LabReportDialog: true,
        LabSmsDialog: true,
        HistoricalSampleChangeDialog: HistoricalSampleChangeDialogStub,
        LabSampleChangeRequestDrawer: LabSampleChangeRequestDrawerStub,
        BulkSampleFillDialog: BulkSampleFillDialogStub,
        SampleCompletionDialog: SampleCompletionDialogStub,
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
  await flushPromises()
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
    mocks.labStore.disconnectRealtime.mockReset()
    mocks.changeRequestStore.requests = []
    mocks.changeRequestStore.pendingByBlock = {}
    mocks.changeRequestStore.detail = null
    mocks.changeRequestStore.loading = false
    mocks.changeRequestStore.submitting = false
    mocks.changeRequestStore.loadingDetail = false
    mocks.changeRequestStore.withdrawing = false
    mocks.changeRequestStore.load.mockReset()
    mocks.changeRequestStore.load.mockResolvedValue([])
    mocks.changeRequestStore.submit.mockReset()
    mocks.changeRequestStore.submit.mockResolvedValue(undefined)
    mocks.changeRequestStore.loadDetail.mockReset()
    mocks.changeRequestStore.loadDetail.mockResolvedValue(undefined)
    mocks.changeRequestStore.withdraw.mockReset()
    mocks.changeRequestStore.withdraw.mockResolvedValue(undefined)
    mocks.changeRequestStore.reset.mockReset()
    mocks.accessGuard.loadGroups.mockReset()
    mocks.accessGuard.requestFeatureAccess.mockReset()
    mocks.accessGuard.requestFeatureAccess.mockReturnValue(true)
    mocks.accessGuard.hasFeatureAccess.mockReset()
    mocks.accessGuard.hasFeatureAccess.mockReturnValue(true)
    mocks.labStore.autoSaveStatus = 'idle'
    mocks.labStore.applyingParameters = false
    mocks.labStore.autoSaveError = ''
    mocks.labStore.conflictBlockIds = []
    mocks.labStore.sheet = { date: '2026-06-24', readonly: false }
    mocks.labStore.sampleBlocks = [
      {
        id: 'block-1',
        index: 1,
        readonly: false,
        inputs: { sequence: '001', price: null, paymentStatus: '' },
        results: {},
        parameterSnapshot: {}
      },
      {
        id: 'block-2',
        index: 2,
        readonly: false,
        inputs: { sequence: '002', price: null, paymentStatus: '' },
        results: {},
        parameterSnapshot: {}
      }
    ]
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

  it('loads request summaries for readonly history and submits without patching the sheet store', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T04:00:00.000Z'))
    mocks.labStore.sheet = { date: '2026-06-24', readonly: true }
    mocks.labStore.sampleBlocks[0].readonly = true
    mocks.labStore.sampleBlocks[0].updatedAt = '2026-06-24T01:00:00.000Z'
    const payload: CreateLabSampleChangeRequestPayload = {
      blockId: 'block-1',
      baseUpdatedAt: '2026-06-24T01:00:00.000Z',
      changes: { sampleNumber: '复核后样品' },
      reason: '复核原始记录'
    }
    const wrapper = mountPage()
    await settleMountedPage()

    expect(mocks.changeRequestStore.load).toHaveBeenCalledWith({ date: '2026-06-24' })
    wrapper.getComponent({ name: 'LabSheetGrid' }).vm.$emit('requestSampleChange', 'block-1')
    await nextTick()
    const dialog = wrapper.getComponent({ name: 'HistoricalSampleChangeDialog' })
    expect(dialog.props('block')).toMatchObject({ id: 'block-1' })
    dialog.vm.$emit('submit', payload)
    await flushPromises()

    expect(mocks.changeRequestStore.submit).toHaveBeenCalledWith(payload)
    expect(mocks.labStore.patchBlock).not.toHaveBeenCalled()
    expect(dialog.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('resets request state for current and future sheets instead of loading summaries', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T04:00:00.000Z'))
    mocks.labStore.sheet = { date: '2026-08-20', readonly: false }
    const current = mountPage()
    await settleMountedPage()

    expect(mocks.changeRequestStore.reset).toHaveBeenCalled()
    expect(mocks.changeRequestStore.load).not.toHaveBeenCalled()
    current.unmount()

    mocks.changeRequestStore.reset.mockClear()
    mocks.labStore.sheet = { date: '2099-01-01', readonly: true }
    const future = mountPage()
    await settleMountedPage()

    expect(mocks.changeRequestStore.reset).toHaveBeenCalled()
    expect(mocks.changeRequestStore.load).not.toHaveBeenCalled()
    future.unmount()
  })

  it('resets request state when historical access is denied', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T04:00:00.000Z'))
    mocks.labStore.sheet = { date: '2026-08-20', readonly: false }
    const wrapper = mountPage()
    await settleMountedPage()
    mocks.changeRequestStore.reset.mockClear()
    mocks.accessGuard.requestFeatureAccess.mockReturnValue(false)

    await wrapper.find('.date-picker-stub').setValue('2026-06-24')
    await flushPromises()

    expect(mocks.changeRequestStore.reset).toHaveBeenCalled()
    expect(mocks.changeRequestStore.load).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps a failed submission open and exposes submitting true then false for dialog retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T04:00:00.000Z'))
    mocks.labStore.sheet = { date: '2026-06-24', readonly: true }
    mocks.labStore.sampleBlocks[0].readonly = true
    mocks.labStore.sampleBlocks[0].updatedAt = '2026-06-24T01:00:00.000Z'
    let rejectSubmit!: (reason: Error) => void
    mocks.changeRequestStore.submit.mockImplementation(() => new Promise((_, reject) => {
      rejectSubmit = reject
    }))
    const wrapper = mountPage()
    await settleMountedPage()
    const grid = wrapper.getComponent({ name: 'LabSheetGrid' })
    grid.vm.$emit('requestSampleChange', 'block-1')
    await nextTick()
    const dialog = wrapper.getComponent({ name: 'HistoricalSampleChangeDialog' })
    dialog.vm.$emit('submit', {
      blockId: 'block-1',
      baseUpdatedAt: '2026-06-24T01:00:00.000Z',
      changes: { sampleNumber: '保留草稿' },
      reason: '网络失败后重试'
    })
    await nextTick()

    expect(dialog.props('submitting')).toBe(true)
    rejectSubmit(new Error('网络错误'))
    await flushPromises()

    expect(dialog.props('submitting')).toBe(false)
    expect(dialog.props('modelValue')).toBe(true)
    expect(mocks.labStore.patchBlock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('coordinates the history drawer, detail loading, and confirmed grid withdrawal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T04:00:00.000Z'))
    mocks.labStore.sheet = { date: '2026-06-24', readonly: true }
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = mountPage()
    await settleMountedPage()

    await findButtonByText(wrapper, '修改申请记录').trigger('click')
    const drawer = wrapper.getComponent({ name: 'LabSampleChangeRequestDrawer' })
    expect(drawer.props('modelValue')).toBe(true)
    drawer.vm.$emit('select', 'request-1')
    await flushPromises()
    expect(mocks.changeRequestStore.loadDetail).toHaveBeenCalledWith('request-1')

    wrapper.getComponent({ name: 'LabSheetGrid' }).vm.$emit('withdrawSampleChangeRequest', 'request-1')
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(mocks.changeRequestStore.withdraw).toHaveBeenCalledWith('request-1')
    expect(mocks.labStore.patchBlock).not.toHaveBeenCalled()
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

  it('disables the sample completion action for readonly history sheets', async () => {
    mocks.labStore.sheet = { date: '2026-06-24', readonly: true }
    const wrapper = mountPage()
    await settleMountedPage()

    expect(findButtonByText(wrapper, '标记样品完成').attributes('disabled')).toBeDefined()
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
