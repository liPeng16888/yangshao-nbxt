import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessageBox } from 'element-plus'

import AppLayout from './AppLayout.vue'

const stores = vi.hoisted(() => ({
  loadGroups: vi.fn(),
  tenantConnect: vi.fn(),
  tenantDisconnect: vi.fn(),
  tenantRegister: vi.fn(),
  unregisterPreferences: vi.fn(),
  sharedConnect: vi.fn(),
  sharedDisconnect: vi.fn(),
  preferenceLoadAll: vi.fn(),
  preferenceSave: vi.fn(),
  preferenceResolveConflict: vi.fn(),
  collectCandidates: vi.fn(),
  markFinished: vi.fn(),
  authUser: {
    id: 'main-1', account: 'main-1', username: '主账号', role: 'FRONTEND_USER',
    dataOwnerId: 'main-1', isFrontendMainAccount: true, isFrontendSubAccount: false
  },
  preferenceStore: { hasPendingChanges: false, records: {} as Record<string, unknown> }
}))

vi.mock('@/stores/accessGuard', () => ({
  useAccessGuardStore: () => ({ loadGroups: stores.loadGroups })
}))
vi.mock('@/stores/tenantRealtime', () => ({
  useTenantRealtimeStore: () => ({
    hasRemoteChanges: false,
    connect: stores.tenantConnect,
    disconnect: stores.tenantDisconnect,
    registerModule: stores.tenantRegister
  })
}))
vi.mock('@/stores/sharedPrepaid', () => ({
  useSharedPrepaidStore: () => ({
    connectRealtime: stores.sharedConnect,
    disconnectRealtime: stores.sharedDisconnect
  })
}))
vi.mock('@/stores/frontendPreferences', () => ({
  frontendPreferenceOwnerId: (user: typeof stores.authUser | null) => user?.dataOwnerId || user?.id || '',
  useFrontendPreferencesStore: () => ({
    get hasPendingChanges() { return stores.preferenceStore.hasPendingChanges },
    get records() { return stores.preferenceStore.records },
    loadAll: stores.preferenceLoadAll,
    save: stores.preferenceSave,
    resolveConflict: stores.preferenceResolveConflict
  })
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ get user() { return stores.authUser } })
}))
vi.mock('@/utils/frontendPreferenceMigration', () => ({
  collectLegacyPreferenceCandidates: stores.collectCandidates,
  markLegacyMigrationFinished: stores.markFinished
}))

describe('AppLayout authenticated realtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stores.preferenceStore.hasPendingChanges = false
    stores.preferenceStore.records = {}
    stores.preferenceLoadAll.mockResolvedValue('loaded')
    stores.preferenceSave.mockResolvedValue('saved')
    stores.preferenceResolveConflict.mockResolvedValue('saved')
    stores.collectCandidates.mockReturnValue({})
    stores.tenantRegister.mockReturnValue(stores.unregisterPreferences)
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] || null,
      get length() { return values.size }
    })
  })

  it('starts shared prepaid realtime on mount and stops it on unmount', () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          AppSidebar: true,
          AppTopbar: true,
          RouterView: true,
          ElAlert: true
        }
      }
    })

    expect(stores.sharedConnect).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(stores.sharedDisconnect).toHaveBeenCalledTimes(1)
  })

  it('loads frontend preferences once and registers owner sync with tenant realtime', async () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: {
          AppSidebar: true,
          AppTopbar: true,
          RouterView: true,
          ElAlert: true
        }
      }
    })

    expect(stores.preferenceLoadAll).toHaveBeenCalledTimes(1)
    expect(stores.tenantRegister).toHaveBeenCalledWith(
      'frontend-preferences',
      expect.objectContaining({
        isDirty: expect.any(Function),
        refresh: expect.any(Function)
      })
    )
    const registration = stores.tenantRegister.mock.calls[0][1]
    expect(registration.isDirty()).toBe(false)
    stores.preferenceStore.hasPendingChanges = true
    expect(registration.isDirty()).toBe(true)
    await expect(registration.refresh()).resolves.toBeUndefined()
    expect(stores.preferenceLoadAll).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    expect(stores.unregisterPreferences).toHaveBeenCalledTimes(1)
  })

  it('does not inspect or decide legacy migration when the server list fails', async () => {
    stores.preferenceLoadAll.mockResolvedValueOnce('error')
    const confirm = vi.spyOn(ElMessageBox, 'confirm')

    const wrapper = mount(AppLayout, {
      global: { stubs: { AppSidebar: true, AppTopbar: true, RouterView: true, ElAlert: true } }
    })
    await flushPromises()

    expect(stores.collectCandidates).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
    expect(stores.markFinished).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('marks explicit cancel as the server/default decision', async () => {
    stores.collectCandidates.mockReturnValue({ LAB_REPORT_SMS_TEMPLATE: { prefix: '旧前缀', suffix: '' } })
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('cancel')

    const wrapper = mount(AppLayout, {
      global: { stubs: { AppSidebar: true, AppTopbar: true, RouterView: true, ElAlert: true } }
    })
    await flushPromises()

    expect(stores.markFinished).toHaveBeenCalledWith('main-1', ['LAB_REPORT_SMS_TEMPLATE'])
    expect(stores.preferenceSave).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('records nothing when the migration dialog is closed or escaped', async () => {
    stores.collectCandidates.mockReturnValue({ LAB_REPORT_SMS_TEMPLATE: { prefix: '旧前缀', suffix: '' } })
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValueOnce('close')

    const wrapper = mount(AppLayout, {
      global: { stubs: { AppSidebar: true, AppTopbar: true, RouterView: true, ElAlert: true } }
    })
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(
      '检测到本机旧配置：化验短信生成模板。是否同步到当前主账号并与子账号共享？',
      '同步本机旧配置',
      expect.objectContaining({ distinguishCancelAndClose: true })
    )
    expect(stores.markFinished).not.toHaveBeenCalled()
    expect(stores.preferenceSave).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('uploads all detected sections and installs the server value on a migration conflict', async () => {
    stores.preferenceStore.records = {
      LAB_REPORT_SAMPLE_UNITS: { section: 'LAB_REPORT_SAMPLE_UNITS' }
    }
    stores.collectCandidates.mockReturnValue({
      LAB_REPORT_TEMPLATE: { title: '旧报告' },
      LAB_REPORT_SMS_TEMPLATE: { prefix: '旧前缀', suffix: '' }
    })
    stores.preferenceSave
      .mockResolvedValueOnce('conflict')
      .mockResolvedValueOnce('saved')
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce(undefined as never)

    const wrapper = mount(AppLayout, {
      global: { stubs: { AppSidebar: true, AppTopbar: true, RouterView: true, ElAlert: true } }
    })
    await flushPromises()

    expect(stores.collectCandidates).toHaveBeenCalledWith(
      stores.authUser,
      new Set(['LAB_REPORT_SAMPLE_UNITS'])
    )
    expect(stores.preferenceSave).toHaveBeenNthCalledWith(1, 'LAB_REPORT_TEMPLATE', { title: '旧报告' })
    expect(stores.preferenceSave).toHaveBeenNthCalledWith(2, 'LAB_REPORT_SMS_TEMPLATE', { prefix: '旧前缀', suffix: '' })
    expect(stores.preferenceResolveConflict).toHaveBeenCalledWith('LAB_REPORT_TEMPLATE', 'server')
    expect(stores.markFinished).toHaveBeenCalledWith(
      'main-1',
      ['LAB_REPORT_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE']
    )
    wrapper.unmount()
  })
})
