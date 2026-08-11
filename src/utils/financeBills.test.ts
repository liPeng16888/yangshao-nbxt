import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import {
  createPaidSettlementRemark,
  filterMonthlySettlementDailyRows,
  filterUnsettledRows,
  getMonthlySettlementDailyRowsFromSheet,
  getUnsettledRowsFromSheet,
  summarizeIncomeSheet,
  summarizeIncomeRows,
  summarizeMonthlySettlementReport
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

  it('counts prepaid samples once and recognizes paid principal without gift or sample price as income', () => {
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [
        makeBlock('001', 10, '预存款'),
        makeBlock('002', 20, '已结款')
      ]
    }

    const row = summarizeIncomeSheet(sheet)
    const report = summarizeIncomeRows('2026-06', [row], [{
      rechargeDate: '2026-06-25',
      paidAmount: 1000,
      giftAmount: 100,
      totalAmount: 1100
    }])

    expect(row.statusSummaries.find((item) => item.status === '预存款')).toMatchObject({ count: 1, amount: 0 })
    expect(report.statusSummaries.find((item) => item.status === '预存款')).toMatchObject({ count: 1, amount: 1000 })
    expect(report.rows.find((item) => item.date === '2026-06-25')).toMatchObject({
      sampleCount: 2,
      totalAmount: 1020
    })
    expect(report.totalAmount).toBe(1020)
    expect(report.totalSamples).toBe(2)
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

  it('filters unsettled samples by one or multiple selected customers', () => {
    const rows = [
      { date: '2026-06-25', sheetId: 's1', blockId: 'b1', sequence: '001', sampleNumber: '样品1', customer: '客户甲', amount: 10 },
      { date: '2026-06-25', sheetId: 's1', blockId: 'b2', sequence: '002', sampleNumber: '样品2', customer: '客户乙', amount: 20 },
      { date: '2026-06-25', sheetId: 's1', blockId: 'b3', sequence: '003', sampleNumber: '样品3', customer: '客户丙', amount: 30 }
    ]

    expect(filterUnsettledRows(rows, [])).toEqual(rows)
    expect(filterUnsettledRows(rows, ['客户乙']).map((row) => row.customer)).toEqual(['客户乙'])
    expect(filterUnsettledRows(rows, ['客户甲', '客户丙']).map((row) => row.customer)).toEqual(['客户甲', '客户丙'])
  })

  it('uses only the payer for unsettled and monthly settlement finance ownership', () => {
    const payer = {
      id: 'customer-wang',
      name: '王总',
      phone: '13055558888',
      wechat: 'wangzong',
      wechatNickname: '王总微信',
      note: '付款客户'
    }
    const recipient = {
      id: 'customer-li',
      name: '李总',
      phone: '13900000000',
      note: '仅接收数据'
    }
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [
        makeBlock('001', 10, '未结款'),
        makeBlock('002', 20, '月结款'),
        makeBlock('003', 3, '预存款')
      ]
    }

    sheet.sampleBlocks.forEach((block) => {
      Object.assign(block.inputs, {
        customerId: payer.id,
        customerIds: [payer.id],
        customers: [payer],
        customerText: payer.name,
        recipientCustomerId: recipient.id,
        recipientCustomerIds: [recipient.id],
        recipientCustomers: [recipient],
        recipientCustomerText: recipient.name
      })
    })

    const unsettledRows = getUnsettledRowsFromSheet(sheet)
    const monthlyRows = getMonthlySettlementDailyRowsFromSheet(sheet)
    expect(unsettledRows[0]).toMatchObject({ customer: '王总' })
    expect(filterUnsettledRows(unsettledRows, ['王总'])).toHaveLength(1)
    expect(filterUnsettledRows(unsettledRows, ['李总'])).toEqual([])
    expect(monthlyRows[0]).toMatchObject({
      customer: '王总',
      customerDisplay: '王总 13055558888 wangzong 王总微信 付款客户'
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

  it('keeps aluminum and silicon separate when a sample does not also select aluminum-silicon ratio', () => {
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [makeBlock('001', 60, '月结款')]
    }
    Object.assign(sheet.sampleBlocks[0].inputs, { elementNote: '铝、硅' })

    const rows = getMonthlySettlementDailyRowsFromSheet(sheet)

    expect(rows[0].elementCounts).toEqual([
      { key: 'aluminum', label: '铝', count: 1 },
      { key: 'silicon', label: '硅', count: 1 }
    ])
  })

  it('counts a standalone aluminum-silicon ratio selection as the ratio item', () => {
    const sheet: LabSheet = {
      ...makeSheet(),
      sampleBlocks: [makeBlock('001', 60, '月结款')]
    }
    Object.assign(sheet.sampleBlocks[0].inputs, { elementNote: '铝硅比' })

    expect(getMonthlySettlementDailyRowsFromSheet(sheet)[0].elementCounts).toEqual([
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 }
    ])
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

  it('filters monthly settlement details by one or multiple selected customers', () => {
    const rows = [
      { id: '1', date: '2026-06-25', customer: '客户甲', sampleCount: 1, amount: 10, elementCounts: [] },
      { id: '2', date: '2026-06-25', customer: '客户乙', sampleCount: 2, amount: 20, elementCounts: [] },
      { id: '3', date: '2026-06-25', customer: '客户丙', sampleCount: 3, amount: 30, elementCounts: [] }
    ]

    expect(filterMonthlySettlementDailyRows(rows, [])).toEqual(rows)
    expect(filterMonthlySettlementDailyRows(rows, ['客户乙']).map((row) => row.customer)).toEqual(['客户乙'])
    expect(filterMonthlySettlementDailyRows(rows, ['客户甲', '客户丙']).map((row) => row.customer)).toEqual(['客户甲', '客户丙'])
  })

})
