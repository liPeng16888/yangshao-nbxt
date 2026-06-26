import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getIncomeBillReport, getMonthlySettlementReport, getUnsettledSamples, markSampleAsPaid, updateMonthlySettlementSummary } from '@/api/financeBills'
import type { IncomeBillReport, MonthlySettlementReport, MonthlySettlementSummaryRow, UnsettledSampleRow } from '@/types/financeBills'
import type { SampleBlock } from '@/types/labSheet'
import { currentMonth } from '@/utils/date'
import { useLabSheetStore } from './labSheet'

export const useFinanceBillsStore = defineStore('financeBills', () => {
  const month = ref(currentMonth())
  const monthlySettlementMonth = ref(currentMonth())
  const incomeReport = ref<IncomeBillReport | null>(null)
  const unsettledRows = ref<UnsettledSampleRow[]>([])
  const monthlySettlementReport = ref<MonthlySettlementReport | null>(null)
  const loading = ref(false)
  const settlingId = ref('')
  const monthlySavingId = ref('')

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
      if (index >= 0 && monthlySettlementReport.value) monthlySettlementReport.value.summaryRows[index] = savedRow
    } finally {
      monthlySavingId.value = ''
    }
  }

  return {
    month,
    monthlySettlementMonth,
    incomeReport,
    unsettledRows,
    monthlySettlementReport,
    loading,
    settlingId,
    monthlySavingId,
    loadIncomeReport,
    loadUnsettledRows,
    loadMonthlySettlementReport,
    settleRow,
    saveMonthlySettlementRow
  }
})
