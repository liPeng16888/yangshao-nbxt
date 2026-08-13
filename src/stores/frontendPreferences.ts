import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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

function idleStatuses(): Record<FrontendPreferenceSection, FrontendPreferenceStatus> {
  return Object.fromEntries(
    FRONTEND_PREFERENCE_SECTIONS.map((section) => [section, 'idle'])
  ) as Record<FrontendPreferenceSection, FrontendPreferenceStatus>
}

function hasPendingValue(entry: CachedFrontendPreference): boolean {
  return Object.prototype.hasOwnProperty.call(entry, 'pendingValue')
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
  const response = (error as { response?: unknown } | null)?.response
  return response === undefined || response === null
}

export const useFrontendPreferencesStore = defineStore('frontendPreferences', () => {
  const authStore = useAuthStore()
  const activeOwnerId = ref('')
  const records = ref<SectionRecord<FrontendPreferenceRecord>>({})
  const pendingValues = ref<SectionRecord<unknown>>({})
  const statuses = ref<Record<FrontendPreferenceSection, FrontendPreferenceStatus>>(idleStatuses())
  const conflicts = ref<SectionRecord<FrontendPreferenceConflict>>({})

  const hasPendingChanges = computed(() => (
    Object.keys(pendingValues.value).length > 0 || Object.keys(conflicts.value).length > 0
  ))

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
      if (cached.server) records.value[section] = cached.server
      if (hasPendingValue(cached)) {
        pendingValues.value[section] = cached.pendingValue
        statuses.value[section] = 'queued'
      } else if (cached.server) {
        statuses.value[section] = 'saved'
      }
    }
  }

  function ensureActiveOwner(ownerId: string) {
    if (activeOwnerId.value !== ownerId) hydrateOwner(ownerId)
  }

  function installServerRecord(
    ownerId: string,
    record: FrontendPreferenceRecord | null,
    section = record?.section
  ) {
    if (!section) return
    if (record) {
      writeFrontendPreferenceCache({ ownerId, section, server: record })
    } else {
      removeFrontendPreferenceCache(ownerId, section)
    }
    if (activeOwnerId.value !== ownerId || frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    if (record) records.value[section] = record
    else delete records.value[section]
    delete pendingValues.value[section]
    delete conflicts.value[section]
    statuses.value[section] = record ? 'saved' : 'idle'
  }

  function installPending(
    ownerId: string,
    section: FrontendPreferenceSection,
    localValue: unknown,
    baseVersion: number,
    server: FrontendPreferenceRecord | null
  ) {
    const entry: CachedFrontendPreference = {
      ownerId,
      section,
      server,
      pendingValue: localValue,
      pendingBaseVersion: baseVersion
    }
    writeFrontendPreferenceCache(entry)
    if (activeOwnerId.value !== ownerId || frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    if (server) records.value[section] = server
    else delete records.value[section]
    pendingValues.value[section] = localValue
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
    const serverVersion = server?.version ?? 0
    writeFrontendPreferenceCache({
      ownerId,
      section,
      server,
      pendingValue: localValue,
      pendingBaseVersion
    })
    if (activeOwnerId.value !== ownerId || frontendPreferenceOwnerId(authStore.user) !== ownerId) return
    if (server) records.value[section] = server
    else delete records.value[section]
    pendingValues.value[section] = localValue
    conflicts.value[section] = { localValue, server, serverVersion }
    statuses.value[section] = 'conflict'
  }

  async function loadAll() {
    const ownerId = frontendPreferenceOwnerId(authStore.user)
    if (!ownerId) {
      resetState()
      return 'error' as const
    }

    hydrateOwner(ownerId)
    for (const section of FRONTEND_PREFERENCE_SECTIONS) {
      if (statuses.value[section] !== 'queued') statuses.value[section] = 'loading'
    }

    try {
      const serverRecords = await listFrontendPreferences()
      if (frontendPreferenceOwnerId(authStore.user) !== ownerId || activeOwnerId.value !== ownerId) {
        resetState(frontendPreferenceOwnerId(authStore.user))
        return 'stale' as const
      }

      const serverBySection = new Map(serverRecords.map((record) => [record.section, record]))
      for (const section of FRONTEND_PREFERENCE_SECTIONS) {
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
    if (Object.prototype.hasOwnProperty.call(pendingValues.value, section)) {
      return pendingValues.value[section] as T
    }
    return (records.value[section]?.value as T | undefined) ?? fallback
  }

  async function save(
    section: FrontendPreferenceSection,
    nextValue: unknown
  ): Promise<SaveResult> {
    const ownerId = frontendPreferenceOwnerId(authStore.user)
    if (!ownerId) {
      statuses.value[section] = 'error'
      return 'error'
    }
    ensureActiveOwner(ownerId)
    const current = records.value[section] ?? null
    const baseVersion = current?.version ?? 0
    statuses.value[section] = 'saving'
    try {
      const saved = await saveFrontendPreference(section, nextValue, baseVersion)
      installServerRecord(ownerId, saved)
      return 'saved'
    } catch (error) {
      if (isPreferenceConflict(error)) {
        installConflict(ownerId, section, nextValue, error.response.data.current, baseVersion)
        return 'conflict'
      }
      if (isTransportError(error)) {
        installPending(ownerId, section, nextValue, baseVersion, current)
        return 'queued'
      }
      if (frontendPreferenceOwnerId(authStore.user) === ownerId && activeOwnerId.value === ownerId) {
        statuses.value[section] = 'error'
      }
      return 'error'
    }
  }

  async function resolveConflict(
    section: FrontendPreferenceSection,
    strategy: 'server' | 'overwrite'
  ): Promise<SaveResult> {
    const ownerId = frontendPreferenceOwnerId(authStore.user)
    const conflict = conflicts.value[section]
    if (!ownerId || activeOwnerId.value !== ownerId || !conflict) {
      statuses.value[section] = 'error'
      return 'error'
    }
    if (strategy === 'server') {
      installServerRecord(ownerId, conflict.server, section)
      return 'saved'
    }

    statuses.value[section] = 'saving'
    try {
      const saved = await saveFrontendPreference(
        section,
        conflict.localValue,
        conflict.serverVersion
      )
      installServerRecord(ownerId, saved)
      return 'saved'
    } catch (error) {
      if (isPreferenceConflict(error)) {
        installConflict(
          ownerId,
          section,
          conflict.localValue,
          error.response.data.current,
          conflict.serverVersion
        )
        return 'conflict'
      }
      if (isTransportError(error)) {
        installPending(
          ownerId,
          section,
          conflict.localValue,
          conflict.serverVersion,
          conflict.server
        )
        return 'queued'
      }
      if (frontendPreferenceOwnerId(authStore.user) === ownerId && activeOwnerId.value === ownerId) {
        statuses.value[section] = 'error'
      }
      return 'error'
    }
  }

  return {
    records,
    statuses,
    conflicts,
    hasPendingChanges,
    loadAll,
    value,
    save,
    resolveConflict
  }
})
