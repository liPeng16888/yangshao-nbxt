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
  updateMonthlySettlementSummary: vi.fn()
}))

vi.mock('@/api/financeBills', () => apiMocks)

function makeBlock(paymentStatus: SampleBlock['inputs']['paymentStatus']): SampleBlock {
  return {
    id: '2026-06-25-1',
    index: 1,
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

describe('finance bills store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMocks.markSampleAsPaid.mockReset()
    apiMocks.updateMonthlySettlementSummary.mockReset()
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
