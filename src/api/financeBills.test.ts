import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnsettledSampleRow } from '@/types/financeBills'

const requestMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))

vi.mock('@/utils/request', () => ({
  default: requestMock,
  useMocks: false
}))

import { getIncomeBillReport, getUnsettledSamples, markSamplesAsPaid } from './financeBills'

const rows: UnsettledSampleRow[] = [
  {
    date: '2026-08-08',
    sheetId: 'sheet-1',
    blockId: 'block-1',
    sequence: '001',
    sampleNumber: '样品1',
    customer: '客户甲',
    amount: 80
  },
  {
    date: '2026-08-08',
    sheetId: 'sheet-1',
    blockId: 'block-2',
    sequence: '002',
    sampleNumber: '样品2',
    customer: '客户乙',
    amount: 120
  }
]

describe('finance bills batch payment API', () => {
  beforeEach(() => {
    requestMock.get.mockReset()
    requestMock.put.mockReset()
  })

  it('forwards scoped abort signals without changing finance GET endpoints', async () => {
    const incomeController = new AbortController()
    const unsettledController = new AbortController()
    requestMock.get.mockResolvedValueOnce({ month: '2026-08', totalSamples: 0, totalAmount: 0, statusSummaries: [], rows: [] })
      .mockResolvedValueOnce([])

    await getIncomeBillReport('2026-08', { signal: incomeController.signal })
    await getUnsettledSamples({ signal: unsettledController.signal })

    expect(requestMock.get).toHaveBeenNthCalledWith(1, '/finance/income-bills', {
      params: { month: '2026-08' },
      signal: incomeController.signal
    })
    expect(requestMock.get).toHaveBeenNthCalledWith(2, '/finance/unsettled-samples', {
      signal: unsettledController.signal
    })
  })

  it('sends unique block ids to the batch payment endpoint', async () => {
    requestMock.put.mockResolvedValue([{ id: 'block-1' }, { id: 'block-2' }])

    await markSamplesAsPaid([...rows, rows[0]])

    expect(requestMock.put).toHaveBeenCalledWith('/finance/unsettled-samples/paid', {
      blockIds: ['block-1', 'block-2']
    })
  })
})
