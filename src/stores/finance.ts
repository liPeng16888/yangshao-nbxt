import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createFinanceEntries, createFinanceEntry, getFinanceEntries, getFinanceMonths } from '@/api/finance'
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
      entries.value = sortEntriesByPaymentDate(await getFinanceEntries(nextMonth))
      months.value = await getFinanceMonths()
    } finally {
      loading.value = false
    }
  }

  async function addEntry(payload: FinancePayload) {
    const entry = await createFinanceEntry(payload)
    if (entry.paymentDate.startsWith(month.value)) entries.value = sortEntriesByPaymentDate([entry, ...entries.value])
    months.value = await getFinanceMonths()
    return entry
  }

  async function addEntries(payloads: FinancePayload[]) {
    const savedEntries = await createFinanceEntries(payloads)
    const visibleEntries = savedEntries.filter((entry) => entry.paymentDate.startsWith(month.value))
    if (visibleEntries.length) entries.value = sortEntriesByPaymentDate([...visibleEntries, ...entries.value])
    months.value = await getFinanceMonths()
    return savedEntries
  }

  return { month, entries, months, loading, loadEntries, addEntry, addEntries }
})

function sortEntriesByPaymentDate(rows: FinanceEntry[]) {
  return [...rows].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
}
