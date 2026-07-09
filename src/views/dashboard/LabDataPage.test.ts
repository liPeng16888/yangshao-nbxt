import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import LabDataPage from './LabDataPage.vue'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  labStore: {
    loading: false,
    saving: false,
    adding: false,
    autoSaving: false,
    autoSaveStatus: 'idle',
    lastAutoSavedAt: '',
    autoSaveError: '',
    pendingAutoSaveCount: 0,
    sheet: { date: '2026-06-24', readonly: false },
    currentParameters: null,
    sampleBlocks: [] as any[],
    loadCurrentSheet: vi.fn(),
    loadSheetByDate: vi.fn(),
    saveParameters: vi.fn(),
    patchBlock: vi.fn(),
    commitBlockFieldChange: vi.fn(),
    persistAllBlocks: vi.fn(),
    appendSampleBlocks: vi.fn(),
    disconnectRealtime: vi.fn()
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
  useAccessGuardStore: () => ({
    loadSettings: vi.fn(),
    requestAccess: vi.fn(() => true)
  })
}))

function mountPage() {
  const LabSheetGridStub = defineComponent({
    props: {
      blocks: { type: Array, default: () => [] },
      selectionMode: { type: Boolean, default: false },
      selectedBlockIds: { type: Array, default: () => [] }
    },
    emits: ['selectionChange'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: 'lab-grid-stub' }, [
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
        BulkSampleFillDialog: BulkSampleFillDialogStub,
        BlacklistHitDialog: true,
        ElDatePicker: { template: '<input />' },
        ElTag: { template: '<span><slot /></span>' },
        ElInput: { template: '<input />' },
        ElButton: { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }
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
    mocks.labStore.loadCurrentSheet.mockResolvedValue(undefined)
    mocks.labStore.loadSheetByDate.mockResolvedValue(undefined)
    mocks.labStore.saveParameters.mockReset()
    mocks.labStore.patchBlock.mockReset()
    mocks.labStore.commitBlockFieldChange.mockReset()
    mocks.labStore.persistAllBlocks.mockReset()
    mocks.labStore.persistAllBlocks.mockResolvedValue(undefined)
    mocks.labStore.appendSampleBlocks.mockResolvedValue(undefined)
    mocks.labStore.disconnectRealtime.mockReset()
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

  it('uses the grid internal scrollbar without rendering an external mirror scrollbar', async () => {
    const wrapper = mountPage()
    await settleMountedPage()

    expect(wrapper.find('.lab-grid-stub').exists()).toBe(true)
    expect(wrapper.find('.table-scroll-panel').exists()).toBe(false)
    expect(wrapper.find('.table-scrollbar').exists()).toBe(false)
    expect(wrapper.find('.append-panel').exists()).toBe(true)
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
})

function findButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === text)
  if (!button) throw new Error(`未找到按钮：${text}`)
  return button
}
