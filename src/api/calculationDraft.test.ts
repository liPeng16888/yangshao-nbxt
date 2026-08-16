import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from '@/utils/request'
import {
  CalculationDraftConflictError,
  getCalculationDraft,
  saveCalculationDraft
} from './calculationDraft'

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn()
  }
}))

const standardPayload = {
  aluminum: { highStandard: 69.74, highReading: 7.7, lowStandard: 52, lowReading: 12.2, baseValue: 214.38 },
  silicon: { lowStandard: 4.88, lowReading: 0.405, highStandard: 17.05, highReading: 1.31 },
  iron: { lowStandard: 6.09, lowReading: 0.147, highStandard: 15.31, highReading: 0.461 }
}

const standardDraft = {
  kind: 'STANDARD_SAMPLE' as const,
  payload: standardPayload,
  revision: 4,
  updatedAt: '2026-08-15T08:00:00.000Z'
}

const coefficientPayload = {
  parameters: {
    ironBlank: 0.04,
    ironFactor: 29.1,
    siliconBlank: 0.027,
    siliconFactor: 13,
    aluminumFactor1: 0.502,
    aluminumFactor2: 4.98,
    calciumFactor: 1.15,
    magnesiumFactor: 0.556,
    titaniumFactor: 0.57
  },
  standardAddCount: 1,
  calculationAddCount: 1,
  standardRows: [{
    id: 'standard-1',
    code: '001',
    autoCode: true,
    aluminum: null,
    silicon: 1.2,
    iron: null,
    calcium: null,
    magnesium: null,
    titanium: null
  }],
  calculationRows: [{
    id: 'calculation-1',
    code: '001',
    autoCode: true,
    inputs: {
      ironRaw: null,
      siliconRaw: 0.2,
      aluminumRaw: null,
      calciumRaw: null,
      magnesiumRaw: null,
      titaniumRaw: null
    }
  }]
}

const coefficientDraft = {
  kind: 'COEFFICIENT' as const,
  payload: coefficientPayload,
  revision: 3,
  updatedAt: '2026-08-15T08:00:00.000Z'
}

function axiosResponseError(status: number, data: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data }
  })
}

