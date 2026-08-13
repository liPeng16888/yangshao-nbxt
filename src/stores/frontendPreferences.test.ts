// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'
import type { AuthUser } from '@/types/auth'
import type {
  CachedFrontendPreference,
  FrontendPreferenceRecord,
  FrontendPreferenceSection
} from '@/types/frontendPreference'
import {
  readFrontendPreferenceCache,
  writeFrontendPreferenceCache
} from '@/utils/frontendPreferenceCache'
import { useAuthStore } from './auth'

const api = vi.hoisted(() => ({
  listFrontendPreferences: vi.fn(),
  saveFrontendPreference: vi.fn()
}))

vi.mock('@/api/frontendPreferences', () => api)

import {
  frontendPreferenceOwnerId,
  useFrontendPreferencesStore
} from './frontendPreferences'

const smsSection = 'LAB_REPORT_SMS_TEMPLATE' as const

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  }
}

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'main-1',
    account: 'main-1',
    username: '主账号',
    role: 'FRONTEND_USER',
    dataOwnerId: 'main-1',
    isFrontendMainAccount: true,
    isFrontendSubAccount: false,
    permissions: [],
    permissionVersion: 1,
    ...overrides
  }
}

function record<T>(
  section: FrontendPreferenceSection,
  value: T,
  version: number,
  updatedById = 'main-1'
): FrontendPreferenceRecord<T> {
  return {
    section,
    value,
    version,
    updatedAt: `2026-08-13T00:00:0${version}.000Z`,
    updatedBy: { id: updatedById, username: '主账号' }
  }
}

function cached<T>(
  ownerId: string,
  server: FrontendPreferenceRecord<T> | null,
  pending?: { value: T; baseVersion: number }
): CachedFrontendPreference<T> {
  return {
    ownerId,
    section: (server?.section ?? smsSection),
    server,
    ...(pending ? { pendingValue: pending.value, pendingBaseVersion: pending.baseVersion } : {})
  }
}

function networkError() {
  return new AxiosError('Network Error', 'ERR_NETWORK')
}

function preferenceConflict(current: FrontendPreferenceRecord | null) {
  return {
    response: {
      status: 409,
      data: { code: 'PREFERENCE_VERSION_CONFLICT', current }
    }
  }
}

