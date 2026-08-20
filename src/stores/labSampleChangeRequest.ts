import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createLabSampleChangeRequest,
  getLabSampleChangeRequest,
  listLabSampleChangeRequests,
  withdrawLabSampleChangeRequest
} from '@/api/labSampleChangeRequest'
import type {
  CreateLabSampleChangeRequestPayload,
  LabSampleChangeRequestDetail,
  LabSampleChangeRequestFilters,
  LabSampleChangeRequestSummary
} from '@/types/labSampleChangeRequest'

export const useLabSampleChangeRequestStore = defineStore('labSampleChangeRequest', () => {
  const requests = ref<LabSampleChangeRequestSummary[]>([])
  const detail = ref<LabSampleChangeRequestDetail | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const loadingDetail = ref(false)
  const withdrawing = ref(false)

  const pendingByBlock = computed<Record<string, LabSampleChangeRequestSummary>>(() => Object.fromEntries(
    requests.value.filter((row) => row.status === 'PENDING').map((row) => [row.blockId, row])
  ))

  async function load(filters: LabSampleChangeRequestFilters = {}) {
    loading.value = true
    try {
      requests.value = await listLabSampleChangeRequests(filters)
      return requests.value
    } finally {
      loading.value = false
    }
  }

  async function submit(payload: CreateLabSampleChangeRequestPayload) {
    submitting.value = true
    try {
      const created = await createLabSampleChangeRequest(payload)
      requests.value = [created, ...requests.value]
      return created
    } finally {
      submitting.value = false
    }
  }

  async function loadDetail(id: string) {
    loadingDetail.value = true
    try {
      detail.value = await getLabSampleChangeRequest(id)
      return detail.value
    } finally {
      loadingDetail.value = false
    }
  }

  async function withdraw(id: string) {
    withdrawing.value = true
    try {
      const updated = await withdrawLabSampleChangeRequest(id)
      requests.value = requests.value.map((row) => row.id === id ? updated : row)
      if (detail.value?.id === id) detail.value = { ...detail.value, ...updated }
      return updated
    } finally {
      withdrawing.value = false
    }
  }

  function reset() {
    requests.value = []
    detail.value = null
    loading.value = false
    submitting.value = false
    loadingDetail.value = false
    withdrawing.value = false
  }

  return {
    requests, detail, loading, submitting, loadingDetail, withdrawing, pendingByBlock,
    load, submit, loadDetail, withdraw, reset
  }
})
