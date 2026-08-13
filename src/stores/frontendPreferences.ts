import { defineStore } from 'pinia'
import axios from 'axios'
import { computed, readonly, ref, watch } from 'vue'
import {
  listFrontendPreferences,
  saveFrontendPreference
} from '@/api/frontendPreferences'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/types/auth'
import type {
  CachedFrontendPreference,
  FrontendPreferenceConflict,
  FrontendPreferenceRecord,
  FrontendPreferenceSection,
  FrontendPreferenceStatus
} from '@/types/frontendPreference'
import {
  readFrontendPreferenceCache,
  removeFrontendPreferenceCache,
  writeFrontendPreferenceCache
} from '@/utils/frontendPreferenceCache'

export const FRONTEND_PREFERENCE_SECTIONS = [
  'LAB_REPORT_TEMPLATE',
  'LAB_REPORT_SMS_TEMPLATE',
  'LAB_REPORT_SAMPLE_UNITS',
  'LAB_ELEMENT_GROUPS'
] as const satisfies readonly FrontendPreferenceSection[]

type SectionRecord<T> = Partial<Record<FrontendPreferenceSection, T>>
type SaveResult = 'saved' | 'queued' | 'conflict' | 'error'
type MutationToken = {
  ownerSessionGeneration: number
  sequence: number
}

function idleStatuses(): Record<FrontendPreferenceSection, FrontendPreferenceStatus> {
  return Object.fromEntries(
    FRONTEND_PREFERENCE_SECTIONS.map((section) => [section, 'idle'])
  ) as Record<FrontendPreferenceSection, FrontendPreferenceStatus>
}

function hasPendingValue(entry: CachedFrontendPreference): boolean {
  return Object.prototype.hasOwnProperty.call(entry, 'pendingValue')
}

function cloneJsonValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

export function frontendPreferenceOwnerId(user: AuthUser | null): string {
  if (!user) return ''
  if (user.role === 'FRONTEND_SUB_USER' || user.isFrontendSubAccount) {
    return user.dataOwnerId ?? ''
  }
  if (user.role === 'FRONTEND_USER' || user.isFrontendMainAccount) {
    return user.dataOwnerId ?? user.id
  }
  return ''
}

export function isPreferenceConflict(error: unknown): error is {
  response: {
    status: 409
    data: {
      code: 'PREFERENCE_VERSION_CONFLICT'
      current: FrontendPreferenceRecord | null
    }
  }
} {
  const response = (error as {
    response?: { status?: unknown; data?: { code?: unknown; current?: unknown } }
  } | null)?.response
  return response?.status === 409 && response.data?.code === 'PREFERENCE_VERSION_CONFLICT'
}

function isTransportError(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response) return false
  const code = error.code?.toUpperCase() ?? ''
  if (code) return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(code)
  const message = error.message.trim()
  return message.toLowerCase() === 'network error' ||
    /^timeout(?: of \d+(?:\.\d+)?ms)?(?: exceeded)?$/i.test(message)
}

