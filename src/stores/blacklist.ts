import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createBlacklist, deleteBlacklist, searchBlacklist, updateBlacklist } from '@/api/blacklist'
import type { BlacklistPayload, BlacklistRecord, BlacklistUpdatePayload } from '@/types/blacklist'

export const useBlacklistStore = defineStore('blacklist', () => {
  const keyword = ref('')
  const records = ref<BlacklistRecord[]>([])
  const loading = ref(false)
  const deletingId = ref('')
  const updatingId = ref('')

  async function loadRecords(nextKeyword = keyword.value) {
    loading.value = true
    try {
      keyword.value = nextKeyword
      records.value = await searchBlacklist(nextKeyword)
    } finally {
      loading.value = false
    }
  }

  async function addRecord(payload: BlacklistPayload) {
    const record = await createBlacklist(payload)
    records.value.unshift(record)
    return record
  }

  async function deleteRecord(id: string) {
    deletingId.value = id
    try {
      await deleteBlacklist(id)
      records.value = records.value.filter((record) => record.id !== id)
    } finally {
      deletingId.value = ''
    }
  }

  async function updateRecord(id: string, payload: BlacklistUpdatePayload) {
    updatingId.value = id
    try {
      const record = await updateBlacklist(id, payload)
      const index = records.value.findIndex((item) => item.id === id)
      if (index >= 0) records.value[index] = record
      return record
    } finally {
      updatingId.value = ''
    }
  }

  return { keyword, records, loading, deletingId, updatingId, loadRecords, addRecord, deleteRecord, updateRecord }
})
