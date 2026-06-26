import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { useLabSheetStore } from './labSheet'

const apiMocks = vi.hoisted(() => ({
  addSampleBlocks: vi.fn(),
  getCurrentLabSheet: vi.fn(),
  getLabSheetByDate: vi.fn(),
  saveSampleBlock: vi.fn(),
  updateCurrentParameters: vi.fn()
}))

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('@/api/labSheet', () => apiMocks)
vi.mock('element-plus', () => ({
  ElMessage: messageMocks
}))

function makeBlock(overrides: Partial<SampleBlock['inputs']> = {}): SampleBlock {
  const inputs = {
    sequence: '001',
    sampleNumber: '',
    customerText: '',
    customerIds: [],
    customers: [],
    price: null,
    ...overrides
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

function makeSheet(): LabSheet {
  return {
    id: 'sheet-1',
    date: '2026-06-25',
    readonly: false,
    parameters: defaultLabParameters,
    sampleBlocks: [makeBlock()]
  }
}

describe('labSheet store auto save', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheet())
    apiMocks.getLabSheetByDate.mockResolvedValue(makeSheet())
    apiMocks.updateCurrentParameters.mockResolvedValue(defaultLabParameters)
    apiMocks.addSampleBlocks.mockImplementation(async (_sheetId: string, count: number) => {
      const sheet = makeSheet()
      for (let index = 0; index < count; index += 1) {
        sheet.sampleBlocks.push({ ...makeBlock(), id: `block-${index + 2}`, index: index + 2 })
      }
      return sheet
    })
    apiMocks.saveSampleBlock.mockImplementation(async (_sheetId: string, block: SampleBlock) => ({
      ...block,
      results: calculateSampleResults(block.inputs, block.parameterSnapshot)
    }))
    messageMocks.success.mockReset()
    messageMocks.error.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('automatically saves an edited block after a short idle delay', async () => {
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'A-001' })

    expect(store.autoSaveStatus).toBe('pending')
    expect(apiMocks.saveSampleBlock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(1)
    expect(apiMocks.saveSampleBlock).toHaveBeenCalledWith(
      'sheet-1',
      expect.objectContaining({
        id: 'block-1',
        inputs: expect.objectContaining({ sampleNumber: 'A-001' })
      })
    )
    expect(store.autoSaveStatus).toBe('saved')
    expect(store.lastAutoSavedAt).not.toBe('')
  })

  it('debounces repeated edits and only persists the latest block state', async () => {
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'A-001' })
    await vi.advanceTimersByTimeAsync(450)
    store.patchBlock('block-1', { sampleNumber: 'A-002' })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(1)
    expect(apiMocks.saveSampleBlock).toHaveBeenCalledWith(
      'sheet-1',
      expect.objectContaining({
        inputs: expect.objectContaining({ sampleNumber: 'A-002' })
      })
    )
  })
})