describe('calculation draft transport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('uses the account-scoped draft endpoints and preserves the save body', async () => {
    vi.mocked(request.get).mockResolvedValueOnce(standardDraft)
    vi.mocked(request.put).mockResolvedValueOnce(coefficientDraft)

    await expect(getCalculationDraft('standard-sample')).resolves.toEqual(standardDraft)
    expect(request.get).toHaveBeenCalledWith('/calculation-drafts/standard-sample')

    const body = { baseRevision: 2, payload: coefficientPayload }
    await saveCalculationDraft('coefficient', body)
    expect(request.put).toHaveBeenCalledWith('/calculation-drafts/coefficient', body)
  })

  it.each([
    ['revision zero with a timestamp', { ...standardDraft, revision: 0 }],
    ['a positive revision with null updatedAt', { ...standardDraft, updatedAt: null }]
  ])('rejects a general draft response with %s', async (_label, malformed) => {
    vi.mocked(request.get).mockResolvedValueOnce(malformed)

    await expect(getCalculationDraft('standard-sample')).rejects.toThrow(TypeError)
  })

  it('maps only a structurally valid authoritative 409 into a typed conflict', async () => {
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: standardDraft
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    const failure = await saveCalculationDraft('standard-sample', {
      baseRevision: 3,
      payload: standardPayload
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CalculationDraftConflictError)
    expect(failure).toMatchObject({ serverDraft: standardDraft, cause: transportError })
  })

  it('preserves a revision-zero conflict response as the original request error', async () => {
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...standardDraft, revision: 0, updatedAt: null }
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('standard-sample', {
      baseRevision: 0,
      payload: standardPayload
    })).rejects.toBe(transportError)
  })

  it('rejects a successful save response that is not exactly baseRevision plus one', async () => {
    vi.mocked(request.put).mockResolvedValueOnce(standardDraft)

    await expect(saveCalculationDraft('standard-sample', {
      baseRevision: 1,
      payload: standardPayload
    })).rejects.toThrow(TypeError)
  })

  it('preserves a 409 whose server revision still equals the submitted base revision', async () => {
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: standardDraft
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('standard-sample', {
      baseRevision: 4,
      payload: standardPayload
    })).rejects.toBe(transportError)
  })

  it('deep-clones and freezes an authoritative conflict before exposing it', async () => {
    const mutableDraft = structuredClone(standardDraft)
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: mutableDraft
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    const failure = await saveCalculationDraft('standard-sample', {
      baseRevision: 3,
      payload: standardPayload
    }).catch((error: unknown) => error) as CalculationDraftConflictError<typeof standardPayload>
    mutableDraft.revision = 99
    mutableDraft.payload.aluminum.highStandard = 1

    expect(failure.serverDraft.revision).toBe(4)
    expect(failure.serverDraft.payload.aluminum.highStandard).toBe(69.74)
    expect(Object.isFrozen(failure.serverDraft)).toBe(true)
    expect(Object.isFrozen(failure.serverDraft.payload.aluminum)).toBe(true)
  })

  it.each([
    ['an empty standard payload', {}],
    ['an extra standard field', { ...standardPayload, extra: true }],
    ['a missing standard field', { ...standardPayload, aluminum: { ...standardPayload.aluminum, baseValue: undefined } }],
    ['a non-finite standard value', { ...standardPayload, silicon: { ...standardPayload.silicon, lowReading: Number.NaN } }]
  ])('preserves a 409 with %s as the original request error', async (_label, payload) => {
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...standardDraft, payload }
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('standard-sample', {
      baseRevision: 3,
      payload: standardPayload
    })).rejects.toBe(transportError)
  })

  it.each([
    ['missing coefficient parameters', { ...coefficientPayload, parameters: {} }],
    ['an invalid add count', { ...coefficientPayload, standardAddCount: 0 }],
    ['duplicate trimmed standard ids', {
      ...coefficientPayload,
      standardRows: [coefficientPayload.standardRows[0], { ...coefficientPayload.standardRows[0], id: ' standard-1 ' }]
    }],
    ['an overlong row code', {
      ...coefficientPayload,
      standardRows: [{ ...coefficientPayload.standardRows[0], code: 'x'.repeat(41) }]
    }],
    ['an invalid row boolean', {
      ...coefficientPayload,
      standardRows: [{ ...coefficientPayload.standardRows[0], autoCode: 'true' }]
    }],
    ['a missing raw input', {
      ...coefficientPayload,
      calculationRows: [{
        ...coefficientPayload.calculationRows[0],
        inputs: { ...coefficientPayload.calculationRows[0].inputs, titaniumRaw: undefined }
      }]
    }],
    ['an extra calculation row field', {
      ...coefficientPayload,
      calculationRows: [{ ...coefficientPayload.calculationRows[0], extra: true }]
    }]
  ])('preserves a coefficient 409 with %s as the original request error', async (_label, payload) => {
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...coefficientDraft, payload }
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('coefficient', {
      baseRevision: 1,
      payload: coefficientPayload
    })).rejects.toBe(transportError)
  })

  it('preserves a coefficient 409 with sparse rows as the original request error', async () => {
    const sparseRows = Array(2) as typeof coefficientPayload.standardRows
    sparseRows[1] = coefficientPayload.standardRows[0]
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: {
        ...coefficientDraft,
        payload: { ...coefficientPayload, standardRows: sparseRows }
      }
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('coefficient', {
      baseRevision: 1,
      payload: coefficientPayload
    })).rejects.toBe(transportError)
  })

  it('preserves the original 409 when inspecting a malformed server draft throws', async () => {
    const malformed = {
      kind: 'STANDARD_SAMPLE',
      revision: 4,
      updatedAt: null
    } as Record<string, unknown>
    Object.defineProperty(malformed, 'payload', {
      enumerable: true,
      get() { throw new Error('malformed getter') }
    })
    const transportError = axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: malformed
    })
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('standard-sample', {
      baseRevision: 3,
      payload: standardPayload
    })).rejects.toBe(transportError)
  })

  it.each([
    ['a Task 5 service-unavailable response', axiosResponseError(503, { message: 'temporarily unavailable' })],
    ['a generic 409', axiosResponseError(409, { message: 'conflict' })],
    ['a 409 without a server payload', axiosResponseError(409, { code: 'CALCULATION_DRAFT_CONFLICT' })],
    ['a 409 with an invalid revision', axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...standardDraft, revision: -1 }
    })],
    ['a 409 for another draft kind', axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...standardDraft, kind: 'COEFFICIENT' }
    })],
    ['a 409 with a malformed payload', axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...standardDraft, payload: undefined }
    })],
    ['a 409 with an invalid timestamp', axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...standardDraft, updatedAt: '2026-08-15' }
    })],
    ['a 409 with an unsafe revision', axiosResponseError(409, {
      code: 'CALCULATION_DRAFT_CONFLICT',
      serverDraft: { ...standardDraft, revision: Number.MAX_SAFE_INTEGER + 1 }
    })]
  ])('preserves %s as the original retryable request error', async (_label, transportError) => {
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('standard-sample', {
      baseRevision: 3,
      payload: standardPayload
    })).rejects.toBe(transportError)
  })
})
