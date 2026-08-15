// @vitest-environment jsdom
import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CalculationDraftConflictError,
  getCalculationDraft,
  saveCalculationDraft
} from '@/api/calculationDraft'
import { useCalculationDraft, type CalculationDraftAdapter } from './useCalculationDraft'

vi.mock('@/api/calculationDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/calculationDraft')>()
  return {
    ...actual,
    getCalculationDraft: vi.fn(),
    saveCalculationDraft: vi.fn()
  }
})

interface TestDraft {
  value: number
  details: { label: string }
}

const defaults: TestDraft = { value: 0, details: { label: 'default' } }
const serverPayload: TestDraft = { value: 4, details: { label: 'server' } }
const legacyPayload: TestDraft = { value: 1, details: { label: 'legacy' } }

function response(payload: TestDraft, revision: number, updatedAt: string | null = null) {
  return { kind: 'STANDARD_SAMPLE' as const, payload, revision, updatedAt }
}

function normalize(value: unknown): TestDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid draft')
  const source = value as Partial<TestDraft>
  if (!Number.isFinite(source.value) || !source.details || typeof source.details.label !== 'string') {
    throw new Error('invalid draft')
  }
  return { value: source.value as number, details: { label: source.details.label } }
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) })
  } satisfies Storage
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function setup(initial: TestDraft = defaults) {
  let current = normalize(initial)
  const apply = vi.fn((payload: TestDraft) => { current = normalize(payload) })
  const adapter: CalculationDraftAdapter<TestDraft> = {
    kind: 'standard-sample',
    legacyStorageKey: 'legacy-draft',
    cacheStorageKey: 'draft-cache',
    defaults: () => normalize(defaults),
    normalize,
    snapshot: () => current,
    apply
  }
  const scope = effectScope()
  let draft!: ReturnType<typeof useCalculationDraft<TestDraft>>
  scope.run(() => { draft = useCalculationDraft(adapter) })
  return {
    adapter,
    apply,
    draft,
    scope,
    edit(next: TestDraft) { current = next }
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('useCalculationDraft', () => {
  let scopes: EffectScope[]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
    scopes = []
  })

  afterEach(() => {
    scopes.forEach((scope) => scope.stop())
    vi.useRealTimers()
  })

  function trackedSetup(initial?: TestDraft) {
    const result = setup(initial)
    scopes.push(result.scope)
    return result
  }

  it('lets a positive server revision win over an older legacy payload', async () => {
    localStorage.setItem('legacy-draft', JSON.stringify(legacyPayload))
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(serverPayload, 4, '2026-08-15T08:00:00.000Z'))
    const { draft, apply } = trackedSetup(legacyPayload)

    await draft.load()

    expect(apply).toHaveBeenCalledWith(serverPayload)
    expect(draft.revision.value).toBe(4)
    expect(draft.updatedAt.value).toBe('2026-08-15T08:00:00.000Z')
    expect(saveCalculationDraft).not.toHaveBeenCalled()
    expect(localStorage.getItem('legacy-draft')).not.toBeNull()
  })

  it('imports one valid legacy payload only at revision zero and removes it after the save succeeds', async () => {
    localStorage.setItem('legacy-draft', JSON.stringify(legacyPayload))
    vi.mocked(getCalculationDraft)
      .mockResolvedValueOnce(response(defaults, 0))
      .mockResolvedValueOnce(response(legacyPayload, 1, '2026-08-15T08:01:00.000Z'))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(legacyPayload, 1, '2026-08-15T08:01:00.000Z'))
    const { draft, apply } = trackedSetup()

    await draft.load()

    expect(apply).toHaveBeenCalledWith(legacyPayload)
    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 0,
      payload: legacyPayload
    })
    expect(localStorage.getItem('legacy-draft')).toBeNull()
    await draft.load()
    expect(saveCalculationDraft).toHaveBeenCalledTimes(1)
    expect(draft.revision.value).toBe(1)
  })

  it('does not remove legacy data when its first server save fails', async () => {
    localStorage.setItem('legacy-draft', JSON.stringify(legacyPayload))
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 0))
    vi.mocked(saveCalculationDraft).mockRejectedValueOnce(new Error('offline'))
    const { draft } = trackedSetup()

    await draft.load()

    expect(draft.status.value).toBe('error')
    expect(localStorage.getItem('legacy-draft')).not.toBeNull()
  })

  it('uses the revision-zero server draft when reading legacy storage throws', async () => {
    const storage = memoryStorage()
    storage.getItem.mockImplementation((key) => {
      if (key === 'legacy-draft') throw new Error('blocked legacy read')
      return null
    })
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 0))
    const { draft, apply } = trackedSetup(legacyPayload)

    await draft.load()

    expect(storage.getItem).toHaveBeenCalledWith('legacy-draft')
    expect(apply).toHaveBeenCalledWith(defaults)
    expect(saveCalculationDraft).not.toHaveBeenCalled()
    expect(draft.status.value).toBe('idle')
  })

  it('does not turn a successful legacy import into failure when removal throws or reimport later', async () => {
    const storage = memoryStorage()
    storage.setItem('legacy-draft', JSON.stringify(legacyPayload))
    storage.removeItem.mockImplementation(() => { throw new Error('blocked legacy removal') })
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
    vi.mocked(getCalculationDraft)
      .mockResolvedValueOnce(response(defaults, 0))
      .mockResolvedValueOnce(response(legacyPayload, 1))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(legacyPayload, 1))
    const { draft } = trackedSetup()

    await draft.load()
    expect(draft.status.value).toBe('saved')
    expect(storage.removeItem).toHaveBeenCalledWith('legacy-draft')
    expect(storage.getItem('legacy-draft')).not.toBeNull()

    await draft.load()
    expect(saveCalculationDraft).toHaveBeenCalledTimes(1)
    expect(draft.revision.value).toBe(1)
  })

  it('keeps authoritative load and edit saves successful when cache writes throw', async () => {
    const storage = memoryStorage()
    storage.setItem.mockImplementation(() => { throw new Error('blocked cache write') })
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
    const local = { value: 5, details: { label: 'edit' } }
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(serverPayload, 2))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(local, 3))
    const { draft, edit } = trackedSetup()

    await draft.load()
    edit(local)
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)

    expect(storage.setItem).toHaveBeenCalledWith('draft-cache', JSON.stringify(local))
    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 2,
      payload: local
    })
    expect(draft.status.value).toBe('saved')
  })

  it('keeps server load and save working when every storage operation throws', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => { throw new Error('blocked') }),
        setItem: vi.fn(() => { throw new Error('blocked') }),
        removeItem: vi.fn(() => { throw new Error('blocked') })
      }
    })
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(serverPayload, 2))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response({ value: 5, details: { label: 'edit' } }, 3))
    const { draft, edit, apply } = trackedSetup()

    await draft.load()
    edit({ value: 5, details: { label: 'edit' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)

    expect(apply).toHaveBeenCalledWith(serverPayload)
    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 2,
      payload: { value: 5, details: { label: 'edit' } }
    })
    expect(draft.status.value).toBe('saved')
  })

  it('keeps an edit queued after a failed load visible while retrying against the fetched revision', async () => {
    const local = { value: 9, details: { label: 'edited after load failure' } }
    vi.mocked(getCalculationDraft)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(serverPayload, 4))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(local, 5))
    const { draft, edit, apply } = trackedSetup()

    await draft.load()
    expect(draft.status.value).toBe('error')
    edit(local)
    draft.scheduleSave()

    await draft.retry()
    await vi.advanceTimersByTimeAsync(500)

    expect(apply).not.toHaveBeenCalledWith(serverPayload)
    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 4,
      payload: local
    })
    expect(draft.revision.value).toBe(5)
    expect(draft.status.value).toBe('saved')
  })

  it('restores a valid recovery cache provisionally after an authoritative load failure', async () => {
    const cached = { value: 8, details: { label: 'cached local' } }
    localStorage.setItem('draft-cache', JSON.stringify(cached))
    vi.mocked(getCalculationDraft).mockRejectedValueOnce(new Error('offline'))
    const { draft, apply } = trackedSetup()

    await draft.load()

    expect(apply).toHaveBeenCalledWith(cached)
    expect(draft.status.value).toBe('error')
    expect(draft.revision.value).toBe(0)
    expect(saveCalculationDraft).not.toHaveBeenCalled()
  })

  it('does not persist a clean server snapshot as an unsynchronized recovery cache', async () => {
    vi.mocked(getCalculationDraft)
      .mockResolvedValueOnce(response(serverPayload, 4))
      .mockRejectedValueOnce(new Error('offline'))
    const first = trackedSetup()

    await first.draft.load()
    expect(localStorage.getItem('draft-cache')).toBeNull()

    const remounted = trackedSetup()
    await remounted.draft.load()
    expect(remounted.apply).not.toHaveBeenCalled()
    expect(remounted.draft.status.value).toBe('error')
  })

  it('keeps a successful save successful when clearing its recovery cache throws', async () => {
    const storage = memoryStorage()
    storage.removeItem.mockImplementation((key) => {
      if (key === 'draft-cache') throw new Error('blocked cache removal')
    })
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
    const local = { value: 8, details: { label: 'saved local' } }
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(serverPayload, 4))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(local, 5))
    const { draft, edit } = trackedSetup()

    await draft.load()
    edit(local)
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)

    expect(storage.removeItem).toHaveBeenCalledWith('draft-cache')
    expect(draft.status.value).toBe('saved')
    expect(draft.revision.value).toBe(5)
  })

  it.each([
    ['malformed cache data', () => localStorage.setItem('draft-cache', '{bad json')],
    ['cache data rejected by the adapter normalizer', () => {
      localStorage.setItem('draft-cache', JSON.stringify({ value: '8', details: { label: 'invalid' } }))
    }],
    ['a throwing cache read', () => {
      const storage = memoryStorage()
      storage.getItem.mockImplementation((key) => {
        if (key === 'draft-cache') throw new Error('blocked')
        return null
      })
      Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
    }]
  ])('ignores %s without blocking the failed-load retry state', async (_label, arrange) => {
    arrange()
    vi.mocked(getCalculationDraft).mockRejectedValueOnce(new Error('offline'))
    const { draft, apply } = trackedSetup()

    await draft.load()

    expect(apply).not.toHaveBeenCalled()
    expect(draft.status.value).toBe('error')
    expect(saveCalculationDraft).not.toHaveBeenCalled()
  })

  it('reconciles a provisional recovery cache with the server revision before saving it', async () => {
    const cached = { value: 8, details: { label: 'newer cached local' } }
    localStorage.setItem('draft-cache', JSON.stringify(cached))
    vi.mocked(getCalculationDraft)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response(serverPayload, 4))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(cached, 5))
    const { draft, apply } = trackedSetup()

    await draft.load()
    apply.mockClear()
    await draft.retry()
    await flush()

    expect(apply).not.toHaveBeenCalledWith(serverPayload)
    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 4,
      payload: cached
    })
    expect(draft.revision.value).toBe(5)
    expect(draft.status.value).toBe('saved')
  })

  it('debounces rapid edits and saves only an immutable copy of the latest snapshot', async () => {
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    const saved = { value: 2, details: { label: 'latest' } }
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(saved, 3))
    const { draft, edit } = trackedSetup()
    await draft.load()

    edit({ value: 1, details: { label: 'older' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(300)
    const mutable = { value: 2, details: { label: 'latest' } }
    edit(mutable)
    draft.scheduleSave()
    mutable.details.label = 'mutated after scheduling'
    await vi.advanceTimersByTimeAsync(499)
    expect(saveCalculationDraft).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(saveCalculationDraft).toHaveBeenCalledTimes(1)
    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 2,
      payload: saved
    })
  })

  it('makes the retry action recapture state after a local snapshot validation error', async () => {
    const corrected = { value: 6, details: { label: 'corrected' } }
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    vi.mocked(saveCalculationDraft).mockResolvedValueOnce(response(corrected, 3))
    const { draft, edit } = trackedSetup()
    await draft.load()

    edit({ value: Number.NaN, details: { label: 'invalid' } })
    draft.scheduleSave()
    expect(draft.status.value).toBe('error')
    edit(corrected)
    draft.scheduleSave()

    await draft.retry()

    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 2,
      payload: corrected
    })
    expect(draft.status.value).toBe('saved')
  })

  it('retries the exact failed snapshot before safely saving a newer queued edit', async () => {
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    vi.mocked(saveCalculationDraft)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response({ value: 1, details: { label: 'failed' } }, 3))
      .mockResolvedValueOnce(response({ value: 2, details: { label: 'newer' } }, 4))
    const { draft, edit } = trackedSetup()
    await draft.load()

    const first = { value: 1, details: { label: 'failed' } }
    edit(first)
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)
    first.details.label = 'mutated later'
    expect(draft.status.value).toBe('error')

    edit({ value: 2, details: { label: 'newer' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(saveCalculationDraft).toHaveBeenCalledTimes(1)

    await draft.retry()
    expect(saveCalculationDraft).toHaveBeenNthCalledWith(2, 'standard-sample', {
      baseRevision: 2,
      payload: { value: 1, details: { label: 'failed' } }
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(saveCalculationDraft).toHaveBeenNthCalledWith(3, 'standard-sample', {
      baseRevision: 3,
      payload: { value: 2, details: { label: 'newer' } }
    })
  })

  it('does not let an older in-flight save response replace the newer queued cache', async () => {
    const firstSave = deferred<ReturnType<typeof response>>()
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    vi.mocked(saveCalculationDraft)
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce(response({ value: 2, details: { label: 'newer' } }, 4))
    const { draft, edit } = trackedSetup()
    await draft.load()

    edit({ value: 1, details: { label: 'in flight' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)
    edit({ value: 2, details: { label: 'newer' } })
    draft.scheduleSave()

    firstSave.resolve(response({ value: 1, details: { label: 'in flight' } }, 3))
    await flush()
    expect(JSON.parse(localStorage.getItem('draft-cache')!)).toEqual({
      value: 2,
      details: { label: 'newer' }
    })

    await vi.advanceTimersByTimeAsync(500)
    expect(saveCalculationDraft).toHaveBeenNthCalledWith(2, 'standard-sample', {
      baseRevision: 3,
      payload: { value: 2, details: { label: 'newer' } }
    })
  })

  it('does not consume a corrected pending snapshot when retry is pressed during an older save', async () => {
    const firstSave = deferred<ReturnType<typeof response>>()
    const corrected = { value: 3, details: { label: 'corrected while saving' } }
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    vi.mocked(saveCalculationDraft)
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce(response(corrected, 4))
    const { draft, edit } = trackedSetup()
    await draft.load()

    edit({ value: 1, details: { label: 'in flight' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)
    edit({ value: Number.NaN, details: { label: 'invalid newer edit' } })
    draft.scheduleSave()
    edit(corrected)
    draft.scheduleSave()
    expect(draft.status.value).toBe('error')

    await draft.retry()
    firstSave.resolve(response({ value: 1, details: { label: 'in flight' } }, 3))
    await flush()
    await vi.advanceTimersByTimeAsync(500)

    expect(saveCalculationDraft).toHaveBeenNthCalledWith(2, 'standard-sample', {
      baseRevision: 3,
      payload: corrected
    })
    expect(draft.status.value).toBe('saved')
  })

  it('drains a queued successor before load and preserves its retry snapshot when the successor fails', async () => {
    const firstSave = deferred<ReturnType<typeof response>>()
    const secondSave = deferred<ReturnType<typeof response>>()
    const queued = { value: 2, details: { label: 'queued B' } }
    vi.mocked(getCalculationDraft)
      .mockResolvedValueOnce(response(defaults, 2))
      .mockResolvedValueOnce(response({ value: 1, details: { label: 'old server A' } }, 3))
    vi.mocked(saveCalculationDraft)
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise)
      .mockResolvedValueOnce(response(queued, 4))
    const { draft, edit, apply } = trackedSetup()
    await draft.load()
    apply.mockClear()

    edit({ value: 1, details: { label: 'in-flight A' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)
    edit(queued)
    draft.scheduleSave()
    const concurrentLoad = draft.load()

    firstSave.resolve(response({ value: 1, details: { label: 'in-flight A' } }, 3))
    await flush()
    expect(saveCalculationDraft).toHaveBeenCalledTimes(2)
    expect(getCalculationDraft).toHaveBeenCalledTimes(1)

    secondSave.reject(new Error('B failed'))
    await concurrentLoad
    expect(draft.status.value).toBe('error')
    expect(apply).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('draft-cache')!)).toEqual(queued)

    await draft.retry()
    expect(saveCalculationDraft).toHaveBeenNthCalledWith(3, 'standard-sample', {
      baseRevision: 3,
      payload: queued
    })
  })

  it('does not let a concurrent load apply or clear a conflict produced by the save it awaited', async () => {
    const firstSave = deferred<ReturnType<typeof response>>()
    const authoritative = response(serverPayload, 4, '2026-08-15T09:00:00.000Z')
    vi.mocked(getCalculationDraft)
      .mockResolvedValueOnce(response(defaults, 2))
      .mockResolvedValueOnce(authoritative)
    vi.mocked(saveCalculationDraft).mockReturnValueOnce(firstSave.promise)
    const { draft, edit, apply } = trackedSetup()
    await draft.load()
    apply.mockClear()

    edit({ value: 1, details: { label: 'conflicting local' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)
    const concurrentLoad = draft.load()

    firstSave.reject(new CalculationDraftConflictError(authoritative))
    await concurrentLoad

    expect(getCalculationDraft).toHaveBeenCalledTimes(1)
    expect(draft.status.value).toBe('conflict')
    expect(draft.conflict.value?.localSnapshot).toEqual({ value: 1, details: { label: 'conflicting local' } })
    expect(apply).not.toHaveBeenCalled()
  })

  it('does not let a late load response overwrite an edit made while loading', async () => {
    const loading = deferred<ReturnType<typeof response>>()
    const saving = deferred<ReturnType<typeof response>>()
    vi.mocked(getCalculationDraft).mockReturnValueOnce(loading.promise)
    vi.mocked(saveCalculationDraft).mockReturnValueOnce(saving.promise)
    const { draft, edit, apply } = trackedSetup()

    const load = draft.load()
    edit({ value: 9, details: { label: 'local' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)
    loading.resolve(response(serverPayload, 5))
    await flush()

    expect(apply).not.toHaveBeenCalledWith(serverPayload)
    expect(JSON.parse(localStorage.getItem('draft-cache')!)).toEqual({
      value: 9,
      details: { label: 'local' }
    })
    expect(saveCalculationDraft).toHaveBeenCalledWith('standard-sample', {
      baseRevision: 5,
      payload: { value: 9, details: { label: 'local' } }
    })
    saving.resolve(response({ value: 9, details: { label: 'local' } }, 6))
    await load
  })

  it('freezes automatic saves during conflict, keeps the attempted snapshot, and can use the server version', async () => {
    const authoritative = response(serverPayload, 4, '2026-08-15T09:00:00.000Z')
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    vi.mocked(saveCalculationDraft).mockRejectedValueOnce(new CalculationDraftConflictError(authoritative))
    const { draft, edit, apply } = trackedSetup()
    await draft.load()

    const attempted = { value: 1, details: { label: 'attempted' } }
    edit(attempted)
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)
    attempted.details.label = 'changed outside'

    expect(draft.status.value).toBe('conflict')
    expect(draft.conflict.value?.localSnapshot).toEqual({ value: 1, details: { label: 'attempted' } })
    edit({ value: 8, details: { label: 'new while conflicted' } })
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(saveCalculationDraft).toHaveBeenCalledTimes(1)

    draft.useServerVersion()
    expect(apply).toHaveBeenLastCalledWith(serverPayload)
    expect(draft.revision.value).toBe(4)
    expect(draft.conflict.value).toBeNull()
    expect(draft.status.value).toBe('saved')
    expect(localStorage.getItem('draft-cache')).toBeNull()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(saveCalculationDraft).toHaveBeenCalledTimes(1)
  })

  it('overwrites from the conflict revision and retains the same local snapshot across repeat conflict and retryable failure', async () => {
    const local = { value: 1, details: { label: 'attempted' } }
    const conflict4 = response(serverPayload, 4)
    const conflict5 = response({ value: 5, details: { label: 'new server' } }, 5)
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    vi.mocked(saveCalculationDraft)
      .mockRejectedValueOnce(new CalculationDraftConflictError(conflict4))
      .mockRejectedValueOnce(new CalculationDraftConflictError(conflict5))
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce(response(local, 6))
    const { draft, edit } = trackedSetup()
    await draft.load()
    edit(local)
    draft.scheduleSave()
    await vi.advanceTimersByTimeAsync(500)

    await draft.overwriteServerVersion()
    expect(saveCalculationDraft).toHaveBeenNthCalledWith(2, 'standard-sample', {
      baseRevision: 4,
      payload: local
    })
    expect(draft.status.value).toBe('conflict')
    expect(draft.conflict.value?.serverDraft.revision).toBe(5)
    expect(draft.conflict.value?.localSnapshot).toEqual(local)

    await draft.overwriteServerVersion()
    expect(saveCalculationDraft).toHaveBeenNthCalledWith(3, 'standard-sample', {
      baseRevision: 5,
      payload: local
    })
    expect(draft.status.value).toBe('error')

    await draft.retry()
    expect(saveCalculationDraft).toHaveBeenNthCalledWith(4, 'standard-sample', {
      baseRevision: 5,
      payload: local
    })
    expect(draft.revision.value).toBe(6)
    expect(draft.conflict.value).toBeNull()
  })

  it('clears scheduled work and ignores late responses when its scope is disposed', async () => {
    vi.mocked(getCalculationDraft).mockResolvedValueOnce(response(defaults, 2))
    const lateSave = deferred<ReturnType<typeof response>>()
    vi.mocked(saveCalculationDraft).mockReturnValueOnce(lateSave.promise)
    const { draft, edit, scope } = trackedSetup()
    await draft.load()

    edit({ value: 7, details: { label: 'pending' } })
    draft.scheduleSave()
    scope.stop()
    await vi.advanceTimersByTimeAsync(500)
    expect(saveCalculationDraft).not.toHaveBeenCalled()

    const second = trackedSetup()
    const lateLoad = deferred<ReturnType<typeof response>>()
    vi.mocked(getCalculationDraft).mockReturnValueOnce(lateLoad.promise)
    const loading = second.draft.load()
    second.scope.stop()
    lateLoad.resolve(response(serverPayload, 9))
    await loading
    expect(second.apply).not.toHaveBeenCalled()
    expect(second.draft.revision.value).toBe(0)
  })
})
