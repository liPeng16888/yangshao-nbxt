// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus, { ElMessage } from 'element-plus'
import { createPinia } from 'pinia'
import LabReportDialog from './LabReportDialog.vue'
import LabSmsDialog from './LabSmsDialog.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { defaultLabReportSmsTemplate, defaultLabReportTemplate } from '@/utils/labReport'

function makeBlock(id: string, elementNote: string): SampleBlock {
  const inputs: SampleBlock['inputs'] = {
    sequence: id === 'block-1' ? '001' : '002',
    sampleNumber: '',
    customerText: '',
    customerIds: [],
    customers: [],
    paymentStatus: '已结款',
    price: 20,
    elementNote
  }

  return {
    id,
    index: id === 'block-1' ? 1 : 2,
    readonly: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: defaultLabParameters,
    retests: []
  }
}

const blocks = [makeBlock('block-1', '三氧化二铝、全硫、比重'), makeBlock('block-2', '')]
const selectedBlockIds = blocks.map((block) => block.id)

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}

describe('lab report and SMS element defaults', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'execCommand')
  })

  it('prefills report element selections from each sample lab element field', async () => {
    const wrapper = mount(LabReportDialog, {
      props: {
        visible: true,
        blocks,
        selectedBlockIds,
        template: defaultLabReportTemplate,
        date: '2026-07-31'
      },
      global: { plugins: [createPinia(), ElementPlus] }
    })

    await wrapper.vm.$nextTick()
    const groups = wrapper.findAllComponents({ name: 'ElCheckboxGroup' })

    expect(groups[1].props('modelValue')).toEqual(['aluminum', 'sulfur', 'density'])
    expect(groups[2].props('modelValue')).toEqual([])
  })

  it('prefills SMS element selections from each sample lab element field', async () => {
    const wrapper = mount(LabSmsDialog, {
      props: {
        visible: true,
        blocks,
        selectedBlockIds,
        template: defaultLabReportSmsTemplate
      },
      global: { plugins: [createPinia(), ElementPlus] }
    })

    await wrapper.vm.$nextTick()
    const groups = wrapper.findAllComponents({ name: 'ElCheckboxGroup' })

    expect(groups[1].props('modelValue')).toEqual(['aluminum', 'sulfur', 'density'])
    expect(groups[2].props('modelValue')).toEqual([])
  })

  it('uses the selection fallback when copying a generated SMS after Clipboard API failure', async () => {
    const smsBlock = makeBlock('block-1', '铝')
    smsBlock.inputs.sampleNumber = '手机样品'
    smsBlock.results.aluminum = 68
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    const success = vi.spyOn(ElMessage, 'success')
    const wrapper = mount(LabSmsDialog, {
      props: {
        visible: true,
        blocks: [smsBlock],
        selectedBlockIds: [smsBlock.id],
        template: defaultLabReportSmsTemplate
      },
      global: { plugins: [ElementPlus] }
    })

    await wrapper.vm.$nextTick()
    const createButton = wrapper.findAll('button').find((button) => button.text().includes('生成短信'))
    await createButton!.trigger('click')
    await wrapper.vm.$nextTick()
    const copyButton = wrapper.findAll('button').find((button) => button.text().includes('复制短信'))
    await copyButton!.trigger('click')
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledWith('手机样品\n铝68')
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(success).toHaveBeenCalledWith('短信内容已复制')
  })
})
