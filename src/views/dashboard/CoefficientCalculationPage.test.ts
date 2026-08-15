import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent, h, nextTick, onScopeDispose, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { useLabSheetStore } from '@/stores/labSheet'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/types/auth'
import type { LabFormulaResult, LabSheet, SampleBlock } from '@/types/labSheet'
import CoefficientCalculationPage from './CoefficientCalculationPage.vue'

const apiMocks = vi.hoisted(() => ({
  applyCurrentParametersFromIndex: vi.fn(),
  createLabSheetEventSource: vi.fn(),
  getCurrentLabSheet: vi.fn(),
  getLabSheetClientId: vi.fn(),
  saveSampleBlock: vi.fn()
}))

const messageMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}))

const messageBoxMocks = vi.hoisted(() => ({ confirm: vi.fn() }))
const draftMocks = vi.hoisted(() => ({
  adapters: [] as Array<any>,
  instances: [] as Array<any>,
  payload: undefined as unknown,
  serverVersion: undefined as unknown,
  status: 'idle',
  retry: vi.fn(),
  overwrite: vi.fn()
}))
const layoutMocks = vi.hoisted(() => ({ isMobileLayout: undefined as any }))
const mountedWrappers: VueWrapper[] = []

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => { values.clear(); draftMocks.payload = undefined },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value)
      if (key.startsWith('ys_coefficient_calculation_inputs:')) draftMocks.payload = JSON.parse(value)
    }
  }
}

vi.mock('@/api/labSheet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/labSheet')>()),
  ...apiMocks
}))

vi.mock('@/composables/useCalculationDraft', () => ({
  useCalculationDraft: (adapter: any) => {
    draftMocks.adapters.push(adapter)
    adapter.apply(draftMocks.payload === undefined ? adapter.defaults() : adapter.normalize(draftMocks.payload))
    const status = ref(draftMocks.status)
    const updatedAt = ref<string | null>(null)
    const conflict = ref(draftMocks.status === 'conflict' ? { serverDraft: true } : null)
    const scheduleSave = vi.fn(() => window.localStorage.setItem(adapter.legacyStorageKey, JSON.stringify(adapter.snapshot())))
    const useServerVersion = vi.fn(() => {
      if (draftMocks.serverVersion !== undefined) adapter.apply(draftMocks.serverVersion)
      status.value = 'saved'
      conflict.value = null
    })
    const instance = {
      status,
      updatedAt,
      conflict,
      load: async () => {
        status.value = 'idle'
      },
      scheduleSave,
      retry: draftMocks.retry,
      useServerVersion,
      overwriteServerVersion: draftMocks.overwrite,
      disposed: false
    }
    draftMocks.instances.push(instance)
    onScopeDispose(() => { instance.disposed = true })
    return instance
  }
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: layoutMocks.isMobileLayout })
}))

vi.mock('element-plus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('element-plus')>()),
  ElMessage: messageMocks,
  ElMessageBox: messageBoxMocks
}))

const ElCheckboxStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean },
  emits: ['change'],
  setup(props, { attrs, emit }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      'aria-pressed': String(props.modelValue),
      onClick: () => emit('change', !props.modelValue)
    })
  }
})

const ElInputStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue', 'input'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue,
      onInput: (event: Event) => {
        const value = (event.target as HTMLInputElement).value
        emit('update:modelValue', value)
        emit('input', value)
      }
    })
  }
})

const ElInputNumberStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: Number, default: null },
    valueOnClear: { type: [String, Number], default: null }
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () => h('input', {
      ...attrs,
      value: props.modelValue ?? '',
      onInput: (event: Event) => {
        const raw = (event.target as HTMLInputElement).value
        emit('update:modelValue', raw === '' ? null : Number(raw))
      }
    })
  }
})

function makeBlock(index: number): SampleBlock {
  return {
    id: `block-${index}`,
    index,
    readonly: false,
    inputs: { sequence: String(index).padStart(3, '0') },
    results: {} as LabFormulaResult,
    parameterSnapshot: { ...defaultLabParameters }
  }
}

