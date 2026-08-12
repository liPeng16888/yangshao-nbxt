import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnsettledSampleRow } from '@/types/financeBills'

const requestMock = vi.hoisted(() => ({ put: vi.fn() }))

vi.mock('@/utils/request', () => ({
  default: requestMock,
  useMocks: false
}))

import { markSamplesAsPaid } from './financeBills'

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
  beforeEach(() => requestMock.put.mockReset())

  it('sends unique block ids to the batch payment endpoint', async () => {
    requestMock.put.mockResolvedValue([{ id: 'block-1' }, { id: 'block-2' }])

    await markSamplesAsPaid([...rows, rows[0]])

    expect(requestMock.put).toHaveBeenCalledWith('/finance/unsettled-samples/paid', {
      blockIds: ['block-1', 'block-2']
    })
  })
})