export const useFrontendPreferencesStore = defineStore('frontendPreferences', () => {
  const authStore = useAuthStore()
  const activeOwnerId = ref('')
  const records = ref<SectionRecord<FrontendPreferenceRecord>>({})
  const pendingValues = ref<SectionRecord<unknown>>({})
  const statuses = ref<Record<FrontendPreferenceSection, FrontendPreferenceStatus>>(idleStatuses())
  const conflicts = ref<SectionRecord<FrontendPreferenceConflict>>({})
  let loadEpoch = 0
  let ownerSessionGeneration = 0
  let mutationSequence = 0
  const mutationSequences = new Map<string, number>()

  const hasPendingChanges = computed(() => {
    syncOwnerState()
    return Object.keys(pendingValues.value).length > 0 || Object.keys(conflicts.value).length > 0
  })

  function resetState(ownerId = '') {
    activeOwnerId.value = ownerId
    records.value = {}
    pendingValues.value = {}
    statuses.value = idleStatuses()
    conflicts.value = {}
  }

  function hydrateOwner(ownerId: string) {
    resetState(ownerId)
    for (const section of FRONTEND_PREFERENCE_SECTIONS) {
      const cached = readFrontendPreferenceCache(ownerId, section)
      if (!cached) continue
      if (cached.server) records.value[section] = cloneJsonValue(cached.server)
      if (hasPendingValue(cached)) {
        pendingValues.value[section] = cloneJsonValue(cached.pendingValue)
        statuses.value[section] = 'queued'
      } else if (cached.server) {
        statuses.value[section] = 'saved'
      }
    }
  }

  function syncOwnerState() {
    const ownerId = frontendPreferenceOwnerId(authStore.user)
    if (activeOwnerId.value === ownerId) return ownerId
    loadEpoch += 1
    ownerSessionGeneration += 1
    if (ownerId) hydrateOwner(ownerId)
    else resetState()
    return ownerId
  }

  function beginMutation(ownerId: string, section: FrontendPreferenceSection) {
    const key = `${ownerId}:${section}`
    const sequence = ++mutationSequence
    mutationSequences.set(key, sequence)
    return { ownerSessionGeneration, sequence } satisfies MutationToken
  }

  function isCurrentMutation(ownerId: string, section: FrontendPreferenceSection, token: MutationToken) {
    return activeOwnerId.value === ownerId &&
      frontendPreferenceOwnerId(authStore.user) === ownerId &&
      token.ownerSessionGeneration === ownerSessionGeneration &&
      mutationSequences.get(`${ownerId}:${section}`) === token.sequence
  }

  function installServerRecord(
    ownerId: string,
    record: FrontendPreferenceRecord | null,
    section = record?.section
  ) {
    if (!section) return
    const installedRecord = record ? cloneJsonValue(record) : null
    if (installedRecord) {
      writeFrontendPreferenceCache({ ownerId, section, server: installedRecord })
    } else {
      removeFrontendPreferenceCache(ownerId, section)
    }
    if (activeOwnerId.value !== ownerId || frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    if (installedRecord) records.value[section] = installedRecord
    else delete records.value[section]
    delete pendingValues.value[section]
    delete conflicts.value[section]
    statuses.value[section] = installedRecord ? 'saved' : 'idle'
  }

  function installPending(
    ownerId: string,
    section: FrontendPreferenceSection,
    localValue: unknown,
    baseVersion: number,
    server: FrontendPreferenceRecord | null
  ) {
    const installedServer = server ? cloneJsonValue(server) : null
    const installedLocalValue = cloneJsonValue(localValue)
    const entry: CachedFrontendPreference = {
      ownerId,
      section,
      server: installedServer,
      pendingValue: installedLocalValue,
      pendingBaseVersion: baseVersion
    }
    writeFrontendPreferenceCache(entry)
    if (activeOwnerId.value !== ownerId || frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    if (installedServer) records.value[section] = cloneJsonValue(installedServer)
    else delete records.value[section]
    pendingValues.value[section] = cloneJsonValue(installedLocalValue)
    delete conflicts.value[section]
    statuses.value[section] = 'queued'
  }

  function installConflict(
    ownerId: string,
    section: FrontendPreferenceSection,
    localValue: unknown,
    server: FrontendPreferenceRecord | null,
    pendingBaseVersion: number
  ) {
    const installedServer = server ? cloneJsonValue(server) : null
    const installedLocalValue = cloneJsonValue(localValue)
    const serverVersion = installedServer?.version ?? 0
    writeFrontendPreferenceCache({
      ownerId,
      section,
      server: installedServer,
      pendingValue: installedLocalValue,
      pendingBaseVersion
    })
    if (activeOwnerId.value !== ownerId || frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    if (installedServer) records.value[section] = cloneJsonValue(installedServer)
    else delete records.value[section]
    pendingValues.value[section] = cloneJsonValue(installedLocalValue)
    conflicts.value[section] = {
      localValue: cloneJsonValue(installedLocalValue),
      server: installedServer ? cloneJsonValue(installedServer) : null,
      serverVersion
    }
    statuses.value[section] = 'conflict'
  }

  async function loadAll() {
    const ownerId = syncOwnerState()
    if (!ownerId) {
      return 'error' as const
    }

    const requestEpoch = ++loadEpoch
    const requestOwnerSessionGeneration = ownerSessionGeneration
    for (const section of FRONTEND_PREFERENCE_SECTIONS) {
      if (statuses.value[section] !== 'queued') statuses.value[section] = 'loading'
    }

    try {
      const serverRecords = await listFrontendPreferences()
      if (
        requestEpoch !== loadEpoch ||
        requestOwnerSessionGeneration !== ownerSessionGeneration ||
        frontendPreferenceOwnerId(authStore.user) !== ownerId ||
        activeOwnerId.value !== ownerId
      ) {
        return 'stale' as const
      }

      const serverBySection = new Map(serverRecords.map((record) => [record.section, record]))
      for (const section of FRONTEND_PREFERENCE_SECTIONS) {
        beginMutation(ownerId, section)
        const server = serverBySection.get(section) ?? null
        const cached = readFrontendPreferenceCache(ownerId, section)
        if (cached && hasPendingValue(cached)) {
          const baseVersion = cached.pendingBaseVersion ?? cached.server?.version ?? 0
          if (baseVersion !== (server?.version ?? 0)) {
            installConflict(ownerId, section, cached.pendingValue, server, baseVersion)
          } else {
            installPending(ownerId, section, cached.pendingValue, baseVersion, server)
          }
          continue
        }
        installServerRecord(ownerId, server, section)
      }
      return 'loaded' as const
    } catch {
      if (
        requestEpoch !== loadEpoch ||
        requestOwnerSessionGeneration !== ownerSessionGeneration ||
        frontendPreferenceOwnerId(authStore.user) !== ownerId ||
        activeOwnerId.value !== ownerId
      ) {
        return 'stale' as const
      }
      if (frontendPreferenceOwnerId(authStore.user) === ownerId && activeOwnerId.value === ownerId) {
        for (const section of FRONTEND_PREFERENCE_SECTIONS) {
          if (statuses.value[section] !== 'queued' && statuses.value[section] !== 'conflict') {
            statuses.value[section] = 'error'
          }
        }
      }
      return 'error' as const
    }
  }

  function value<T>(section: FrontendPreferenceSection, fallback: T): T {
    syncOwnerState()
    if (Object.prototype.hasOwnProperty.call(pendingValues.value, section)) {
      return cloneJsonValue(pendingValues.value[section] as T)
    }
    const storedValue = records.value[section]?.value as T | undefined
    return cloneJsonValue(storedValue ?? fallback)
  }

  async function save(
    section: FrontendPreferenceSection,
    nextValue: unknown
  ): Promise<SaveResult> {
    const ownerId = syncOwnerState()
    if (!ownerId) {
      statuses.value[section] = 'error'
      return 'error'
    }
    const current = records.value[section] ?? null
    const baseVersion = current?.version ?? 0
    const mutationToken = beginMutation(ownerId, section)
    statuses.value[section] = 'saving'
    let submittedValue: unknown
    try {
      submittedValue = cloneJsonValue(nextValue)
    } catch {
      statuses.value[section] = 'error'
      return 'error'
    }
    try {
      const saved = await saveFrontendPreference(section, submittedValue, baseVersion)
      if (isCurrentMutation(ownerId, section, mutationToken)) installServerRecord(ownerId, saved)
      return 'saved'
    } catch (error) {
      if (isPreferenceConflict(error)) {
        if (isCurrentMutation(ownerId, section, mutationToken)) {
          installConflict(ownerId, section, submittedValue, error.response.data.current, baseVersion)
        }
        return 'conflict'
      }
      if (isTransportError(error)) {
        if (isCurrentMutation(ownerId, section, mutationToken)) {
          installPending(ownerId, section, submittedValue, baseVersion, current)
        }
        return 'queued'
      }
      if (isCurrentMutation(ownerId, section, mutationToken)) {
        statuses.value[section] = 'error'
      }
      return 'error'
    }
  }

  async function resolveConflict(
    section: FrontendPreferenceSection,
    strategy: 'server' | 'overwrite'
  ): Promise<SaveResult> {
    const ownerId = syncOwnerState()
    const storedConflict = conflicts.value[section]
    const conflict = storedConflict ? cloneJsonValue(storedConflict) : undefined
    if (!ownerId || activeOwnerId.value !== ownerId || !conflict) {
      statuses.value[section] = 'error'
      return 'error'
    }
    if (strategy === 'server') {
      beginMutation(ownerId, section)
      installServerRecord(ownerId, conflict.server, section)
      return 'saved'
    }

    const mutationToken = beginMutation(ownerId, section)
    statuses.value[section] = 'saving'
    try {
      const saved = await saveFrontendPreference(
        section,
        cloneJsonValue(conflict.localValue),
        conflict.serverVersion
      )
      if (isCurrentMutation(ownerId, section, mutationToken)) installServerRecord(ownerId, saved)
      return 'saved'
    } catch (error) {
      if (isPreferenceConflict(error)) {
        if (isCurrentMutation(ownerId, section, mutationToken)) {
          installConflict(
            ownerId,
            section,
            conflict.localValue,
            error.response.data.current,
            conflict.serverVersion
          )
        }
        return 'conflict'
      }
      if (isTransportError(error)) {
        if (isCurrentMutation(ownerId, section, mutationToken)) {
          installPending(
            ownerId,
            section,
            conflict.localValue,
            conflict.serverVersion,
            conflict.server
          )
        }
        return 'queued'
      }
      if (isCurrentMutation(ownerId, section, mutationToken)) {
        statuses.value[section] = 'error'
      }
      return 'error'
    }
  }

  watch(
    () => frontendPreferenceOwnerId(authStore.user),
    () => { syncOwnerState() },
    { immediate: true, flush: 'sync' }
  )

  return {
    records: readonly(records),
    statuses: readonly(statuses),
    conflicts: readonly(conflicts),
    hasPendingChanges,
    loadAll,
    value,
    save,
    resolveConflict
  }
})
