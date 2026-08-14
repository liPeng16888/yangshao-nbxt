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
  FRONTEND_PREFERENCE_SECTIONS,
  canAccessFrontendPreference,
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

  it('maps current actor permissions to each shared shortcut section', () => {
    const subaccount = user({
      id: 'sub-1', role: 'FRONTEND_SUB_USER', dataOwnerId: 'main-1',
      isFrontendMainAccount: false, isFrontendSubAccount: true, permissions: []
    })
    expect(canAccessFrontendPreference(user(), 'LAB_ELEMENT_GROUPS')).toBe(true)
    expect(canAccessFrontendPreference(subaccount, 'LAB_ELEMENT_GROUPS')).toBe(false)
    expect(canAccessFrontendPreference({ ...subaccount, permissions: ['DATA_MAIN'] }, 'LAB_ELEMENT_GROUPS')).toBe(true)
    expect(canAccessFrontendPreference({ ...subaccount, permissions: ['LAB_REPORT_IMAGE_TEMPLATE'] }, 'LAB_REPORT_SAMPLE_UNITS')).toBe(true)
    expect(canAccessFrontendPreference(subaccount, 'LAB_REPORT_SAMPLE_UNITS')).toBe(false)
  })

  it('includes only the current actor edit sessions in the realtime dirty gate', () => {
    const store = useFrontendPreferencesStore()
    const session = store.registerEditSession('LAB_REPORT_TEMPLATE')

    session.update({ dirty: true, value: { title: '本机草稿' } })
    expect(store.hasPendingChanges).toBe(true)

    useAuthStore().user = user({
      id: 'sub-1',
      account: 'sub-1',
      role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'main-1',
      isFrontendMainAccount: false,
      isFrontendSubAccount: true,
      permissions: ['LAB_REPORT_IMAGE_TEMPLATE']
    })
    expect(store.hasPendingChanges).toBe(false)

    session.update({ dirty: true, value: { title: '迟到的旧账号状态' } })
    expect(store.hasPendingChanges).toBe(false)
    session.unregister()
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

  it('revokes unauthorized same-owner cache values without deleting durable owner data', async () => {
    const reportSection = 'LAB_REPORT_TEMPLATE' as const
    const groupSection = 'LAB_ELEMENT_GROUPS' as const
    const report = record(reportSection, { title: '主账号报告模板' }, 3)
    const groups = record(groupSection, [{ id: 'g-1', name: '铝硅', elementKeys: ['aluminum', 'silicon'] }], 2)
    writeFrontendPreferenceCache(cached('main-1', report))
    writeFrontendPreferenceCache({ ownerId: 'main-1', section: groupSection, server: groups })
    const store = useFrontendPreferencesStore()
    expect(store.value(reportSection, { title: '默认' }).title).toBe('主账号报告模板')

    useAuthStore().user = user({
      id: 'sub-data', account: 'sub-data', role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'main-1', isFrontendMainAccount: false, isFrontendSubAccount: true,
      permissions: ['DATA_MAIN']
    })

    expect(store.value(reportSection, { title: '无权默认' }).title).toBe('无权默认')
    expect(store.records[reportSection]).toBeUndefined()
    expect(store.statuses[reportSection]).toBe('idle')
    expect(store.value(groupSection, [])).toEqual(groups.value)

    api.listFrontendPreferences.mockResolvedValueOnce([groups])
    await store.loadAll()
    expect(readFrontendPreferenceCache('main-1', reportSection)).toEqual(cached('main-1', report))
    expect(store.value(reportSection, { title: '离线无权默认' }).title).toBe('离线无权默认')

    api.listFrontendPreferences.mockRejectedValueOnce(networkError())
    await expect(store.loadAll()).resolves.toBe('error')
    expect(readFrontendPreferenceCache('main-1', reportSection)).toEqual(cached('main-1', report))
    expect(store.value(reportSection, { title: '断网无权默认' }).title).toBe('断网无权默认')

    useAuthStore().user = user()
    expect(store.value(reportSection, { title: '默认' }).title).toBe('主账号报告模板')
  })

  it('hides unauthorized pending and conflict state and rejects direct writes', async () => {
    const reportSection = 'LAB_REPORT_TEMPLATE' as const
    const report = record(reportSection, { title: '服务器报告' }, 3)
    writeFrontendPreferenceCache({
      ownerId: 'main-1',
      section: reportSection,
      server: report,
      pendingValue: { title: '高权限账号待同步草稿' },
      pendingBaseVersion: 3
    })
    useAuthStore().user = user({
      id: 'sub-data', account: 'sub-data', role: 'FRONTEND_SUB_USER',
      dataOwnerId: 'main-1', isFrontendMainAccount: false, isFrontendSubAccount: true,
      permissions: ['DATA_MAIN']
    })
    const store = useFrontendPreferencesStore()

    expect(store.value(reportSection, { title: '无权默认' }).title).toBe('无权默认')
    expect(store.statuses[reportSection]).toBe('idle')
    expect(store.conflicts[reportSection]).toBeUndefined()
    expect(store.hasPendingChanges).toBe(false)
    await expect(store.save(reportSection, { title: '越权写入' })).resolves.toBe('error')
    expect(api.saveFrontendPreference).not.toHaveBeenCalled()
    expect(readFrontendPreferenceCache('main-1', reportSection)).toMatchObject({
      pendingValue: { title: '高权限账号待同步草稿' }
    })
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
    ['non-network Axios error without a response', () => new AxiosError('bad request setup', 'ERR_BAD_REQUEST')],
    [
      'coded Axios option error containing timeout text',
      () => new AxiosError('error trying to parse config.timeout to int', 'ERR_BAD_OPTION_VALUE')
    ],
    [
      'coded Axios request error containing network text',
      () => new AxiosError('Network Error', 'ERR_BAD_REQUEST')
    ]
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
    ['timed out', () => new AxiosError('timeout', 'ETIMEDOUT')],
    ['code-less browser Network Error', () => new AxiosError('Network Error')],
    ['code-less browser timeout', () => new AxiosError('timeout of 15000ms exceeded')]
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
    const groupsRecord = record('LAB_ELEMENT_GROUPS', [
      { id: 'group-1', name: '铝硅铁', elementKeys: ['aluminum', 'silicon', 'iron'] }
    ], 2)
    api.listFrontendPreferences.mockResolvedValueOnce([serverRecord, groupsRecord])
    const store = useFrontendPreferencesStore()
    await store.loadAll()

    serverValue.prefix = '服务器对象被外部修改'
    const firstRead = store.value(smsSection, { prefix: '', suffix: '' })
    firstRead.prefix = '读取结果被修改'
    expect(store.value(smsSection, { prefix: '', suffix: '' }).prefix).toBe('服务器')

    const groupsRead = store.value('LAB_ELEMENT_GROUPS', [{ id: '', name: '', elementKeys: [] }])
    groupsRead[0].name = '读取数组结果被修改'
    groupsRead[0].elementKeys.pop()
    expect(store.value('LAB_ELEMENT_GROUPS', [])).toEqual([
      { id: 'group-1', name: '铝硅铁', elementKeys: ['aluminum', 'silicon', 'iron'] }
    ])

    const fallback = [{ name: '默认组' }]
    const fallbackRead = store.value('LAB_REPORT_SAMPLE_UNITS', fallback)
    fallbackRead[0].name = '读取结果被修改'
    expect(fallback).toEqual([{ name: '默认组' }])
    expect(store.value('LAB_REPORT_SAMPLE_UNITS', fallback)).toEqual([{ name: '默认组' }])
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

  it('does not let an older save or overwrite response replace the latest section mutation', async () => {
    const initial = record(smsSection, { prefix: '初始', suffix: '' }, 4)
    api.listFrontendPreferences.mockResolvedValueOnce([initial])
    const store = useFrontendPreferencesStore()
    await store.loadAll()

    let rejectFirst!: (reason: unknown) => void
    let resolveSecond!: (value: FrontendPreferenceRecord) => void
    api.saveFrontendPreference
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))
    const first = store.save(smsSection, { prefix: '旧请求', suffix: '' })
    const second = store.save(smsSection, { prefix: '新请求', suffix: '' })

    resolveSecond(record(smsSection, { prefix: '新请求', suffix: '' }, 6))
    await second
    rejectFirst(networkError())
    await first

    expect(store.records[smsSection]).toMatchObject({ version: 6, value: { prefix: '新请求', suffix: '' } })
    expect(store.statuses[smsSection]).toBe('saved')
    expect(store.value(smsSection, { prefix: '', suffix: '' })).toEqual({ prefix: '新请求', suffix: '' })
  })

  it.each(FRONTEND_PREFERENCE_SECTIONS)(
    'does not let a delayed load downgrade %s after a later local save',
    async (section) => {
      const sectionIndex = FRONTEND_PREFERENCE_SECTIONS.indexOf(section)
      const companionSection = FRONTEND_PREFERENCE_SECTIONS[
        (sectionIndex + 1) % FRONTEND_PREFERENCE_SECTIONS.length
      ]
      const oldServer = record(section, { label: '旧 GET v2' }, 2)
      const savedServer = record(section, { label: '本机 PUT v3' }, 3)
      const companionServer = record(companionSection, { label: '同次 GET 的其他分区' }, 4)
      writeFrontendPreferenceCache({ ownerId: 'main-1', section, server: oldServer })
      const store = useFrontendPreferencesStore()
      let resolveLoad!: (records: FrontendPreferenceRecord[]) => void
      api.listFrontendPreferences.mockReturnValueOnce(new Promise((resolve) => { resolveLoad = resolve }))
      api.saveFrontendPreference.mockResolvedValueOnce(savedServer)

      const loading = store.loadAll()
      await expect(store.save(section, savedServer.value)).resolves.toBe('saved')
      resolveLoad([oldServer, companionServer])
      await expect(loading).resolves.toBe('loaded')

      expect(store.records[section]).toEqual(savedServer)
      expect(store.value(section, { label: '空' })).toEqual(savedServer.value)
      expect(store.statuses[section]).toBe('saved')
      expect(store.conflicts[section]).toBeUndefined()
      expect(store.hasPendingChanges).toBe(false)
      expect(readFrontendPreferenceCache('main-1', section)).toEqual({
        ownerId: 'main-1', section, server: savedServer
      })
      expect(store.records[companionSection]).toEqual(companionServer)
    }
  )

  it('ignores a delayed lower-version load while the saved SMS page draft is still dirty', async () => {
    const oldServer = record(smsSection, { prefix: '旧 GET v2', suffix: '' }, 2)
    const savedServer = record(smsSection, { prefix: '本机 PUT v3', suffix: '' }, 3)
    writeFrontendPreferenceCache(cached('main-1', oldServer))
    const store = useFrontendPreferencesStore()
    const editSession = store.registerEditSession(smsSection)
    let resolveLoad!: (records: FrontendPreferenceRecord[]) => void
    api.listFrontendPreferences.mockReturnValueOnce(new Promise((resolve) => { resolveLoad = resolve }))
    api.saveFrontendPreference.mockResolvedValueOnce(savedServer)

    const loading = store.loadAll()
    editSession.update({ dirty: true, value: savedServer.value })
    await expect(store.save(smsSection, savedServer.value)).resolves.toBe('saved')
    resolveLoad([oldServer])
    await expect(loading).resolves.toBe('loaded')

    expect(store.records[smsSection]).toEqual(savedServer)
    expect(store.value(smsSection, { prefix: '', suffix: '' })).toEqual(savedServer.value)
    expect(store.statuses[smsSection]).toBe('saved')
    expect(store.conflicts[smsSection]).toBeUndefined()
    expect(store.hasPendingChanges).toBe(true)
    expect(readFrontendPreferenceCache('main-1', smsSection)).toEqual(cached('main-1', savedServer))
    editSession.unregister()
  })

  it('makes an in-flight save inert after a successful authoritative hydration', async () => {
    const initial = record(smsSection, { prefix: '初始', suffix: '' }, 4)
    api.listFrontendPreferences.mockResolvedValueOnce([initial])
    const store = useFrontendPreferencesStore()
    await store.loadAll()

    let resolveSave!: (value: FrontendPreferenceRecord) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const saving = store.save(smsSection, { prefix: '在途旧保存', suffix: '' })
    const hydrated = record(smsSection, { prefix: '实时刷新', suffix: '' }, 6)
    api.listFrontendPreferences.mockResolvedValueOnce([hydrated])

    await expect(store.loadAll()).resolves.toBe('loaded')
    resolveSave(record(smsSection, { prefix: '在途旧保存', suffix: '' }, 5))
    await expect(saving).resolves.toBe('saved')

    expect(store.records[smsSection]).toEqual(hydrated)
    expect(store.statuses[smsSection]).toBe('saved')
    expect(readFrontendPreferenceCache('main-1', smsSection)).toEqual(cached('main-1', hydrated))
  })

  it('makes an old owner-A save inert after an A to B to A session transition', async () => {
    const ownerAInitial = record(smsSection, { prefix: '账号 A 初始', suffix: '' }, 4)
    api.listFrontendPreferences.mockResolvedValueOnce([ownerAInitial])
    const store = useFrontendPreferencesStore()
    await store.loadAll()

    let resolveOldOwnerA!: (value: FrontendPreferenceRecord) => void
    api.saveFrontendPreference.mockReturnValueOnce(new Promise((resolve) => { resolveOldOwnerA = resolve }))
    const oldOwnerASave = store.save(smsSection, { prefix: '账号 A 旧在途', suffix: '' })

    useAuthStore().user = user({ id: 'main-2', dataOwnerId: 'main-2' })
    store.value(smsSection, { prefix: '', suffix: '' })
    useAuthStore().user = user()
    const ownerAFresh = record(smsSection, { prefix: '账号 A 新会话', suffix: '' }, 6)
    api.listFrontendPreferences.mockResolvedValueOnce([ownerAFresh])
    await store.loadAll()

    resolveOldOwnerA(record(smsSection, { prefix: '账号 A 旧在途', suffix: '' }, 5))
    await expect(oldOwnerASave).resolves.toBe('saved')

    expect(store.records[smsSection]).toEqual(ownerAFresh)
    expect(store.statuses[smsSection]).toBe('saved')
    expect(readFrontendPreferenceCache('main-1', smsSection)).toEqual(cached('main-1', ownerAFresh))
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
