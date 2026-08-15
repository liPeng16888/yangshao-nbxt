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
  it('opens one sample with all five calculation groups collapsed by default', async () => {
    const wrapper = mountList()

    expect(wrapper.findAll('.mobile-sample-card--expanded')).toHaveLength(1)
    expect(wrapper.get('.mobile-sample-card--expanded').attributes('data-block-id')).toBe('block-1')
    expect(wrapper.findAll('.mobile-group-toggle').map((toggle) => toggle.text())).toEqual([
      expect.stringContaining('金属元素'),
      expect.stringContaining('比重 / 白度'),
      expect.stringContaining('其他元素'),
      expect.stringContaining('水份'),
      expect.stringContaining('灼烧')
    ])
    expect(wrapper.findAll('.mobile-group-toggle').every((toggle) => toggle.attributes('aria-expanded') === 'false')).toBe(true)
    expect(wrapper.findAll('.mobile-calculation-group--expanded')).toHaveLength(0)
    expect(wrapper.find('[data-mobile-field="ironRaw"]').exists()).toBe(false)
    expect(wrapper.find('[data-mobile-field="burnedCrucibleSample"]').exists()).toBe(false)

    await getGroupToggle(wrapper, '金属元素').trigger('click')

    expect(wrapper.find('[data-mobile-field="ironRaw"]').attributes('inputmode')).toBe('decimal')
    expect(wrapper.text()).toContain('铝硅比')
    expect(wrapper.text()).toContain(calculateSampleResults(wrapper.props('blocks')[0].inputs, defaultLabParameters).total.toFixed(2))
  })

  it('places sulfur, calcium, magnesium, carbon and titanium in an independent element group', async () => {
    const wrapper = mountList()

    await getGroupToggle(wrapper, '其他元素').trigger('click')

    expect(wrapper.get('[data-mobile-group="otherElements"]').findAll('input[data-mobile-field]').map((input) => input.attributes('data-mobile-field'))).toEqual([
      'sulfur', 'calciumRaw', 'magnesiumRaw', 'carbon', 'titaniumRaw'
    ])

    await getGroupToggle(wrapper, '金属元素').trigger('click')

    expect(wrapper.get('[data-mobile-group="metal"]').findAll('input[data-mobile-field]').map((input) => input.attributes('data-mobile-field'))).toEqual([
      'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust'
    ])
  })

  it('toggles calculation groups independently and resets them after reopening the sample', async () => {
    const wrapper = mountList()

    await getGroupToggle(wrapper, '金属元素').trigger('click')
    await getGroupToggle(wrapper, '比重 / 白度').trigger('click')
    expect(wrapper.findAll('.mobile-calculation-group--expanded')).toHaveLength(2)

    await wrapper.findAll('.mobile-sample-card__toggle')[0].trigger('click')
    await wrapper.findAll('.mobile-sample-card__toggle')[0].trigger('click')

    expect(wrapper.findAll('.mobile-calculation-group--expanded')).toHaveLength(0)
    expect(wrapper.findAll('.mobile-group-toggle').every((toggle) => toggle.attributes('aria-expanded') === 'false')).toBe(true)
  })

  it('emits parsed updates and commits, then saves and expands the next sample', async () => {
    const wrapper = mountList()
    await getGroupToggle(wrapper, '金属元素').trigger('click')
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
    expect(wrapper.findAll('.mobile-calculation-group--expanded')).toHaveLength(0)
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
    await getGroupToggle(wrapper, '金属元素').trigger('click')
    expect(wrapper.find('[data-mobile-field="ironRaw"]').exists()).toBe(true)
    expect(wrapper.find('[data-mobile-field="price"]').exists()).toBe(true)
  })

  it('supports card selection mode and reports the checked sample', async () => {
    const wrapper = mountList({ selectionMode: true })
    const checkbox = wrapper.get('input[type="checkbox"][data-selection-block="block-1"]')
    await checkbox.setValue(true)

    expect(wrapper.emitted('selectionChange')).toContainEqual(['block-1', true])
  })

  it('independently expands multiple samples and allows every sample to collapse', async () => {
    const wrapper = mountList({ selectionMode: true })
    const toggles = wrapper.findAll('.mobile-sample-card__toggle')

    expect(expandedBlockIds(wrapper)).toEqual(['block-1'])

    await toggles[1].trigger('click')
    await nextTick()
    expect(expandedBlockIds(wrapper)).toEqual(['block-1', 'block-2'])

    await toggles[0].trigger('click')
    await nextTick()
    expect(expandedBlockIds(wrapper)).toEqual(['block-2'])

    await toggles[1].trigger('click')
    await nextTick()
    expect(expandedBlockIds(wrapper)).toEqual([])
  })

  it('marks customer controls for mobile-sized touch targets', () => {
    const wrapper = mountList()

    expect(wrapper.findAll('.mobile-customer-editor')).toHaveLength(2)
  })
})

function expandedBlockIds(wrapper: ReturnType<typeof mountList>) {
  return wrapper.findAll('.mobile-sample-card--expanded').map((card) => card.attributes('data-block-id'))
}

function getGroupToggle(wrapper: ReturnType<typeof mountList>, label: string) {
  const toggle = wrapper.findAll('.mobile-group-toggle').find((button) => button.text().includes(label))
  if (!toggle) throw new Error(`Missing mobile group toggle: ${label}`)
  return toggle
}
