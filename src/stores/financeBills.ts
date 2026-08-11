import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getIncomeBillReport,
  getMonthlySettlementReport,
  getUnsettledSamples,
  markSampleAsPaid,
  markSamplesAsPaid,
  updateMonthlySettlementSummary
} from '@/api/financeBills'
import type {
  IncomeBillReport,
  MonthlySettlementReport,
  MonthlySettlementSummaryRow,
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
  const loading = ref(false)
  const settlingId = ref('')
  const settlingBatch = ref(false)
  const isSettling = computed(() => Boolean(settlingId.value) || settlingBatch.value)
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

  async function settleRows(rows: UnsettledSampleRow[]) {
    if (!rows.length) return
    settlingBatch.value = true
    try {
      const savedBlocks = await markSamplesAsPaid(rows)
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

  return {
    month,
    monthlySettlementMonth,
    incomeReport,
    unsettledRows,
    monthlySettlementReport,
    loading,
    settlingId,
    settlingBatch,
    isSettling,
    monthlySavingId,
    loadIncomeReport,
    loadUnsettledRows,
    loadMonthlySettlementReport,
    settleRow,
    settleRows,
    saveMonthlySettlementRow
  }
})
