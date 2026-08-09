import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { useLabSheetStore } from '@/stores/labSheet'
import type { LabFormulaResult, LabSheet, SampleBlock } from '@/types/labSheet'
import CoefficientCalculationPage from './CoefficientCalculationPage.vue'

const apiMocks = vi.hoisted(() => ({
  applyCurrentParametersFromIndex: vi.fn(),
  createLabSheetEventSource: vi.fn(),
  getCurrentLabSheet: vi.fn(),
  getLabSheetClientId: vi.fn(),
  saveSampleBlock: vi.fn()
}))

const messageMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}))

const messageBoxMocks = vi.hoisted(() => ({ confirm: vi.fn() }))

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
  ElMessage: messageMocks,
  ElMessageBox: messageBoxMocks
}))

const ElCheckboxStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean },
  emits: ['change'],
  setup(props, { attrs, emit }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      'aria-pressed': String(props.modelValue),
      onClick: () => emit('change', !props.modelValue)
    })
  }
})

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
  const pinia = createPinia()
  const wrapper = mount(CoefficientCalculationPage, {
    global: {
      plugins: [pinia],
      stubs: {
        CoefficientApplicationDialog: CoefficientApplicationDialogStub,
        ElButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
        },
        ElInput: true,
        ElInputNumber: true,
        ElCheckbox: ElCheckboxStub
      }
    }
  })
  return { wrapper, store: useLabSheetStore(pinia) }
}

function seedIndependentRows(options: {
  standardRows?: Array<{ id: string; code: string; autoCode: boolean }>
  calculationRows?: Array<{ id: string; code: string; autoCode: boolean; inputs?: Record<string, null> }>
}) {
  window.localStorage.setItem('ys_coefficient_calculation_inputs:guest', JSON.stringify({
    parameters: { ironBlank: 0.123, ironFactor: 29.1 },
    standardRows: options.standardRows,
    calculationRows: options.calculationRows
  }))
}

function rowCodes(wrapper: VueWrapper, kind: 'standard' | 'calculation') {
  return wrapper.findAll(`[data-testid="${kind}-row"]`).map((row) => row.attributes('data-code'))
}

async function selectRow(wrapper: VueWrapper, kind: 'standard' | 'calculation', id: string) {
  await wrapper.get(`[data-testid="select-${kind}-row-${id}"]`).trigger('click')
  await nextTick()
}

