import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBlacklistStore } from './blacklist'

const mocks = vi.hoisted(() => ({ searchBlacklist: vi.fn() }))

vi.mock('@/api/blacklist', () => ({
  searchBlacklist: mocks.searchBlacklist,
  createBlacklist: vi.fn(),
  deleteBlacklist: vi.fn(),
  updateBlacklist: vi.fn()
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('blacklist store record loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.searchBlacklist.mockReset()
  })

  it('keeps the latest search result when an older request settles afterward', async () => {
    const first = deferred<any[]>()
    const second = deferred<any[]>()
    mocks.searchBlacklist.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const store = useBlacklistStore()

    const firstLoad = store.loadRecords('旧关键词')
    const secondLoad = store.loadRecords('新关键词')
    second.resolve([{ id: 'new', images: [] }])
    await secondLoad
    first.resolve([{ id: 'old', images: [] }])
    await firstLoad

    expect(store.keyword).toBe('新关键词')
    expect(store.records.map((row) => row.id)).toEqual(['new'])
    expect(store.loading).toBe(false)
  })

  it('ignores a pending result after the page cancels its loads on unmount', async () => {
    const request = deferred<any[]>()
    mocks.searchBlacklist.mockReturnValueOnce(request.promise)
    const store = useBlacklistStore()
    const load = store.loadRecords('离开前')

    store.cancelPendingLoads()
    request.resolve([{ id: 'late', images: [] }])
    await load

    expect(store.records).toEqual([])
    expect(store.loading).toBe(false)
  })
})
