import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getFinanceReport, getSampleDetectionReport } from '@/api/report'
import type { DateRange, FinanceReport, ReportMode, SampleDetectionReport } from '@/types/report'
import { todayInBeijing } from '@/utils/date'

export type ReportKind = 'sample' | 'finance'

export const useReportStore = defineStore('report', () => {
  const kind = ref<ReportKind>('sample')
  const mode = ref<ReportMode>('daily')
  const date = ref(todayInBeijing())
  const startDate = ref(todayInBeijing())
  const endDate = ref(todayInBeijing())
  const sampleReport = ref<SampleDetectionReport | null>(null)
  const financeReport = ref<FinanceReport | null>(null)
  const loading = ref(false)

  function range(): DateRange {
    return {
      mode: mode.value,
      date: date.value,
      startDate: startDate.value,
      endDate: endDate.value
    }
  }

  async function loadReport() {
    loading.value = true
    try {
      if (kind.value === 'sample') {
        sampleReport.value = await getSampleDetectionReport(range())
      } else {
        financeReport.value = await getFinanceReport(range())
      }
    } finally {
      loading.value = false
    }
  }

  return {
    kind,
    mode,
    date,
    startDate,
    endDate,
    sampleReport,
    financeReport,
    loading,
    loadReport
  }
})