async function openApplicationDialog(wrapper: ReturnType<typeof mountPage>['wrapper']) {
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
    apiMocks.saveSampleBlock.mockReset()
    apiMocks.saveSampleBlock.mockImplementation(async () => makeBlock(1))
    messageMocks.error.mockReset()
    messageMocks.success.mockReset()
    messageMocks.warning.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('keeps different stored row counts independent', () => {
    window.localStorage.setItem('ys_coefficient_calculation_inputs:guest', JSON.stringify({
      addCount: 2,
      standardRows: [{ code: '001' }, { code: '002' }],
      calculationRows: [{ code: '001', inputs: {} }]
    }))
    const { wrapper } = mountPage()
    expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(1)
  })

  it('migrates the legacy add count into two independent persisted counts', async () => {
    window.localStorage.setItem('ys_coefficient_calculation_inputs:guest', JSON.stringify({
      addCount: 2,
      standardRows: [{ code: '001' }],
      calculationRows: [{ code: '001', inputs: {} }]
    }))
    const { wrapper } = mountPage()
    await wrapper.get('[data-testid="add-standard-rows"]').trigger('click')
    await nextTick()
    const stored = JSON.parse(window.localStorage.getItem('ys_coefficient_calculation_inputs:guest')!)
    expect(stored.standardAddCount).toBe(2)
    expect(stored.calculationAddCount).toBe(2)
    expect(stored).not.toHaveProperty('addCount')
  })

  it('adds rows to each table independently', async () => {
    const { wrapper } = mountPage()
    const calculationBefore = wrapper.findAll('[data-testid="calculation-row"]').length
    await wrapper.get('[data-testid="add-standard-rows"]').trigger('click')
    expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(4)
    expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(calculationBefore)
    await wrapper.get('[data-testid="add-calculation-rows"]').trigger('click')
    expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(calculationBefore + 1)
  })

  it('deletes selected standard rows without touching calculation rows', async () => {
    seedIndependentRows({
      standardRows: [
        { id: 'standard-1', code: '001', autoCode: true },
        { id: 'standard-2', code: '002', autoCode: true },
        { id: 'standard-3', code: '003', autoCode: true }
      ],
      calculationRows: [
        { id: 'calculation-1', code: '001', autoCode: true, inputs: {} },
        { id: 'calculation-2', code: '002', autoCode: true, inputs: {} }
      ]
    })
    messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
    const { wrapper } = mountPage()
    const calculationCodesBefore = rowCodes(wrapper, 'calculation')

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await selectRow(wrapper, 'standard', 'standard-2')
    await wrapper.get('[data-testid="confirm-delete-standard-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002'])
    expect(rowCodes(wrapper, 'calculation')).toEqual(calculationCodesBefore)
    expect(messageBoxMocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining('002'),
      expect.stringContaining('标样含量'),
      expect.any(Object)
    )
  })

  it('keeps a custom calculation code when another calculation row is deleted', async () => {
    seedIndependentRows({
      calculationRows: [
        { id: 'calculation-1', code: '001', autoCode: true, inputs: {} },
        { id: 'calculation-2', code: 'CUSTOM', autoCode: false, inputs: {} },
        { id: 'calculation-3', code: '003', autoCode: true, inputs: {} }
      ]
    })
    messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
    const { wrapper } = mountPage()
    const standardBefore = rowCodes(wrapper, 'standard')

    await wrapper.get('[data-testid="delete-calculation-rows"]').trigger('click')
    await selectRow(wrapper, 'calculation', 'calculation-1')
    await wrapper.get('[data-testid="confirm-delete-calculation-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'calculation')).toEqual(['CUSTOM', '002'])
    expect(rowCodes(wrapper, 'standard')).toEqual(standardBefore)
  })

  it('refuses to delete every row and keeps at least one sample', async () => {
    seedIndependentRows({
      standardRows: [
        { id: 'standard-1', code: '001', autoCode: true },
        { id: 'standard-2', code: '002', autoCode: true }
      ]
    })
    const { wrapper } = mountPage()

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await selectRow(wrapper, 'standard', 'standard-1')
    await selectRow(wrapper, 'standard', 'standard-2')

    expect(wrapper.get('[data-testid="confirm-delete-standard-rows"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('至少保留一个样品')
    expect(messageBoxMocks.confirm).not.toHaveBeenCalled()
  })

  it('keeps rows and selections when the confirmation is cancelled', async () => {
    seedIndependentRows({
      standardRows: [
        { id: 'standard-1', code: '001', autoCode: true },
        { id: 'standard-2', code: '002', autoCode: true }
      ]
    })
    messageBoxMocks.confirm.mockRejectedValueOnce('cancel')
    const { wrapper } = mountPage()

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await selectRow(wrapper, 'standard', 'standard-2')
    await wrapper.get('[data-testid="confirm-delete-standard-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002'])
    expect(wrapper.get('[data-testid="standard-selection-count"]').text()).toContain('1')
  })

  it('loads samples and displays their sorted range before applying', async () => {
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)

    expect(apiMocks.getCurrentLabSheet).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="sample-range"]').text()).toBe('001～004')
  })

  it('applies the current parameters from the selected sample and confirms success', async () => {
    const { wrapper } = mountPage()

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
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)
    await wrapper.get('[data-testid="dialog-cancel"]').trigger('click')

    expect(apiMocks.applyCurrentParametersFromIndex).not.toHaveBeenCalled()
  })

  it('warns without opening the dialog when there are no samples', async () => {
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheet([]))
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)

    expect(messageMocks.warning).toHaveBeenCalledWith('当天暂无可应用的样品')
    expect(wrapper.find('[data-testid="coefficient-application-dialog"]').exists()).toBe(false)
  })

  it('keeps the dialog open and explains when saving samples before application fails', async () => {
    vi.useFakeTimers()
    const { wrapper, store } = mountPage()

    await openApplicationDialog(wrapper)
    apiMocks.saveSampleBlock.mockRejectedValueOnce({ response: { status: 400 } })
    store.patchBlock('block-1', { sampleNumber: 'DIRTY-001' })
    await wrapper.get('[data-testid="dialog-confirm"]').trigger('click')
    await vi.runAllTimersAsync()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="coefficient-application-dialog"]').exists()).toBe(true)
    expect(messageMocks.success).not.toHaveBeenCalled()
    expect(messageMocks.error).toHaveBeenCalledWith('应用系数前的数据保存失败，请处理后重试')
    vi.useRealTimers()
  })

  it('refreshes the current sheet and requires reselection when the chosen boundary no longer exists', async () => {
    apiMocks.getCurrentLabSheet
      .mockResolvedValueOnce(makeSheet([1, 2, 3, 4]))
      .mockResolvedValueOnce(makeSheet([1, 2]))
    apiMocks.applyCurrentParametersFromIndex.mockRejectedValueOnce({
      response: { data: { message: '起始样品不存在，请刷新后重新选择' } }
    })
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)
    await wrapper.get('[data-testid="dialog-confirm"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    await vi.waitFor(() => expect(apiMocks.getCurrentLabSheet).toHaveBeenCalledTimes(2))
    await nextTick()
    expect(wrapper.get('[data-testid="sample-range"]').text()).toBe('001～002')
    expect(wrapper.find('[data-testid="coefficient-application-dialog"]').exists()).toBe(true)
    expect(messageMocks.success).not.toHaveBeenCalled()
    expect(messageMocks.error).toHaveBeenCalledWith('起始样品已不存在，已刷新当天数据，请重新选择')
  })
})
