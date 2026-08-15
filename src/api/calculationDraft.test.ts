import { describe, expect, it, vi } from 'vitest'
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

function axiosResponseError(status: number, data: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data }
  })
}

describe('calculation draft transport', () => {
  it('uses the account-scoped draft endpoints and preserves the save body', async () => {
    vi.mocked(request.get).mockResolvedValueOnce(standardDraft)
    vi.mocked(request.put).mockResolvedValueOnce({ ...standardDraft, kind: 'COEFFICIENT' })

    await expect(getCalculationDraft('standard-sample')).resolves.toEqual(standardDraft)
    expect(request.get).toHaveBeenCalledWith('/calculation-drafts/standard-sample')

    const body = { baseRevision: 2, payload: standardPayload }
    await saveCalculationDraft('coefficient', body)
    expect(request.put).toHaveBeenCalledWith('/calculation-drafts/coefficient', body)
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
    })]
  ])('preserves %s as the original retryable request error', async (_label, transportError) => {
    vi.mocked(request.put).mockRejectedValueOnce(transportError)

    await expect(saveCalculationDraft('standard-sample', {
      baseRevision: 3,
      payload: standardPayload
    })).rejects.toBe(transportError)
  })
})
