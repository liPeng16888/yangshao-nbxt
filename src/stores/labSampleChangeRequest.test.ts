// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreateLabSampleChangeRequestPayload,
  LabSampleChangeRequestDetail,
  LabSampleChangeRequestSummary
} from '@/types/labSampleChangeRequest'

const api = vi.hoisted(() => ({
  listLabSampleChangeRequests: vi.fn(), getLabSampleChangeRequest: vi.fn(),
  createLabSampleChangeRequest: vi.fn(), withdrawLabSampleChangeRequest: vi.fn()
}))

vi.mock('@/api/labSampleChangeRequest', () => api)

import { useLabSampleChangeRequestStore } from './labSampleChangeRequest'

function makeSummary(overrides: Partial<LabSampleChangeRequestSummary> = {}): LabSampleChangeRequestSummary {
  return {
    id: 'request-0', date: '2026-08-19', blockId: 'block-0', blockIndex: 1, sampleName: '样品', changedFieldLabels: ['铁'],
    reason: '更正原始记录', status: 'PENDING', review: null, withdrawnAt: null,
    createdAt: '2026-08-20T01:00:00.000Z', updatedAt: '2026-08-20T01:00:00.000Z', ...overrides
  }
}

const payload: CreateLabSampleChangeRequestPayload = {
  blockId: 'block-1', baseUpdatedAt: '2026-08-19T01:00:00.000Z', changes: { ironRaw: 2 }, reason: '更正原始记录'
}

describe('lab sample change request store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('maps pending requests by block and replaces the pending row after withdrawal', async () => {
    api.listLabSampleChangeRequests.mockResolvedValue([makeSummary({ id: 'request-1', blockId: 'block-1', status: 'PENDING' })])
    api.withdrawLabSampleChangeRequest.mockResolvedValue(makeSummary({ id: 'request-1', blockId: 'block-1', status: 'WITHDRAWN' }))
    const store = useLabSampleChangeRequestStore()

    await store.load({ date: '2026-08-19' })
    expect(store.pendingByBlock['block-1']?.id).toBe('request-1')
    await store.withdraw('request-1')

    expect(store.pendingByBlock['block-1']).toBeUndefined()
    expect(store.requests).toEqual([expect.objectContaining({ id: 'request-1', status: 'WITHDRAWN' })])
  })

  it('keeps the current request list and clears submitting after create failure', async () => {
    api.createLabSampleChangeRequest.mockRejectedValue(new Error('网络错误'))
    const store = useLabSampleChangeRequestStore()
    store.requests = [makeSummary({ id: 'existing' })]

    await expect(store.submit(payload)).rejects.toThrow('网络错误')

    expect(store.requests).toHaveLength(1)
    expect(store.submitting).toBe(false)
  })

  it('tracks detail loading and prepends a successful create without losing history', async () => {
    const created = makeSummary({ id: 'created', blockId: 'block-1' })
    const detail: LabSampleChangeRequestDetail = {
      ...created,
      sourceSnapshot: { inputs: {}, results: { iron: 0, silicon: 0, aluminum: 0, aluminumSiliconRatio: 0, total: 0, density: 0, calcium: 0, magnesium: 0, titanium: 0, bottleDensity: 0, moisture: 0, burnLoss: 0 }, parameterSnapshot: { ironBlank: 0, ironFactor: 0, siliconBlank: 0, siliconFactor: 0, aluminumFactor1: 0, aluminumFactor2: 0, calciumFactor: 0, magnesiumFactor: 0, titaniumFactor: 0 }, updatedAt: payload.baseUpdatedAt },
      requestedChanges: payload.changes, previewResults: { iron: 1, silicon: 0, aluminum: 0, aluminumSiliconRatio: 0, total: 0, density: 0, calcium: 0, magnesium: 0, titanium: 0, bottleDensity: 0, moisture: 0, burnLoss: 0 }, settlementEffects: []
    }
    api.createLabSampleChangeRequest.mockResolvedValue(created)
    api.getLabSampleChangeRequest.mockResolvedValue(detail)
    const store = useLabSampleChangeRequestStore()
    store.requests = [makeSummary({ id: 'terminal', status: 'APPROVED' })]

    await store.submit(payload)
    await store.loadDetail('created')

    expect(store.requests.map((row) => row.id)).toEqual(['created', 'terminal'])
    expect(store.detail).toEqual(detail)
    expect(store.loadingDetail).toBe(false)
  })
})
