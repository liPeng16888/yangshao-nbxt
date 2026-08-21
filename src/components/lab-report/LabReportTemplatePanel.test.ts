import { mount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import LabReportTemplatePanel from './LabReportTemplatePanel.vue'
import { defaultLabReportTemplate } from '@/utils/labReport'

const image = vi.hoisted(() => ({ resizeSealImage: vi.fn() }))

vi.mock('@/utils/imageDataUrl', () => ({
  resizeSealImage: image.resizeSealImage
}))

function mountPanel() {
  return mount(LabReportTemplatePanel, {
    props: { modelValue: { ...defaultLabReportTemplate, statements: [...defaultLabReportTemplate.statements] } },
    global: {
      stubs: {
        ElInput: true,
        ElTag: true,
        ElButton: { template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }
      }
    }
  })
}

async function selectFile(wrapper: ReturnType<typeof mountPanel>, file: File) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await Promise.resolve()
  await nextTick()
}

describe('LabReportTemplatePanel seal upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits only the resized and validated seal data URL', async () => {
    image.resizeSealImage.mockResolvedValue('data:image/webp;base64,aGVsbG8=')
    const wrapper = mountPanel()

    await selectFile(wrapper, new File(['png'], 'seal.png', { type: 'image/png' }))

    expect(image.resizeSealImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'seal.png' }))
    expect(wrapper.emitted('update:modelValue')).toEqual([[
      { ...defaultLabReportTemplate, statements: [...defaultLabReportTemplate.statements], sealImage: 'data:image/webp;base64,aGVsbG8=' }
    ]])
  })

  it('shows the validation error and emits nothing when resizing fails', async () => {
    image.resizeSealImage.mockRejectedValue(new Error('电子公章不能超过 512 KiB'))
    const error = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as never)
    const wrapper = mountPanel()

    await selectFile(wrapper, new File(['png'], 'seal.png', { type: 'image/png' }))

    expect(error).toHaveBeenCalledWith('电子公章不能超过 512 KiB')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
