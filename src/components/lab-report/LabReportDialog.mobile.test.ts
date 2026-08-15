import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LabReportDialog from './LabReportDialog.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { SampleBlock } from '@/types/labSheet'
import { defaultLabReportTemplate } from '@/utils/labReport'

const reportMocks = vi.hoisted(() => ({
  createPngBlob: vi.fn(),
  downloadPng: vi.fn()
}))

vi.mock('@/utils/labReport', async () => {
  const actual = await vi.importActual<typeof import('@/utils/labReport')>('@/utils/labReport')
  return {
    ...actual,
    createLabReportPngBlob: reportMocks.createPngBlob,
    downloadLabReportAsPng: reportMocks.downloadPng
  }
})

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
})
