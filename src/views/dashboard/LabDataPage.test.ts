import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    sampleBlocks: [],
    loadCurrentSheet: vi.fn(),
    loadSheetByDate: vi.fn(),
    saveParameters: vi.fn(),
    patchBlock: vi.fn(),
    persistAllBlocks: vi.fn(),
    appendSampleBlocks: vi.fn()
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
    setup() {
      return () => h('div', { class: 'lab-grid-stub' })
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
    mocks.labStore.persistAllBlocks.mockReset()
    mocks.labStore.appendSampleBlocks.mockResolvedValue(undefined)
    mocks.labStore.sheet = { date: '2026-06-24', readonly: false }
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
})
