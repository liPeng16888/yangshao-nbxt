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
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.any(File)],
        title: '化验报告'
      })
    )
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
    expect(wrapper.text()).toContain('长按图片保存')
    wrapper.unmount()
  })
})
