import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LabReportDialog from './LabReportDialog.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { SampleBlock } from '@/types/labSheet'
import { defaultLabReportTemplate } from '@/utils/labReport'

const reportMocks = vi.hoisted(() => ({
  createPngBlob: vi.fn(),
  downloadPng: vi.fn()
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

vi.mock('@/utils/labReport', async () => {
  const actual = await vi.importActual<typeof import('@/utils/labReport')>('@/utils/labReport')
  return {
    ...actual,
    createLabReportPngBlob: reportMocks.createPngBlob,
    downloadLabReportAsPng: reportMocks.downloadPng
  }
})

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: {
      id: 'main-account',
      dataOwnerId: 'main-account',
      role: 'FRONTEND_USER',
      permissions: [],
      isFrontendMainAccount: true,
      isFrontendSubAccount: false
    }
  })
}))

vi.mock('@/stores/frontendPreferences', () => ({
  canAccessFrontendPreference: () => true,
  frontendPreferenceActorKey: () => 'main-account',
  frontendPreferenceOwnerId: () => 'main-account',
  useFrontendPreferencesStore: () => ({
    statuses: { LAB_REPORT_SAMPLE_UNITS: 'idle' },
    conflicts: {},
    value: (_section: string, fallback: unknown) => structuredClone(fallback),
    save: vi.fn().mockResolvedValue('saved'),
    resolveConflict: vi.fn().mockResolvedValue('saved'),
    registerEditSession: () => ({ update: vi.fn(), unregister: vi.fn() })
  })
}))

function makeBlock(): SampleBlock {
  return {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs: {
      sequence: '001',
      sampleNumber: '手机化验样品',
      customerText: '王总',
      customerIds: [],
      customers: [],
      paymentStatus: '已结款',
      price: 20,
      elementNote: '铝'
    },
    results: {
      aluminum: 68,
      silicon: 0,
      iron: 0,
      aluminumSiliconRatio: 0,
      total: 68,
      density: 0,
      calcium: 0,
      magnesium: 0,
      titanium: 0,
      bottleDensity: 0,
      moisture: 0,
      burnLoss: 0
    },
    parameterSnapshot: defaultLabParameters
  }
}

