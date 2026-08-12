import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockLabSheetByDate, mockSampleDetectionReport, mockSaveSampleBlock } from './db'

afterEach(() => vi.useRealTimers())

describe('mock report shared prepaid income', () => {
  it('includes active shared paid principal in the report range', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-10T08:00:00.000Z'))
    const sheet = await mockLabSheetByDate('2026-08-10')
    await mockSaveSampleBlock(sheet.id, {
      id: sheet.sampleBlocks[0].id,
      changedFields: { price: 100, paymentStatus: '预存款' }
    })
    const report = await mockSampleDetectionReport({
      mode: 'custom',
      startDate: '2026-08-10',
      endDate: '2026-08-10'
    })

    expect(report.summary.totalPrice).toBe(1000)
    expect(report.summary.totalSamples).toBe(1)
    expect(report.summary.statusSummaries.find((row) => row.status === '预存款')?.amount).toBe(1000)
    expect(report.summary.statusSummaries.find((row) => row.status === '预存款')?.count).toBe(1)
  })
})
