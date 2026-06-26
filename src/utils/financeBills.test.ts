import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import { getMonthlySettlementDailyRowsFromSheet, getUnsettledRowsFromSheet, summarizeIncomeSheet, summarizeMonthlySettlementReport } from './financeBills'

function makeBlock(id: string, price: number | null, paymentStatus = ''): SampleBlock {
  return {
    id,
    index: Number(id.replace(/\D/g, '')) || 1,
    readonly: false,
    inputs: {
      sequence: id,
      sampleNumber: `样品${id}`,
      customerText: `客户${id}`,
      price,
      paymentStatus: paymentStatus as SampleBlock['inputs']['paymentStatus']
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
    sampleBlocks: [
      makeBlock('001', 10, '已结款'),
      makeBlock('002', 20, '未结款'),
      makeBlock('003', null, '未结款'),
      makeBlock('004', 30, '月结款')
    ]
  }
}

describe('finance bill aggregation', () => {
  it('counts income samples by numeric sample amount and groups by payment status', () => {
    const row = summarizeIncomeSheet(makeSheet())

    expect(row.sampleCount).toBe(3)
    expect(row.totalAmount).toBe(60)
    expect(row.statusSummaries.find((item) => item.status === '已结款')).toMatchObject({ count: 1, amount: 10 })
    expect(row.statusSummaries.find((item) => item.status === '未结款')).toMatchObject({ count: 1, amount: 20 })
    expect(row.statusSummaries.find((item) => item.status === '月结款')).toMatchObject({ count: 1, amount: 30 })
  })

  it('lists only unpaid samples that have a numeric amount', () => {
    const rows = getUnsettledRowsFromSheet(makeSheet())

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      date: '2026-06-25',
      blockId: '002',
      amount: 20,
      customer: '客户002'
    })
  })

  it('groups monthly settlement samples by date and customer, then summarizes by customer for the month', () => {
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [
        makeBlock('001', 10, '月结款'),
        makeBlock('002', 20, '月结款'),
        makeBlock('003', 30, '已结款')
      ]
    }
    sheet.sampleBlocks[1].inputs.customerText = '客户001'

    const dailyRows = getMonthlySettlementDailyRowsFromSheet(sheet)
    const report = summarizeMonthlySettlementReport('2026-06', dailyRows, [
      {
        id: '2026-06__客户001',
        month: '2026-06',
        customer: '客户001',
        sampleCount: 0,
        amount: 0,
        settlementStatus: '部分结款',
        paidAmount: 12,
        remark: '已收 12'
      }
    ])

    expect(dailyRows).toMatchObject([{ date: '2026-06-25', customer: '客户001', sampleCount: 2, amount: 30 }])
    expect(report.totalSamples).toBe(2)
    expect(report.totalAmount).toBe(30)
    expect(report.summaryRows[0]).toMatchObject({
      month: '2026-06',
      customer: '客户001',
      sampleCount: 2,
      amount: 30,
      settlementStatus: '部分结款',
      paidAmount: 12,
      remark: '已收 12'
    })
  })
})
