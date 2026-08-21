// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, onScopeDispose, reactive, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@/types/auth'
import type { CalculationDraftSyncStatus, StandardSampleDraft } from '@/types/calculationDraft'
import { useStandardSampleCalculation } from '@/composables/useStandardSampleCalculation'
import StandardSampleCalculationPage from './StandardSampleCalculationPage.vue'

const defaults: StandardSampleDraft = {
  aluminum: { highStandard: 69.74, highReading: 7.7, lowStandard: 52, lowReading: 12.2, baseValue: 214.38 },
  silicon: { lowStandard: 4.88, lowReading: 0.405, highStandard: 17.05, highReading: 1.31 },
  iron: { lowStandard: 6.09, lowReading: 0.147, highStandard: 15.31, highReading: 0.461 }
}

const serverSnapshot: StandardSampleDraft = {
  aluminum: { ...defaults.aluminum, highStandard: 71.25 },
  silicon: { ...defaults.silicon, lowReading: 0.5 },
  iron: { ...defaults.iron, highReading: 0.5 }
}

type DraftAdapter = {
  kind: string
  legacyStorageKey: string
  cacheStorageKey: string
  defaults: () => StandardSampleDraft
  normalize: (value: unknown) => StandardSampleDraft
  snapshot: () => StandardSampleDraft
  apply: (value: StandardSampleDraft) => void
}

type DraftDouble = {
  adapter: DraftAdapter
  status: Ref<CalculationDraftSyncStatus>
  updatedAt: Ref<string | null>
  conflict: Ref<unknown>
  savedSnapshots: StandardSampleDraft[]
  load: ReturnType<typeof vi.fn>
  scheduleSave: ReturnType<typeof vi.fn>
  retry: ReturnType<typeof vi.fn>
  useServerVersion: ReturnType<typeof vi.fn>
  overwriteServerVersion: ReturnType<typeof vi.fn>
  disposed: boolean
}

const mocks = vi.hoisted(() => ({
  isMobileLayout: undefined as unknown as Ref<boolean>,
  routerPush: vi.fn(),
  useCalculationDraft: vi.fn(),
  draftInstances: [] as DraftDouble[],
  confirm: vi.fn(),
  authStore: undefined as unknown as { user: AuthUser | null }
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.routerPush })
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.isMobileLayout })
}))

vi.mock('@/composables/useCalculationDraft', () => ({
  useCalculationDraft: (adapter: DraftAdapter) => mocks.useCalculationDraft(adapter)
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => mocks.authStore
}))

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessageBox: { confirm: mocks.confirm }
}))

const ElButtonStub = defineComponent({
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () => h('button', { ...attrs, type: 'button', onClick: () => emit('click') }, slots.default?.())
  }
})

const ElInputNumberStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: Number, default: null },
    precision: { type: Number, default: undefined },
    controlsPosition: { type: String, default: undefined }
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      type: 'number',
      value: props.modelValue ?? '',
      'data-precision': props.precision,
      'data-controls-position': props.controlsPosition,
      onInput: (event: Event) => {
        const value = (event.target as HTMLInputElement).value
        emit('update:modelValue', value === '' ? undefined : Number(value))
      }
    })
  }
})

function cloneDraft(value: StandardSampleDraft): StandardSampleDraft {
  return structuredClone(value)
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((fulfill) => { resolve = fulfill })
  return { promise, resolve }
}

