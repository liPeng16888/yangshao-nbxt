import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import type { UnsettledSampleRow } from '@/types/financeBills'
import { useLabSheetStore } from './labSheet'
import { useFinanceBillsStore } from './financeBills'

const apiMocks = vi.hoisted(() => ({
  getIncomeBillReport: vi.fn(),
  getMonthlySettlementReport: vi.fn(),
  getUnsettledSamples: vi.fn(),
  markSampleAsPaid: vi.fn(),
  markSamplesAsPaid: vi.fn(),
  updateMonthlySettlementSummary: vi.fn()
}))

vi.mock('@/api/financeBills', () => apiMocks)

function makeBlock(paymentStatus: SampleBlock['inputs']['paymentStatus'], id = '2026-06-25-1'): SampleBlock {
  return {
    id,
    index: id.endsWith('-2') ? 2 : 1,
    readonly: false,
    inputs: {
      sequence: '001',
      sampleNumber: '粉矿',
      customerText: '客户甲',
      price: 80,
      paymentStatus
    },
    results: {
      iron: 0,
      silicon: 0,
      aluminum: 0,
      aluminumSiliconRatio: 0,
      total: 0,
      density: 0,
      calcium: 0,
      magnesium: 0,
      titanium: 0,
      bottleDensity: 0,
      moisture: 0,
      burnLoss: 0
    },
    parameterSnapshot: defaultLabParameters
  }
}

function makeSheet(): LabSheet {
  return {
    id: 'sheet-2026-06-25',
    date: '2026-06-25',
    readonly: false,
    parameters: defaultLabParameters,
    sampleBlocks: [makeBlock('未结款')]
  }
}

