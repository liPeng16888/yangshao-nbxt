import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSheet, SampleBlock } from '@/types/labSheet'
import type { UnsettledSampleRow } from '@/types/financeBills'
import { useLabSheetStore } from './labSheet'
import { useFinanceBillsStore } from './financeBills'

const apiMocks = vi.hoisted(() => ({
  createPrepaidRecharge: vi.fn(),
  getIncomeBillReport: vi.fn(),
  getMonthlySettlementReport: vi.fn(),
  getPrepaidRecharges: vi.fn(),
  getPrepaidReport: vi.fn(),
  getUnsettledSamples: vi.fn(),
  markSampleAsPaid: vi.fn(),
  markSamplesAsPaid: vi.fn(),
  requestPrepaidRechargeDeletion: vi.fn(),
  updateMonthlySettlementSummary: vi.fn(),
  updatePrepaidCustomerRemark: vi.fn(),
  updatePrepaidUsageRemark: vi.fn()
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

  it('aborts and absorbs an older income rejection when a newer scoped load starts', async () => {
    const older = deferred<any>()
    const latest = deferred<any>()
    let olderSignal: AbortSignal | undefined
    let latestSignal: AbortSignal | undefined
    apiMocks.getIncomeBillReport
      .mockImplementationOnce((_month, options) => {
        olderSignal = options?.signal
        return older.promise
      })
      .mockImplementationOnce((_month, options) => {
        latestSignal = options?.signal
        return latest.promise
      })
    const store = useFinanceBillsStore()
    const firstScope = Symbol('first-income-page')
    const latestScope = Symbol('latest-income-page')

    const olderLoad = store.loadIncomeReport('2026-07', { scope: firstScope })
    const latestLoad = store.loadIncomeReport('2026-06', { scope: latestScope })
    expect(olderSignal?.aborted).toBe(true)
    expect(latestSignal?.aborted).toBe(false)
    older.reject(new Error('obsolete transport rejected'))
    await expect(olderLoad).resolves.toBe(false)
    latest.resolve({ month: '2026-06', totalSamples: 0, totalAmount: 0, statusSummaries: [], rows: [] })
    await expect(latestLoad).resolves.toBe(true)

    expect(store.month).toBe('2026-06')
  })

  it('absorbs a post-unmount income rejection and does not cancel another page scope', async () => {
    const first = deferred<any>()
    const latest = deferred<any>()
    let latestSignal: AbortSignal | undefined
    apiMocks.getIncomeBillReport
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce((_month, options) => {
        latestSignal = options?.signal
        return latest.promise
      })
    const store = useFinanceBillsStore()
    const oldPage = Symbol('old-page')
    const newPage = Symbol('new-page')
    const oldLoad = store.loadIncomeReport('2026-07', { scope: oldPage })
    const newLoad = store.loadIncomeReport('2026-06', { scope: newPage })

    store.cancelIncomeLoads(oldPage)
    expect(latestSignal?.aborted).toBe(false)
    first.reject(new Error('late old-page rejection'))
    await expect(oldLoad).resolves.toBe(false)
    latest.resolve({ month: '2026-06', totalSamples: 0, totalAmount: 0, statusSummaries: [], rows: [] })
    await expect(newLoad).resolves.toBe(true)
    expect(store.month).toBe('2026-06')
  })

  it('aborts and absorbs an active income rejection after its owning page unmounts', async () => {
    const pending = deferred<any>()
    let signal: AbortSignal | undefined
    apiMocks.getIncomeBillReport.mockImplementationOnce((_month, options) => {
      signal = options?.signal
      return pending.promise
    })
    const store = useFinanceBillsStore()
    const pageScope = Symbol('unmounted-income-page')
    const load = store.loadIncomeReport('2026-07', { scope: pageScope })

    store.cancelIncomeLoads(pageScope)
    expect(signal?.aborted).toBe(true)
    pending.reject(new Error('adapter rejected after income unmount'))
    await expect(load).resolves.toBe(false)
    expect(store.incomeReport).toBeNull()
  })

  it('keeps a real latest income failure observable', async () => {
    apiMocks.getIncomeBillReport.mockRejectedValueOnce(new Error('latest income failed'))
    const store = useFinanceBillsStore()

    await expect(store.loadIncomeReport('2026-07', { scope: Symbol('income-page') })).rejects.toThrow('latest income failed')
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

  it('aborts and absorbs stale or post-unmount unsettled rejections within the owning scope', async () => {
    const older = deferred<UnsettledSampleRow[]>()
    const latest = deferred<UnsettledSampleRow[]>()
    let olderSignal: AbortSignal | undefined
    let latestSignal: AbortSignal | undefined
    apiMocks.getUnsettledSamples
      .mockImplementationOnce((options) => {
        olderSignal = options?.signal
        return older.promise
      })
      .mockImplementationOnce((options) => {
        latestSignal = options?.signal
        return latest.promise
      })
    const store = useFinanceBillsStore()
    const oldPage = Symbol('old-unsettled-page')
    const newPage = Symbol('new-unsettled-page')
    const olderLoad = store.loadUnsettledRows({ scope: oldPage })
    const latestLoad = store.loadUnsettledRows({ scope: newPage })
    expect(olderSignal?.aborted).toBe(true)

    store.cancelUnsettledLoads(oldPage)
    expect(latestSignal?.aborted).toBe(false)
    older.reject(new Error('late stale refresh rejection'))
    await expect(olderLoad).resolves.toBe(false)
    latest.resolve([row])
    await expect(latestLoad).resolves.toBe(true)

    expect(store.unsettledRows).toEqual([row])
  })

  it('aborts and absorbs an active unsettled rejection after its owning page unmounts', async () => {
    const pending = deferred<UnsettledSampleRow[]>()
    let signal: AbortSignal | undefined
    apiMocks.getUnsettledSamples.mockImplementationOnce((options) => {
      signal = options?.signal
      return pending.promise
    })
    const store = useFinanceBillsStore()
    const pageScope = Symbol('unmounted-unsettled-page')
    const load = store.loadUnsettledRows({ scope: pageScope })

    store.cancelUnsettledLoads(pageScope)
    expect(signal?.aborted).toBe(true)
    pending.reject(new Error('adapter rejected after unsettled unmount'))
    await expect(load).resolves.toBe(false)
    expect(store.unsettledRows).toEqual([])
  })

  it('keeps a real latest unsettled failure observable', async () => {
    apiMocks.getUnsettledSamples.mockRejectedValueOnce(new Error('latest unsettled failed'))
    const store = useFinanceBillsStore()

    await expect(store.loadUnsettledRows({ scope: Symbol('unsettled-page') })).rejects.toThrow('latest unsettled failed')
    expect(store.loading).toBe(false)
  })

  it('commits only the latest monthly settlement month and aborts the stale request', async () => {
    const older = deferred<any>()
    const latest = deferred<any>()
    let olderSignal: AbortSignal | undefined
    apiMocks.getMonthlySettlementReport
      .mockImplementationOnce((_month, options) => {
        olderSignal = options?.signal
        return older.promise
      })
      .mockImplementationOnce(() => latest.promise)
    const store = useFinanceBillsStore()

    const olderLoad = store.loadMonthlySettlementReport('2026-07')
    const latestLoad = store.loadMonthlySettlementReport('2026-06')
    expect(olderSignal?.aborted).toBe(true)
    latest.resolve({ month: '2026-06', totalSamples: 0, totalAmount: 0, dailyRows: [], summaryRows: [] })
    await expect(latestLoad).resolves.toBe(true)
    older.resolve({ month: '2026-07', totalSamples: 1, totalAmount: 1, dailyRows: [], summaryRows: [] })
    await expect(olderLoad).resolves.toBe(false)

    expect(store.monthlySettlementMonth).toBe('2026-06')
    expect(store.monthlySettlementReport?.month).toBe('2026-06')
  })

  it('cancels and absorbs an owned monthly settlement rejection after unmount', async () => {
    const pending = deferred<any>()
    let signal: AbortSignal | undefined
    apiMocks.getMonthlySettlementReport.mockImplementationOnce((_month, options) => {
      signal = options?.signal
      return pending.promise
    })
    const store = useFinanceBillsStore()
    const scope = Symbol('monthly-page')
    const load = store.loadMonthlySettlementReport('2026-07', { scope })

    store.cancelMonthlySettlementLoads(scope)
    expect(signal?.aborted).toBe(true)
    pending.reject(new Error('late monthly rejection'))
    await expect(load).resolves.toBe(false)
    expect(store.monthlySettlementReport).toBeNull()
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

  it('commits only the latest prepaid recharge load and aborts the stale request', async () => {
    const older = deferred<any[]>()
    const latest = deferred<any[]>()
    const prepaidRow = {
      id: 'prepaid-row', rechargeDate: '2026-08-15', customer: '客户甲', amount: 100, usableTimes: 5, remark: ''
    }
    let olderSignal: AbortSignal | undefined
    apiMocks.getPrepaidRecharges
      .mockImplementationOnce((options) => {
        olderSignal = options?.signal
        return older.promise
      })
      .mockImplementationOnce(() => latest.promise)
    const store = useFinanceBillsStore()

    const olderLoad = store.loadPrepaidRecharges({ scope: Symbol('older-add-page') })
    const latestLoad = store.loadPrepaidRecharges({ scope: Symbol('latest-add-page') })
    expect(olderSignal?.aborted).toBe(true)
    latest.resolve([{ ...prepaidRow, id: 'latest' }])
    await expect(latestLoad).resolves.toBe(true)
    older.resolve([{ ...prepaidRow, id: 'older' }])
    await expect(olderLoad).resolves.toBe(false)

    expect(store.prepaidRecharges.map((item) => item.id)).toEqual(['latest'])
  })

  it('aborts and absorbs a prepaid report rejection after its owning page unmounts', async () => {
    const pending = deferred<any>()
    let signal: AbortSignal | undefined
    apiMocks.getPrepaidReport.mockImplementationOnce((options) => {
      signal = options?.signal
      return pending.promise
    })
    const store = useFinanceBillsStore()
    const scope = Symbol('prepaid-customers-page')
    const load = store.loadPrepaidReport({ scope })

    store.cancelPrepaidReportLoads(scope)
    expect(signal?.aborted).toBe(true)
    pending.reject(new Error('late prepaid report rejection'))
    await expect(load).resolves.toBe(false)
    expect(store.prepaidReport).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('keeps the latest prepaid failures observable for page error and retry handling', async () => {
    apiMocks.getPrepaidRecharges.mockRejectedValueOnce(new Error('recharges failed'))
    apiMocks.getPrepaidReport.mockRejectedValueOnce(new Error('report failed'))
    const store = useFinanceBillsStore()

    await expect(store.loadPrepaidRecharges({ scope: Symbol('add-page') })).rejects.toThrow('recharges failed')
    await expect(store.loadPrepaidReport({ scope: Symbol('customers-page') })).rejects.toThrow('report failed')
    expect(store.loading).toBe(false)
  })

  it('does not let a delayed post-recharge report overwrite a newer saved remark', async () => {
    const delayedReport = deferred<any>()
    const savedRecharge = { id: 'prepaid-new', rechargeDate: '2026-08-16', customer: '客户甲', amount: 25, usableTimes: 2, remark: '' }
    apiMocks.createPrepaidRecharge.mockResolvedValueOnce(savedRecharge)
    apiMocks.getPrepaidReport.mockReturnValueOnce(delayedReport.promise)
    apiMocks.updatePrepaidCustomerRemark.mockResolvedValueOnce({ customer: '客户甲', remark: '最新备注' })
    const store = useFinanceBillsStore()
    store.prepaidReport = {
      customerRows: [{ id: 'customer-a', customer: '客户甲', totalAmount: 100, totalUsableTimes: 5, usedTimes: 1, availableTimes: 4, remark: '旧备注' }],
      dailyRows: []
    }

    const add = store.addPrepaidRecharge(savedRecharge)
    await Promise.resolve()
    await store.savePrepaidCustomerRemark('客户甲', '最新备注')
    delayedReport.resolve({
      customerRows: [{ id: 'customer-a', customer: '客户甲', totalAmount: 125, totalUsableTimes: 7, usedTimes: 1, availableTimes: 6, remark: '旧备注' }],
      dailyRows: []
    })
    await add

    expect(store.prepaidReport?.customerRows[0].remark).toBe('最新备注')
  })
})