function createMemoryStorage(): Storage {
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

function installDraftDouble(options: {
  status?: CalculationDraftSyncStatus
  load?: (instance: DraftDouble) => Promise<void> | void
  serverVersion?: StandardSampleDraft
} = {}) {
  mocks.useCalculationDraft.mockImplementation((adapter: DraftAdapter) => {
    const instance = {} as DraftDouble
    Object.assign(instance, {
      adapter,
      status: ref<CalculationDraftSyncStatus>(options.status ?? 'idle'),
      updatedAt: ref<string | null>(null),
      conflict: ref<unknown>(options.status === 'conflict' ? { revision: 4 } : null),
      savedSnapshots: [] as StandardSampleDraft[],
      load: vi.fn(async () => { await options.load?.(instance) }),
      scheduleSave: vi.fn(() => instance.savedSnapshots.push(adapter.snapshot())),
      retry: vi.fn(),
      useServerVersion: vi.fn(() => {
        if (options.serverVersion) adapter.apply(options.serverVersion)
      }),
      overwriteServerVersion: vi.fn(),
      disposed: false
    })
    onScopeDispose(() => { instance.disposed = true })
    mocks.draftInstances.push(instance)
    return instance
  })
}

function mountPage(mobile = false) {
  mocks.isMobileLayout.value = mobile
  return mount(StandardSampleCalculationPage, {
    global: {
      stubs: {
        ElButton: ElButtonStub,
        ElInputNumber: ElInputNumberStub
      }
    }
  })
}

async function settle() {
  await flushPromises()
  await nextTick()
}

async function expandCard(wrapper: VueWrapper, element: 'aluminum' | 'silicon' | 'iron') {
  await wrapper.get(`[data-testid="mobile-standard-toggle-${element}"]`).trigger('click')
  await nextTick()
  return wrapper.get(`[data-testid="mobile-standard-card-${element}"]`)
}

function authUser(id: string, account = id): AuthUser {
  return {
    id,
    account,
    username: `User ${id}`,
    role: 'FRONTEND_USER'
  }
}

describe('useStandardSampleCalculation', () => {
  it('keeps the legacy defaults and calculator results in one shared state', () => {
    const calculation = useStandardSampleCalculation()

    expect(cloneDraft(calculation.snapshot())).toEqual(defaults)
    expect(calculation.aluminumResult.value.coefficient1).toBeCloseTo(0.4759473212144895, 12)
    expect(calculation.siliconResult.value.factor).toBeCloseTo(13.447513812154696, 12)
    expect(calculation.ironResult.value.factor).toBeCloseTo(29.363057324840764, 12)
  })

  it('resets only the requested element to its original values', () => {
    const calculation = useStandardSampleCalculation()
    calculation.aluminum.highReading = 8
    calculation.silicon.lowReading = 0.5
    calculation.iron.highReading = 0.5

    calculation.resetSilicon()

    expect(calculation.aluminum.highReading).toBe(8)
    expect(calculation.silicon).toEqual(defaults.silicon)
    expect(calculation.iron.highReading).toBe(0.5)
  })
})

describe('StandardSampleCalculationPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: createMemoryStorage() })
    window.localStorage.clear()
    mocks.authStore = reactive({
      user: authUser('frontend-user-7', 'fallback-account')
    })
    mocks.isMobileLayout = ref(false)
    mocks.routerPush.mockReset()
    mocks.useCalculationDraft.mockReset()
    mocks.draftInstances.length = 0
    mocks.confirm.mockReset()
    installDraftDouble()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('mounts exactly one editor for desktop or mobile widths', async () => {
    const desktop = mountPage(false)
    await settle()
    expect(desktop.find('[data-testid="standard-desktop-view"]').exists()).toBe(true)
    expect(desktop.find('[data-testid="standard-mobile-view"]').exists()).toBe(false)
    desktop.unmount()

    const mobile = mountPage(true)
    await settle()
    expect(mobile.find('[data-testid="standard-mobile-view"]').exists()).toBe(true)
    expect(mobile.find('[data-testid="standard-desktop-view"]').exists()).toBe(false)
  })

  it('preserves the desktop labels, precision, result tones, defaults, and coefficient navigation', async () => {
    const wrapper = mountPage(false)
    await settle()
    const desktop = wrapper.get('[data-testid="standard-desktop-view"]')

    expect(desktop.text()).toContain('录入标样值和读数后自动计算空白、系数和反算标样。绿色为输入项，彩色结果为自动计算项。')
    expect(desktop.text()).toContain('高铝标样1')
    expect(desktop.text()).toContain('低硅标样1')
    expect(desktop.text()).toContain('高硅标样2')
    expect(desktop.text()).toContain('低铁标样1')
    expect(desktop.text()).toContain('高铁标样2')
    expect(desktop.findAll('input[data-precision="3"]')).toHaveLength(12)
    expect(desktop.findAll('.result-label--yellow')).toHaveLength(3)
    expect(desktop.findAll('.result-label--blue')).toHaveLength(3)
    expect(desktop.findAll('.result-label--gray')).toHaveLength(3)
    expect(desktop.text()).toContain('0.476')
    expect(desktop.text()).toContain('-5.066')
    expect(desktop.text()).toContain('72.62')

    await desktop.get('[data-testid="open-coefficient-calculation"]').trigger('click')
    expect(mocks.routerPush).toHaveBeenCalledWith('/data/coefficient')
  })

  it('renders three collapsed mobile cards with accessible summaries and decimal two-column fields', async () => {
    const wrapper = mountPage(true)
    await settle()
    const mobile = wrapper.get('[data-testid="standard-mobile-view"]')
    const cards = mobile.findAll('[data-testid^="mobile-standard-card-"]')

    expect(cards).toHaveLength(3)
    expect(cards.map((card) => card.get('h2').text())).toEqual(['铝标样算法', '硅标样算法', '铁标样算法'])
    for (const element of ['aluminum', 'silicon', 'iron'] as const) {
      const toggle = mobile.get(`[data-testid="mobile-standard-toggle-${element}"]`)
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(toggle.classes()).toContain('mobile-touch-target')
      expect(mobile.get(`[data-testid="mobile-standard-content-${element}"]`).isVisible()).toBe(false)
    }
    expect(cards[0].text()).toContain('系数1 0.476')
    expect(cards[0].text()).toContain('反算标样1 72.62')
    expect(cards[1].text()).toContain('系数 13.448')
    expect(cards[2].text()).toContain('系数 29.363')

    const aluminum = await expandCard(wrapper, 'aluminum')
    expect(aluminum.get('[data-testid="mobile-standard-fields-aluminum"]').classes()).toContain('mobile-standard-card__fields--two-column')
    expect(aluminum.findAll('input[inputmode="decimal"]')).toHaveLength(4)
    expect(aluminum.findAll('input').every((input) => input.classes().includes('mobile-touch-target'))).toBe(true)
    expect(aluminum.get('[data-testid="mobile-standard-fixed-baseValue"]').text()).toBe('214.380')
    expect(aluminum.get('[data-testid="mobile-standard-reset-aluminum"]').classes()).toContain('mobile-touch-target')
  })

  it('updates existing formula results immediately and resets each mobile card independently', async () => {
    const wrapper = mountPage(true)
    await settle()
    const aluminum = await expandCard(wrapper, 'aluminum')
    const silicon = await expandCard(wrapper, 'silicon')
    const iron = await expandCard(wrapper, 'iron')

    await aluminum.get('[data-field="highReading"]').setValue('8')
    await silicon.get('[data-field="lowReading"]').setValue('0.5')
    await iron.get('[data-field="highReading"]').setValue('0.5')
    await nextTick()
    expect(aluminum.text()).toContain('0.493')
    expect(aluminum.text()).toContain('-5.248')
    expect(aluminum.text()).toContain('73.76')
    expect(silicon.text()).toContain('15.025')
    expect(iron.text()).not.toContain('29.363')

    await silicon.get('[data-testid="mobile-standard-reset-silicon"]').trigger('click')
    await nextTick()
    expect(silicon.get<HTMLInputElement>('[data-field="lowReading"]').element.value).toBe('0.405')
    expect(aluminum.get<HTMLInputElement>('[data-field="highReading"]').element.value).toBe('8')
    expect(iron.get<HTMLInputElement>('[data-field="highReading"]').element.value).toBe('0.5')

    await aluminum.get('[data-testid="mobile-standard-reset-aluminum"]').trigger('click')
    await iron.get('[data-testid="mobile-standard-reset-iron"]').trigger('click')
    await nextTick()
    expect(aluminum.get<HTMLInputElement>('[data-field="highReading"]').element.value).toBe('7.7')
    expect(iron.get<HTMLInputElement>('[data-field="highReading"]').element.value).toBe('0.461')
  })

  it('normalizes mobile numeric input to the desktop three-decimal precision', async () => {
    const wrapper = mountPage(true)
    await settle()
    const instance = mocks.draftInstances[0]
    const aluminum = await expandCard(wrapper, 'aluminum')
    const reading = aluminum.get<HTMLInputElement>('[data-field="highReading"]')

    await reading.setValue('8.1239')
    await nextTick()

    expect(reading.element.value).toBe('8.124')
    expect(instance.savedSnapshots.at(-1)?.aluminum.highReading).toBe(8.124)
  })

  it('uses strict account-scoped legacy and recovery keys compatible with the transport payload', async () => {
    mountPage(false)
    await settle()
    const { adapter } = mocks.draftInstances[0]

    expect(adapter.kind).toBe('standard-sample')
    expect(adapter.legacyStorageKey).toBe('ys_standard_sample_inputs:frontend-user-7')
    expect(adapter.cacheStorageKey).toBe('ys_calculation_draft_cache:standard-sample:frontend-user-7')
    expect(adapter.normalize(serverSnapshot)).toEqual(serverSnapshot)
    expect(() => adapter.normalize({ ...serverSnapshot, extra: true })).toThrow(TypeError)
    expect(() => adapter.normalize({ ...serverSnapshot, aluminum: { ...serverSnapshot.aluminum, highReading: Number.NaN } })).toThrow(TypeError)
    expect(() => adapter.normalize({ aluminum: serverSnapshot.aluminum, silicon: serverSnapshot.silicon })).toThrow(TypeError)
  })

  it('does not initialize a draft or expose an editor without a valid auth-store identity', async () => {
    mocks.authStore.user = null
    const wrapper = mountPage(false)
    await settle()

    expect(mocks.useCalculationDraft).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="standard-desktop-view"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="standard-mobile-view"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="standard-account-pending"]').text()).toContain('登录账号')
  })

  it('rejects blank auth ids and never falls back to a guest or global draft key', async () => {
    mocks.authStore.user = authUser('   ', 'account-without-id')
    mountPage(false)
    await settle()

    expect(mocks.useCalculationDraft).not.toHaveBeenCalled()
    expect(mocks.draftInstances.some((instance) => instance.adapter.legacyStorageKey.includes('guest'))).toBe(false)
  })

  it('uses the reactive auth id even when localStorage is malformed or unreadable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        ...createMemoryStorage(),
        getItem: () => { throw new Error('blocked storage') }
      }
    })
    mocks.authStore.user = authUser('account-a', 'ignored-account')

    mountPage(false)
    await settle()

    expect(mocks.draftInstances).toHaveLength(1)
    expect(mocks.draftInstances[0].adapter.legacyStorageKey).toBe('ys_standard_sample_inputs:account-a')
    expect(mocks.draftInstances[0].adapter.cacheStorageKey).toBe('ys_calculation_draft_cache:standard-sample:account-a')
  })

  it('disposes account A and shows fresh disabled defaults while account B loads', async () => {
    const accountBLoad = deferred<void>()
    installDraftDouble({
      load: async (instance) => {
        if (instance.adapter.legacyStorageKey.endsWith(':account-a')) {
          instance.adapter.apply({ ...serverSnapshot, aluminum: { ...serverSnapshot.aluminum, highStandard: 88 } })
          return
        }
        await accountBLoad.promise
        if (!instance.disposed) {
          instance.adapter.apply({ ...serverSnapshot, aluminum: { ...serverSnapshot.aluminum, highStandard: 62 } })
        }
      }
    })
    mocks.authStore.user = authUser('account-a')
    const wrapper = mountPage(false)
    await settle()
    const accountA = mocks.draftInstances[0]
    expect(wrapper.get<HTMLInputElement>('[data-testid="standard-desktop-view"] input').element.value).toBe('88')

    mocks.authStore.user = authUser('account-b')
    await nextTick()
    const accountB = mocks.draftInstances[1]
    const freshInput = wrapper.get<HTMLInputElement>('[data-testid="standard-desktop-view"] input')
    expect(accountA.disposed).toBe(true)
    expect(accountB.adapter.legacyStorageKey).toBe('ys_standard_sample_inputs:account-b')
    expect(freshInput.element.value).toBe('69.74')
    expect(freshInput.attributes('disabled')).toBeDefined()

    accountA.adapter.apply({ ...serverSnapshot, aluminum: { ...serverSnapshot.aluminum, highStandard: 99 } })
    expect(freshInput.element.value).toBe('69.74')
    expect(accountA.scheduleSave).not.toHaveBeenCalled()

    accountBLoad.resolve()
    await settle()
    expect(freshInput.element.value).toBe('62')
    expect(freshInput.attributes('disabled')).toBeUndefined()
    await freshInput.setValue('63')
    await nextTick()
    expect(accountB.scheduleSave).toHaveBeenCalledTimes(1)
    expect(accountA.scheduleSave).not.toHaveBeenCalled()
  })

  it('disposes account state and hides its draft immediately on logout', async () => {
    installDraftDouble({
      load: async (instance) => {
        instance.adapter.apply({ ...serverSnapshot, aluminum: { ...serverSnapshot.aluminum, highStandard: 88 } })
      }
    })
    mocks.authStore.user = authUser('account-a')
    const wrapper = mountPage(false)
    await settle()
    const accountA = mocks.draftInstances[0]
    expect(wrapper.text()).toContain('88')

    mocks.authStore.user = null
    await settle()

    expect(accountA.disposed).toBe(true)
    expect(wrapper.find('[data-testid="standard-desktop-view"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('88')
    expect(wrapper.find('[data-testid="standard-account-pending"]').exists()).toBe(true)
  })

  it('creates one fresh account scope only after a null identity becomes valid', async () => {
    const accountBLoad = deferred<void>()
    installDraftDouble({
      load: async (instance) => {
        await accountBLoad.promise
        if (!instance.disposed) instance.adapter.apply(serverSnapshot)
      }
    })
    mocks.authStore.user = null
    const wrapper = mountPage(false)
    await settle()
    expect(mocks.useCalculationDraft).not.toHaveBeenCalled()

    mocks.authStore.user = authUser('account-b')
    await nextTick()
    expect(mocks.useCalculationDraft).toHaveBeenCalledTimes(1)
    expect(mocks.draftInstances[0].adapter.legacyStorageKey).toBe('ys_standard_sample_inputs:account-b')
    expect(wrapper.get<HTMLInputElement>('[data-testid="standard-desktop-view"] input').element.value).toBe('69.74')
    expect(wrapper.get('[data-testid="standard-desktop-view"] input').attributes('disabled')).toBeDefined()

    accountBLoad.resolve()
    await settle()
    expect(wrapper.get('[data-testid="standard-desktop-view"] input').attributes('disabled')).toBeUndefined()
  })

  it('loads and applies state before installing the deep save watcher', async () => {
    installDraftDouble({
      load: async (instance) => {
        instance.adapter.apply(serverSnapshot)
      }
    })
    const wrapper = mountPage(false)
    const instance = mocks.draftInstances[0]

    expect(instance.scheduleSave).not.toHaveBeenCalled()
    await settle()
    expect(instance.scheduleSave).not.toHaveBeenCalled()
    expect(wrapper.get<HTMLInputElement>('[data-testid="standard-desktop-view"] input').element.value).toBe('71.25')

    await wrapper.get<HTMLInputElement>('[data-testid="standard-desktop-view"] input').setValue('72')
    await nextTick()
    expect(instance.scheduleSave).toHaveBeenCalledTimes(1)
    expect(instance.savedSnapshots[0].aluminum.highStandard).toBe(72)
  })

  it('keeps both editors non-interactive until the initial load settles across a layout switch', async () => {
    const loading = deferred<void>()
    installDraftDouble({
      status: 'loading',
      load: async (instance) => {
        await loading.promise
        instance.status.value = 'idle'
      }
    })
    const wrapper = mountPage(false)
    const instance = mocks.draftInstances[0]

    expect(wrapper.get('[data-testid="standard-desktop-view"] input').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[data-testid="standard-desktop-view"] button').filter((button) => button.text() === '重置').every((button) => button.attributes('disabled') !== undefined)).toBe(true)

    mocks.isMobileLayout.value = true
    await nextTick()
    const aluminum = await expandCard(wrapper, 'aluminum')
    expect(aluminum.get('[data-field="highStandard"]').attributes('disabled')).toBeDefined()
    expect(aluminum.get('[data-testid="mobile-standard-reset-aluminum"]').attributes('disabled')).toBeDefined()
    expect(mocks.useCalculationDraft).toHaveBeenCalledTimes(1)
    expect(instance.scheduleSave).not.toHaveBeenCalled()

    loading.resolve()
    await settle()
    expect(aluminum.get('[data-field="highStandard"]').attributes('disabled')).toBeUndefined()
    expect(aluminum.get('[data-testid="mobile-standard-reset-aluminum"]').attributes('disabled')).toBeUndefined()
  })

  it('saves the same complete snapshot from desktop and mobile editors', async () => {
    const desktop = mountPage(false)
    await settle()
    const desktopInstance = mocks.draftInstances[0]
    await desktop.get<HTMLInputElement>('[data-testid="standard-desktop-view"] input').setValue('70')
    await nextTick()
    const desktopSaved = desktopInstance.savedSnapshots.at(-1)
    desktop.unmount()

    const mobile = mountPage(true)
    await settle()
    const mobileInstance = mocks.draftInstances[1]
    const aluminum = await expandCard(mobile, 'aluminum')
    await aluminum.get<HTMLInputElement>('[data-field="highStandard"]').setValue('70')
    await nextTick()
    const mobileSaved = mobileInstance.savedSnapshots.at(-1)

    expect(desktopSaved).toEqual(mobileSaved)
    expect(desktopSaved).toEqual({ ...defaults, aluminum: { ...defaults.aluminum, highStandard: 70 } })
  })

  it('shows a provisional cache after load failure and exposes retry without discarding input', async () => {
    installDraftDouble({
      status: 'loading',
      load: async (instance) => {
        instance.adapter.apply(serverSnapshot)
        instance.status.value = 'error'
      }
    })
    const wrapper = mountPage(true)
    await settle()
    const instance = mocks.draftInstances[0]

    expect(wrapper.text()).toContain('保存失败，请重试。')
    expect(wrapper.text()).toContain('系数1')
    const retry = wrapper.findAll('button').find((button) => button.text() === '重试保存')!
    await retry.trigger('click')
    expect(instance.retry).toHaveBeenCalledTimes(1)
  })

  it('requires confirmation before overwrite and cancel keeps the conflict and local snapshot untouched', async () => {
    installDraftDouble({ status: 'conflict' })
    mocks.confirm.mockRejectedValueOnce('cancel')
    const wrapper = mountPage(true)
    await settle()
    const instance = mocks.draftInstances[0]
    const before = instance.adapter.snapshot()
    const overwrite = wrapper.findAll('button').find((button) => button.text() === '覆盖服务器版本')!

    await overwrite.trigger('click')
    await settle()
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(instance.overwriteServerVersion).not.toHaveBeenCalled()
    expect(instance.adapter.snapshot()).toEqual(before)
    expect(instance.status.value).toBe('conflict')

    mocks.confirm.mockResolvedValueOnce('confirm')
    await overwrite.trigger('click')
    await settle()
    expect(instance.overwriteServerVersion).toHaveBeenCalledTimes(1)
  })

  it('applies the server conflict version without immediately saving it back', async () => {
    installDraftDouble({ status: 'conflict', serverVersion: serverSnapshot })
    const wrapper = mountPage(false)
    await settle()
    const instance = mocks.draftInstances[0]
    const useServer = wrapper.findAll('button').find((button) => button.text() === '加载服务器版本')!

    await useServer.trigger('click')
    await settle()
    expect(instance.useServerVersion).toHaveBeenCalledTimes(1)
    expect(instance.adapter.snapshot()).toEqual(serverSnapshot)
    expect(instance.scheduleSave).not.toHaveBeenCalled()

    const firstInput = wrapper.get<HTMLInputElement>('[data-testid="standard-desktop-view"] input')
    await firstInput.setValue('73')
    await nextTick()
    expect(instance.scheduleSave).toHaveBeenCalledTimes(1)
  })

  it('keeps one adapter and watcher while switching layouts', async () => {
    const wrapper = mountPage(false)
    await settle()
    const instance = mocks.draftInstances[0]

    mocks.isMobileLayout.value = true
    await nextTick()
    expect(wrapper.find('[data-testid="standard-desktop-view"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="standard-mobile-view"]').exists()).toBe(true)
    expect(mocks.useCalculationDraft).toHaveBeenCalledTimes(1)

    const aluminum = await expandCard(wrapper, 'aluminum')
    await aluminum.get<HTMLInputElement>('[data-field="highStandard"]').setValue('75')
    await nextTick()
    expect(instance.scheduleSave).toHaveBeenCalledTimes(1)
  })
})
