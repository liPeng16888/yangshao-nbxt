// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSampleInput, SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import MobileLabSampleList from './MobileLabSampleList.vue'

function makeBlock(id: string, index: number, inputs: LabSampleInput = {}): SampleBlock {
  return {
    id,
    index,
    readonly: false,
    inputs: { sequence: String(index).padStart(3, '0'), ...inputs },
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: { ...defaultLabParameters }
  }
}

function mountList(overrides: Record<string, unknown> = {}) {
  const blocks = [
    makeBlock('block-1', 1, {
      sampleNumber: '铝土矿 A', customerText: '张总', price: 20, paymentStatus: '未结款', elementNote: '铁、硅、铝',
      ironRaw: 0.1, siliconRaw: 0.08, siliconAdjust: 0.5, aluminumRaw: 0.5, aluminumAdjust: 0.1,
      sulfur: 0.02, densityRaw: 2, whiteness: 80, calciumRaw: 0.4, magnesiumRaw: 0.7, carbon: 0.1, titaniumRaw: 0.2,
      waterSample: 10, bottleWater: 20, bottleWaterSample: 25, moisture: 4.268,
      crucible: 20, sampleWeight: 2, burnedCrucibleSample: 21.5
    }),
    makeBlock('block-2', 2)
  ]
  return mount(MobileLabSampleList, {
    props: {
      blocks,
      readonly: false,
      selectionMode: false,
      selectedBlockIds: [],
      highlightBlockId: '',
      canViewCompletedSensitiveData: true,
      ...overrides
    },
    global: {
      stubs: {
        CustomerCellEditor: {
          template: '<button class="customer-editor-stub" type="button">客户</button>'
        },
        LabElementSelector: {
          template: '<button class="element-selector-stub" type="button">元素</button>'
        }
      }
    }
  })
}

describe('MobileLabSampleList', () => {
  it('shows exactly one expanded card with all four field groups and shared formula results', () => {
    const wrapper = mountList()

    expect(wrapper.findAll('.mobile-sample-card--expanded')).toHaveLength(1)
    expect(wrapper.get('.mobile-sample-card--expanded').attributes('data-block-id')).toBe('block-1')
    expect(wrapper.text()).toContain('金属元素')
    expect(wrapper.text()).toContain('比重 / 白度')
    expect(wrapper.text()).toContain('水份')
    expect(wrapper.text()).toContain('灼烧')
    expect(wrapper.find('[data-mobile-field="ironRaw"]').attributes('inputmode')).toBe('decimal')
    expect(wrapper.find('[data-mobile-field="burnedCrucibleSample"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('铝硅比')
    expect(wrapper.text()).toContain(calculateSampleResults(wrapper.props('blocks')[0].inputs, defaultLabParameters).total.toFixed(2))
  })

  it('emits parsed updates and commits, then saves and expands the next sample', async () => {
    const wrapper = mountList()
    const iron = wrapper.get('input[data-mobile-field="ironRaw"]')

    await iron.trigger('focus')
    await iron.setValue('0.125')
    await iron.trigger('blur')

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { ironRaw: 0.125 }])
    expect(wrapper.emitted('fieldCommit')).toContainEqual(['block-1', 'ironRaw', 0.1, 0.125])

    await wrapper.get('.mobile-save-next').trigger('click')
    await nextTick()

    expect(wrapper.emitted('saveNext')).toContainEqual(['block-1'])
    expect(wrapper.get('.mobile-sample-card--expanded').attributes('data-block-id')).toBe('block-2')
  })

  it('opens and highlights a route-targeted sample and keeps readonly history disabled', () => {
    const wrapper = mountList({ highlightBlockId: 'block-2', readonly: true })

    expect(wrapper.get('.mobile-sample-card--expanded').attributes('data-block-id')).toBe('block-2')
    expect(wrapper.get('[data-block-id="block-2"]').classes()).toContain('mobile-sample-card--highlight')
    expect(wrapper.findAll('input').every((input) => input.attributes('disabled') !== undefined)).toBe(true)
  })

  it('hides completed detection and payment values until the existing access grant is provided', async () => {
    const completed = makeBlock('block-1', 1, {
      completed: true,
      sampleNumber: '已完成样品', price: 30, paymentStatus: '已结款', elementNote: '铁', ironRaw: 0.2
    })
    const wrapper = mountList({ blocks: [completed], canViewCompletedSensitiveData: false })

    expect(wrapper.find('.mobile-sensitive-lock').exists()).toBe(true)
    expect(wrapper.find('[data-mobile-field="ironRaw"]').exists()).toBe(false)
    expect(wrapper.find('[data-mobile-field="price"]').exists()).toBe(false)
    expect(wrapper.find('[data-mobile-field="sampleNumber"]').exists()).toBe(true)

    await wrapper.setProps({ canViewCompletedSensitiveData: true })
    expect(wrapper.find('[data-mobile-field="ironRaw"]').exists()).toBe(true)
    expect(wrapper.find('[data-mobile-field="price"]').exists()).toBe(true)
  })

  it('supports card selection mode and reports the checked sample', async () => {
    const wrapper = mountList({ selectionMode: true })
    const checkbox = wrapper.get('input[type="checkbox"][data-selection-block="block-1"]')
    await checkbox.setValue(true)

    expect(wrapper.emitted('selectionChange')).toContainEqual(['block-1', true])
  })
})
