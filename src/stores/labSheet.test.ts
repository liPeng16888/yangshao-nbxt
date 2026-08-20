import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { Customer } from '@/types/customer'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { useLabSheetStore } from './labSheet'

const apiMocks = vi.hoisted(() => ({
  addSampleBlocks: vi.fn(),
  applyCurrentParametersFromIndex: vi.fn(),
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

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    }
  }
}

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
    parameterSnapshot: defaultLabParameters,
    retests: []
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

function makeSegmentedSheet(startIndex: number): LabSheet {
  const oldParameters = { ...defaultLabParameters, ironFactor: 10 }
  const newParameters = { ...defaultLabParameters, ironFactor: 20 }
  const firstBlock = makeBlock({ ironRaw: 1 })
  firstBlock.parameterSnapshot = oldParameters
  firstBlock.results = calculateSampleResults(firstBlock.inputs, oldParameters)
  const secondBlock = makeBlock({ ironRaw: 2 })
  secondBlock.id = 'block-2'
  secondBlock.index = startIndex
  secondBlock.inputs.sequence = String(startIndex).padStart(3, '0')
  secondBlock.parameterSnapshot = newParameters
  secondBlock.results = calculateSampleResults(secondBlock.inputs, newParameters)

  return {
    id: 'sheet-1',
    date: '2026-06-25',
    readonly: false,
    parameters: newParameters,
    sampleBlocks: [firstBlock, secondBlock]
  }
}