const row: UnsettledSampleRow = {
  date: '2026-06-25',
  sheetId: 'sheet-2026-06-25',
  blockId: '2026-06-25-1',
  sequence: '001',
  sampleNumber: '粉矿',
  customer: '客户甲',
  amount: 80
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('finance bills store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
  })

  it('commits only the latest income month when an older request resolves last', async () => {
    const july = deferred<any>()
    const june = deferred<any>()
    apiMocks.getIncomeBillReport.mockReturnValueOnce(july.promise).mockReturnValueOnce(june.promise)
    const store = useFinanceBillsStore()

    const julyLoad = store.loadIncomeReport('2026-07')
    const juneLoad = store.loadIncomeReport('2026-06')
    june.resolve({ month: '2026-06', totalSamples: 0, totalAmount: 0, statusSummaries: [], rows: [] })
    await juneLoad
    july.resolve({ month: '2026-07', totalSamples: 1, totalAmount: 1, statusSummaries: [], rows: [] })
    await julyLoad

    expect(store.month).toBe('2026-06')
    expect(store.incomeReport?.month).toBe('2026-06')
    expect(store.loading).toBe(false)
  })

  it('invalidates a pending income month load when its page unmounts', async () => {
    const pending = deferred<any>()
    apiMocks.getIncomeBillReport.mockReturnValueOnce(pending.promise)
    const store = useFinanceBillsStore()
    const load = store.loadIncomeReport('2026-07')

    store.cancelIncomeLoads()
    pending.resolve({ month: '2026-07', totalSamples: 1, totalAmount: 1, statusSummaries: [], rows: [] })
    await load

    expect(store.incomeReport).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('keeps only the latest unsettled refresh result', async () => {
    const older = deferred<UnsettledSampleRow[]>()
    const latest = deferred<UnsettledSampleRow[]>()
    apiMocks.getUnsettledSamples.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    const store = useFinanceBillsStore()

    const olderLoad = store.loadUnsettledRows()
    const latestLoad = store.loadUnsettledRows()
    latest.resolve([{ ...row, blockId: 'latest' }])
    await latestLoad
    older.resolve([{ ...row, blockId: 'older' }])
    await olderLoad

    expect(store.unsettledRows.map((item) => item.blockId)).toEqual(['latest'])
    expect(store.loading).toBe(false)
  })

  it('does not let a refresh started before settlement reinsert the paid row', async () => {
    const pending = deferred<UnsettledSampleRow[]>()
    apiMocks.getUnsettledSamples.mockReturnValueOnce(pending.promise)
    apiMocks.markSampleAsPaid.mockResolvedValue(makeBlock('已结款'))
    const store = useFinanceBillsStore()
    store.unsettledRows = [row]

    const load = store.loadUnsettledRows()
    await store.settleRow(row)
    pending.resolve([row])
    await load

    expect(store.unsettledRows).toEqual([])
  })

  it('invalidates a pending unsettled refresh when its page unmounts', async () => {
    const pending = deferred<UnsettledSampleRow[]>()
    apiMocks.getUnsettledSamples.mockReturnValueOnce(pending.promise)
    const store = useFinanceBillsStore()
    const load = store.loadUnsettledRows()

    store.cancelUnsettledLoads()
    pending.resolve([row])
    await load

    expect(store.unsettledRows).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('syncs paid status back into the loaded lab sheet cache', async () => {
    const labSheetStore = useLabSheetStore()
    labSheetStore.sheet = makeSheet()
    const financeBillsStore = useFinanceBillsStore()
    financeBillsStore.unsettledRows = [row]
    apiMocks.markSampleAsPaid.mockResolvedValue(makeBlock('已结款'))

    await financeBillsStore.settleRow(row)

    expect(financeBillsStore.unsettledRows).toEqual([])
    expect(labSheetStore.sheet?.sampleBlocks[0].inputs.paymentStatus).toBe('已结款')
  })

  it('removes every paid row and syncs matching blocks after a successful batch', async () => {
    const secondRow: UnsettledSampleRow = {
      ...row,
      blockId: '2026-06-25-2',
      sequence: '002',
      sampleNumber: '块矿',
      amount: 120
    }
    const labSheetStore = useLabSheetStore()
    labSheetStore.sheet = {
      ...makeSheet(),
      sampleBlocks: [makeBlock('未结款'), makeBlock('未结款', secondRow.blockId)]
    }
    const financeBillsStore = useFinanceBillsStore()
    financeBillsStore.unsettledRows = [row, secondRow]
    apiMocks.markSamplesAsPaid.mockResolvedValue([
      makeBlock('已结款'),
      makeBlock('已结款', secondRow.blockId)
    ])

    await financeBillsStore.settleRows([row, secondRow])

    expect(financeBillsStore.unsettledRows).toEqual([])
    expect(labSheetStore.sheet.sampleBlocks.map((block) => block.inputs.paymentStatus)).toEqual(['已结款', '已结款'])
    expect(financeBillsStore.settlingBatch).toBe(false)
  })

  it('keeps every row and restores batch state when the batch request fails', async () => {
    const financeBillsStore = useFinanceBillsStore()
    financeBillsStore.unsettledRows = [row]
    apiMocks.markSamplesAsPaid.mockRejectedValue(new Error('批量失败'))

    await expect(financeBillsStore.settleRows([row])).rejects.toThrow('批量失败')

    expect(financeBillsStore.unsettledRows).toEqual([row])
    expect(financeBillsStore.settlingBatch).toBe(false)
  })

  it('updates monthly settlement summary rows after saving', async () => {
    const financeBillsStore = useFinanceBillsStore()
    const row = {
      id: '2026-06__客户甲',
      month: '2026-06',
      customer: '客户甲',
      sampleCount: 2,
      amount: 100,
      settlementStatus: '未结款' as const,
      paidAmount: null,
      remark: ''
    }
    const savedRow = { ...row, settlementStatus: '部分结款' as const, paidAmount: 30, remark: '未结款差额 ¥70.00' }
    financeBillsStore.monthlySettlementReport = {
      month: '2026-06',
      totalSamples: 2,
      totalAmount: 100,
      dailyRows: [],
      summaryRows: [row]
    }
    apiMocks.updateMonthlySettlementSummary.mockResolvedValue(savedRow)

    await financeBillsStore.saveMonthlySettlementRow(savedRow)

    expect(financeBillsStore.monthlySettlementReport?.summaryRows[0]).toEqual(savedRow)
  })
})