describe('frontend preference owner sync store', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })
    setActivePinia(createPinia())
    useAuthStore().user = user()
    api.listFrontendPreferences.mockReset()
    api.saveFrontendPreference.mockReset()
  })

  it('uses dataOwnerId for a subaccount and falls back to id only for a main account', () => {
    expect(frontendPreferenceOwnerId(user({
      id: 'sub-1', role: 'FRONTEND_SUB_USER', dataOwnerId: 'main-1',
      isFrontendMainAccount: false, isFrontendSubAccount: true
    }))).toBe('main-1')
    expect(frontendPreferenceOwnerId(user({ dataOwnerId: undefined }))).toBe('main-1')
    expect(frontendPreferenceOwnerId(user({
      id: 'sub-1', role: 'FRONTEND_SUB_USER', dataOwnerId: undefined,
      isFrontendMainAccount: false, isFrontendSubAccount: true
    }))).toBe('')
  })

  it('shows cache first and then replaces it with the server version for the same owner', async () => {
    writeFrontendPreferenceCache(cached(
      'main-1',
      record(smsSection, { prefix: '缓存', suffix: '' }, 2)
    ))
    api.listFrontendPreferences.mockResolvedValue([
      record(smsSection, { prefix: '服务器', suffix: '' }, 3)
    ])
    const store = useFrontendPreferencesStore()

    const promise = store.loadAll()

    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('缓存')
    await promise
    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('服务器')
    expect(store.statuses[smsSection]).toBe('saved')
  })

  it('synchronously switches in-memory values to the authenticated owner before another load', async () => {
    writeFrontendPreferenceCache(cached(
      'main-1',
      record(smsSection, { prefix: '账号 A', suffix: '' }, 1)
    ))
    writeFrontendPreferenceCache(cached(
      'main-2',
      record(smsSection, { prefix: '账号 B', suffix: '' }, 2)
    ))
    const store = useFrontendPreferencesStore()
    expect(store.value(smsSection, { prefix: '空', suffix: '' }).prefix).toBe('账号 A')

    useAuthStore().user = user({ id: 'main-2', dataOwnerId: 'main-2' })

    expect(store.value(smsSection, { prefix: '空', suffix: '' }).prefix).toBe('账号 B')
    expect(store.statuses[smsSection]).toBe('saved')
  })

  it('queues an offline edit without silently overwriting a newer server version', async () => {
    const store = useFrontendPreferencesStore()
    api.saveFrontendPreference.mockRejectedValueOnce(networkError())

    await expect(store.save(smsSection, { prefix: '本机', suffix: '' }))
      .resolves.toBe('queued')
    api.listFrontendPreferences.mockResolvedValue([
      record(smsSection, { prefix: '他人', suffix: '' }, 4, 'sub-2')
    ])

    await store.loadAll()

    expect(store.conflicts[smsSection]).toMatchObject({
      serverVersion: 4,
      localValue: { prefix: '本机', suffix: '' }
    })
    expect(store.statuses[smsSection]).toBe('conflict')
    expect(api.saveFrontendPreference).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending edit queued when its base still matches and never auto-resubmits it', async () => {
    const current = record(smsSection, { prefix: '服务器', suffix: '' }, 3)
    writeFrontendPreferenceCache(cached('main-1', current, {
      value: { prefix: '待同步', suffix: '' },
      baseVersion: 3
    }))
    api.listFrontendPreferences.mockResolvedValue([current])
    const store = useFrontendPreferencesStore()

    await store.loadAll()

    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('待同步')
    expect(store.statuses[smsSection]).toBe('queued')
    expect(api.saveFrontendPreference).not.toHaveBeenCalled()
  })

  it('marks an HTTP application failure as error without queuing that value', async () => {
    const store = useFrontendPreferencesStore()
    api.saveFrontendPreference.mockRejectedValueOnce({ response: { status: 500 } })

    await expect(store.save(smsSection, { prefix: '不应入队', suffix: '' }))
      .resolves.toBe('error')

    expect(store.statuses[smsSection]).toBe('error')
    expect(store.hasPendingChanges).toBe(false)
    expect(readFrontendPreferenceCache('main-1', smsSection)).toBeNull()
  })

  it.each([
    ['plain Error', () => new Error('interceptor bug')],
    ['TypeError', () => new TypeError('serialization bug')],
    ['non-network Axios error without a response', () => new AxiosError('bad request setup', 'ERR_BAD_REQUEST')]
  ])('does not queue %s as an offline edit', async (_label, makeError) => {
    const store = useFrontendPreferencesStore()
    api.saveFrontendPreference.mockRejectedValueOnce(makeError())

    await expect(store.save(smsSection, { prefix: '不应入队', suffix: '' }))
      .resolves.toBe('error')

    expect(store.statuses[smsSection]).toBe('error')
    expect(store.hasPendingChanges).toBe(false)
    expect(readFrontendPreferenceCache('main-1', smsSection)).toBeNull()
  })

  it.each([
    ['network', () => new AxiosError('Network Error', 'ERR_NETWORK')],
    ['aborted timeout', () => new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED')],
    ['timed out', () => new AxiosError('timeout', 'ETIMEDOUT')]
  ])('queues a confirmed Axios %s failure', async (_label, makeError) => {
    const store = useFrontendPreferencesStore()
    api.saveFrontendPreference.mockRejectedValueOnce(makeError())

    await expect(store.save(smsSection, { prefix: '待同步', suffix: '' }))
      .resolves.toBe('queued')

    expect(store.statuses[smsSection]).toBe('queued')
    expect(store.hasPendingChanges).toBe(true)
  })

  it('deep-copies server values, read results, and caller fallbacks', async () => {
    const serverValue = { prefix: '服务器', suffix: '' }
    const serverRecord = record(smsSection, serverValue, 3)
    api.listFrontendPreferences.mockResolvedValueOnce([serverRecord])
    const store = useFrontendPreferencesStore()
    await store.loadAll()

    serverValue.prefix = '服务器对象被外部修改'
    const firstRead = store.value(smsSection, { prefix: '', suffix: '' })
    firstRead.prefix = '读取结果被修改'
    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('服务器')

    const fallback = [{ name: '默认组' }]
    const fallbackRead = store.value('LAB_ELEMENT_GROUPS', fallback)
    fallbackRead[0].name = '读取结果被修改'
    expect(fallback).toEqual([{ name: '默认组' }])
    expect(store.value('LAB_ELEMENT_GROUPS', fallback)).toEqual([{ name: '默认组' }])
  })

  it('deep-copies save input and the installed successful server record', async () => {
    const draft = { prefix: '提交值', suffix: '' }
    const saved = record(smsSection, { prefix: '已保存', suffix: '' }, 1)
    api.saveFrontendPreference.mockResolvedValueOnce(saved)
    const store = useFrontendPreferencesStore()

    await store.save(smsSection, draft)

    const sentValue = api.saveFrontendPreference.mock.calls[0][1]
    expect(sentValue).toEqual({ prefix: '提交值', suffix: '' })
    expect(sentValue).not.toBe(draft)
    draft.prefix = '调用方修改'
    saved.value.prefix = 'API 返回对象修改'
    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('已保存')
  })

  it('deep-copies local and server values across a conflict boundary', async () => {
    const localValue = { prefix: '本机', suffix: '' }
    const serverValue = { prefix: '他人', suffix: '' }
    const current = record(smsSection, serverValue, 4, 'sub-2')
    api.saveFrontendPreference.mockRejectedValueOnce(preferenceConflict(current))
    const store = useFrontendPreferencesStore()

    await store.save(smsSection, localValue)
    localValue.prefix = '本机对象被外部修改'
    serverValue.prefix = '服务器对象被外部修改'

    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('本机')
    expect(store.conflicts[smsSection]).toMatchObject({
      localValue: { prefix: '本机', suffix: '' },
      server: { value: { prefix: '他人', suffix: '' } }
    })
  })

  it('installs a 409 conflict and can discard only the pending value for the server choice', async () => {
    const server = record(smsSection, { prefix: '他人', suffix: '' }, 5, 'sub-2')
    api.saveFrontendPreference.mockRejectedValueOnce(preferenceConflict(server))
    const store = useFrontendPreferencesStore()

    await expect(store.save(smsSection, { prefix: '本机', suffix: '' }))
      .resolves.toBe('conflict')
    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('本机')

    api.listFrontendPreferences.mockResolvedValueOnce([server])
    await store.loadAll()
    expect(store.statuses[smsSection]).toBe('conflict')
    expect(store.conflicts[smsSection]).toMatchObject({ serverVersion: 5 })

    await expect(store.resolveConflict(smsSection, 'server')).resolves.toBe('saved')

    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('他人')
    expect(store.conflicts[smsSection]).toBeUndefined()
    expect(readFrontendPreferenceCache('main-1', smsSection)).toEqual(cached('main-1', server))
  })

  it('overwrites from the conflict version and refreshes the conflict if retry also gets 409', async () => {
    const firstServer = record(smsSection, { prefix: '他人一', suffix: '' }, 5, 'sub-2')
    const secondServer = record(smsSection, { prefix: '他人二', suffix: '' }, 6, 'sub-3')
    api.saveFrontendPreference
      .mockRejectedValueOnce(preferenceConflict(firstServer))
      .mockRejectedValueOnce(preferenceConflict(secondServer))
    const store = useFrontendPreferencesStore()
    const localValue = { prefix: '本机', suffix: '' }
    await store.save(smsSection, localValue)

    await expect(store.resolveConflict(smsSection, 'overwrite')).resolves.toBe('conflict')

    expect(api.saveFrontendPreference).toHaveBeenNthCalledWith(2, smsSection, localValue, 5)
    expect(store.conflicts[smsSection]).toMatchObject({
      serverVersion: 6,
      server: secondServer,
      localValue
    })
    expect(store.statuses[smsSection]).toBe('conflict')
  })

  it('ignores a stale owner response after the authenticated owner changes', async () => {
    let resolveList!: (records: FrontendPreferenceRecord[]) => void
    api.listFrontendPreferences.mockReturnValue(new Promise((resolve) => { resolveList = resolve }))
    const store = useFrontendPreferencesStore()
    const loading = store.loadAll()
    useAuthStore().user = user({ id: 'main-2', dataOwnerId: 'main-2' })

    resolveList([record(smsSection, { prefix: '旧账号', suffix: '' }, 9)])
    await loading

    expect(store.value(smsSection, { prefix: '空', suffix: '' }).prefix).toBe('空')
  })

  it('does not let an old-owner response wipe a newer owner load', async () => {
    let resolveOwnerA!: (records: FrontendPreferenceRecord[]) => void
    let resolveOwnerB!: (records: FrontendPreferenceRecord[]) => void
    api.listFrontendPreferences
      .mockReturnValueOnce(new Promise((resolve) => { resolveOwnerA = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveOwnerB = resolve }))
    const store = useFrontendPreferencesStore()
    const ownerALoad = store.loadAll()
    useAuthStore().user = user({ id: 'main-2', dataOwnerId: 'main-2' })
    const ownerBLoad = store.loadAll()

    resolveOwnerB([record(smsSection, { prefix: '账号 B 最新', suffix: '' }, 2)])
    await ownerBLoad
    resolveOwnerA([record(smsSection, { prefix: '账号 A 旧响应', suffix: '' }, 1)])
    await ownerALoad

    expect(store.value(smsSection, { prefix: '空', suffix: '' }).prefix).toBe('账号 B 最新')
    expect(store.statuses[smsSection]).toBe('saved')
  })

  it('does not let an older same-owner response overwrite a newer response', async () => {
    let resolveOlder!: (records: FrontendPreferenceRecord[]) => void
    let resolveNewer!: (records: FrontendPreferenceRecord[]) => void
    api.listFrontendPreferences
      .mockReturnValueOnce(new Promise((resolve) => { resolveOlder = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNewer = resolve }))
    const store = useFrontendPreferencesStore()
    const olderLoad = store.loadAll()
    const newerLoad = store.loadAll()

    resolveNewer([record(smsSection, { prefix: '新响应', suffix: '' }, 4)])
    await newerLoad
    resolveOlder([record(smsSection, { prefix: '旧响应', suffix: '' }, 3)])
    await olderLoad

    expect(store.value(smsSection, { prefix: '空', suffix: '' }).prefix).toBe('新响应')
    expect(store.statuses[smsSection]).toBe('saved')
  })
})