describe('labSheet store auto save', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage()
    })
    window.localStorage.clear()
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'front-1', dataOwnerId: 'front-1', account: 'front-1' }))
    apiMocks.createLabSheetEventSource.mockReturnValue(null)
    apiMocks.getLabSheetClientId.mockReturnValue('client-1')
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheet())
    apiMocks.getLabSheetByDate.mockImplementation(async () => makeSheet())
    apiMocks.applyCurrentParametersFromIndex.mockReset()
    apiMocks.applyCurrentParametersFromIndex.mockImplementation(async () => makeSheet())
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

  it('persists recipient customer fields through the field-level save payload', async () => {
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    const recipient = { id: 'customer-2', name: '李总' } as Customer

    store.patchBlock('block-1', {
      recipientCustomerId: recipient.id,
      recipientCustomerIds: [recipient.id],
      recipientCustomers: [recipient],
      recipientCustomerText: recipient.name
    })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledWith(
      'sheet-1',
      expect.objectContaining({
        id: 'block-1',
        changedFields: expect.objectContaining({
          recipientCustomerId: 'customer-2',
          recipientCustomerIds: ['customer-2'],
          recipientCustomers: [recipient],
          recipientCustomerText: '李总'
        })
      })
    )
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

  it('retries transient failures and keeps a recoverable local draft', async () => {
    apiMocks.saveSampleBlock.mockRejectedValue({ response: { status: 500 }, message: 'server error' })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'LOCAL-DRAFT' })
    await vi.advanceTimersByTimeAsync(900)
    await vi.runAllTimersAsync()

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(4)
    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('LOCAL-DRAFT')
    expect(store.autoSaveStatus).toBe('error')
    expect(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))).toEqual(
      expect.arrayContaining([expect.stringContaining('ys_lab_draft:v1:front-1:front-1:2026-06-25:sheet-1')])
    )
  })

  it('creates one idempotency key and reuses the same payload object for transient retries', async () => {
    apiMocks.saveSampleBlock
      .mockRejectedValueOnce({ response: { status: 500 }, message: 'server error' })
      .mockResolvedValueOnce(makeBlock({ sampleNumber: 'RETRIED' }))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'RETRIED' })
    await vi.advanceTimersByTimeAsync(900)
    await vi.advanceTimersByTimeAsync(1000)

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(2)
    const firstPayload = apiMocks.saveSampleBlock.mock.calls[0][1]
    const retriedPayload = apiMocks.saveSampleBlock.mock.calls[1][1]
    expect(firstPayload).toBe(retriedPayload)
    expect(firstPayload.idempotencyKey).toEqual(expect.any(String))
    expect(firstPayload.idempotencyKey).not.toBe('')
  })

  it('does not retry an insufficient-balance conflict and preserves the dirty draft with the latest balance message', async () => {
    apiMocks.saveSampleBlock.mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: 'PREPAID_BALANCE_INSUFFICIENT',
          message: '会员预付余额不足',
          availableBalance: '20.00'
        }
      },
      message: 'Request failed with status code 409'
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', {
      paymentStatus: '预存款',
      price: 100,
      prepaidMemberId: 'member-1',
      prepaidMemberPhone: '13800000000'
    })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(1)
    expect(store.sampleBlocks[0].inputs).toMatchObject({
      paymentStatus: '预存款',
      price: 100,
      prepaidMemberId: 'member-1',
      prepaidMemberPhone: '13800000000'
    })
    expect(store.pendingAutoSaveCount).toBe(1)
    expect(store.autoSaveStatus).toBe('error')
    expect(store.autoSaveError).toBe('会员预付余额不足，当前可用余额：20.00 元')
    expect(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))).toEqual(
      expect.arrayContaining([expect.stringContaining('ys_lab_draft:v1:front-1:front-1:2026-06-25:sheet-1')])
    )
  })

  it('reuses the prepared request key when a 409 save is retried later', async () => {
    apiMocks.saveSampleBlock
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'PREPAID_BALANCE_INSUFFICIENT', message: '余额不足' } }
      })
      .mockResolvedValueOnce(makeBlock({ sampleNumber: 'RETRY-409' }))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { sampleNumber: 'RETRY-409' })
    await vi.advanceTimersByTimeAsync(900)

    const firstPayload = apiMocks.saveSampleBlock.mock.calls[0][1]
    const result = await store.retryFailedSaves()
    const retriedPayload = apiMocks.saveSampleBlock.mock.calls[1][1]

    expect(result.success).toBe(true)
    expect(retriedPayload).toBe(firstPayload)
    expect(retriedPayload.idempotencyKey).toBe(firstPayload.idempotencyKey)
  })

  it('restores the prepared idempotency key with a local draft after reload', async () => {
    apiMocks.saveSampleBlock.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'PREPAID_BALANCE_INSUFFICIENT', message: '余额不足' } }
    })
    const firstStore = useLabSheetStore()
    await firstStore.loadCurrentSheet()
    firstStore.patchBlock('block-1', { sampleNumber: 'RESTORE-KEY' })
    await vi.advanceTimersByTimeAsync(900)
    const firstKey = apiMocks.saveSampleBlock.mock.calls[0][1].idempotencyKey

    apiMocks.saveSampleBlock.mockImplementation(async (_sheetId: string, payload: { id: string }) => (
      makeBlock({ sampleNumber: payload.id === 'block-1' ? 'RESTORE-KEY' : '' })
    ))
    setActivePinia(createPinia())
    const restoredStore = useLabSheetStore()
    await restoredStore.loadCurrentSheet()
    await vi.advanceTimersByTimeAsync(0)

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(2)
    expect(apiMocks.saveSampleBlock.mock.calls[1][1].idempotencyKey).toBe(firstKey)
  })

  it('creates a new idempotency key when the prepared request contents change after 409', async () => {
    apiMocks.saveSampleBlock
      .mockRejectedValueOnce({
        response: { status: 409, data: { code: 'PREPAID_BALANCE_INSUFFICIENT', message: '余额不足' } }
      })
      .mockResolvedValueOnce(makeBlock({ sampleNumber: 'CHANGED', note: '新备注' }))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { sampleNumber: 'CHANGED' })
    await vi.advanceTimersByTimeAsync(900)
    const firstKey = apiMocks.saveSampleBlock.mock.calls[0][1].idempotencyKey

    store.patchBlock('block-1', { note: '新备注' })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(2)
    expect(apiMocks.saveSampleBlock.mock.calls[1][1].idempotencyKey).not.toBe(firstKey)
  })

  it('isolates a subaccount draft by both shared owner and actual actor', async () => {
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'sub-1', dataOwnerId: 'front-1', account: 'sub-1' }))
    apiMocks.saveSampleBlock.mockRejectedValue({ response: { status: 400 }, message: 'bad request' })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'SUB-DRAFT' })
    await vi.advanceTimersByTimeAsync(900)

    expect(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))).toEqual(
      expect.arrayContaining([expect.stringContaining('ys_lab_draft:v1:front-1:sub-1:2026-06-25:sheet-1')])
    )
  })

  it('restores an unsaved local draft after the store is recreated', async () => {
    apiMocks.saveSampleBlock.mockRejectedValue({ response: { status: 400 }, message: 'bad request' })
    const firstStore = useLabSheetStore()
    await firstStore.loadCurrentSheet()
    firstStore.patchBlock('block-1', { sampleNumber: 'RESTORED-DRAFT' })
    await vi.advanceTimersByTimeAsync(900)

    setActivePinia(createPinia())
    const restoredStore = useLabSheetStore()
    await restoredStore.loadCurrentSheet()

    expect(restoredStore.sampleBlocks[0].inputs.sampleNumber).toBe('RESTORED-DRAFT')
    expect(restoredStore.pendingAutoSaveCount).toBe(1)
  })

  it('stops a date change when pending data cannot be saved', async () => {
    apiMocks.saveSampleBlock.mockRejectedValue({ response: { status: 400 }, message: 'bad request' })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { sampleNumber: 'KEEP-CURRENT' })

    const loaded = await store.loadSheetByDate('2026-06-24')

    expect(loaded).toBe(false)
    expect(apiMocks.getLabSheetByDate).not.toHaveBeenCalled()
    expect(store.sheet?.date).toBe('2026-06-25')
    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('KEEP-CURRENT')
  })

  it('rebases a newer edit on an earlier in-flight save result', async () => {
    let resolveFirstSave!: (value: SampleBlock) => void
    const firstSave = new Promise<SampleBlock>((resolve) => {
      resolveFirstSave = resolve
    })
    apiMocks.saveSampleBlock
      .mockReturnValueOnce(firstSave)
      .mockImplementationOnce(async (_sheetId: string, payload: { changedFields?: Partial<SampleBlock['inputs']> }) => {
        const block = makeBlock({ sampleNumber: String(payload.changedFields?.sampleNumber || '') })
        block.updatedAt = '2026-06-25T00:00:02.000Z'
        return block
      })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'FIRST' })
    await vi.advanceTimersByTimeAsync(900)
    store.patchBlock('block-1', { sampleNumber: 'SECOND' })
    await vi.advanceTimersByTimeAsync(900)
    const firstSavedBlock = makeBlock({ sampleNumber: 'FIRST' })
    firstSavedBlock.updatedAt = '2026-06-25T00:00:01.000Z'
    resolveFirstSave(firstSavedBlock)
    await vi.runAllTimersAsync()

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(2)
    expect(apiMocks.saveSampleBlock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        baseUpdatedAt: '2026-06-25T00:00:01.000Z',
        changedFields: expect.objectContaining({ sampleNumber: 'SECOND' })
      })
    )
    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('SECOND')
    expect(store.autoSaveStatus).toBe('saved')
  })

  it('does not persist clean blocks when flushing the current sheet', async () => {
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    await store.persistAllBlocks({ silent: true })

    expect(apiMocks.saveSampleBlock).not.toHaveBeenCalled()
  })

  it('flushes pending edits before replacing the sheet with segmented parameters', async () => {
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { ironRaw: 1 })
    const newSheet = makeSegmentedSheet(2)
    apiMocks.applyCurrentParametersFromIndex.mockResolvedValue(newSheet)

    const applied = await store.applyParametersFromIndex(newSheet.parameters, 2)

    expect(applied).toBe(true)
    expect(apiMocks.saveSampleBlock.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.applyCurrentParametersFromIndex.mock.invocationCallOrder[0]
    )
    expect(store.sheet).toEqual(newSheet)
    expect(store.pendingAutoSaveCount).toBe(0)
  })

  it('does not apply parameters when pending sample edits cannot be saved', async () => {
    apiMocks.saveSampleBlock.mockRejectedValue({ response: { status: 400 }, message: 'bad request' })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { ironRaw: 1 })

    const applied = await store.applyParametersFromIndex(defaultLabParameters, 1)

    expect(applied).toBe(false)
    expect(apiMocks.applyCurrentParametersFromIndex).not.toHaveBeenCalled()
    expect(store.sampleBlocks[0].inputs.ironRaw).toBe(1)
  })

  it('keeps apply mutually exclusive and blocks new sample edits until the response settles', async () => {
    let resolveApply!: (sheet: LabSheet) => void
    const deferredApply = new Promise<LabSheet>((resolve) => {
      resolveApply = resolve
    })
    apiMocks.applyCurrentParametersFromIndex.mockReturnValue(deferredApply)
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    const firstApply = store.applyParametersFromIndex(defaultLabParameters, 1)
    await Promise.resolve()
    await Promise.resolve()
    const applyingDuringRequest = store.applyingParameters
    const originalSampleNumber = store.sampleBlocks[0].inputs.sampleNumber
    store.patchBlock('block-1', { sampleNumber: 'MUST-NOT-BE-EDITED' })
    const secondApply = store.applyParametersFromIndex(defaultLabParameters, 1)
    await Promise.resolve()
    const callsDuringRequest = apiMocks.applyCurrentParametersFromIndex.mock.calls.length

    resolveApply(makeSheet())
    const [firstResult, secondResult] = await Promise.all([firstApply, secondApply])

    expect(applyingDuringRequest).toBe(true)
    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe(originalSampleNumber)
    expect(callsDuringRequest).toBe(1)
    expect(firstResult).toBe(true)
    expect(secondResult).toBe(false)
    expect(store.applyingParameters).toBe(false)
  })

  it('refreshes a clean block after a remote save signal', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getLabSheetByDate.mockResolvedValue({
      ...makeSheet(),
      sampleBlocks: [makeBlock({ sampleNumber: 'REMOTE-001' })]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    source.onmessage?.({
      data: JSON.stringify({
        type: 'block-saved',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString()
      })
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('REMOTE-001')
    })
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

  it('treats sheet-reloaded as an untrusted signal and pulls with this client access context', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getLabSheetByDate.mockResolvedValue({
      ...makeSheet(),
      sampleBlocks: [makeBlock({ sampleNumber: 'GRANT-FILTERED-PULL' })]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    apiMocks.getLabSheetByDate.mockClear()

    source.onmessage?.({
      data: JSON.stringify({
        type: 'sheet-reloaded',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString(),
        sheet: {
          ...makeSheet(),
          sampleBlocks: [makeBlock({ sampleNumber: 'UNTRUSTED-SSE-SNAPSHOT' })]
        }
      })
    } as MessageEvent)
    await Promise.resolve()
    await Promise.resolve()

    expect(apiMocks.getLabSheetByDate).toHaveBeenCalledWith('2026-06-25')
    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('GRANT-FILTERED-PULL')
  })

  it('treats block-saved as an untrusted signal and pulls with this client access context', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getLabSheetByDate.mockResolvedValue({
      ...makeSheet(),
      sampleBlocks: [makeBlock({ sampleNumber: 'GRANT-FILTERED-BLOCK-PULL' })]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    apiMocks.getLabSheetByDate.mockClear()

    source.onmessage?.({
      data: JSON.stringify({
        type: 'block-saved',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString(),
        block: makeBlock({ sampleNumber: 'UNTRUSTED-SSE-BLOCK' })
      })
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(apiMocks.getLabSheetByDate).toHaveBeenCalledWith('2026-06-25')
      expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('GRANT-FILTERED-BLOCK-PULL')
    })
  })

  it('keeps local edits when a remote saved block arrives during pending auto save', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getLabSheetByDate.mockResolvedValue(makeSheet())
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { sampleNumber: 'LOCAL-001' })
    source.onmessage?.({
      data: JSON.stringify({
        type: 'block-saved',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString()
      })
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(apiMocks.getLabSheetByDate).toHaveBeenCalledWith('2026-06-25')
      expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('LOCAL-001')
    })
  })

  it('merges remote changes to clean fields while preserving local dirty fields', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getLabSheetByDate.mockResolvedValue({
      ...makeSheet(),
      sampleBlocks: [makeBlock({ price: 88 })]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { sampleNumber: 'LOCAL-001' })

    source.onmessage?.({
      data: JSON.stringify({
        type: 'block-saved',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString()
      })
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('LOCAL-001')
      expect(store.sampleBlocks[0].inputs.price).toBe(88)
      expect(store.autoSaveStatus).toBe('pending')
    })
  })

  it('keeps the local value and marks a true same-field remote conflict', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getLabSheetByDate.mockResolvedValue({
      ...makeSheet(),
      sampleBlocks: [makeBlock({ sampleNumber: 'REMOTE-001' })]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { sampleNumber: 'LOCAL-001' })

    source.onmessage?.({
      data: JSON.stringify({
        type: 'block-saved',
        date: '2026-06-25',
        sheetId: 'sheet-1',
        sourceClientId: 'client-2',
        updatedAt: new Date().toISOString()
      })
    } as MessageEvent)

    await vi.waitFor(() => {
      expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('LOCAL-001')
      expect(store.autoSaveStatus).toBe('conflict')
      expect(store.conflictBlockIds).toEqual(['block-1'])
    })
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

  it('keeps an explicitly segmented blank snapshot when it receives its first detection input', async () => {
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const parametersB = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const emptySegmentedBlock = makeBlock()
    emptySegmentedBlock.parameterSnapshot = { ...parametersA, segmentedApplication: true }
    apiMocks.getCurrentLabSheet.mockResolvedValue({
      ...makeSheet(),
      parameters: parametersB,
      sampleBlocks: [emptySegmentedBlock]
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchBlock('block-1', { ironRaw: 2 })

    expect(store.sampleBlocks[0].parameterSnapshot).toMatchObject({
      ironFactor: 10,
      segmentedApplication: true
    })
    expect(store.sampleBlocks[0].results.iron).toBe(20)
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
