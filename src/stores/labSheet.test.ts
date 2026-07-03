import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { useLabSheetStore } from './labSheet'

const apiMocks = vi.hoisted(() => ({
  addSampleBlocks: vi.fn(),
  createLabSheetEventSource: vi.fn(),
  getCurrentLabSheet: vi.fn(),
  getLabSheetByDate: vi.fn(),
  getLabSheetClientId: vi.fn(),
  saveSampleBlock: vi.fn(),
  updateCurrentParameters: vi.fn()
}))

const messageMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}))

type FakeEventSource = {
  close: ReturnType<typeof vi.fn>
  onerror: ((event: Event) => unknown) | null
  onmessage: ((event: MessageEvent) => unknown) | null
  onopen: ((event: Event) => unknown) | null
}

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
    updatedAt: '2026-06-25T00:00:00.000Z',
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
    apiMocks.createLabSheetEventSource.mockReturnValue(null)
    apiMocks.getLabSheetClientId.mockReturnValue('client-1')
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
    apiMocks.saveSampleBlock.mockImplementation(async (_sheetId: string, payload: { id: string; changedFields?: Partial<SampleBlock['inputs']> }) => {
      const sheet = makeSheet()
      const block = sheet.sampleBlocks.find((item) => item.id === payload.id) || sheet.sampleBlocks[0]
      const inputs = { ...block.inputs, ...(payload.changedFields || {}) }
      return {
        ...block,
        updatedAt: '2026-06-25T00:00:01.000Z',
        inputs,
        results: calculateSampleResults(inputs, block.parameterSnapshot)
      }
    })
    messageMocks.success.mockReset()
    messageMocks.error.mockReset()
    messageMocks.warning.mockReset()
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
        baseUpdatedAt: '2026-06-25T00:00:00.000Z',
        baseInputs: expect.objectContaining({ sampleNumber: '' }),
        changedFields: expect.objectContaining({ sampleNumber: 'A-001' })
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
        changedFields: expect.objectContaining({ sampleNumber: 'A-002' })
      })
    )
  })

  it('does not persist clean blocks when flushing the current sheet', async () => {
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    await store.persistAllBlocks({ silent: true })

    expect(apiMocks.saveSampleBlock).not.toHaveBeenCalled()
  })

  it('applies a remote saved block event when the local block is clean', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    source.onmessage?.({
      data: JSON.stringify({
        type: 'block-saved',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString(),
        block: makeBlock({ sampleNumber: 'REMOTE-001' })
      })
    } as MessageEvent)

    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('REMOTE-001')
  })

  it('refreshes the loaded sheet when realtime connection is established', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getLabSheetByDate.mockResolvedValue({
      ...makeSheet(),
      sampleBlocks: [makeBlock({ sampleNumber: 'PULLED-001' })]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    source.onmessage?.({
      data: JSON.stringify({
        type: 'connected',
        frontendUserId: 'front-1',
        date: '2026-06-25',
        updatedAt: new Date().toISOString()
      })
    } as MessageEvent)
    await Promise.resolve()
    await Promise.resolve()

    expect(apiMocks.getLabSheetByDate).toHaveBeenCalledWith('2026-06-25')
    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('PULLED-001')
  })

  it('keeps local edits when a remote saved block arrives during pending auto save', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'LOCAL-001' })
    source.onmessage?.({
      data: JSON.stringify({
        type: 'block-saved',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString(),
        block: makeBlock({ sampleNumber: 'REMOTE-001' })
      })
    } as MessageEvent)

    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('LOCAL-001')
  })

  it('keeps old parameter snapshots for filled blocks and applies new parameters to newly filled blocks', async () => {
    const oldParameters = { ...defaultLabParameters, ironFactor: 10 }
    const newParameters = { ...defaultLabParameters, ironFactor: 20 }
    const filledBlock = makeBlock({ ironRaw: 1 })
    filledBlock.parameterSnapshot = oldParameters
    filledBlock.results = calculateSampleResults(filledBlock.inputs, oldParameters)
    const emptyBlock = makeBlock()
    emptyBlock.id = 'block-2'
    emptyBlock.index = 2
    emptyBlock.inputs.sequence = '002'
    emptyBlock.parameterSnapshot = oldParameters
    emptyBlock.results = calculateSampleResults(emptyBlock.inputs, oldParameters)
    apiMocks.getCurrentLabSheet.mockResolvedValue({
      ...makeSheet(),
      parameters: oldParameters,
      sampleBlocks: [filledBlock, emptyBlock]
    })
    apiMocks.updateCurrentParameters.mockResolvedValue(newParameters)
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    await store.saveParameters(newParameters)
    store.patchBlock('block-1', { ironRaw: 2 })
    store.patchBlock('block-2', { ironRaw: 2 })

    expect(store.sampleBlocks[0].parameterSnapshot.ironFactor).toBe(10)
    expect(store.sampleBlocks[0].results.iron).toBe(19.6)
    expect(store.sampleBlocks[1].parameterSnapshot.ironFactor).toBe(20)
    expect(store.sampleBlocks[1].results.iron).toBe(39.2)
  })

  it('does not recalculate existing blocks when remote parameters are updated', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    const oldParameters = { ...defaultLabParameters, ironFactor: 10 }
    const newParameters = { ...defaultLabParameters, ironFactor: 20 }
    const filledBlock = makeBlock({ ironRaw: 1 })
    filledBlock.parameterSnapshot = oldParameters
    filledBlock.results = calculateSampleResults(filledBlock.inputs, oldParameters)
    apiMocks.getCurrentLabSheet.mockResolvedValue({
      ...makeSheet(),
      parameters: oldParameters,
      sampleBlocks: [filledBlock]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    source.onmessage?.({
      data: JSON.stringify({
        type: 'parameters-updated',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString(),
        parameters: newParameters
      })
    } as MessageEvent)

    expect(store.currentParameters?.ironFactor).toBe(20)
    expect(store.sampleBlocks[0].parameterSnapshot.ironFactor).toBe(10)
    expect(store.sampleBlocks[0].results.iron).toBe(9.6)
  })
})

function makeEventSource(): FakeEventSource {
  return {
    close: vi.fn(),
    onerror: null,
    onmessage: null,
    onopen: null
  }
}
