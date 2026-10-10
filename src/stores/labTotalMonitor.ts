import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getLabTotalMonitorConfig } from '@/api/labTotalMonitor'
import { useAuthStore } from './auth'
import type { LabTotalMonitorConfig } from '../../server/src/common/lab-total-monitor'

export const useLabTotalMonitorStore = defineStore('labTotalMonitor', () => {
  const auth = useAuthStore()
  const config = ref<LabTotalMonitorConfig | null>(null)
  const error = ref('')
  const ownerId = computed(() => auth.user?.dataOwnerId || auth.user?.id || '')
  const actorKey = computed(() => `${auth.user?.id || ''}:${ownerId.value}:${auth.user?.permissionVersion || 0}`)
  const rules = computed(() => config.value?.frontendUserId === ownerId.value ? config.value.rules : [])
  let generation = 0
  let pending: { key: string; promise: Promise<boolean> } | null = null
  watch(actorKey, () => { generation++; config.value = null; error.value = ''; pending = null }, { flush: 'sync' })

  function load(): Promise<boolean> {
    const key = actorKey.value
    const owner = ownerId.value
    if (!owner) return Promise.resolve(false)
    if (pending?.key === key) return pending.promise
    const requestGeneration = ++generation
    const promise = (async () => {
      try {
        const value = await getLabTotalMonitorConfig(owner)
        if (generation !== requestGeneration || key !== actorKey.value) return false
        if (value.frontendUserId !== owner) throw new Error('监测规则账号不匹配')
        config.value = value
        error.value = ''
        return true
      } catch {
        if (generation === requestGeneration && key === actorKey.value) error.value = '合量监测规则加载失败，请重试'
        return false
      } finally {
        if (pending?.key === key && generation === requestGeneration) pending = null
      }
    })()
    pending = { key, promise }
    return promise
  }
  return { config, rules, error, ownerId, load }
})
