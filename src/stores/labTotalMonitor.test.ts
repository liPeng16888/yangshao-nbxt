import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth'
import { useLabTotalMonitorStore } from './labTotalMonitor'
import type { AuthUser } from '@/types/auth'
import { getLabTotalMonitorConfig } from '@/api/labTotalMonitor'
vi.mock('@/api/labTotalMonitor', () => ({ getLabTotalMonitorConfig: vi.fn() }))
const rule = { id: 'r1', name: '低铁', ironMin: 5, ironMax: 10, totalMin: 80.5, totalMax: 82.5, enabled: true }
const identity = (id: string, owner = id) => ({ id, dataOwnerId: owner, permissionVersion: 1 } as AuthUser)
beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } })
  setActivePinia(createPinia()); vi.mocked(getLabTotalMonitorConfig).mockReset()
  useAuthStore().user = identity('main-1')
})
describe('total monitor configuration identity', () => {
  it('uses the main owner for subaccounts and immediately clears rules when the identity changes', async () => {
    useAuthStore().user = identity('child-1', 'main-1')
    vi.mocked(getLabTotalMonitorConfig).mockResolvedValue({ frontendUserId: 'main-1', version: 1, rules: [rule], updatedAt: null })
    const store = useLabTotalMonitorStore(); expect(await store.load()).toBe(true)
    expect(getLabTotalMonitorConfig).toHaveBeenCalledWith('main-1'); expect(store.rules).toHaveLength(1)
    useAuthStore().user = identity('main-2'); expect(store.rules).toEqual([]); expect(store.config).toBeNull()
  })
  it('discards a late response from the previous owner', async () => {
    let resolve!: (value: any) => void
    vi.mocked(getLabTotalMonitorConfig).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const store = useLabTotalMonitorStore(), old = store.load()
    useAuthStore().user = identity('main-2')
    vi.mocked(getLabTotalMonitorConfig).mockResolvedValueOnce({ frontendUserId: 'main-2', version: 0, rules: [], updatedAt: null })
    expect(await store.load()).toBe(true)
    resolve({ frontendUserId: 'main-1', version: 1, rules: [rule], updatedAt: null })
    expect(await old).toBe(false); expect(store.config?.frontendUserId).toBe('main-2'); expect(store.rules).toEqual([])
  })
  it('refuses to treat network failure or a different-owner response as a valid configuration', async () => {
    const store = useLabTotalMonitorStore()
    vi.mocked(getLabTotalMonitorConfig).mockRejectedValueOnce(new Error('offline'))
    expect(await store.load()).toBe(false); expect(store.error).toContain('加载失败')
    vi.mocked(getLabTotalMonitorConfig).mockResolvedValueOnce({ frontendUserId: 'other', version: 1, rules: [rule], updatedAt: null })
    expect(await store.load()).toBe(false); expect(store.rules).toEqual([])
  })
})
