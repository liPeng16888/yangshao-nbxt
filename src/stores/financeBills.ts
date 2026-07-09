import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createPrepaidRecharge,
  getIncomeBillReport,
  getMonthlySettlementReport,
  getPrepaidRecharges,
  getPrepaidReport,
  getUnsettledSamples,
  markSampleAsPaid,
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
  const monthlySavingId = ref('')
  const prepaidSaving = ref(false)
  const prepaidRemarkSavingId = ref('')
  const prepaidDeletingId = ref('')

  async function loadIncomeReport(nextMonth = month.value) {
    loading.value = true
    try {
      month.value = nextMonth
      incomeReport.value = await getIncomeBillReport(nextMonth)
    } finally {
      loading.value = false
    }
  }

  async function loadUnsettledRows() {
    loading.value = true
    try {
      unsettledRows.value = await getUnsettledSamples()
    } finally {
      loading.value = false
    }
  }

  async function loadMonthlySettlementReport(nextMonth = monthlySettlementMonth.value) {
    loading.value = true
    try {
      monthlySettlementMonth.value = nextMonth
      monthlySettlementReport.value = await getMonthlySettlementReport(nextMonth)
    } finally {
      loading.value = false
    }
  }

  async function settleRow(row: UnsettledSampleRow) {
    settlingId.value = row.blockId
    try {
      const savedBlock = await markSampleAsPaid(row)
      syncLoadedLabSheet(row, savedBlock)
      unsettledRows.value = unsettledRows.value.filter((item) => item.blockId !== row.blockId)
    } finally {
      settlingId.value = ''
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
    monthlySavingId,
    prepaidSaving,
    prepaidRemarkSavingId,
    prepaidDeletingId,
    loadIncomeReport,
    loadUnsettledRows,
    loadMonthlySettlementReport,
    settleRow,
    saveMonthlySettlementRow,
    loadPrepaidRecharges,
    addPrepaidRecharge,
    requestPrepaidDeletion,
    loadPrepaidReport,
    savePrepaidCustomerRemark,
    savePrepaidUsageRemark
  }
})
