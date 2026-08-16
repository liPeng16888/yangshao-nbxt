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
  let loadVersion = 0
  let mutationVersion = 0

  async function loadRecords(nextKeyword = keyword.value, options: { signal?: AbortSignal } = {}) {
    const currentLoad = ++loadVersion
    const mutationAtStart = mutationVersion
    loading.value = true
    keyword.value = nextKeyword
    try {
      const nextRecords = await searchBlacklist(nextKeyword, options)
      if (!options.signal?.aborted && currentLoad === loadVersion && mutationAtStart === mutationVersion) records.value = nextRecords
    } finally {
      if (currentLoad === loadVersion) loading.value = false
    }
  }

  async function addRecord(payload: BlacklistPayload) {
    const record = await createBlacklist(payload)
    mutationVersion += 1
    records.value.unshift(record)
    return record
  }

  async function deleteRecord(id: string) {
    deletingId.value = id
    try {
      const current = records.value.find((record) => record.id === id)
      if (!current) return
      await deleteBlacklist(id, current.updatedAt || '')
      mutationVersion += 1
      records.value = records.value.filter((record) => record.id !== id)
    } finally {
      deletingId.value = ''
    }
  }

  async function updateRecord(id: string, payload: BlacklistUpdatePayload) {
    updatingId.value = id
    try {
      const record = await updateBlacklist(id, payload)
      mutationVersion += 1
      const index = records.value.findIndex((item) => item.id === id)
      if (index >= 0) records.value[index] = record
      return record
    } finally {
      updatingId.value = ''
    }
  }

  return { keyword, records, loading, deletingId, updatingId, loadRecords, addRecord, deleteRecord, updateRecord }
})
