import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { Customer } from '@/types/customer'
import {
  sampleRetestInputFields,
  type LabSheet,
  type SampleBlock,
  type SampleRetest,
  type SampleRetestInput
} from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { useLabSheetStore } from './labSheet'

const apiMocks = vi.hoisted(() => ({
  addSampleBlocks: vi.fn(),
  applyCurrentParametersFromIndex: vi.fn(),
  createLabSheetEventSource: vi.fn(),
  createSampleRetests: vi.fn(),
  deleteSampleRetest: vi.fn(),
  getCurrentLabSheet: vi.fn(),
  getLabSheetByDate: vi.fn(),
  getLabSheetClientId: vi.fn(),
  saveSampleBlock: vi.fn(),
  saveSampleRetest: vi.fn(),
  voidSampleRetest: vi.fn(),
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

function makeRetest(
  id = 'retest-1',
  inputs: SampleRetestInput = {},
  overrides: Partial<SampleRetest> = {}
): SampleRetest {
  const completeInputs = Object.fromEntries(sampleRetestInputFields.map((field) => [field, null])) as SampleRetestInput
  const mergedInputs = { ...completeInputs, ...inputs }
  const parameterSnapshot = overrides.parameterSnapshot || { ...defaultLabParameters }
  return {
    id,
    sampleBlockId: 'block-1',
    sequence: 1,
    status: 'ACTIVE',
    everFilled: false,
    readonly: false,
    sensitiveFieldsHidden: false,
    inputs: mergedInputs,
    results: calculateSampleResults(mergedInputs, parameterSnapshot),
    parameterSnapshot,
    voidReason: null,
    createdById: 'front-1',
    updatedById: 'front-1',
    voidedById: null,
    createdAt: '2026-06-25T00:00:00.000Z',
    updatedAt: '2026-06-25T00:00:00.000Z',
    voidedAt: null,
    ...overrides
  }
}

function makeSheetWithRetests(...retests: SampleRetest[]): LabSheet {
  const next = makeSheet()
  next.sampleBlocks[0].retests = retests
  return next
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
    apiMocks.createSampleRetests.mockReset()
    apiMocks.deleteSampleRetest.mockReset()
    apiMocks.saveSampleRetest.mockReset()
    apiMocks.voidSampleRetest.mockReset()
    apiMocks.updateCurrentParameters.mockResolvedValue(defaultLabParameters)
    apiMocks.addSampleBlocks.mockImplementation(async (_sheetId: string, count: number) => {
      const sheet = makeSheet()
      for (let index = 0; index < count; index += 1) {
        sheet.sampleBlocks.push({ ...makeBlock(), id: `block-${index + 2}`, index: index + 2 })
      }
      return sheet
    })
    apiMocks.createSampleRetests.mockImplementation(async (_sheetId: string, payload: { sampleBlockIds: string[] }) => (
      payload.sampleBlockIds.map((sampleBlockId, index) => makeRetest(`retest-${index + 1}`, {}, {
        sampleBlockId,
        sequence: 1
      }))
    ))
    apiMocks.deleteSampleRetest.mockImplementation(async (_sheetId: string, retestId: string) => ({
      id: retestId,
      sampleBlockId: 'block-1',
      deleted: true as const
    }))
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
    apiMocks.saveSampleRetest.mockImplementation(async (_sheetId: string, retestId: string, payload: { changedFields: SampleRetestInput }) => {
      const inputs = { ...makeRetest(retestId).inputs, ...payload.changedFields }
      return makeRetest(retestId, inputs, {
        everFilled: Object.values(inputs).some((value) => typeof value === 'number'),
        updatedAt: '2026-06-25T00:00:01.000Z'
      })
    })
    apiMocks.voidSampleRetest.mockImplementation(async (_sheetId: string, retestId: string, payload: { reason?: string }) => (
      makeRetest(retestId, {}, {
        status: 'VOID',
        readonly: true,
        voidReason: payload.reason || null,
        voidedById: 'front-1',
        voidedAt: '2026-06-25T00:00:02.000Z',
        updatedAt: '2026-06-25T00:00:02.000Z'
      })
    ))
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

  it('creates retests, auto-saves each retest independently, and keeps its frozen snapshot', async () => {
    const snapshot = { ...defaultLabParameters, ironBlank: 0, ironFactor: 17 }
    const createdRetest = makeRetest('retest-created', {}, { parameterSnapshot: snapshot })
    apiMocks.createSampleRetests.mockResolvedValue([createdRetest])
    apiMocks.saveSampleRetest.mockImplementation(async (_sheetId: string, retestId: string, payload: { changedFields: SampleRetestInput }) => (
      makeRetest(retestId, payload.changedFields, {
        parameterSnapshot: snapshot,
        updatedAt: '2026-06-25T00:00:01.000Z'
      })
    ))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    const [created] = await store.createRetests(['block-1'])
    store.patchRetest('block-1', created.id, { ironRaw: 1 })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.createSampleRetests).toHaveBeenCalledWith('sheet-1', {
      sampleBlockIds: ['block-1'],
      idempotencyKey: expect.any(String)
    })
    expect(apiMocks.saveSampleRetest).toHaveBeenCalledWith('sheet-1', created.id, expect.objectContaining({
      baseUpdatedAt: created.updatedAt,
      baseInputs: { ironRaw: null },
      changedFields: { ironRaw: 1 },
      idempotencyKey: expect.any(String)
    }))
    expect(store.sampleBlocks[0].retests[0].parameterSnapshot).toEqual(snapshot)
    expect(store.sampleBlocks[0].retests[0].results.iron).toBe(17)
  })

  it('debounces repeated edits to the same retest and saves only its latest values', async () => {
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheetWithRetests(makeRetest()))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })
    await vi.advanceTimersByTimeAsync(450)
    store.patchRetest('block-1', 'retest-1', { ironRaw: 2 })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(1)
    expect(apiMocks.saveSampleRetest).toHaveBeenCalledWith('sheet-1', 'retest-1', expect.objectContaining({
      changedFields: { ironRaw: 2 }
    }))
  })

  it('allows different retests to save concurrently while serializing each retest', async () => {
    let resolveFirst!: (value: SampleRetest) => void
    let resolveSecond!: (value: SampleRetest) => void
    const firstSave = new Promise<SampleRetest>((resolve) => { resolveFirst = resolve })
    const secondSave = new Promise<SampleRetest>((resolve) => { resolveSecond = resolve })
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(
      makeRetest('retest-1'),
      makeRetest('retest-2', {}, { sequence: 2 })
    ))
    apiMocks.saveSampleRetest.mockImplementation((_sheetId: string, retestId: string) => (
      retestId === 'retest-1' ? firstSave : secondSave
    ))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })
    store.patchRetest('block-1', 'retest-2', { siliconRaw: 2 })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(2)
    expect(store.autoSaving).toBe(true)
    resolveFirst(makeRetest('retest-1', { ironRaw: 1 }, { updatedAt: '2026-06-25T00:00:01.000Z' }))
    resolveSecond(makeRetest('retest-2', { siliconRaw: 2 }, { sequence: 2, updatedAt: '2026-06-25T00:00:01.000Z' }))
    await Promise.resolve()
    await Promise.resolve()
  })

  it('keeps one retest save chain serialized when realtime observes the in-flight value', async () => {
    const source = makeEventSource()
    let resolveFirst!: (value: SampleRetest) => void
    const firstSave = new Promise<SampleRetest>((resolve) => { resolveFirst = resolve })
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.getLabSheetByDate.mockResolvedValue(makeSheetWithRetests(makeRetest('retest-1', { ironRaw: 1 }, {
      updatedAt: '2026-06-25T00:00:01.000Z'
    })))
    apiMocks.saveSampleRetest
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce(makeRetest('retest-1', { ironRaw: 1, siliconRaw: 2 }, {
        updatedAt: '2026-06-25T00:00:02.000Z'
      }))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })
    await vi.advanceTimersByTimeAsync(900)

    source.onmessage?.({ data: JSON.stringify({
      type: 'retests-changed', date: '2026-06-25', sheetId: 'sheet-1', sourceClientId: 'client-2', updatedAt: new Date().toISOString()
    }) } as MessageEvent)
    await vi.waitFor(() => expect(store.pendingAutoSaveCount).toBe(0))
    store.patchRetest('block-1', 'retest-1', { siliconRaw: 2 })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(1)
    resolveFirst(makeRetest('retest-1', { ironRaw: 1 }, { updatedAt: '2026-06-25T00:00:01.000Z' }))
    await vi.runAllTimersAsync()
    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(2)
  })

  it('keeps one retest failure visible when a different concurrent retest succeeds later', async () => {
    let resolveSecond!: (value: SampleRetest) => void
    const secondSave = new Promise<SampleRetest>((resolve) => { resolveSecond = resolve })
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(
      makeRetest('retest-1'),
      makeRetest('retest-2', {}, { sequence: 2 })
    ))
    apiMocks.saveSampleRetest.mockImplementation((_sheetId: string, retestId: string) => {
      if (retestId === 'retest-1') return Promise.reject({ response: { status: 400 }, message: 'bad request' })
      return secondSave
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })
    store.patchRetest('block-1', 'retest-2', { siliconRaw: 2 })
    await vi.advanceTimersByTimeAsync(900)
    await vi.waitFor(() => expect(store.autoSaveStatus).toBe('error'))

    resolveSecond(makeRetest('retest-2', { siliconRaw: 2 }, {
      sequence: 2,
      updatedAt: '2026-06-25T00:00:01.000Z'
    }))
    await Promise.resolve()
    await Promise.resolve()

    expect(store.autoSaveStatus).toBe('error')
    expect(store.pendingAutoSaveCount).toBe(1)
    expect(store.sampleBlocks[0].retests[0].inputs.ironRaw).toBe(1)
  })

  it('reuses the exact prepared retest payload and idempotency key for transient retries', async () => {
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.saveSampleRetest
      .mockRejectedValueOnce({ response: { status: 500 }, message: 'server error' })
      .mockResolvedValueOnce(makeRetest('retest-1', { ironRaw: 1 }, { updatedAt: '2026-06-25T00:00:01.000Z' }))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })
    await vi.advanceTimersByTimeAsync(900)
    await vi.advanceTimersByTimeAsync(1000)

    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(2)
    const firstPayload = apiMocks.saveSampleRetest.mock.calls[0][2]
    const retryPayload = apiMocks.saveSampleRetest.mock.calls[1][2]
    expect(retryPayload).toBe(firstPayload)
    expect(retryPayload.idempotencyKey).toEqual(expect.any(String))
  })

  it('rebases a later retest edit after prepared work resolves and gives it a new key', async () => {
    let resolveFirst!: (value: SampleRetest) => void
    const firstSave = new Promise<SampleRetest>((resolve) => { resolveFirst = resolve })
    const snapshot = { ...defaultLabParameters, ironBlank: 0, ironFactor: 11 }
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest('retest-1', {}, { parameterSnapshot: snapshot })))
    apiMocks.saveSampleRetest
      .mockReturnValueOnce(firstSave)
      .mockResolvedValueOnce(makeRetest('retest-1', { ironRaw: 2 }, {
        parameterSnapshot: snapshot,
        updatedAt: '2026-06-25T00:00:02.000Z'
      }))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })
    await vi.advanceTimersByTimeAsync(900)
    const firstPayload = apiMocks.saveSampleRetest.mock.calls[0][2]
    store.patchRetest('block-1', 'retest-1', { ironRaw: 2 })
    await vi.advanceTimersByTimeAsync(900)
    resolveFirst(makeRetest('retest-1', { ironRaw: 1 }, {
      parameterSnapshot: snapshot,
      updatedAt: '2026-06-25T00:00:01.000Z'
    }))
    await vi.runAllTimersAsync()

    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(2)
    expect(apiMocks.saveSampleRetest.mock.calls[1][2]).toEqual(expect.objectContaining({
      baseUpdatedAt: '2026-06-25T00:00:01.000Z',
      baseInputs: { ironRaw: 1 },
      changedFields: { ironRaw: 2 }
    }))
    expect(apiMocks.saveSampleRetest.mock.calls[1][2].idempotencyKey).not.toBe(firstPayload.idempotencyKey)
    expect(store.sampleBlocks[0].retests[0].inputs.ironRaw).toBe(2)
    expect(store.sampleBlocks[0].retests[0].results.iron).toBe(22)
  })

  it('keeps local retest values, field conflicts, and its v2 draft after a 409', async () => {
    const remote = makeRetest('retest-1', { ironRaw: 3 }, { updatedAt: '2026-06-25T00:00:02.000Z' })
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.saveSampleRetest.mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: 'SAMPLE_RETEST_INPUT_CONFLICT',
          message: '该复样已被另一台设备修改，请确认后再保存',
          fields: ['ironRaw'],
          retest: remote
        }
      }
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchRetest('block-1', 'retest-1', { ironRaw: 2 })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(1)
    expect(store.sampleBlocks[0].retests[0].inputs.ironRaw).toBe(2)
    expect(store.autoSaveStatus).toBe('conflict')
    expect(store.conflictBlockIds).toContain('retest-1')
    const draftKey = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .find((key) => key?.startsWith('ys_lab_draft:v1:front-1:front-1:2026-06-25:sheet-1'))
    expect(JSON.parse(window.localStorage.getItem(draftKey!)!)).toMatchObject({
      version: 2,
      retests: {
        'retest-1': {
          sampleBlockId: 'block-1',
          fields: { ironRaw: { value: 2 } }
        }
      }
    })
  })

  it('restores a v2 retest draft and its prepared key after recreating the store', async () => {
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheetWithRetests(makeRetest()))
    apiMocks.saveSampleRetest.mockRejectedValueOnce({ response: { status: 400 }, message: 'bad request' })
    const firstStore = useLabSheetStore()
    await firstStore.loadCurrentSheet()
    firstStore.patchRetest('block-1', 'retest-1', { ironRaw: 4 })
    await vi.advanceTimersByTimeAsync(900)
    const firstKey = apiMocks.saveSampleRetest.mock.calls[0][2].idempotencyKey

    apiMocks.saveSampleRetest.mockResolvedValueOnce(makeRetest('retest-1', { ironRaw: 4 }, {
      updatedAt: '2026-06-25T00:00:01.000Z'
    }))
    setActivePinia(createPinia())
    const restoredStore = useLabSheetStore()
    await restoredStore.loadCurrentSheet()

    expect(restoredStore.sampleBlocks[0].retests[0].inputs.ironRaw).toBe(4)
    expect(restoredStore.pendingAutoSaveCount).toBe(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(apiMocks.saveSampleRetest.mock.calls[1][2].idempotencyKey).toBe(firstKey)
  })

  it('still restores version 1 original-block drafts without retest data', async () => {
    window.localStorage.setItem('ys_lab_draft:v1:front-1:front-1:2026-06-25:sheet-1', JSON.stringify({
      version: 1,
      owner: 'front-1:front-1',
      sheetId: 'sheet-1',
      date: '2026-06-25',
      expiresAt: Date.now() + 60_000,
      blocks: {
        'block-1': {
          updatedAt: '2026-06-25T00:00:00.000Z',
          fields: { sampleNumber: { baseValue: '', value: 'V1-DRAFT', revision: 1 } },
          changeLogFields: []
        }
      }
    }))
    const store = useLabSheetStore()

    await store.loadCurrentSheet()

    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('V1-DRAFT')
    expect(store.pendingAutoSaveCount).toBe(1)
  })

  it('flushes original and retest edits together and blocks a date change if either fails', async () => {
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.saveSampleBlock.mockRejectedValue({ response: { status: 400 }, message: 'block failed' })
    apiMocks.saveSampleRetest.mockRejectedValue({ response: { status: 400 }, message: 'retest failed' })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { sampleNumber: 'LOCAL-BLOCK' })
    store.patchRetest('block-1', 'retest-1', { ironRaw: 5 })

    const loaded = await store.loadSheetByDate('2026-06-24')

    expect(loaded).toBe(false)
    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(1)
    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(1)
    expect(apiMocks.getLabSheetByDate).not.toHaveBeenCalled()
    expect(store.sheet?.date).toBe('2026-06-25')
    expect(store.sampleBlocks[0].inputs.sampleNumber).toBe('LOCAL-BLOCK')
    expect(store.sampleBlocks[0].retests[0].inputs.ironRaw).toBe(5)
    expect(store.pendingAutoSaveCount).toBe(2)
  })

  it('flushes all work before one deduplicated in-flight create request', async () => {
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    const created = makeRetest('retest-created', {}, { sequence: 2 })
    apiMocks.createSampleRetests.mockResolvedValue([created])
    apiMocks.saveSampleBlock.mockImplementation(async (_sheetId: string, payload: { changedFields?: Partial<SampleBlock['inputs']> }) => {
      const block = makeBlock(payload.changedFields)
      block.updatedAt = '2026-06-25T00:00:01.000Z'
      block.retests = [makeRetest()]
      return block
    })
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchBlock('block-1', { sampleNumber: 'FLUSH-BLOCK' })
    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })

    const [first, second] = await Promise.all([
      store.createRetests(['block-1']),
      store.createRetests(['block-1'])
    ])

    expect(apiMocks.saveSampleBlock.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.createSampleRetests.mock.invocationCallOrder[0])
    expect(apiMocks.saveSampleRetest.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.createSampleRetests.mock.invocationCallOrder[0])
    expect(apiMocks.createSampleRetests).toHaveBeenCalledTimes(1)
    expect(apiMocks.createSampleRetests.mock.calls[0][1].idempotencyKey).toEqual(expect.any(String))
    expect(first).toEqual(second)
    expect(store.sampleBlocks[0].retests.map((item) => item.id)).toEqual(['retest-1', 'retest-created'])
  })

  it('ignores edits to readonly, void, and protected retests and rejects historical creation', async () => {
    const current = makeSheetWithRetests(
      makeRetest('readonly-retest', {}, { readonly: true }),
      makeRetest('void-retest', {}, { status: 'VOID', readonly: true, sequence: 2 }),
      makeRetest('protected-retest', {}, { sensitiveFieldsHidden: true, sequence: 3 })
    )
    apiMocks.getCurrentLabSheet.mockResolvedValue(current)
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    store.patchRetest('block-1', 'readonly-retest', { ironRaw: 1 })
    store.patchRetest('block-1', 'void-retest', { ironRaw: 2 })
    store.patchRetest('block-1', 'protected-retest', { ironRaw: 3 })
    await vi.advanceTimersByTimeAsync(900)

    expect(apiMocks.saveSampleRetest).not.toHaveBeenCalled()
    expect(store.sampleBlocks[0].retests.map((item) => item.inputs.ironRaw)).toEqual([null, null, null])

    store.sheet!.readonly = true
    await expect(store.createRetests(['block-1'])).rejects.toThrow('历史日期表格仅支持查看，不能创建复样')
    expect(apiMocks.createSampleRetests).not.toHaveBeenCalled()
  })

  it('persists one target retest immediately through its public method', async () => {
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchRetest('block-1', 'retest-1', { ironRaw: 6 })

    const result = await store.persistRetest('block-1', 'retest-1')

    expect(result).toMatchObject({ success: true, conflict: false })
    expect(apiMocks.saveSampleRetest).toHaveBeenCalledTimes(1)
    expect(store.pendingAutoSaveCount).toBe(0)
  })

  it('deletes a blank retest and clears its timer, queue, conflict, and draft state', async () => {
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })
    store.patchRetest('block-1', 'retest-1', { ironRaw: null })

    const deleted = await store.deleteRetestRecord('block-1', 'retest-1')
    await vi.advanceTimersByTimeAsync(900)

    expect(deleted).toBe(true)
    expect(apiMocks.deleteSampleRetest).toHaveBeenCalledWith('sheet-1', 'retest-1', {
      baseUpdatedAt: '2026-06-25T00:00:00.000Z',
      idempotencyKey: expect.any(String)
    })
    expect(apiMocks.saveSampleRetest).not.toHaveBeenCalled()
    expect(store.sampleBlocks[0].retests).toEqual([])
    expect(store.pendingAutoSaveCount).toBe(0)
    expect(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)))
      .not.toEqual(expect.arrayContaining([expect.stringContaining('ys_lab_draft:v1:front-1:front-1:2026-06-25:sheet-1')]))
  })

  it('flushes a retest before voiding and replaces it with the readonly server DTO', async () => {
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    const voided = makeRetest('retest-1', { ironRaw: 7 }, {
      everFilled: true,
      status: 'VOID',
      readonly: true,
      voidReason: '复核失败',
      voidedById: 'front-1',
      voidedAt: '2026-06-25T00:00:02.000Z',
      updatedAt: '2026-06-25T00:00:02.000Z'
    })
    apiMocks.voidSampleRetest.mockResolvedValue(voided)
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchRetest('block-1', 'retest-1', { ironRaw: 7 })

    const result = await store.voidRetestRecord('block-1', 'retest-1', '复核失败')

    expect(result).toEqual(voided)
    expect(apiMocks.saveSampleRetest.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.voidSampleRetest.mock.invocationCallOrder[0])
    expect(apiMocks.voidSampleRetest).toHaveBeenCalledWith('sheet-1', 'retest-1', {
      baseUpdatedAt: '2026-06-25T00:00:01.000Z',
      idempotencyKey: expect.any(String),
      reason: '复核失败'
    })
    expect(store.sampleBlocks[0].retests[0]).toEqual(voided)
    expect(store.pendingAutoSaveCount).toBe(0)
  })

  it('treats retests-changed as untrusted and refetches the authorized sheet', async () => {
    const source = makeEventSource()
    const remote = makeRetest('retest-server', { ironRaw: 8 })
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.getLabSheetByDate.mockResolvedValue(makeSheetWithRetests(remote))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    apiMocks.getLabSheetByDate.mockClear()

    source.onmessage?.({ data: JSON.stringify({
      type: 'retests-changed',
      date: '2026-06-25',
      sheetId: 'sheet-1',
      sampleBlockId: 'block-1',
      sampleRetestId: 'untrusted-retest',
      sourceClientId: 'client-2',
      updatedAt: new Date().toISOString(),
      retest: makeRetest('untrusted-retest', { ironRaw: 999 })
    }) } as MessageEvent)

    await vi.waitFor(() => {
      expect(apiMocks.getLabSheetByDate).toHaveBeenCalledWith('2026-06-25')
      expect(store.sampleBlocks[0].retests.map((item) => item.id)).toEqual(['retest-server'])
    })
  })

  it('merges clean remote retest fields while preserving locally dirty fields', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.getLabSheetByDate.mockResolvedValue(makeSheetWithRetests(makeRetest('retest-1', { siliconRaw: 2 }, {
      updatedAt: '2026-06-25T00:00:01.000Z'
    })))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })

    source.onmessage?.({ data: JSON.stringify({
      type: 'retests-changed', date: '2026-06-25', sheetId: 'sheet-1', sourceClientId: 'client-2', updatedAt: new Date().toISOString()
    }) } as MessageEvent)

    await vi.waitFor(() => {
      expect(store.sampleBlocks[0].retests[0].inputs).toMatchObject({ ironRaw: 1, siliconRaw: 2 })
      expect(store.autoSaveStatus).toBe('pending')
    })
  })

  it('preserves a local retest value and records a same-field realtime conflict', async () => {
    const source = makeEventSource()
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.getLabSheetByDate.mockResolvedValue(makeSheetWithRetests(makeRetest('retest-1', { ironRaw: 9 }, {
      updatedAt: '2026-06-25T00:00:01.000Z'
    })))
    const store = useLabSheetStore()
    await store.loadCurrentSheet()
    store.patchRetest('block-1', 'retest-1', { ironRaw: 1 })

    source.onmessage?.({ data: JSON.stringify({
      type: 'retests-changed', date: '2026-06-25', sheetId: 'sheet-1', sourceClientId: 'client-2', updatedAt: new Date().toISOString()
    }) } as MessageEvent)

    await vi.waitFor(() => {
      expect(store.sampleBlocks[0].retests[0].inputs.ironRaw).toBe(1)
      expect(store.autoSaveStatus).toBe('conflict')
      expect(store.conflictBlockIds).toContain('retest-1')
    })
  })

  it('does not let an old-sheet retest refetch overwrite a newly loaded date', async () => {
    const source = makeEventSource()
    let resolveOldPull!: (value: LabSheet) => void
    const oldPull = new Promise<LabSheet>((resolve) => { resolveOldPull = resolve })
    const newSheet = makeSheetWithRetests(makeRetest('new-date-retest', { ironRaw: 10 }))
    newSheet.id = 'sheet-2'
    newSheet.date = '2026-06-24'
    apiMocks.createLabSheetEventSource.mockReturnValue(source)
    apiMocks.getCurrentLabSheet.mockResolvedValue(makeSheetWithRetests(makeRetest()))
    apiMocks.getLabSheetByDate.mockImplementation(async (date: string) => date === '2026-06-25' ? oldPull : newSheet)
    const store = useLabSheetStore()
    await store.loadCurrentSheet()

    source.onmessage?.({ data: JSON.stringify({
      type: 'retests-changed', date: '2026-06-25', sheetId: 'sheet-1', sourceClientId: 'client-2', updatedAt: new Date().toISOString()
    }) } as MessageEvent)
    await Promise.resolve()
    const loaded = await store.loadSheetByDate('2026-06-24')
    resolveOldPull(makeSheetWithRetests(makeRetest('stale-retest', { ironRaw: 999 })))
    await Promise.resolve()
    await Promise.resolve()

    expect(loaded).toBe(true)
    expect(store.sheet?.id).toBe('sheet-2')
    expect(store.sampleBlocks[0].retests.map((item) => item.id)).toEqual(['new-date-retest'])
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
    expect(messageMocks.success).not.toHaveBeenCalled()
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
