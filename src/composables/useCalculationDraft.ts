import { getCurrentScope, onScopeDispose, readonly, ref, shallowRef } from 'vue'
import {
  CalculationDraftConflictError,
  getCalculationDraft,
  saveCalculationDraft
} from '@/api/calculationDraft'
import type {
  CalculationDraft,
  CalculationDraftConflict,
  CalculationDraftKind,
  CalculationDraftSyncStatus
} from '@/types/calculationDraft'

const SAVE_DEBOUNCE_MS = 500

export interface CalculationDraftAdapter<T> {
  kind: CalculationDraftKind
  legacyStorageKey: string
  cacheStorageKey: string
  defaults: () => T
  normalize: (value: unknown) => T
  snapshot: () => T
  apply: (payload: T) => void
}

interface SaveAttempt<T> {
  payload: T
  baseRevision: number
  importsLegacy: boolean
}

export function useCalculationDraft<T>(adapter: CalculationDraftAdapter<T>) {
  const status = ref<CalculationDraftSyncStatus>('loading')
  const revision = ref(0)
  const updatedAt = ref<string | null>(null)
  const conflict = shallowRef<CalculationDraftConflict<T> | null>(null)

  let disposed = false
  let editVersion = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingSnapshot: T | null = null
  let pendingDueAt = 0
  let failedAttempt: SaveAttempt<T> | null = null
  let snapshotCaptureFailed = false
  let loadFailed = false
  let loadPromise: Promise<void> | null = null
  let activeSave: Promise<void> | null = null

  function scheduleSave() {
    if (disposed) return
    let snapshot: T
    try {
      snapshot = normalizedSnapshot(adapter.snapshot())
    } catch {
      editVersion += 1
      pendingSnapshot = null
      snapshotCaptureFailed = true
      clearTimer()
      status.value = 'error'
      return
    }
    snapshotCaptureFailed = false
    editVersion += 1
    pendingSnapshot = snapshot
    pendingDueAt = Date.now() + SAVE_DEBOUNCE_MS
    writeCache(snapshot)
    clearTimer()
    if (status.value === 'conflict' || status.value === 'error' || loadPromise || activeSave) return
    armPendingSave()
  }

  function load(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (loadPromise) return loadPromise

    const task = (async () => {
      if (!await drainSavesBeforeLoad()) return
      const versionAtStart = editVersion
      status.value = 'loading'
      loadFailed = false
      try {
        const serverDraft = await getCalculationDraft<T>(adapter.kind)
        if (disposed) return
        const serverSnapshot = normalizedSnapshot(serverDraft.payload)
        revision.value = serverDraft.revision
        updatedAt.value = serverDraft.updatedAt

        if (editVersion !== versionAtStart || pendingSnapshot) return
        removeRecoveryCache()

        if (serverDraft.revision === 0) {
          const legacy = readLegacySnapshot()
          if (legacy) {
            applySnapshot(legacy)
            await executeSave({ payload: legacy, baseRevision: 0, importsLegacy: true }, 'saving')
            return
          }
        }

        applySnapshot(serverSnapshot)
        failedAttempt = null
        conflict.value = null
        status.value = 'idle'
      } catch {
        if (!disposed) {
          restoreRecoveryCache(versionAtStart)
          loadFailed = true
          status.value = 'error'
        }
      }
    })()

    let tracked!: Promise<void>
    tracked = task.finally(async () => {
      if (loadPromise === tracked) loadPromise = null
      if (!disposed && status.value !== 'error' && status.value !== 'conflict') {
        await resumePendingSave()
      }
    })
    loadPromise = tracked
    return tracked
  }

  async function drainSavesBeforeLoad() {
    while (!disposed) {
      if (activeSave) {
        await activeSave
        await Promise.resolve()
        continue
      }
      if (status.value === 'conflict' || failedAttempt || snapshotCaptureFailed) return false
      if (pendingSnapshot && !loadFailed) {
        clearTimer()
        const queuedSnapshot = pendingSnapshot
        pendingSnapshot = null
        await executeSave({
          payload: queuedSnapshot,
          baseRevision: revision.value,
          importsLegacy: false
        }, 'saving')
        continue
      }
      if (status.value === 'error' && !loadFailed) return false
      return true
    }
    return false
  }

  async function retry() {
    if (disposed || status.value !== 'error') return
    if (activeSave) return
    clearTimer()
    if (failedAttempt) {
      const exactAttempt = failedAttempt
      await executeSave(exactAttempt, 'retrying')
      return
    }
    if (snapshotCaptureFailed) {
      let snapshot: T
      try {
        snapshot = normalizedSnapshot(adapter.snapshot())
      } catch {
        return
      }
      snapshotCaptureFailed = false
      writeCache(snapshot)
      await executeSave({ payload: snapshot, baseRevision: revision.value, importsLegacy: false }, 'retrying')
      return
    }
    if (loadFailed) {
      await load()
      return
    }
    if (pendingSnapshot) {
      const correctedSnapshot = pendingSnapshot
      pendingSnapshot = null
      await executeSave({
        payload: correctedSnapshot,
        baseRevision: revision.value,
        importsLegacy: false
      }, 'retrying')
    }
  }

  function useServerVersion() {
    if (disposed || status.value !== 'conflict' || !conflict.value) return
    clearTimer()
    const serverDraft = conflict.value.serverDraft
    applySnapshot(serverDraft.payload)
    revision.value = serverDraft.revision
    updatedAt.value = serverDraft.updatedAt
    removeRecoveryCache()
    pendingSnapshot = null
    failedAttempt = null
    snapshotCaptureFailed = false
    loadFailed = false
    conflict.value = null
    status.value = 'saved'
  }

  async function overwriteServerVersion() {
    if (disposed || status.value !== 'conflict' || !conflict.value || activeSave) return
    clearTimer()
    const currentConflict = conflict.value
    await executeSave({
      payload: currentConflict.localSnapshot,
      baseRevision: currentConflict.serverDraft.revision,
      importsLegacy: false
    }, 'retrying')
  }

  async function executeSave(attempt: SaveAttempt<T>, saveStatus: 'saving' | 'retrying') {
    if (disposed || activeSave) return
    const exactAttempt: SaveAttempt<T> = {
      payload: normalizedSnapshot(attempt.payload),
      baseRevision: attempt.baseRevision,
      importsLegacy: attempt.importsLegacy
    }
    status.value = saveStatus

    const operation = (async () => {
      try {
        const savedDraft = await saveCalculationDraft(adapter.kind, {
          baseRevision: exactAttempt.baseRevision,
          payload: exactAttempt.payload
        })
        if (disposed) return
        normalizedSnapshot(savedDraft.payload)
        revision.value = savedDraft.revision
        updatedAt.value = savedDraft.updatedAt
        if (!pendingSnapshot) removeRecoveryCache()
        if (exactAttempt.importsLegacy) removeLegacy()
        failedAttempt = null
        loadFailed = false
        conflict.value = null
        status.value = snapshotCaptureFailed ? 'error' : 'saved'
      } catch (error) {
        if (disposed) return
        if (error instanceof CalculationDraftConflictError) {
          const validatedServer = validatedConflictDraft(error.serverDraft)
          if (validatedServer) {
            clearTimer()
            failedAttempt = null
            conflict.value = {
              serverDraft: validatedServer,
              localSnapshot: exactAttempt.payload
            }
            status.value = 'conflict'
            return
          }
        }
        clearTimer()
        failedAttempt = exactAttempt
        status.value = 'error'
      }
    })()

    activeSave = operation
    await operation
    if (activeSave === operation) activeSave = null
    if (shouldResumePending()) {
      await resumePendingSave()
    }
  }

  function shouldResumePending() {
    return !disposed && status.value !== 'error' && status.value !== 'conflict'
  }

  function validatedConflictDraft(serverDraft: CalculationDraft<unknown>): CalculationDraft<T> | null {
    try {
      return { ...serverDraft, payload: normalizedSnapshot(serverDraft.payload) }
    } catch {
      return null
    }
  }

  async function flushPendingSave() {
    if (
      disposed ||
      !pendingSnapshot ||
      loadPromise ||
      activeSave ||
      status.value === 'error' ||
      status.value === 'conflict'
    ) {
      return
    }
    const snapshot = pendingSnapshot
    pendingSnapshot = null
    await executeSave({ payload: snapshot, baseRevision: revision.value, importsLegacy: false }, 'saving')
  }

  async function resumePendingSave() {
    if (!pendingSnapshot || disposed || status.value === 'error' || status.value === 'conflict') return
    if (pendingDueAt <= Date.now()) {
      await flushPendingSave()
    } else {
      armPendingSave()
    }
  }

  function armPendingSave() {
    clearTimer()
    if (!pendingSnapshot || disposed || loadPromise || activeSave) return
    const delay = Math.max(0, pendingDueAt - Date.now())
    timer = setTimeout(() => {
      timer = null
      void flushPendingSave()
    }, delay)
  }

  function readLegacySnapshot() {
    const raw = safeStorageGet(adapter.legacyStorageKey)
    if (raw === null) return null
    try {
      return normalizedSnapshot(JSON.parse(raw))
    } catch {
      return null
    }
  }

  function restoreRecoveryCache(versionAtStart: number) {
    if (
      editVersion !== versionAtStart ||
      pendingSnapshot ||
      failedAttempt ||
      snapshotCaptureFailed ||
      status.value === 'conflict'
    ) {
      return
    }
    const raw = safeStorageGet(adapter.cacheStorageKey)
    if (raw === null) return
    try {
      const cached = normalizedSnapshot(JSON.parse(raw))
      applySnapshot(cached)
      pendingSnapshot = cached
      pendingDueAt = Date.now()
      editVersion += 1
    } catch {
      // Recovery storage is best effort and never blocks authoritative retry.
    }
  }

  function applySnapshot(snapshot: T) {
    adapter.apply(cloneDraftValue(snapshot))
  }

  function normalizedSnapshot(value: unknown) {
    return deepFreeze(cloneDraftValue(adapter.normalize(cloneDraftValue(value))))
  }

  function writeCache(snapshot: T) {
    safeStorageSet(adapter.cacheStorageKey, JSON.stringify(snapshot))
  }

  function removeLegacy() {
    safeStorageRemove(adapter.legacyStorageKey)
  }

  function removeRecoveryCache() {
    safeStorageRemove(adapter.cacheStorageKey)
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function dispose() {
    disposed = true
    clearTimer()
    pendingSnapshot = null
  }

  // Validate the adapter's default boundary early, without making it authoritative.
  normalizedSnapshot(adapter.defaults())

  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    status: readonly(status),
    revision: readonly(revision),
    updatedAt: readonly(updatedAt),
    conflict: readonly(conflict),
    load,
    scheduleSave,
    retry,
    useServerVersion,
    overwriteServerVersion
  }
}

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function cloneDraftValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('草稿数值必须有限')
    return value
  }
  if (typeof value !== 'object') throw new TypeError('草稿只能包含 JSON 值')
  if (seen.has(value)) throw new TypeError('草稿不能循环引用')
  seen.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError('草稿数组不能包含空槽')
    }
    const result = value.map((item) => cloneDraftValue(item, seen))
    seen.delete(value)
    return result as T
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('草稿对象格式无效')
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string')) throw new TypeError('草稿字段格式无效')
  const result: Record<string, unknown> = {}
  for (const key of keys as string[]) {
    result[key] = cloneDraftValue((value as Record<string, unknown>)[key], seen)
  }
  seen.delete(value)
  return result as T
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}
