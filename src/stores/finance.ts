import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createFinanceEntries, createFinanceEntry, getFinanceEntries, getFinanceMonths, requestFinanceEntryDeletion } from '@/api/finance'
import type { FinanceEntry, FinancePayload } from '@/types/finance'
import { currentMonth } from '@/utils/date'

export const useFinanceStore = defineStore('finance', () => {
  const month = ref(currentMonth())
  const entries = ref<FinanceEntry[]>([])
  const months = ref<string[]>([])
  const loading = ref(false)
  const loadError = ref('')
  const deletingId = ref('')
  let loadVersion = 0
  let lastRequestedMonth = month.value

  async function loadEntries(nextMonth = month.value) {
    const requestVersion = ++loadVersion
    lastRequestedMonth = nextMonth
    loading.value = true
    loadError.value = ''
    try {
      const [nextEntries, nextMonths] = await Promise.all([getFinanceEntries(nextMonth), getFinanceMonths()])
      if (requestVersion !== loadVersion) return
      month.value = nextMonth
      entries.value = sortEntriesByPaymentDate(nextEntries)
      months.value = nextMonths
    } catch {
      if (requestVersion !== loadVersion) return
      loadError.value = `${nextMonth} 支出明细加载失败，请重试`
    } finally {
      if (requestVersion === loadVersion) loading.value = false
    }
  }

  function retryEntries() {
    return loadEntries(lastRequestedMonth)
  }

  function cancelEntryLoads() {
    loadVersion += 1
    loading.value = false
    loadError.value = ''
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

  async function requestEntryDeletion(row: FinanceEntry, reason: string) {
    deletingId.value = row.id
    try {
      const requestRow = await requestFinanceEntryDeletion(row.id, reason)
      entries.value = entries.value.map((entry) =>
        entry.id === row.id ? { ...entry, deleteRequestId: requestRow.id, deleteRequestStatus: requestRow.status } : entry
      )
      return requestRow
    } finally {
      deletingId.value = ''
    }
  }

  return {
    month,
    entries,
    months,
    loading,
    loadError,
    deletingId,
    loadEntries,
    retryEntries,
    cancelEntryLoads,
    addEntry,
    addEntries,
    requestEntryDeletion
  }
})

function sortEntriesByPaymentDate(rows: FinanceEntry[]) {
  return [...rows].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
}
