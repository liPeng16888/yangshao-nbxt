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
  migrateLegacy?: (value: unknown) => T
  snapshot: () => T
  apply: (payload: T) => void
}

interface SaveAttempt<T> {
  payload: T
  baseRevision: number
  importsLegacy: boolean
}

interface DirtyRecoveryCache<T> {
  version: 1
  state: 'dirty'
  baseRevision: number
  payload: T
}

interface ResolvedRecoveryCache {
  version: 1
  state: 'resolved'
  revision: number
}

type RecoveryCache<T> = DirtyRecoveryCache<T> | ResolvedRecoveryCache

export function useCalculationDraft<T>(adapter: CalculationDraftAdapter<T>) {
  const status = ref<CalculationDraftSyncStatus>('loading')
  const revision = ref(0)
  const updatedAt = ref<string | null>(null)
  const conflict = shallowRef<CalculationDraftConflict<T> | null>(null)

  let disposed = false
  let hasAuthoritativeRevision = false
  let editVersion = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingSnapshot: T | null = null
  let pendingBaseRevision: number | null = null
  let pendingBaseKnown = false
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
      pendingBaseRevision = null
      pendingBaseKnown = false
      snapshotCaptureFailed = true
      clearTimer()
      status.value = 'error'
      return
    }
    const hadPendingSnapshot = pendingSnapshot !== null
    const originatingRevision = hadPendingSnapshot && pendingBaseRevision !== null
      ? pendingBaseRevision
      : revision.value
    snapshotCaptureFailed = false
    editVersion += 1
    pendingSnapshot = snapshot
    pendingBaseRevision = originatingRevision
    if (!hadPendingSnapshot) pendingBaseKnown = hasAuthoritativeRevision
    pendingDueAt = Date.now() + SAVE_DEBOUNCE_MS
    writeDirtyCache(snapshot, originatingRevision)
    clearTimer()
    if (status.value === 'conflict' || status.value === 'error' || loadPromise || activeSave) return
    armPendingSave()
  }

  function load(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (loadPromise) return loadPromise

    const task = (async () => {
      if (!await drainSavesBeforeLoad()) return
      restoreRecoveryCache()
      const versionAtStart = editVersion
      status.value = 'loading'
      loadFailed = false
      try {
        const serverDraft = await getCalculationDraft<T>(adapter.kind)
        if (disposed) return
        const serverSnapshot = normalizedSnapshot(serverDraft.payload)
        revision.value = serverDraft.revision
        updatedAt.value = serverDraft.updatedAt
        hasAuthoritativeRevision = true

        if (pendingSnapshot) {
          if (pendingBaseKnown) {
            reconcilePendingSnapshot(serverDraft, serverSnapshot)
          } else {
            pendingBaseRevision = serverDraft.revision
            pendingBaseKnown = true
            writeDirtyCache(pendingSnapshot, serverDraft.revision)
          }
          return
        }
        if (editVersion !== versionAtStart) return
        markRecoveryResolved(serverDraft.revision)

        if (serverDraft.revision === 0) {
          const legacy = readLegacySnapshot()
          if (legacy.state === 'valid') {
            applySnapshot(legacy.snapshot)
            await executeSave({ payload: legacy.snapshot, baseRevision: 0, importsLegacy: true }, 'saving')
            return
          }
          if (legacy.state === 'invalid') {
            applySnapshot(serverSnapshot)
            throw new TypeError('旧计算草稿无法无损迁移')
          }
        }

        applySnapshot(serverSnapshot)
        failedAttempt = null
        conflict.value = null
        status.value = 'idle'
      } catch {
        if (!disposed) {
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
        const queuedBaseRevision = pendingBaseRevision ?? revision.value
        pendingSnapshot = null
        pendingBaseRevision = null
        pendingBaseKnown = false
        await executeSave({
          payload: queuedSnapshot,
          baseRevision: queuedBaseRevision,
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
      writeDirtyCache(snapshot, revision.value)
      await executeSave({ payload: snapshot, baseRevision: revision.value, importsLegacy: false }, 'retrying')
      return
    }
    if (loadFailed) {
      await load()
      return
    }
    if (pendingSnapshot) {
      const correctedSnapshot = pendingSnapshot
      const correctedBaseRevision = pendingBaseRevision ?? revision.value
      pendingSnapshot = null
      pendingBaseRevision = null
      pendingBaseKnown = false
      await executeSave({
        payload: correctedSnapshot,
        baseRevision: correctedBaseRevision,
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
    hasAuthoritativeRevision = true
    markRecoveryResolved(serverDraft.revision)
    pendingSnapshot = null
    pendingBaseRevision = null
    pendingBaseKnown = false
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
        hasAuthoritativeRevision = true
        if (pendingSnapshot) {
          pendingBaseRevision = savedDraft.revision
          pendingBaseKnown = true
          writeDirtyCache(pendingSnapshot, savedDraft.revision)
        } else {
          markRecoveryResolved(savedDraft.revision)
        }
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
      return deepFreeze({ ...serverDraft, payload: normalizedSnapshot(serverDraft.payload) })
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
    const baseRevision = pendingBaseRevision ?? revision.value
    pendingSnapshot = null
    pendingBaseRevision = null
    pendingBaseKnown = false
    await executeSave({ payload: snapshot, baseRevision, importsLegacy: false }, 'saving')
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
    if (raw === null) return { state: 'absent' as const }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { state: 'absent' as const }
    }
    if (!adapter.migrateLegacy) {
      try {
        return { state: 'valid' as const, snapshot: normalizedSnapshot(parsed) }
      } catch {
        return { state: 'absent' as const }
      }
    }
    try {
      return {
        state: 'valid' as const,
        snapshot: normalizedSnapshot(adapter.migrateLegacy(cloneDraftValue(parsed)))
      }
    } catch {
      return { state: 'invalid' as const }
    }
  }

  function restoreRecoveryCache() {
    if (
      pendingSnapshot ||
      failedAttempt ||
      snapshotCaptureFailed ||
      status.value === 'conflict'
    ) {
      return
    }
    const cached = readRecoveryCache()
    if (!cached || cached.state === 'resolved') return
    try {
      applySnapshot(cached.payload)
      pendingSnapshot = cached.payload
      pendingBaseRevision = cached.baseRevision
      pendingBaseKnown = true
      pendingDueAt = Date.now()
      editVersion += 1
    } catch {
      // Recovery storage is best effort and never blocks authoritative retry.
    }
  }

  function reconcilePendingSnapshot(serverDraft: CalculationDraft<T>, serverSnapshot: T) {
    if (!pendingSnapshot || pendingBaseRevision === null) return
    const localSnapshot = pendingSnapshot
    if (serverDraft.revision < pendingBaseRevision) {
      enterReconciliationConflict(serverDraft, serverSnapshot, localSnapshot)
      return
    }
    if (draftValuesEqual(localSnapshot, serverSnapshot)) {
      applySnapshot(serverSnapshot)
      pendingSnapshot = null
      pendingBaseRevision = null
      pendingBaseKnown = false
      failedAttempt = null
      conflict.value = null
      loadFailed = false
      markRecoveryResolved(serverDraft.revision)
      status.value = 'idle'
      return
    }
    if (serverDraft.revision !== pendingBaseRevision) {
      enterReconciliationConflict(serverDraft, serverSnapshot, localSnapshot)
      return
    }
    pendingDueAt = Date.now()
  }

  function enterReconciliationConflict(
    serverDraft: CalculationDraft<T>,
    serverSnapshot: T,
    localSnapshot: T
  ) {
    clearTimer()
    pendingSnapshot = null
    pendingBaseRevision = null
    pendingBaseKnown = false
    failedAttempt = null
    loadFailed = false
    conflict.value = {
      serverDraft: deepFreeze({ ...serverDraft, payload: serverSnapshot }),
      localSnapshot
    }
    status.value = 'conflict'
  }

  function applySnapshot(snapshot: T) {
    adapter.apply(cloneDraftValue(snapshot))
  }

  function normalizedSnapshot(value: unknown) {
    return deepFreeze(cloneDraftValue(adapter.normalize(cloneDraftValue(value))))
  }

  function readRecoveryCache(): RecoveryCache<T> | null {
    const raw = safeStorageGet(adapter.cacheStorageKey)
    if (raw === null) return null
    try {
      const value = JSON.parse(raw) as unknown
      if (!isPlainDraftObject(value) || value.version !== 1) return null
      if (value.state === 'dirty') {
        if (
          !hasExactDraftKeys(value, ['version', 'state', 'baseRevision', 'payload']) ||
          !isSafeRevision(value.baseRevision)
        ) {
          return null
        }
        return deepFreeze({
          version: 1,
          state: 'dirty',
          baseRevision: value.baseRevision,
          payload: normalizedSnapshot(value.payload)
        })
      }
      if (
        value.state === 'resolved' &&
        hasExactDraftKeys(value, ['version', 'state', 'revision']) &&
        isSafeRevision(value.revision)
      ) {
        return deepFreeze({ version: 1, state: 'resolved', revision: value.revision })
      }
      return null
    } catch {
      return null
    }
  }

  function writeDirtyCache(snapshot: T, baseRevision: number) {
    const value: DirtyRecoveryCache<T> = {
      version: 1,
      state: 'dirty',
      baseRevision,
      payload: snapshot
    }
    safeStorageSet(adapter.cacheStorageKey, JSON.stringify(value))
  }

  function removeLegacy() {
    safeStorageRemove(adapter.legacyStorageKey)
  }

  function markRecoveryResolved(resolvedRevision: number) {
    if (safeStorageRemove(adapter.cacheStorageKey)) return
    const tombstone: ResolvedRecoveryCache = {
      version: 1,
      state: 'resolved',
      revision: resolvedRevision
    }
    safeStorageSet(adapter.cacheStorageKey, JSON.stringify(tombstone))
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function dispose() {
    disposed = true
    clearTimer()
    pendingSnapshot = null
    pendingBaseRevision = null
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

function isPlainDraftObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactDraftKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.length === expected.length &&
    keys.every((key) => typeof key === 'string' && expected.includes(key)) &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function isSafeRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function draftValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => draftValuesEqual(value, right[index]))
  }
  if (!isPlainDraftObject(left) || !isPlainDraftObject(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && draftValuesEqual(left[key], right[key]))
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
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new TypeError('草稿数组不能包含空槽')
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