function mountMobileReport() {
  const block = makeBlock()
  return mount(LabReportDialog, {
    props: {
      visible: true,
      mobile: true,
      blocks: [block],
      selectedBlockIds: [block.id],
      template: defaultLabReportTemplate,
      date: '2026-08-15'
    },
    global: {
      stubs: {
        ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
        ElButton: { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' },
        ElAlert: true,
        ElCheckboxGroup: { template: '<div><slot /></div>' },
        ElCheckbox: { template: '<label><slot /></label>' },
        ElSelect: true,
        ElOption: true
      }
    }
  })
}

async function openPreview(wrapper: ReturnType<typeof mountMobileReport>) {
  const createButton = wrapper.findAll('button').find((button) => button.text().includes('生成预览'))
  expect(createButton).toBeTruthy()
  await createButton!.trigger('click')
  await wrapper.vm.$nextTick()
}

async function clickMobileExport(wrapper: ReturnType<typeof mountMobileReport>) {
  const shareButton = wrapper.findAll('button').find((button) => button.text().includes('分享或保存图片'))
  expect(shareButton).toBeTruthy()
  await shareButton!.trigger('click')
  await Promise.resolve()
  await wrapper.vm.$nextTick()
}

describe('mobile lab report sharing', () => {
  beforeEach(() => {
    reportMocks.createPngBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    reportMocks.downloadPng.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shares the generated PNG file through the iPhone system share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { share, canShare })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)

    expect(reportMocks.createPngBlob).toHaveBeenCalledOnce()
    expect(canShare).toHaveBeenCalledOnce()
    const shareData = share.mock.calls[0][0]
    expect(shareData.title).toBe('化验报告')
    expect(shareData.files).toHaveLength(1)
    expect(shareData.files[0]).toBeInstanceOf(File)
    expect(shareData.files[0].name).toBe('王总-2026.8.15.png')
    expect(shareData.files[0].type).toBe('image/png')
    wrapper.unmount()
  })

  it('shows a long-press image fallback when file sharing is unavailable', async () => {
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(false) })
    const createObjectURL = vi.fn().mockReturnValue('blob:mobile-report')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(wrapper.find('.mobile-report-share-preview img').attributes('src')).toBe('blob:mobile-report')
    expect(wrapper.text()).toContain('长按保存图片')
    wrapper.unmount()
  })

  it('requires explicit file-share capability even when navigator.share exists', async () => {
    const share = vi.fn()
    vi.stubGlobal('navigator', { share })
    const createObjectURL = vi.fn().mockReturnValue('blob:no-can-share')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)

    expect(share).not.toHaveBeenCalled()
    expect(wrapper.find('.mobile-report-share-preview img').attributes('src')).toBe('blob:no-can-share')
    wrapper.unmount()
  })

  it('shows the PNG fallback when the browser has no File constructor', async () => {
    vi.stubGlobal('File', undefined)
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn() })
    const createObjectURL = vi.fn().mockReturnValue('blob:no-file-constructor')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)

    expect(wrapper.find('.mobile-report-share-preview img').attributes('src')).toBe('blob:no-file-constructor')
    expect(wrapper.text()).toContain('长按保存图片')
    wrapper.unmount()
  })

  it('treats AbortError as a cancellation without mounting a fallback preview', async () => {
    const abortError = new DOMException('cancelled', 'AbortError')
    const share = vi.fn().mockRejectedValue(abortError)
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true) })
    const createObjectURL = vi.fn().mockReturnValue('blob:should-not-exist')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(wrapper.find('.mobile-report-share-preview').exists()).toBe(false)
    wrapper.unmount()
  })

  it('falls back to the actual PNG when live system sharing fails', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share transport failed'))
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true) })
    const createObjectURL = vi.fn().mockReturnValue('blob:failed-share-png')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)

    expect(share).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }))
    expect(wrapper.find('.mobile-report-share-preview img').attributes('src')).toBe('blob:failed-share-png')
    expect(wrapper.text()).toContain('长按保存图片')
    wrapper.unmount()
  })

  it('replaces and revokes fallback object URLs across retries and dialog close', async () => {
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(false) })
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:first-report')
      .mockReturnValueOnce('blob:second-report')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    await clickMobileExport(wrapper)

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first-report')
    expect(wrapper.find('.mobile-report-share-preview img').attributes('src')).toBe('blob:second-report')

    await wrapper.setProps({ visible: false })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second-report')
    wrapper.unmount()
  })

  it('clears and revokes an earlier fallback when a later system share succeeds', async () => {
    const canShare = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare, share })
    const createObjectURL = vi.fn().mockReturnValue('blob:stale-fallback')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    expect(wrapper.find('.mobile-report-share-preview').exists()).toBe(true)

    await clickMobileExport(wrapper)
    await flushPromises()

    expect(share).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stale-fallback')
    expect(wrapper.find('.mobile-report-share-preview').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does nothing when the dialog closes while PNG generation is pending', async () => {
    const png = deferred<Blob | null>()
    reportMocks.createPngBlob.mockReturnValueOnce(png.promise)
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(true), share })
    const createObjectURL = vi.fn().mockReturnValue('blob:late-close')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    await wrapper.setProps({ visible: false })
    png.resolve(new Blob(['png'], { type: 'image/png' }))
    await flushPromises()

    expect(share).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does nothing when the component unmounts while PNG generation is pending', async () => {
    const png = deferred<Blob | null>()
    reportMocks.createPngBlob.mockReturnValueOnce(png.promise)
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(true), share })
    const createObjectURL = vi.fn().mockReturnValue('blob:late-unmount')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    wrapper.unmount()
    png.resolve(new Blob(['png'], { type: 'image/png' }))
    await flushPromises()

    expect(share).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('does not show a fallback after the dialog closes during failed sharing', async () => {
    const pendingShare = deferred<void>()
    const share = vi.fn().mockReturnValue(pendingShare.promise)
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(true), share })
    const createObjectURL = vi.fn().mockReturnValue('blob:late-share')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    expect(share).toHaveBeenCalledOnce()
    await wrapper.setProps({ visible: false })
    pendingShare.reject(new Error('late share failure'))
    await flushPromises()

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(wrapper.find('.mobile-report-share-preview').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores an old PNG result after closing and reopening the dialog', async () => {
    const oldPng = deferred<Blob | null>()
    reportMocks.createPngBlob.mockReturnValueOnce(oldPng.promise)
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(false) })
    const createObjectURL = vi.fn().mockReturnValue('blob:old-reopen')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    oldPng.resolve(new Blob(['old'], { type: 'image/png' }))
    await flushPromises()

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(wrapper.find('.mobile-report-share-preview').exists()).toBe(false)
    wrapper.unmount()
  })

  it('invalidates mobile export when the layout flips to desktop', async () => {
    const png = deferred<Blob | null>()
    reportMocks.createPngBlob.mockReturnValueOnce(png.promise)
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(true), share })
    const createObjectURL = vi.fn().mockReturnValue('blob:late-layout')
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    await wrapper.setProps({ mobile: false })
    png.resolve(new Blob(['png'], { type: 'image/png' }))
    await flushPromises()

    expect(share).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(reportMocks.downloadPng).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('prevents concurrent exports while the first PNG is pending', async () => {
    const png = deferred<Blob | null>()
    reportMocks.createPngBlob.mockReturnValueOnce(png.promise)
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(false) })
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:once'), configurable: true })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    await clickMobileExport(wrapper)

    expect(reportMocks.createPngBlob).toHaveBeenCalledOnce()
    png.resolve(null)
    await flushPromises()
    wrapper.unmount()
  })

  it('does not start a second system share after close and reopen while the first share is pending', async () => {
    const firstShare = deferred<void>()
    const share = vi.fn()
      .mockReturnValueOnce(firstShare.promise)
      .mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(true), share })
    const wrapper = mountMobileReport()

    await openPreview(wrapper)
    await clickMobileExport(wrapper)
    expect(share).toHaveBeenCalledOnce()

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await openPreview(wrapper)
    await clickMobileExport(wrapper)

    expect(reportMocks.createPngBlob).toHaveBeenCalledOnce()
    expect(share).toHaveBeenCalledOnce()

    firstShare.resolve()
    await flushPromises()
    await clickMobileExport(wrapper)
    await flushPromises()

    expect(reportMocks.createPngBlob).toHaveBeenCalledTimes(2)
    expect(share).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('does not start a second system share from a new instance while an unmounted instance share is pending', async () => {
    const firstShare = deferred<void>()
    const share = vi.fn()
      .mockReturnValueOnce(firstShare.promise)
      .mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(true), share })
    const firstWrapper = mountMobileReport()

    await openPreview(firstWrapper)
    await clickMobileExport(firstWrapper)
    expect(share).toHaveBeenCalledOnce()
    firstWrapper.unmount()

    const nextWrapper = mountMobileReport()
    await openPreview(nextWrapper)
    await clickMobileExport(nextWrapper)

    expect(reportMocks.createPngBlob).toHaveBeenCalledOnce()
    expect(share).toHaveBeenCalledOnce()

    firstShare.resolve()
    await flushPromises()
    await clickMobileExport(nextWrapper)
    await flushPromises()

    expect(reportMocks.createPngBlob).toHaveBeenCalledTimes(2)
    expect(share).toHaveBeenCalledTimes(2)
    nextWrapper.unmount()
  })
})
