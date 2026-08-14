import { flushPromises, mount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LabSmsDialog from './LabSmsDialog.vue'
import { writeTextToClipboard } from '@/utils/clipboard'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { defaultLabReportSmsTemplate } from '@/utils/labReport'
import type { SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'

vi.mock('@/utils/clipboard', () => ({
  writeTextToClipboard: vi.fn()
}))

function mountPreview() {
  const inputs: SampleBlock['inputs'] = {
    sequence: '001',
    sampleNumber: '样品001',
    customerText: '',
    customerIds: [],
    customers: [],
    paymentStatus: '已结款',
    price: 20,
    elementNote: '铝'
  }
  const block: SampleBlock = {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: defaultLabParameters
  }
  return mount(LabSmsDialog, {
    props: {
      visible: true,
      blocks: [block],
      selectedBlockIds: [block.id],
      template: defaultLabReportSmsTemplate
    },
    global: {
      stubs: {
        ElDialog: { template: '<div><slot /><slot name="footer" /></div>' },
        ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
        ElInput: { props: ['modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        ElAlert: true,
        ElCheckbox: true,
        ElCheckboxGroup: true
      }
    }
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(writeTextToClipboard).mockReset()
})

describe('LabSmsDialog copy action', () => {
  it('prevents a second pending click and shows one success toast', async () => {
    let resolveCopy!: () => void
    vi.mocked(writeTextToClipboard).mockReturnValueOnce(new Promise<void>((resolve) => { resolveCopy = resolve }))
    const success = vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)
    const wrapper = mountPreview()
    await wrapper.findAll('button').filter((button) => button.text() === '生成短信')[0].trigger('click')
    await wrapper.find('textarea').setValue('化验短信')
    await wrapper.findAll('button').filter((button) => button.text() === '复制短信')[0].trigger('click')
    await wrapper.findAll('button').filter((button) => button.text() === '复制短信')[0].trigger('click')

    expect(writeTextToClipboard).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('button').filter((button) => button.text() === '复制短信').every((button) => button.attributes('disabled') !== undefined)).toBe(true)

    resolveCopy()
    await flushPromises()
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('shows one error toast when copying fails', async () => {
    vi.mocked(writeTextToClipboard).mockRejectedValueOnce(new Error('复制失败'))
    const error = vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as never)
    const wrapper = mountPreview()
    await wrapper.findAll('button').filter((button) => button.text() === '生成短信')[0].trigger('click')
    await wrapper.find('textarea').setValue('化验短信')

    await wrapper.findAll('button').filter((button) => button.text() === '复制短信')[0].trigger('click')
    await flushPromises()

    expect(error).toHaveBeenCalledTimes(1)
  })
})
