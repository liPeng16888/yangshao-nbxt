import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinanceEntry } from '@/types/finance'
import { useFinanceStore } from './finance'

const mocks = vi.hoisted(() => ({
  createFinanceEntries: vi.fn(),
  createFinanceEntry: vi.fn(),
  getFinanceEntries: vi.fn(),
  getFinanceMonths: vi.fn(),
  requestFinanceEntryDeletion: vi.fn()
}))

vi.mock('@/api/finance', () => mocks)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function entry(id: string, paymentDate: string): FinanceEntry {
  return { id, paymentDate, item: id, amount: 1, paymentMethod: 'cash', screenshotUrls: [] }
}

describe('finance store month loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.getFinanceMonths.mockResolvedValue(['2026-08', '2026-07', '2026-06'])
  })

  it('atomically commits only the latest successful month when an older response resolves last', async () => {
    const july = deferred<FinanceEntry[]>()
    const june = deferred<FinanceEntry[]>()
    mocks.getFinanceEntries.mockReturnValueOnce(july.promise).mockReturnValueOnce(june.promise)
    const store = useFinanceStore()
    store.month = '2026-08'
    store.entries = [entry('august', '2026-08-01')]

    const julyLoad = store.loadEntries('2026-07')
    const juneLoad = store.loadEntries('2026-06')
    expect(store.month).toBe('2026-08')
    expect(store.entries.map((row) => row.id)).toEqual(['august'])
    expect(store.loading).toBe(true)

    june.resolve([entry('june', '2026-06-20')])
    await juneLoad
    expect(store.month).toBe('2026-06')
    expect(store.entries.map((row) => row.id)).toEqual(['june'])
    expect(store.loading).toBe(false)

    july.resolve([entry('july', '2026-07-20')])
    await julyLoad
    expect(store.month).toBe('2026-06')
    expect(store.entries.map((row) => row.id)).toEqual(['june'])
    expect(store.loading).toBe(false)
  })

  it('does not partially commit a month or entries while the matching months request is pending', async () => {
    const nextEntries = deferred<FinanceEntry[]>()
    const nextMonths = deferred<string[]>()
    mocks.getFinanceEntries.mockReturnValueOnce(nextEntries.promise)
    mocks.getFinanceMonths.mockReturnValueOnce(nextMonths.promise)
    const store = useFinanceStore()
    store.month = '2026-08'
    store.entries = [entry('august', '2026-08-03')]

    const load = store.loadEntries('2026-07')
    nextEntries.resolve([entry('july', '2026-07-03')])
    await Promise.resolve()
    expect(store.month).toBe('2026-08')
    expect(store.entries.map((row) => row.id)).toEqual(['august'])
    expect(store.loading).toBe(true)

    nextMonths.resolve(['2026-08', '2026-07'])
    await load
    expect(store.month).toBe('2026-07')
    expect(store.entries.map((row) => row.id)).toEqual(['july'])
    expect(store.months).toEqual(['2026-08', '2026-07'])
  })

  it('ignores an older failure while the latest request remains loading', async () => {
    const july = deferred<FinanceEntry[]>()
    const june = deferred<FinanceEntry[]>()
    mocks.getFinanceEntries.mockReturnValueOnce(july.promise).mockReturnValueOnce(june.promise)
    const store = useFinanceStore()

    const julyLoad = store.loadEntries('2026-07')
    const juneLoad = store.loadEntries('2026-06')
    july.reject(new Error('old request failed'))
    await expect(julyLoad).resolves.toBeUndefined()
    expect(store.loading).toBe(true)
    expect(store.loadError).toBe('')

    june.resolve([entry('june', '2026-06-02')])
    await juneLoad
    expect(store.month).toBe('2026-06')
    expect(store.loadError).toBe('')
    expect(store.loading).toBe(false)
  })

  it('keeps the committed month and entries on failure and retries the exact failed month', async () => {
    mocks.getFinanceEntries
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([entry('july', '2026-07-03')])
    const store = useFinanceStore()
    store.month = '2026-08'
    store.entries = [entry('august', '2026-08-03')]

    await expect(store.loadEntries('2026-07')).resolves.toBeUndefined()
    expect(store.month).toBe('2026-08')
    expect(store.entries.map((row) => row.id)).toEqual(['august'])
    expect(store.loadError).toContain('2026-07')
    expect(store.loading).toBe(false)

    await store.retryEntries()
    expect(mocks.getFinanceEntries).toHaveBeenLastCalledWith('2026-07')
    expect(store.month).toBe('2026-07')
    expect(store.entries.map((row) => row.id)).toEqual(['july'])
    expect(store.loadError).toBe('')
  })

  it('does not apply a response after its finance page cancels pending loads on unmount', async () => {
    const pending = deferred<FinanceEntry[]>()
    mocks.getFinanceEntries.mockReturnValueOnce(pending.promise)
    const store = useFinanceStore()
    store.month = '2026-08'
    store.entries = [entry('august', '2026-08-03')]

    const load = store.loadEntries('2026-07')
    store.cancelEntryLoads()
    expect(store.loading).toBe(false)
    pending.resolve([entry('late-july', '2026-07-03')])
    await load

    expect(store.month).toBe('2026-08')
    expect(store.entries.map((row) => row.id)).toEqual(['august'])
    expect(store.loadError).toBe('')
  })
})
