import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
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
  }
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.routerPush })
}))

vi.mock('@/stores/labSheet', () => ({
  useLabSheetStore: () => mocks.labStore
}))

vi.mock('@/stores/accessGuard', () => ({
  useAccessGuardStore: () => mocks.accessGuard
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
      selectedBlockIds: { type: Array, default: () => [] }
    },
    emits: ['selectionChange'],
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
      selectedBlockIds: { type: Array, default: () => [] }
    },
    emits: ['selectionChange', 'saveNext'],
    setup(props, { emit }) {
      return () => h('div', { class: 'mobile-lab-list-stub', 'data-readonly': String(props.readonly) }, [
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

  const LabSmsDialogStub = defineComponent({
    name: 'LabSmsDialog',
    props: {
      mobile: { type: Boolean, default: false }
    },
    template: '<div class="lab-sms-dialog-stub" :data-mobile="String(mobile)" />'
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
        LabReportDialog: true,
        LabSmsDialog: LabSmsDialogStub,
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
    mocks.labStore.disconnectRealtime.mockReset()
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
    mocks.mobileLayout.isMobileLayout.value = false
    mocks.route.query = {}
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
    expect(desktop.get('.lab-sms-dialog-stub').attributes('data-mobile')).toBe('false')
    desktop.unmount()

    mocks.mobileLayout.isMobileLayout.value = true
    const mobile = mountPage()
    await settleMountedPage()
    expect(mobile.find('.mobile-lab-list-stub').exists()).toBe(true)
    expect(mobile.find('.lab-grid-stub').exists()).toBe(false)
    expect(mobile.find('.append-submit').exists()).toBe(true)
    expect(mobile.get('.lab-sms-dialog-stub').attributes('data-mobile')).toBe('true')
    mobile.unmount()
  })

  it('scrolls a routed mobile sample header into view after expanding its card', async () => {
    vi.useFakeTimers()
    mocks.mobileLayout.isMobileLayout.value = true
    mocks.route.query = { block: 'block-2' }
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