function makeSheet(indices = [1, 2, 3, 4]): LabSheet {
  return {
    id: 'sheet-1',
    date: '2026-08-08',
    readonly: false,
    parameters: { ...defaultLabParameters },
    sampleBlocks: indices.map(makeBlock)
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((fulfill) => { resolve = fulfill })
  return { promise, resolve }
}

const CoefficientApplicationDialogStub = defineComponent({
  props: {
    visible: Boolean,
    sampleIndices: { type: Array<number>, default: () => [] },
    loading: Boolean
  },
  emits: ['cancel', 'confirm'],
  setup(props, { emit }) {
    return () => {
      const sampleIndices = props.sampleIndices as number[]
      return props.visible
        ? h('section', { 'data-testid': 'coefficient-application-dialog' }, [
            h('span', { 'data-testid': 'sample-range' }, `${String(sampleIndices[0]).padStart(3, '0')}～${String(sampleIndices.at(-1)).padStart(3, '0')}`),
          h('button', { 'data-testid': 'dialog-cancel', onClick: () => emit('cancel') }, '取消'),
          h('button', { 'data-testid': 'dialog-confirm', onClick: () => emit('confirm', 3) }, '确认应用')
          ])
        : null
    }
  }
})

function authUser(id: string): AuthUser {
  return { id, account: id, username: `User ${id}`, role: 'FRONTEND_USER' }
}

function mountPage(options: { user?: AuthUser | null; mobile?: boolean } = {}) {
  const pinia = createPinia()
  const authStore = useAuthStore(pinia)
  authStore.user = options.user === undefined ? authUser('frontend-user-8') : options.user
  layoutMocks.isMobileLayout.value = options.mobile ?? false
  const wrapper = mount(CoefficientCalculationPage, {
    global: {
      plugins: [pinia],
      stubs: {
        CoefficientApplicationDialog: CoefficientApplicationDialogStub,
        ElButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
        },
        ElInput: ElInputStub,
        ElInputNumber: ElInputNumberStub,
        ElCheckbox: ElCheckboxStub
      }
    }
  })
  mountedWrappers.push(wrapper)
  return { wrapper, store: useLabSheetStore(pinia), authStore }
}

function seedIndependentRows(options: {
  standardRows?: unknown
  calculationRows?: unknown
  standardAddCount?: unknown
  calculationAddCount?: unknown
}) {
  window.localStorage.setItem('ys_coefficient_calculation_inputs:frontend-user-8', JSON.stringify({
    parameters: { ironBlank: 0.123, ironFactor: 29.1 },
    standardRows: options.standardRows,
    calculationRows: options.calculationRows,
    standardAddCount: options.standardAddCount,
    calculationAddCount: options.calculationAddCount
  }))
}

function rowCodes(wrapper: VueWrapper, kind: 'standard' | 'calculation') {
  return wrapper.findAll(`[data-testid="${kind}-row"]`).map((row) => row.attributes('data-code'))
}

async function selectRow(wrapper: VueWrapper, kind: 'standard' | 'calculation', id: string) {
  await wrapper.get(`[data-testid="select-${kind}-row-${id}"]`).trigger('click')
  await nextTick()
}

function getAddCountInput(wrapper: VueWrapper, kind: 'standard' | 'calculation') {
  const input = wrapper.findAllComponents(ElInputNumberStub)
    .find((component) => component.attributes('data-testid') === `${kind}-add-count`)
  if (!input) throw new Error(`Missing ${kind} add-count input`)
  return input
}

async function setAddCount(wrapper: VueWrapper, kind: 'standard' | 'calculation', value: number | null) {
  getAddCountInput(wrapper, kind).vm.$emit('update:modelValue', value)
  await nextTick()
}

async function openApplicationDialog(wrapper: ReturnType<typeof mountPage>['wrapper']) {
  await wrapper.findAll('button').find((button) => button.text() === '应用系数')!.trigger('click')
  await Promise.resolve()
  await nextTick()
}

