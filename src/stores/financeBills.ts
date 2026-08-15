import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createPrepaidRecharge,
  getIncomeBillReport,
  getMonthlySettlementReport,
  getPrepaidRecharges,
  getPrepaidReport,
  getUnsettledSamples,
  markSampleAsPaid,
  markSamplesAsPaid,
  requestPrepaidRechargeDeletion,
  updateMonthlySettlementSummary,
  updatePrepaidCustomerRemark,
  updatePrepaidUsageRemark
} from '@/api/financeBills'
import type {
  IncomeBillReport,
  MonthlySettlementReport,
  MonthlySettlementSummaryRow,
  PrepaidRechargePayload,
  PrepaidRechargeRow,
  PrepaidReport,
  UnsettledSampleRow
} from '@/types/financeBills'
import type { SampleBlock } from '@/types/labSheet'
import { currentMonth } from '@/utils/date'
import { useLabSheetStore } from './labSheet'

interface ScopedLoadOptions {
  scope?: symbol
}

interface ActiveLoad {
  controller: AbortController
  scope: symbol
}

export const useFinanceBillsStore = defineStore('financeBills', () => {
  const month = ref(currentMonth())
  const monthlySettlementMonth = ref(currentMonth())
  const incomeReport = ref<IncomeBillReport | null>(null)
  const unsettledRows = ref<UnsettledSampleRow[]>([])
  const monthlySettlementReport = ref<MonthlySettlementReport | null>(null)
  const prepaidRecharges = ref<PrepaidRechargeRow[]>([])
  const prepaidReport = ref<PrepaidReport | null>(null)
  const loading = ref(false)
  const settlingId = ref('')
  const settlingBatch = ref(false)
  const isSettling = computed(() => Boolean(settlingId.value) || settlingBatch.value)
  const monthlySavingId = ref('')
  const prepaidSaving = ref(false)
  const prepaidRemarkSavingId = ref('')
  const prepaidDeletingId = ref('')
  let incomeLoadVersion = 0
  let unsettledLoadVersion = 0
  let monthlySettlementLoadVersion = 0
  let unsettledMutationVersion = 0
  let activeIncomeLoad: ActiveLoad | null = null
  let activeUnsettledLoad: ActiveLoad | null = null
  let activeMonthlySettlementLoad: ActiveLoad | null = null

  async function loadIncomeReport(nextMonth = month.value, options: ScopedLoadOptions = {}) {
    activeIncomeLoad?.controller.abort()
    const requestVersion = ++incomeLoadVersion
    const activeLoad: ActiveLoad = {
      controller: new AbortController(),
      scope: options.scope ?? Symbol('finance-income-load')
    }
    activeIncomeLoad = activeLoad
    loading.value = true
    try {
      const nextReport = await getIncomeBillReport(nextMonth, { signal: activeLoad.controller.signal })
      if (requestVersion !== incomeLoadVersion || activeLoad.controller.signal.aborted) return false
      month.value = nextMonth
      incomeReport.value = nextReport
      return true
    } catch (error) {
      if (requestVersion !== incomeLoadVersion || activeLoad.controller.signal.aborted) return false
      throw error
    } finally {
      if (activeIncomeLoad === activeLoad) {
        activeIncomeLoad = null
        loading.value = false
      }
    }
  }

  function cancelIncomeLoads(scope?: symbol) {
    if (scope && activeIncomeLoad?.scope !== scope) return
    activeIncomeLoad?.controller.abort()
    activeIncomeLoad = null
    incomeLoadVersion += 1
    loading.value = false
  }

  async function loadUnsettledRows(options: ScopedLoadOptions = {}) {
    activeUnsettledLoad?.controller.abort()
    const requestVersion = ++unsettledLoadVersion
    const mutationAtStart = unsettledMutationVersion
    const activeLoad: ActiveLoad = {
      controller: new AbortController(),
      scope: options.scope ?? Symbol('finance-unsettled-load')
    }
    activeUnsettledLoad = activeLoad
    loading.value = true
    try {
      const nextRows = await getUnsettledSamples({ signal: activeLoad.controller.signal })
      if (
        requestVersion !== unsettledLoadVersion ||
        mutationAtStart !== unsettledMutationVersion ||
        activeLoad.controller.signal.aborted
      ) return false
      unsettledRows.value = nextRows
      return true
    } catch (error) {
      if (requestVersion !== unsettledLoadVersion || activeLoad.controller.signal.aborted) return false
      throw error
    } finally {
      if (activeUnsettledLoad === activeLoad) {
        activeUnsettledLoad = null
        loading.value = false
      }
    }
  }

  function cancelUnsettledLoads(scope?: symbol) {
    if (scope && activeUnsettledLoad?.scope !== scope) return
    activeUnsettledLoad?.controller.abort()
    activeUnsettledLoad = null
    unsettledLoadVersion += 1
    loading.value = false
  }

  async function loadMonthlySettlementReport(nextMonth = monthlySettlementMonth.value, options: ScopedLoadOptions = {}) {
    activeMonthlySettlementLoad?.controller.abort()
    const requestVersion = ++monthlySettlementLoadVersion
    const activeLoad: ActiveLoad = {
      controller: new AbortController(),
      scope: options.scope ?? Symbol('finance-monthly-settlement-load')
    }
    activeMonthlySettlementLoad = activeLoad
    loading.value = true
    try {
      const nextReport = await getMonthlySettlementReport(nextMonth, { signal: activeLoad.controller.signal })
      if (requestVersion !== monthlySettlementLoadVersion || activeLoad.controller.signal.aborted) return false
      monthlySettlementMonth.value = nextMonth
      monthlySettlementReport.value = nextReport
      return true
    } catch (error) {
      if (requestVersion !== monthlySettlementLoadVersion || activeLoad.controller.signal.aborted) return false
      throw error
    } finally {
      if (activeMonthlySettlementLoad === activeLoad) {
        activeMonthlySettlementLoad = null
        loading.value = false
      }
    }
  }

  function cancelMonthlySettlementLoads(scope?: symbol) {
    if (scope && activeMonthlySettlementLoad?.scope !== scope) return
    activeMonthlySettlementLoad?.controller.abort()
    activeMonthlySettlementLoad = null
    monthlySettlementLoadVersion += 1
    loading.value = false
  }

  async function settleRow(row: UnsettledSampleRow) {
    settlingId.value = row.blockId
    try {
      const savedBlock = await markSampleAsPaid(row)
      unsettledMutationVersion += 1
      syncLoadedLabSheet(row, savedBlock)
      unsettledRows.value = unsettledRows.value.filter((item) => item.blockId !== row.blockId)
    } finally {
      settlingId.value = ''
    }
  }

  async function settleRows(rows: UnsettledSampleRow[]) {
    if (!rows.length) return
    settlingBatch.value = true
    try {
      const savedBlocks = await markSamplesAsPaid(rows)
      unsettledMutationVersion += 1
      const savedById = new Map(savedBlocks.map((block) => [block.id, block]))
      rows.forEach((row) => {
        const savedBlock = savedById.get(row.blockId)
        if (savedBlock) syncLoadedLabSheet(row, savedBlock)
      })
      const paidIds = new Set(rows.map((row) => row.blockId))
      unsettledRows.value = unsettledRows.value.filter((item) => !paidIds.has(item.blockId))
    } finally {
      settlingBatch.value = false
    }
  }

  function syncLoadedLabSheet(row: UnsettledSampleRow, savedBlock: SampleBlock) {
    const labSheetStore = useLabSheetStore()
    if (labSheetStore.sheet?.date !== row.date) return
    const index = labSheetStore.sheet.sampleBlocks.findIndex((block) => block.id === row.blockId)
    if (index >= 0) labSheetStore.sheet.sampleBlocks[index] = savedBlock
  }

  async function saveMonthlySettlementRow(row: MonthlySettlementSummaryRow) {
    monthlySavingId.value = row.id
    try {
      const savedRow = await updateMonthlySettlementSummary(row)
      const index = monthlySettlementReport.value?.summaryRows.findIndex((item) => item.id === savedRow.id) ?? -1
      if (index >= 0 && monthlySettlementReport.value) {
        monthlySettlementReport.value.summaryRows[index] = {
          ...monthlySettlementReport.value.summaryRows[index],
          ...savedRow
        }
      }
    } finally {
      monthlySavingId.value = ''
    }
  }

  async function loadPrepaidRecharges() {
    loading.value = true
    try {
      prepaidRecharges.value = await getPrepaidRecharges()
    } finally {
      loading.value = false
    }
  }

  async function addPrepaidRecharge(payload: PrepaidRechargePayload) {
    prepaidSaving.value = true
    try {
      const row = await createPrepaidRecharge(payload)
      prepaidRecharges.value = [row, ...prepaidRecharges.value.filter((item) => item.id !== row.id)]
      prepaidReport.value = await getPrepaidReport()
      return row
    } finally {
      prepaidSaving.value = false
    }
  }

  async function requestPrepaidDeletion(row: PrepaidRechargeRow, reason: string) {
    prepaidDeletingId.value = row.id
    try {
      const requestRow = await requestPrepaidRechargeDeletion(row.id, reason)
      prepaidRecharges.value = prepaidRecharges.value.map((item) =>
        item.id === row.id ? { ...item, deleteRequestId: requestRow.id, deleteRequestStatus: requestRow.status } : item
      )
      return requestRow
    } finally {
      prepaidDeletingId.value = ''
    }
  }

  async function loadPrepaidReport() {
    loading.value = true
    try {
      prepaidReport.value = await getPrepaidReport()
    } finally {
      loading.value = false
    }
  }

  async function savePrepaidCustomerRemark(customer: string, remark: string) {
    prepaidRemarkSavingId.value = `customer__${customer}`
    try {
      await updatePrepaidCustomerRemark(customer, remark)
    } finally {
      prepaidRemarkSavingId.value = ''
    }
  }

  async function savePrepaidUsageRemark(id: string, remark: string) {
    prepaidRemarkSavingId.value = id
    try {
      await updatePrepaidUsageRemark(id, remark)
    } finally {
      prepaidRemarkSavingId.value = ''
    }
  }

  return {
    month,
    monthlySettlementMonth,
    incomeReport,
    unsettledRows,
    monthlySettlementReport,
    prepaidRecharges,
    prepaidReport,
    loading,
    settlingId,
    settlingBatch,
    isSettling,
    monthlySavingId,
    prepaidSaving,
    prepaidRemarkSavingId,
    prepaidDeletingId,
    loadIncomeReport,
    cancelIncomeLoads,
    loadUnsettledRows,
    cancelUnsettledLoads,
    loadMonthlySettlementReport,
    cancelMonthlySettlementLoads,
    settleRow,
    settleRows,
    saveMonthlySettlementRow,
    loadPrepaidRecharges,
    addPrepaidRecharge,
    requestPrepaidDeletion,
    loadPrepaidReport,
    savePrepaidCustomerRemark,
    savePrepaidUsageRemark
  }
})
