import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBlacklistStore } from './blacklist'

const mocks = vi.hoisted(() => ({
  searchBlacklist: vi.fn(),
  createBlacklist: vi.fn(),
  deleteBlacklist: vi.fn(),
  updateBlacklist: vi.fn()
}))

vi.mock('@/api/blacklist', () => ({
  searchBlacklist: mocks.searchBlacklist,
  createBlacklist: mocks.createBlacklist,
  deleteBlacklist: mocks.deleteBlacklist,
  updateBlacklist: mocks.updateBlacklist
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

describe('blacklist store record loading', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.searchBlacklist.mockReset()
    mocks.createBlacklist.mockReset()
    mocks.deleteBlacklist.mockReset()
    mocks.updateBlacklist.mockReset()
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

  it('keeps a newer consumer loading when an older consumer aborts its own request', async () => {
    const first = deferred<any[]>()
    const second = deferred<any[]>()
    mocks.searchBlacklist.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const store = useBlacklistStore()
    const firstController = new AbortController()
    const secondController = new AbortController()
    const firstLoad = store.loadRecords('页面 A', { signal: firstController.signal })
    const secondLoad = store.loadRecords('页面 B', { signal: secondController.signal })

    firstController.abort()
    first.reject(new DOMException('aborted', 'AbortError'))
    await expect(firstLoad).rejects.toMatchObject({ name: 'AbortError' })
    expect(store.loading).toBe(true)

    second.resolve([{ id: 'page-b', images: [] }])
    await secondLoad

    expect(mocks.searchBlacklist).toHaveBeenNthCalledWith(1, '页面 A', { signal: firstController.signal })
    expect(mocks.searchBlacklist).toHaveBeenNthCalledWith(2, '页面 B', { signal: secondController.signal })
    expect(store.records.map((row) => row.id)).toEqual(['page-b'])
    expect(store.loading).toBe(false)
  })

  it('does not apply a response that resolves after its owning consumer aborts', async () => {
    const request = deferred<any[]>()
    mocks.searchBlacklist.mockReturnValueOnce(request.promise)
    const store = useBlacklistStore()
    const controller = new AbortController()
    const load = store.loadRecords('离开前', { signal: controller.signal })

    controller.abort()
    request.resolve([{ id: 'late', images: [] }])
    await load

    expect(store.records).toEqual([])
    expect(store.loading).toBe(false)
  })

  it('does not let an older search resurrect a successfully deleted record', async () => {
    const request = deferred<any[]>()
    mocks.searchBlacklist.mockReturnValueOnce(request.promise)
    mocks.deleteBlacklist.mockResolvedValue({ id: 'deleted' })
    const store = useBlacklistStore()
    store.records = [{ id: 'deleted', images: [] } as never]

    const load = store.loadRecords('pending')
    await store.deleteRecord('deleted')
    request.resolve([{ id: 'deleted', images: [] }])
    await load

    expect(store.records).toEqual([])
  })

  it('does not let an older search overwrite a successfully supplemented record', async () => {
    const request = deferred<any[]>()
    const updated = { id: 'updated', images: [], note: '最新补充', updatedAt: '2026-08-16T01:00:00.000Z' }
    mocks.searchBlacklist.mockReturnValueOnce(request.promise)
    mocks.updateBlacklist.mockResolvedValue(updated)
    const store = useBlacklistStore()
    store.records = [{ id: 'updated', images: [], note: '旧内容', updatedAt: '2026-08-15T01:00:00.000Z' } as never]

    const load = store.loadRecords('pending')
    await store.updateRecord('updated', { images: [], note: '最新补充', baseUpdatedAt: '2026-08-15T01:00:00.000Z' })
    request.resolve([{ id: 'updated', images: [], note: '旧内容' }])
    await load

    expect(store.records[0].note).toBe('最新补充')
  })
})
