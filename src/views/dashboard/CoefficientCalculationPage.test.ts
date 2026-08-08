import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabFormulaResult, LabSheet, SampleBlock } from '@/types/labSheet'
import CoefficientCalculationPage from './CoefficientCalculationPage.vue'

const apiMocks = vi.hoisted(() => ({
  applyCurrentParametersFromIndex: vi.fn(),
  createLabSheetEventSource: vi.fn(),
  getCurrentLabSheet: vi.fn(),
  getLabSheetClientId: vi.fn()
}))

const messageMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}))

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  }
}

vi.mock('@/api/labSheet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/labSheet')>()),
  ...apiMocks
}))

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessage: messageMocks
}))

function makeBlock(index: number): SampleBlock {
  return {
    id: `block-${index}`,
    index,
    readonly: false,
    inputs: { sequence: String(index).padStart(3, '0') },
    results: {} as LabFormulaResult,
    parameterSnapshot: { ...defaultLabParameters }
  }
}

function makeSheet(indices = [1, 2, 3, 4]): LabSheet {
  return {
    id: 'sheet-1',
    date: '2026-08-08',
    readonly: false,
    parameters: { ...defaultLabParameters },
    sampleBlocks: indices.map(makeBlock)
  }
}

const CoefficientApplicationDialogStub = defineComponent({
  props: {
    visible: Boolean,
    sampleIndices: { type: Array<number>, default: () => [] },
    loading: Boolean
  },
  emits: ['cancel', 'confirm'],
  setup(props, { emit }) {
    return () => {
      const sampleIndices = props.sampleIndices as number[]
      return props.visible
        ? h('section', { 'data-testid': 'coefficient-application-dialog' }, [
            h('span', { 'data-testid': 'sample-range' }, `${String(sampleIndices[0]).padStart(3, '0')}～${String(sampleIndices.at(-1)).padStart(3, '0')}`),
          h('button', { 'data-testid': 'dialog-cancel', onClick: () => emit('cancel') }, '取消'),
          h('button', { 'data-testid': 'dialog-confirm', onClick: () => emit('confirm', 3) }, '确认应用')
          ])
        : null
    }
  }
})

function mountPage() {
  return mount(CoefficientCalculationPage, {
    global: {
      plugins: [createPinia()],
      stubs: {
        CoefficientApplicationDialog: CoefficientApplicationDialogStub,
        ElButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
        },
        ElInput: true,
        ElInputNumber: true
      }
    }
  })
}

async function openApplicationDialog(wrapper: ReturnType<typeof mountPage>) {
  await wrapper.findAll('button').find((button) => button.text() === '应用系数')!.trigger('click')
  await Promise.resolve()
  await nextTick()
}

describe('CoefficientCalculationPage coefficient application', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage()
    })
    window.localStorage.clear()
    window.localStorage.setItem('ys_coefficient_calculation_inputs:guest', JSON.stringify({
      parameters: { ironBlank: 0.123, ironFactor: 29.1 }
    }))
    apiMocks.createLabSheetEventSource.mockReturnValue(null)
    apiMocks.getLabSheetClientId.mockReturnValue('client-1')
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheet([4, 1, 3, 2]))
    apiMocks.applyCurrentParametersFromIndex.mockImplementation(async () => makeSheet([1, 2, 3, 4]))
    messageMocks.error.mockReset()
    messageMocks.success.mockReset()
    messageMocks.warning.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('loads samples and displays their sorted range before applying', async () => {
    const wrapper = mountPage()

    await openApplicationDialog(wrapper)

    expect(apiMocks.getCurrentLabSheet).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="sample-range"]').text()).toBe('001～004')
  })

  it('applies the current parameters from the selected sample and confirms success', async () => {
    const wrapper = mountPage()

    await openApplicationDialog(wrapper)
    await wrapper.get('[data-testid="dialog-confirm"]').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(apiMocks.applyCurrentParametersFromIndex).toHaveBeenCalledWith(
      expect.objectContaining({ ironBlank: 0.123, ironFactor: 29.1 }),
      3
    )
    expect(messageMocks.success).toHaveBeenCalledWith('已从样品 003 开始应用新参数')
  })

  it('does not apply parameters after cancelling', async () => {
    const wrapper = mountPage()

    await openApplicationDialog(wrapper)
    await wrapper.get('[data-testid="dialog-cancel"]').trigger('click')

    expect(apiMocks.applyCurrentParametersFromIndex).not.toHaveBeenCalled()
  })

  it('warns without opening the dialog when there are no samples', async () => {
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheet([]))
    const wrapper = mountPage()

    await openApplicationDialog(wrapper)

    expect(messageMocks.warning).toHaveBeenCalledWith('当天暂无可应用的样品')
    expect(wrapper.find('[data-testid="coefficient-application-dialog"]').exists()).toBe(false)
  })
})
