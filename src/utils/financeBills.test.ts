import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import {
  createPaidSettlementRemark,
  getMonthlySettlementDailyRowsFromSheet,
  getPrepaidDailyRowsFromSheet,
  getUnsettledRowsFromSheet,
  summarizeIncomeSheet,
  summarizeIncomeRows,
  summarizeMonthlySettlementReport,
  summarizePrepaidReport
} from './financeBills'

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

  it('counts prepaid income by recharge date and usable times instead of prepaid sample rows', () => {
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [
        makeBlock('001', 10, '预存款'),
        makeBlock('002', 20, '已结款')
      ]
    }

    const row = summarizeIncomeSheet(sheet)
    const report = summarizeIncomeRows('2026-06', [row], [
      { id: 'p-1', rechargeDate: '2026-06-30', customer: '客户甲', amount: 1000, usableTimes: 10, remark: '' },
      { id: 'p-2', rechargeDate: '2026-06-30', customer: '客户乙', amount: 500, usableTimes: 4, remark: '' }
    ])

    expect(row.statusSummaries.find((item) => item.status === '预存款')).toMatchObject({ count: 0, amount: 0 })
    expect(report.statusSummaries.find((item) => item.status === '预存款')).toMatchObject({ count: 14, amount: 1500 })
    expect(report.rows.find((item) => item.date === '2026-06-30')).toMatchObject({
      sampleCount: 14,
      totalAmount: 1500
    })
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
    sheet.sampleBlocks[1].inputs.customers = [
      {
        id: 'customer-001',
        name: '客户001',
        phone: '13800000001',
        wechat: 'wechat001',
        wechatNickname: '客户昵称',
        note: '重点客户'
      }
    ]
    Object.assign(sheet.sampleBlocks[0].inputs, { aluminumRaw: 1, siliconRaw: 1, sulfur: 0.5, whiteness: 80, elementNote: '铝、硅、铝硅比、硫、白度' })
    Object.assign(sheet.sampleBlocks[0].results, { aluminum: 10, silicon: 5, aluminumSiliconRatio: 2 })
    Object.assign(sheet.sampleBlocks[1].inputs, { aluminumRaw: 1, siliconRaw: 1, elementNote: '铝、硅、铝硅比' })
    Object.assign(sheet.sampleBlocks[1].results, { aluminum: 12, silicon: 6, aluminumSiliconRatio: 2 })

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

    expect(dailyRows).toMatchObject([
      {
        date: '2026-06-25',
        customer: '客户001',
        customerDisplay: '客户001 13800000001 wechat001 客户昵称 重点客户',
        sampleCount: 2,
        amount: 30,
        elementCounts: [
          { label: '铝', count: 2 },
          { label: '硅', count: 2 },
          { label: '铝硅比', count: 2 },
          { label: '硫', count: 1 },
          { label: '白度', count: 1 }
        ]
      }
    ])
    expect(report.totalSamples).toBe(2)
    expect(report.totalAmount).toBe(30)
    expect(report.summaryRows[0]).toMatchObject({
      month: '2026-06',
      customer: '客户001',
      customerDisplay: '客户001 13800000001 wechat001 客户昵称 重点客户',
      sampleCount: 2,
      amount: 30,
      settlementStatus: '部分结款',
      paidAmount: 12,
      remark: '已收 12'
    })
  })

  it('uses a fixed settled remark when monthly settlement status is paid', () => {
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [makeBlock('001', 100, '月结款')]
    }

    const dailyRows = getMonthlySettlementDailyRowsFromSheet(sheet)
    const report = summarizeMonthlySettlementReport('2026-06', dailyRows, [
      {
        id: '2026-06__客户001',
        month: '2026-06',
        customer: '客户001',
        sampleCount: 0,
        amount: 0,
        settlementStatus: '已结款',
        paidAmount: 100,
        remark: '未结款差额 ¥50.00'
      }
    ])

    expect(report.summaryRows[0]).toMatchObject({
      settlementStatus: '已结款',
      paidAmount: 100,
      remark: createPaidSettlementRemark()
    })
  })

  it('merges prepaid recharges and deducts daily prepaid sample usage by customer', () => {
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [
        makeBlock('001', 1, '预存款'),
        makeBlock('002', 2, '预存款'),
        makeBlock('003', 30, '月结款')
      ]
    }
    sheet.sampleBlocks[1].inputs.customerText = '客户001'

    const dailyRows = getPrepaidDailyRowsFromSheet(sheet)
    const report = summarizePrepaidReport(
      [
        { id: 'p-1', rechargeDate: '2026-06-20', customer: '客户001', amount: 300, usableTimes: 3, remark: '首次预存' },
        { id: 'p-2', rechargeDate: '2026-06-25', customer: '客户001', amount: 500, usableTimes: 5, remark: '' }
      ],
      dailyRows,
      { 客户001: '重点客户' },
      { '2026-06-25__客户001': '当天消耗' }
    )

    expect(dailyRows).toMatchObject([{ date: '2026-06-25', customer: '客户001', sampleCount: 3 }])
    expect(report.customerRows[0]).toMatchObject({
      customer: '客户001',
      totalAmount: 800,
      totalUsableTimes: 8,
      usedTimes: 3,
      availableTimes: 5,
      remark: '重点客户'
    })
    expect(report.dailyRows[0]).toMatchObject({ id: '2026-06-25__客户001', remark: '当天消耗' })
  })
})
