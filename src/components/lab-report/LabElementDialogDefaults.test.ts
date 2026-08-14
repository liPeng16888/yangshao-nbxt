// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ElementPlus from 'element-plus'
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
    parameterSnapshot: defaultLabParameters
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
})
