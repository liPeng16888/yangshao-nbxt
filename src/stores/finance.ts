import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createFinanceEntry, getFinanceEntries, getFinanceMonths } from '@/api/finance'
import type { FinanceEntry, FinancePayload } from '@/types/finance'
import { currentMonth } from '@/utils/date'

export const useFinanceStore = defineStore('finance', () => {
  const month = ref(currentMonth())
  const entries = ref<FinanceEntry[]>([])
  const months = ref<string[]>([])
  const loading = ref(false)

  async function loadEntries(nextMonth = month.value) {
    loading.value = true
    try {
      month.value = nextMonth
      entries.value = await getFinanceEntries(nextMonth)
      months.value = await getFinanceMonths()
    } finally {
      loading.value = false
    }
  }

  async function addEntry(payload: FinancePayload) {
    const entry = await createFinanceEntry(payload)
    if (entry.paymentDate.startsWith(month.value)) entries.value.unshift(entry)
    months.value = await getFinanceMonths()
    return entry
  }

  return { month, entries, months, loading, loadEntries, addEntry }
})