describe('CoefficientCalculationPage coefficient application', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage()
    })
    window.localStorage.clear()
    window.localStorage.setItem('ys_coefficient_calculation_inputs:frontend-user-8', JSON.stringify({
      parameters: { ironBlank: 0.123, ironFactor: 29.1 }
    }))
    apiMocks.createLabSheetEventSource.mockReturnValue(null)
    apiMocks.getLabSheetClientId.mockReturnValue('client-1')
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheet([4, 1, 3, 2]))
    apiMocks.applyCurrentParametersFromIndex.mockImplementation(async () => makeSheet([1, 2, 3, 4]))
    apiMocks.saveSampleBlock.mockReset()
    apiMocks.saveSampleBlock.mockImplementation(async () => makeBlock(1))
    messageMocks.error.mockReset()
    messageMocks.success.mockReset()
    messageMocks.warning.mockReset()
    messageBoxMocks.confirm.mockReset()
    draftMocks.adapters.length = 0
    draftMocks.instances.length = 0
    draftMocks.status = 'idle'
    draftMocks.serverVersion = undefined
    draftMocks.retry.mockReset()
    draftMocks.overwrite.mockReset()
    layoutMocks.isMobileLayout = ref(false)
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('marks the extracted desktop editor while preserving its existing rows', () => {
    const { wrapper } = mountPage()

    expect(wrapper.get('[data-testid="coefficient-desktop-view"]')).toBeTruthy()
    expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(3)
  })

  it('mounts exactly one desktop or mobile editor while keeping one draft controller', async () => {
    const { wrapper } = mountPage({ mobile: false })
    expect(wrapper.find('[data-testid="coefficient-desktop-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="coefficient-mobile-view"]').exists()).toBe(false)
    expect(draftMocks.adapters).toHaveLength(1)

    layoutMocks.isMobileLayout.value = true
    await nextTick()
    expect(wrapper.find('[data-testid="coefficient-desktop-view"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="coefficient-mobile-view"]').exists()).toBe(true)
    expect(draftMocks.adapters).toHaveLength(1)
  })

  it('uses exact account-scoped coefficient keys and never mounts a guest controller', () => {
    mountPage({ user: authUser('coefficient-account-a') })
    expect(draftMocks.adapters[0].kind).toBe('coefficient')
    expect(draftMocks.adapters[0].legacyStorageKey).toBe('ys_coefficient_calculation_inputs:coefficient-account-a')
    expect(draftMocks.adapters[0].cacheStorageKey).toBe('ys_calculation_draft_cache:coefficient:coefficient-account-a')

    const missing = mountPage({ user: null }).wrapper
    const blank = mountPage({ user: authUser('   ') }).wrapper
    expect(missing.find('[data-testid="coefficient-account-pending"]').exists()).toBe(true)
    expect(blank.find('[data-testid="coefficient-account-pending"]').exists()).toBe(true)
    expect(draftMocks.adapters).toHaveLength(1)
    expect(draftMocks.adapters.some((adapter) => adapter.legacyStorageKey.includes('guest'))).toBe(false)
  })

  it('disposes account A and hides its rows on switch and logout', async () => {
    seedIndependentRows({ standardRows: [{ id: 'account-a-row', code: 'ACCOUNT-A', autoCode: false }] })
    const { wrapper, authStore } = mountPage({ user: authUser('account-a') })
    expect(rowCodes(wrapper, 'standard')).toEqual(['ACCOUNT-A'])
    const accountA = draftMocks.instances[0]

    draftMocks.payload = undefined
    authStore.user = authUser('account-b')
    await nextTick()
    expect(accountA.disposed).toBe(true)
    expect(rowCodes(wrapper, 'standard')).not.toContain('ACCOUNT-A')
    expect(draftMocks.adapters.at(-1).legacyStorageKey).toBe('ys_coefficient_calculation_inputs:account-b')

    const accountB = draftMocks.instances.at(-1)
    authStore.user = null
    await nextTick()
    expect(accountB.disposed).toBe(true)
    expect(wrapper.find('[data-testid="coefficient-account-pending"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="coefficient-desktop-view"]').exists()).toBe(false)
  })

  it('keeps draft sync failures visible and retryable without disabling calculation', async () => {
    draftMocks.status = 'error'
    const { wrapper } = mountPage()
    expect(wrapper.text()).toContain('保存失败，请重试')
    expect(wrapper.find('[data-testid="coefficient-desktop-view"]').exists()).toBe(true)

    await wrapper.findAll('button').find((button) => button.text() === '重试保存')!.trigger('click')
    expect(draftMocks.retry).toHaveBeenCalledTimes(1)
  })

  it('requires confirmation before overwriting a conflicting coefficient draft', async () => {
    draftMocks.status = 'conflict'
    messageBoxMocks.confirm.mockRejectedValueOnce('cancel')
    const { wrapper } = mountPage()
    const overwrite = wrapper.findAll('button').find((button) => button.text() === '覆盖服务器版本')!

    await overwrite.trigger('click')
    await flushPromises()
    expect(draftMocks.overwrite).not.toHaveBeenCalled()

    messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
    await overwrite.trigger('click')
    await flushPromises()
    expect(draftMocks.overwrite).toHaveBeenCalledTimes(1)
  })

  it('applies a conflicting server version without immediately resaving it', async () => {
    draftMocks.status = 'conflict'
    const current = draftMocks.payload as any
    draftMocks.serverVersion = {
      ...current,
      parameters: { ...defaultLabParameters, ironBlank: 0.777 },
      standardAddCount: 1,
      calculationAddCount: 1,
      standardRows: [{ id: 'server-standard', code: 'SERVER', autoCode: false, aluminum: null, silicon: null, iron: null, calcium: null, magnesium: null, titanium: null }],
      calculationRows: [{ id: 'server-calculation', code: 'SERVER', autoCode: false, inputs: { ironRaw: null, siliconRaw: null, aluminumRaw: null, calciumRaw: null, magnesiumRaw: null, titaniumRaw: null } }]
    }
    const { wrapper } = mountPage()
    const instance = draftMocks.instances[0]

    await wrapper.findAll('button').find((button) => button.text() === '加载服务器版本')!.trigger('click')
    await nextTick()
    expect(draftMocks.adapters[0].snapshot().parameters.ironBlank).toBe(0.777)
    expect(instance.scheduleSave).not.toHaveBeenCalled()
  })

  it('keeps different stored row counts independent', () => {
    window.localStorage.setItem('ys_coefficient_calculation_inputs:frontend-user-8', JSON.stringify({
      addCount: 2,
      standardRows: [{ code: '001' }, { code: '002' }],
      calculationRows: [{ code: '001', inputs: {} }]
    }))
    const { wrapper } = mountPage()
    expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(1)
  })

  it('falls back only the corrupted standard table and preserves valid calculation data', () => {
    seedIndependentRows({
      standardRows: 'not-an-array',
      calculationRows: [{
        id: 'calculation-valid',
        code: 'CUSTOM-CALC',
        autoCode: false,
        inputs: { ironRaw: 12.345 }
      }]
    })

    const { wrapper } = mountPage()

    expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002', '003'])
    expect(rowCodes(wrapper, 'calculation')).toEqual(['CUSTOM-CALC'])
    expect(wrapper.get('[data-testid="calculation-row"]').findComponent(ElInputNumberStub).props('modelValue')).toBe(12.345)
  })

  it('falls back only the corrupted calculation table and preserves valid standard data', () => {
    seedIndependentRows({
      standardRows: [{
        id: 'standard-valid',
        code: 'CUSTOM-STANDARD',
        autoCode: false,
        aluminum: 6.25
      }],
      calculationRows: { invalid: true }
    })

    const { wrapper } = mountPage()

    expect(rowCodes(wrapper, 'standard')).toEqual(['CUSTOM-STANDARD'])
    expect(wrapper.get('[data-testid="standard-row"]').findComponent(ElInputNumberStub).props('modelValue')).toBe(6.25)
    expect(rowCodes(wrapper, 'calculation')).toEqual(['001', '002', '003'])
  })

  it('falls back each table containing a null row item without crashing', () => {
    seedIndependentRows({
      standardRows: [{ id: 'standard-valid', code: '001' }, null],
      calculationRows: [null]
    })

    const { wrapper } = mountPage()

    expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002', '003'])
    expect(rowCodes(wrapper, 'calculation')).toEqual(['001', '002', '003'])
  })

  it('regenerates duplicate IDs so selecting one row deletes only that row', async () => {
    seedIndependentRows({
      standardRows: [
        { id: 'duplicate', code: 'A', autoCode: false },
        { id: 'duplicate', code: 'B', autoCode: false },
        { id: '', code: 'C', autoCode: false }
      ]
    })
    messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
    const { wrapper } = mountPage()

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    const rowCheckboxes = wrapper.findAll('[data-testid^="select-standard-row-"]')
    expect(new Set(rowCheckboxes.map((checkbox) => checkbox.attributes('data-testid'))).size).toBe(3)
    await rowCheckboxes[1].trigger('click')
    await wrapper.get('[data-testid="confirm-delete-standard-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'standard')).toEqual(['A', 'C'])
  })

  it('migrates the legacy add count into two independent persisted counts', async () => {
    window.localStorage.setItem('ys_coefficient_calculation_inputs:frontend-user-8', JSON.stringify({
      addCount: 2,
      standardRows: [{ code: '001' }],
      calculationRows: [{ code: '001', inputs: {} }]
    }))
    const { wrapper } = mountPage()
    await wrapper.get('[data-testid="add-standard-rows"]').trigger('click')
    await nextTick()
    const stored = JSON.parse(window.localStorage.getItem('ys_coefficient_calculation_inputs:frontend-user-8')!)
    expect(stored.standardAddCount).toBe(2)
    expect(stored.calculationAddCount).toBe(2)
    expect(stored).not.toHaveProperty('addCount')
  })

  it.each([
    [null, 1],
    [0, 1],
    [-4, 1],
    [2.9, 2],
    [80, 50]
  ])('normalizes stored add count %s before adding and persisting', async (storedCount, expectedCount) => {
    seedIndependentRows({
      standardRows: [{ id: 'standard-1', code: '001', autoCode: true }],
      calculationRows: [{ id: 'calculation-1', code: '001', autoCode: true, inputs: {} }],
      standardAddCount: storedCount,
      calculationAddCount: storedCount
    })
    const { wrapper } = mountPage()

    await wrapper.get('[data-testid="add-standard-rows"]').trigger('click')
    await nextTick()
    const stored = JSON.parse(window.localStorage.getItem('ys_coefficient_calculation_inputs:frontend-user-8')!)

    expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(1 + expectedCount)
    expect(stored.standardAddCount).toBe(expectedCount)
    expect(stored.calculationAddCount).toBe(expectedCount)
  })

  it.each([
    ['standard', null, 1],
    ['standard', 0, 1],
    ['standard', -2, 1],
    ['standard', 3.7, 3],
    ['standard', 99, 50],
    ['calculation', null, 1],
    ['calculation', 0, 1],
    ['calculation', -2, 1],
    ['calculation', 3.7, 3],
    ['calculation', 99, 50]
  ] as const)('normalizes live %s add count %s before appending', async (kind, liveCount, expectedCount) => {
    seedIndependentRows({
      standardRows: [{ id: 'standard-1', code: '001', autoCode: true }],
      calculationRows: [{ id: 'calculation-1', code: '001', autoCode: true, inputs: {} }]
    })
    const { wrapper } = mountPage()

    await setAddCount(wrapper, kind, liveCount)
    await wrapper.get(`[data-testid="add-${kind}-rows"]`).trigger('click')
    await nextTick()
    const stored = JSON.parse(window.localStorage.getItem('ys_coefficient_calculation_inputs:frontend-user-8')!)

    expect(wrapper.findAll(`[data-testid="${kind}-row"]`)).toHaveLength(1 + expectedCount)
    expect(stored[`${kind}AddCount`]).toBe(expectedCount)
  })

  it('configures cleared add-count inputs to restore their minimum', () => {
    const { wrapper } = mountPage()

    expect(getAddCountInput(wrapper, 'standard').props('valueOnClear')).toBe('min')
    expect(getAddCountInput(wrapper, 'calculation').props('valueOnClear')).toBe('min')
  })

  it('adds rows to each table independently', async () => {
    const { wrapper } = mountPage()
    const calculationBefore = wrapper.findAll('[data-testid="calculation-row"]').length
    await wrapper.get('[data-testid="add-standard-rows"]').trigger('click')
    expect(wrapper.findAll('[data-testid="standard-row"]')).toHaveLength(4)
    expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(calculationBefore)
    await wrapper.get('[data-testid="add-calculation-rows"]').trigger('click')
    expect(wrapper.findAll('[data-testid="calculation-row"]')).toHaveLength(calculationBefore + 1)
  })

  it('deletes selected standard rows without touching calculation rows', async () => {
    seedIndependentRows({
      standardRows: [
        { id: 'standard-1', code: '001', autoCode: true },
        { id: 'standard-2', code: '002', autoCode: true },
        { id: 'standard-3', code: '003', autoCode: true }
      ],
      calculationRows: [
        { id: 'calculation-1', code: '001', autoCode: true, inputs: {} },
        { id: 'calculation-2', code: '002', autoCode: true, inputs: {} }
      ]
    })
    messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
    const { wrapper } = mountPage()
    const calculationCodesBefore = rowCodes(wrapper, 'calculation')

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await selectRow(wrapper, 'standard', 'standard-2')
    await wrapper.get('[data-testid="confirm-delete-standard-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002'])
    expect(rowCodes(wrapper, 'calculation')).toEqual(calculationCodesBefore)
    expect(messageBoxMocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining('002'),
      expect.stringContaining('标样含量'),
      expect.any(Object)
    )
  })

  it('keeps a custom calculation code when another calculation row is deleted', async () => {
    seedIndependentRows({
      calculationRows: [
        { id: 'calculation-1', code: '001', autoCode: true, inputs: {} },
        { id: 'calculation-2', code: 'CUSTOM', autoCode: false, inputs: {} },
        { id: 'calculation-3', code: '003', autoCode: true, inputs: {} }
      ]
    })
    messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
    const { wrapper } = mountPage()
    const standardBefore = rowCodes(wrapper, 'standard')

    await wrapper.get('[data-testid="delete-calculation-rows"]').trigger('click')
    await selectRow(wrapper, 'calculation', 'calculation-1')
    await wrapper.get('[data-testid="confirm-delete-calculation-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'calculation')).toEqual(['CUSTOM', '002'])
    expect(rowCodes(wrapper, 'standard')).toEqual(standardBefore)
  })

  it('persists a code edited through the input and preserves it across remount and adjacent deletion', async () => {
    seedIndependentRows({
      calculationRows: [
        { id: 'calculation-1', code: '001', autoCode: true, inputs: {} },
        { id: 'calculation-2', code: '002', autoCode: true, inputs: {} },
        { id: 'calculation-3', code: '003', autoCode: true, inputs: {} }
      ]
    })
    messageBoxMocks.confirm.mockResolvedValueOnce('confirm')
    const firstMount = mountPage()
    const editedInput = firstMount.wrapper.findAll('[data-testid="calculation-row"]')[1].get('input')

    await editedInput.setValue('CUSTOM-EDITED')
    await nextTick()
    const storedAfterEdit = JSON.parse(window.localStorage.getItem('ys_coefficient_calculation_inputs:frontend-user-8')!)
    expect(storedAfterEdit.calculationRows[1]).toMatchObject({ code: 'CUSTOM-EDITED', autoCode: false })
    firstMount.wrapper.unmount()

    const { wrapper } = mountPage()
    await wrapper.get('[data-testid="delete-calculation-rows"]').trigger('click')
    await selectRow(wrapper, 'calculation', 'calculation-1')
    await wrapper.get('[data-testid="confirm-delete-calculation-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'calculation')).toEqual(['CUSTOM-EDITED', '002'])
    const storedAfterDelete = JSON.parse(window.localStorage.getItem('ys_coefficient_calculation_inputs:frontend-user-8')!)
    expect(storedAfterDelete.calculationRows[0]).toMatchObject({ code: 'CUSTOM-EDITED', autoCode: false })
  })

  it('gives both header and row checkboxes accessible names containing their table and current code', async () => {
    seedIndependentRows({
      standardRows: [{ id: 'standard-1', code: 'STD-A', autoCode: false }],
      calculationRows: [{ id: 'calculation-1', code: 'CALC-B', autoCode: false, inputs: {} }]
    })
    const { wrapper } = mountPage()

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await wrapper.get('[data-testid="delete-calculation-rows"]').trigger('click')

    expect(wrapper.get('[data-testid="select-all-standard-rows"]').attributes('aria-label')).toBe('全选标样含量样品')
    expect(wrapper.get('[data-testid="select-standard-row-standard-1"]').attributes('aria-label')).toBe('选择标样含量样品 STD-A')
    expect(wrapper.get('[data-testid="select-all-calculation-rows"]').attributes('aria-label')).toBe('全选标样系数计算样品')
    expect(wrapper.get('[data-testid="select-calculation-row-calculation-1"]').attributes('aria-label')).toBe('选择标样系数计算样品 CALC-B')
  })

  it('places each delete entry in its own bottom add-action container', () => {
    const { wrapper } = mountPage()
    const sections = wrapper.findAll('section.coefficient-section')

    expect(sections[0].get('[data-testid="standard-bottom-actions"]').find('[data-testid="delete-standard-rows"]').exists()).toBe(true)
    expect(sections[0].get('.coefficient-section__header').find('[data-testid="delete-standard-rows"]').exists()).toBe(false)
    expect(sections[1].get('[data-testid="calculation-bottom-actions"]').find('[data-testid="delete-calculation-rows"]').exists()).toBe(true)
    expect(sections[1].get('.coefficient-section__header').find('[data-testid="delete-calculation-rows"]').exists()).toBe(false)
  })

  it('selects every standard row from its header without changing calculation selection', async () => {
    const { wrapper } = mountPage()
    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await wrapper.get('[data-testid="delete-calculation-rows"]').trigger('click')

    await wrapper.get('[data-testid="select-all-standard-rows"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="standard-selection-count"]').text()).toContain('已选择 3 个')
    expect(wrapper.get('[data-testid="calculation-selection-count"]').text()).toContain('已选择 0 个')
    expect(wrapper.get('[data-testid="confirm-delete-standard-rows"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[data-testid^="select-standard-row-"]').every((checkbox) => checkbox.attributes('aria-pressed') === 'true')).toBe(true)
    expect(wrapper.findAll('[data-testid^="select-calculation-row-"]').every((checkbox) => checkbox.attributes('aria-pressed') === 'false')).toBe(true)
    expect(wrapper.text()).toContain('至少保留一个样品')
  })

  it('selects every calculation row from its header without changing standard selection', async () => {
    const { wrapper } = mountPage()
    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await wrapper.get('[data-testid="delete-calculation-rows"]').trigger('click')

    await wrapper.get('[data-testid="select-all-calculation-rows"]').trigger('click')
    await nextTick()

    expect(wrapper.get('[data-testid="calculation-selection-count"]').text()).toContain('已选择 3 个')
    expect(wrapper.get('[data-testid="standard-selection-count"]').text()).toContain('已选择 0 个')
    expect(wrapper.get('[data-testid="confirm-delete-calculation-rows"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[data-testid^="select-calculation-row-"]').every((checkbox) => checkbox.attributes('aria-pressed') === 'true')).toBe(true)
    expect(wrapper.findAll('[data-testid^="select-standard-row-"]').every((checkbox) => checkbox.attributes('aria-pressed') === 'false')).toBe(true)
    expect(wrapper.text()).toContain('至少保留一个样品')
  })

  it('refuses to delete every row and keeps at least one sample', async () => {
    seedIndependentRows({
      standardRows: [
        { id: 'standard-1', code: '001', autoCode: true },
        { id: 'standard-2', code: '002', autoCode: true }
      ]
    })
    const { wrapper } = mountPage()

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await selectRow(wrapper, 'standard', 'standard-1')
    await selectRow(wrapper, 'standard', 'standard-2')

    expect(wrapper.get('[data-testid="confirm-delete-standard-rows"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('至少保留一个样品')
    expect(messageBoxMocks.confirm).not.toHaveBeenCalled()
  })

  it('keeps rows and selections when the confirmation is cancelled', async () => {
    seedIndependentRows({
      standardRows: [
        { id: 'standard-1', code: '001', autoCode: true },
        { id: 'standard-2', code: '002', autoCode: true }
      ]
    })
    messageBoxMocks.confirm.mockRejectedValueOnce('cancel')
    const { wrapper } = mountPage()

    await wrapper.get('[data-testid="delete-standard-rows"]').trigger('click')
    await selectRow(wrapper, 'standard', 'standard-2')
    await wrapper.get('[data-testid="confirm-delete-standard-rows"]').trigger('click')
    await flushPromises()

    expect(rowCodes(wrapper, 'standard')).toEqual(['001', '002'])
    expect(wrapper.get('[data-testid="standard-selection-count"]').text()).toContain('1')
  })

  it('loads samples and displays their sorted range before applying', async () => {
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)

    expect(apiMocks.getCurrentLabSheet).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="sample-range"]').text()).toBe('001～004')
  })

  it('applies the current parameters from the selected sample and confirms success', async () => {
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)
    await wrapper.get('[data-testid="dialog-confirm"]').trigger('click')
    await Promise.resolve()
    await nextTick()

    expect(apiMocks.applyCurrentParametersFromIndex).toHaveBeenCalledWith(
      expect.objectContaining({ ironBlank: 0.123, ironFactor: 29.1 }),
      3
    )
    expect(messageMocks.success).toHaveBeenCalledWith('已从样品 003 开始应用新参数')
  })

  it('does not apply parameters after cancelling', async () => {
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)
    await wrapper.get('[data-testid="dialog-cancel"]').trigger('click')

    expect(apiMocks.applyCurrentParametersFromIndex).not.toHaveBeenCalled()
  })

  it('warns without opening the dialog when there are no samples', async () => {
    apiMocks.getCurrentLabSheet.mockImplementation(async () => makeSheet([]))
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)

    expect(messageMocks.warning).toHaveBeenCalledWith('当天暂无可应用的样品')
    expect(wrapper.find('[data-testid="coefficient-application-dialog"]').exists()).toBe(false)
  })

  it('keeps the dialog open and explains when saving samples before application fails', async () => {
    vi.useFakeTimers()
    const { wrapper, store } = mountPage()

    await openApplicationDialog(wrapper)
    apiMocks.saveSampleBlock.mockRejectedValueOnce({ response: { status: 400 } })
    store.patchBlock('block-1', { sampleNumber: 'DIRTY-001' })
    await wrapper.get('[data-testid="dialog-confirm"]').trigger('click')
    await vi.runAllTimersAsync()
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="coefficient-application-dialog"]').exists()).toBe(true)
    expect(messageMocks.success).not.toHaveBeenCalled()
    expect(messageMocks.error).toHaveBeenCalledWith('应用系数前的数据保存失败，请处理后重试')
    vi.useRealTimers()
  })

  it('flushes a dirty sample block before applying parameters', async () => {
    vi.useFakeTimers()
    const { wrapper, store } = mountPage()
    await openApplicationDialog(wrapper)
    store.patchBlock('block-1', { sampleNumber: 'ORDER-001' })

    await wrapper.get('[data-testid="dialog-confirm"]').trigger('click')
    await vi.runAllTimersAsync()
    await flushPromises()

    expect(apiMocks.saveSampleBlock).toHaveBeenCalledTimes(1)
    expect(apiMocks.applyCurrentParametersFromIndex).toHaveBeenCalledTimes(1)
    expect(apiMocks.saveSampleBlock.mock.invocationCallOrder[0]).toBeLessThan(apiMocks.applyCurrentParametersFromIndex.mock.invocationCallOrder[0])
    vi.useRealTimers()
  })

  it('prevents duplicate parameter application while the first request is pending', async () => {
    const pending = deferred<LabSheet>()
    apiMocks.applyCurrentParametersFromIndex.mockImplementationOnce(() => pending.promise)
    const { wrapper } = mountPage()
    await openApplicationDialog(wrapper)

    const confirm = wrapper.get('[data-testid="dialog-confirm"]')
    await confirm.trigger('click')
    await confirm.trigger('click')
    expect(apiMocks.applyCurrentParametersFromIndex).toHaveBeenCalledTimes(1)

    pending.resolve(makeSheet())
    await flushPromises()
  })

  it('refreshes the current sheet and requires reselection when the chosen boundary no longer exists', async () => {
    apiMocks.getCurrentLabSheet
      .mockResolvedValueOnce(makeSheet([1, 2, 3, 4]))
      .mockResolvedValueOnce(makeSheet([1, 2]))
    apiMocks.applyCurrentParametersFromIndex.mockRejectedValueOnce({
      response: { data: { message: '起始样品不存在，请刷新后重新选择' } }
    })
    const { wrapper } = mountPage()

    await openApplicationDialog(wrapper)
    await wrapper.get('[data-testid="dialog-confirm"]').trigger('click')
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    await vi.waitFor(() => expect(apiMocks.getCurrentLabSheet).toHaveBeenCalledTimes(2))
    await nextTick()
    expect(wrapper.get('[data-testid="sample-range"]').text()).toBe('001～002')
    expect(wrapper.find('[data-testid="coefficient-application-dialog"]').exists()).toBe(true)
    expect(messageMocks.success).not.toHaveBeenCalled()
    expect(messageMocks.error).toHaveBeenCalledWith('起始样品已不存在，已刷新当天数据，请重新选择')
  })
})
