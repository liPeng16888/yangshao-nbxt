// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSampleInput, SampleBlock, SampleRetest } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import MobileLabSampleList from './MobileLabSampleList.vue'

function makeBlock(id: string, index: number, inputs: LabSampleInput = {}): SampleBlock {
  return {
    id,
    index,
    readonly: false,
    inputs: { sequence: String(index).padStart(3, '0'), ...inputs },
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: { ...defaultLabParameters },
    retests: []
  }
}

function makeRetest(sampleBlockId: string, sequence: number, overrides: Partial<SampleRetest> = {}): SampleRetest {
  const inputs: SampleRetest['inputs'] = sequence === 1 ? {} : { ironRaw: 0.5 }
  return {
    id: `retest-${sequence}`,
    sampleBlockId,
    sequence,
    status: 'ACTIVE',
    everFilled: sequence !== 1,
    readonly: false,
    sensitiveFieldsHidden: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: { ...defaultLabParameters, savedAt: '2026-08-20T09:15:00.000Z' },
    voidReason: null,
    createdById: 'main-1',
    updatedById: 'main-1',
    voidedById: null,
    createdAt: '2026-08-20T09:15:00.000Z',
    updatedAt: '2026-08-20T09:16:00.000Z',
    voidedAt: null,
    ...overrides
  }
}

function mountList(overrides: Record<string, unknown> = {}, attachTo?: Element) {
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
    attachTo,
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

function mountListWithLiveUpdates() {
  const blocks = ref([
    makeBlock('block-1', 1, {
      sampleNumber: '连续输入样品',
      customerText: '张总',
      price: 6,
      paymentStatus: '已结款',
      elementNote: '铁'
    })
  ])
  const Host = defineComponent({
    setup() {
      function applyUpdate(blockId: string, patch: Partial<LabSampleInput>) {
        blocks.value = blocks.value.map((block) => block.id === blockId
          ? {
              ...block,
              inputs: { ...block.inputs, ...patch },
              results: calculateSampleResults({ ...block.inputs, ...patch }, block.parameterSnapshot)
            }
          : block)
      }

      return () => h(MobileLabSampleList, {
        blocks: blocks.value,
        canViewCompletedSensitiveData: true,
        onUpdate: applyUpdate
      })
    }
  })

  return mount(Host, {
    attachTo: document.body,
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

function installScrollIntoViewMock() {
  const mock = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: mock
  })
  return mock
}

describe('MobileLabSampleList', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('opens one sample with sample information and calculation data collapsed by default', async () => {
    const wrapper = mountList()

    expect(wrapper.findAll('.mobile-sample-card--expanded')).toHaveLength(1)
    expect(wrapper.get('.mobile-sample-card--expanded').attributes('data-block-id')).toBe('block-1')
    expect(wrapper.findAll('.mobile-group-toggle').map((toggle) => toggle.text())).toEqual([
      expect.stringContaining('样品信息'),
      expect.stringContaining('检测数据')
    ])
    expect(wrapper.findAll('.mobile-group-toggle').every((toggle) => toggle.attributes('aria-expanded') === 'false')).toBe(true)
    expect(wrapper.findAll('.mobile-calculation-group--expanded')).toHaveLength(0)
    expect(wrapper.find('[data-mobile-field="sequence"]').exists()).toBe(false)
    expect(wrapper.find('[data-mobile-field="ironRaw"]').exists()).toBe(false)
    expect(wrapper.find('[data-mobile-field="burnedCrucibleSample"]').exists()).toBe(false)

    await getGroupToggle(wrapper, '样品信息').trigger('click')
    expect(wrapper.find('[data-mobile-field="sequence"]').exists()).toBe(true)

    await getGroupToggle(wrapper, '检测数据').trigger('click')

    expect(wrapper.find('[data-mobile-field="ironRaw"]').attributes('inputmode')).toBe('decimal')
    expect(wrapper.text()).toContain('铝硅比')
    expect(wrapper.text()).toContain(calculateSampleResults(wrapper.props('blocks')[0].inputs, defaultLabParameters).total.toFixed(2))
  })

  it('splits sample information into compact tabs with basic fields selected first', async () => {
    const wrapper = mountList()

    await getGroupToggle(wrapper, '样品信息').trigger('click')

    const tablist = wrapper.get('[role="tablist"][aria-label="样品信息分类"]')
    const tabs = tablist.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['基础', '客户', '结算'])
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(wrapper.get('[role="tabpanel"]').attributes('data-mobile-identity-panel')).toBe('basic')
    expect(wrapper.get('[role="tabpanel"]').findAll('[data-mobile-field]').map((field) => field.attributes('data-mobile-field'))).toEqual([
      'sequence', 'sampleNumber', 'elementNote', 'note'
    ])
    expect(wrapper.find('.mobile-customer-editor').exists()).toBe(false)
    expect(wrapper.find('[data-mobile-field="price"]').exists()).toBe(false)
  })

  it('shows only customer or settlement controls when their sample-information tab is selected', async () => {
    const wrapper = mountList()

    await getGroupToggle(wrapper, '样品信息').trigger('click')
    await getIdentityTab(wrapper, '客户').trigger('click')

    expect(getIdentityTab(wrapper, '客户').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[role="tabpanel"]').attributes('data-mobile-identity-panel')).toBe('customers')
    expect(wrapper.get('[role="tabpanel"]').findAll('[data-mobile-field]').map((field) => field.attributes('data-mobile-field'))).toEqual([
      'customerText', 'recipientCustomerText'
    ])
    expect(wrapper.findAll('.mobile-customer-editor')).toHaveLength(2)
    expect(wrapper.find('[data-mobile-field="sequence"]').exists()).toBe(false)

    await getIdentityTab(wrapper, '结算').trigger('click')

    expect(getIdentityTab(wrapper, '结算').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[role="tabpanel"]').attributes('data-mobile-identity-panel')).toBe('settlement')
    expect(wrapper.get('[role="tabpanel"]').findAll('[data-mobile-field]').map((field) => field.attributes('data-mobile-field'))).toEqual([
      'price', 'paymentStatus'
    ])
    expect(wrapper.find('.mobile-customer-editor').exists()).toBe(false)
    expect(wrapper.text()).toContain('金额和结款状态将随当前样品自动保存')
  })

  it('keeps sample-information tabs independent and resets a reopened sample to basic', async () => {
    const wrapper = mountList({ selectionMode: true })
    const firstCard = wrapper.get('[data-block-id="block-1"]')

    await getGroupToggle(firstCard, '样品信息').trigger('click')
    await getIdentityTab(firstCard, '客户').trigger('click')
    await wrapper.findAll('.mobile-sample-card__toggle')[1].trigger('click')
    const secondCard = wrapper.get('[data-block-id="block-2"]')
    await getGroupToggle(secondCard, '样品信息').trigger('click')

    expect(getIdentityTab(firstCard, '客户').attributes('aria-selected')).toBe('true')
    expect(getIdentityTab(secondCard, '基础').attributes('aria-selected')).toBe('true')

    await wrapper.findAll('.mobile-sample-card__toggle')[0].trigger('click')
    await wrapper.findAll('.mobile-sample-card__toggle')[0].trigger('click')
    await getGroupToggle(wrapper.get('[data-block-id="block-1"]'), '样品信息').trigger('click')

    expect(getIdentityTab(wrapper.get('[data-block-id="block-1"]'), '基础').attributes('aria-selected')).toBe('true')
  })

  it('groups calculation fields and results into the requested ordered tabs with metal selected first', async () => {
    const wrapper = mountList()

    await getGroupToggle(wrapper, '检测数据').trigger('click')

    const tablist = wrapper.get('[role="tablist"][aria-label="检测数据分类"]')
    const tabs = tablist.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['金属元素', '微量元素', '比重/白度', '水份', '灼烧'])
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(wrapper.get('[role="tabpanel"][data-mobile-calculation-panel]').attributes('data-mobile-calculation-panel')).toBe('metal')
    expect(wrapper.get('[data-mobile-group="metal"]').findAll('input[data-mobile-field]').map((input) => input.attributes('data-mobile-field'))).toEqual([
      'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust'
    ])
    expect(wrapper.text()).toContain('铝硅比')
    expect(wrapper.text()).toContain(calculateSampleResults(wrapper.props('blocks')[0].inputs, defaultLabParameters).total.toFixed(2))
  })

  it('places sulfur, calcium, magnesium, carbon and titanium in the micro-elements tab', async () => {
    const wrapper = mountList()

    await getGroupToggle(wrapper, '检测数据').trigger('click')
    await getCalculationTab(wrapper, '微量元素').trigger('click')

    expect(wrapper.get('[data-mobile-group="otherElements"]').findAll('input[data-mobile-field]').map((input) => input.attributes('data-mobile-field'))).toEqual([
      'sulfur', 'calciumRaw', 'magnesiumRaw', 'carbon', 'titaniumRaw'
    ])

    await getCalculationTab(wrapper, '金属元素').trigger('click')

    expect(wrapper.get('[data-mobile-group="metal"]').findAll('input[data-mobile-field]').map((input) => input.attributes('data-mobile-field'))).toEqual([
      'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust'
    ])
  })

  it('keeps calculation tabs independent and resets a reopened sample to metal', async () => {
    const wrapper = mountList({ selectionMode: true })
    const firstCard = wrapper.get('[data-block-id="block-1"]')

    await getGroupToggle(firstCard, '检测数据').trigger('click')
    await getCalculationTab(firstCard, '微量元素').trigger('click')
    await wrapper.findAll('.mobile-sample-card__toggle')[1].trigger('click')
    const secondCard = wrapper.get('[data-block-id="block-2"]')
    await getGroupToggle(secondCard, '检测数据').trigger('click')

    expect(getCalculationTab(firstCard, '微量元素').attributes('aria-selected')).toBe('true')
    expect(getCalculationTab(secondCard, '金属元素').attributes('aria-selected')).toBe('true')

    await wrapper.findAll('.mobile-sample-card__toggle')[0].trigger('click')
    await wrapper.findAll('.mobile-sample-card__toggle')[0].trigger('click')
    await getGroupToggle(wrapper.get('[data-block-id="block-1"]'), '检测数据').trigger('click')

    expect(getCalculationTab(wrapper.get('[data-block-id="block-1"]'), '金属元素').attributes('aria-selected')).toBe('true')
  })

  it('emits parsed updates and commits, then saves and expands the next sample', async () => {
    const wrapper = mountList()
    await getGroupToggle(wrapper, '检测数据').trigger('click')
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

  it('keeps the raw amount draft and focus while parsed updates flow back from the parent', async () => {
    const wrapper = mountListWithLiveUpdates()
    const list = wrapper.getComponent(MobileLabSampleList)
    const identityToggle = list.findAll('.mobile-group-toggle').find((button) => button.text().includes('样品信息'))
    if (!identityToggle) throw new Error('Missing mobile sample information toggle')
    await identityToggle.trigger('click')
    await getIdentityTab(list, '结算').trigger('click')
    const amount = list.get<HTMLInputElement>('input[data-mobile-field="price"]')
    const input = amount.element

    input.focus()
    input.value = '1'
    await amount.trigger('input')
    await nextTick()

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('1')

    input.value = '12'
    await amount.trigger('input')
    await nextTick()
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('12')

    input.value = '12.3'
    await amount.trigger('input')
    await nextTick()
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('12.3')

    input.blur()
    await nextTick()
    expect(input.value).toBe('12.30')

    wrapper.unmount()
  })

  it('opens and highlights a route-targeted sample and keeps readonly history disabled', async () => {
    const wrapper = mountList({ highlightBlockId: 'block-2', readonly: true })

    expect(wrapper.get('.mobile-sample-card--expanded').attributes('data-block-id')).toBe('block-2')
    expect(wrapper.get('[data-block-id="block-2"]').classes()).toContain('mobile-sample-card--highlight')
    await getGroupToggle(wrapper, '样品信息').trigger('click')
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
    expect(wrapper.find('[data-mobile-field="sampleNumber"]').exists()).toBe(false)

    await getGroupToggle(wrapper, '样品信息').trigger('click')
    expect(wrapper.find('[data-mobile-field="sampleNumber"]').exists()).toBe(true)

    await wrapper.setProps({ canViewCompletedSensitiveData: true })
    await getIdentityTab(wrapper, '结算').trigger('click')
    await getGroupToggle(wrapper, '检测数据').trigger('click')
    expect(wrapper.find('[data-mobile-field="ironRaw"]').exists()).toBe(true)
    expect(wrapper.find('[data-mobile-field="price"]').exists()).toBe(true)
  })

  it('supports card selection mode and reports the checked sample', async () => {
    const wrapper = mountList({ selectionMode: true })
    const checkbox = wrapper.get('input[type="checkbox"][data-selection-block="block-1"]')
    await checkbox.setValue(true)

    expect(wrapper.emitted('selectionChange')).toContainEqual(['block-1', true])
  })

  it('keeps selected lab elements visible in collapsed sample headers', async () => {
    const wrapper = mountList()

    await wrapper.findAll('.mobile-sample-card__toggle')[0].trigger('click')

    expect(wrapper.get('[data-block-id="block-1"] .mobile-sample-card__elements').text()).toBe('化验元素：铁、硅、铝')
    expect(wrapper.get('[data-block-id="block-2"] .mobile-sample-card__elements').text()).toBe('化验元素：未选择')
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

  it('marks customer controls for mobile-sized touch targets', async () => {
    const wrapper = mountList()
    await getGroupToggle(wrapper, '样品信息').trigger('click')
    await getIdentityTab(wrapper, '客户').trigger('click')

    expect(wrapper.findAll('.mobile-customer-editor')).toHaveLength(2)
  })

  it('forwards mobile retest edits, zero commits, delete, and void with the parent block id', async () => {
    const parent = makeBlock('block-1', 1, { sampleNumber: '复样样品', elementNote: '铁' })
    parent.retests = [makeRetest(parent.id, 1), makeRetest(parent.id, 2)]
    const wrapper = mountList({ blocks: [parent] })

    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')
    const input = wrapper.get('[data-retest-id="retest-1"] input[data-retest-field="ironRaw"]')
    await input.trigger('focus')
    await input.setValue('0')
    await input.trigger('blur')
    await wrapper.get('[data-testid="delete-retest-retest-1"]').trigger('click')
    await wrapper.get('[data-testid="void-retest-retest-2"]').trigger('click')

    expect(wrapper.emitted('retestUpdate')).toContainEqual(['block-1', 'retest-1', { ironRaw: 0 }])
    expect(wrapper.emitted('retestFieldCommit')).toContainEqual(['block-1', 'retest-1', 'ironRaw', null, 0])
    expect(wrapper.emitted('retestDelete')).toContainEqual(['block-1', 'retest-1'])
    expect(wrapper.emitted('retestVoid')).toContainEqual(['block-1', 'retest-2'])
  })

  it('expands the highlighted retest parent and retest area, then focuses the enabled input', async () => {
    const scrollSpy = installScrollIntoViewMock()
    const first = makeBlock('block-1', 1, { elementNote: '铁' })
    const second = makeBlock('block-2', 2, { elementNote: '铁' })
    second.retests = [makeRetest(second.id, 2)]
    const wrapper = mountList({
      blocks: [first, second],
      highlightRetestId: 'retest-2'
    }, document.body)
    await nextTick()
    await nextTick()

    expect(expandedBlockIds(wrapper)).toContain('block-2')
    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('true')
    expect((document.activeElement as HTMLElement | null)?.closest('[data-retest-id]')?.getAttribute('data-retest-id')).toBe('retest-2')
    expect(scrollSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('consumes a list-level retest highlight after the target first appears', async () => {
    const scrollSpy = installScrollIntoViewMock()
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const parent = reactive(makeBlock('block-1', 1, { elementNote: '铁' }))
    const wrapper = mountList({
      blocks: [parent],
      highlightRetestId: 'retest-3'
    }, document.body)

    await wrapper.get('.mobile-sample-card__toggle').trigger('click')
    expect(expandedBlockIds(wrapper)).toEqual([])
    parent.retests.push(makeRetest(parent.id, 3))
    await nextTick()
    await nextTick()
    await nextTick()
    expect(expandedBlockIds(wrapper)).toEqual(['block-1'])
    expect(focusSpy).toHaveBeenCalledTimes(1)

    await wrapper.get('.mobile-sample-card__toggle').trigger('click')
    parent.retests.push(makeRetest(parent.id, 2))
    await nextTick()
    await nextTick()
    await nextTick()
    expect(expandedBlockIds(wrapper)).toEqual([])
    expect(focusSpy).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ highlightRetestId: '' })
    await wrapper.setProps({ highlightRetestId: 'retest-3' })
    await nextTick()
    await nextTick()
    await nextTick()
    expect(expandedBlockIds(wrapper)).toEqual(['block-1'])
    expect(focusSpy).toHaveBeenCalledTimes(2)
    expect(scrollSpy).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not replay a consumed retest highlight when its parent is collapsed, replaced, and reopened', async () => {
    const scrollSpy = installScrollIntoViewMock()
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const parent = makeBlock('block-1', 1, { elementNote: '铁' })
    parent.retests = [makeRetest(parent.id, 1)]
    const wrapper = mountList({
      blocks: [parent],
      highlightRetestId: 'retest-1'
    }, document.body)
    const retestScrollCount = () => scrollSpy.mock.instances.filter((element) => (
      element instanceof HTMLElement && element.dataset.retestId === 'retest-1'
    )).length

    await nextTick()
    await nextTick()
    await nextTick()
    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(focusSpy).toHaveBeenCalledTimes(1)
    expect(retestScrollCount()).toBe(1)

    await wrapper.get('.mobile-sample-card__toggle').trigger('click')
    expect(wrapper.find('[data-testid="mobile-retests-toggle"]').exists()).toBe(false)
    await wrapper.setProps({
      blocks: [{
        ...parent,
        inputs: { ...parent.inputs },
        retests: parent.retests.map((retest) => ({
          ...retest,
          inputs: { ...retest.inputs },
          results: { ...retest.results }
        }))
      }]
    })
    await wrapper.get('.mobile-sample-card__toggle').trigger('click')
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('false')
    expect(focusSpy).toHaveBeenCalledTimes(1)
    expect(retestScrollCount()).toBe(1)
    wrapper.unmount()
  })

  it('keeps completed retest values out of the DOM until the existing access grant is present', async () => {
    const parent = makeBlock('block-1', 1, { completed: true, elementNote: '铁' })
    parent.retests = [makeRetest(parent.id, 1, {
      inputs: { ironRaw: 91.234 },
      results: { ...calculateSampleResults({ ironRaw: 91.234 }, defaultLabParameters), iron: 88.765 }
    })]
    const wrapper = mountList({ blocks: [parent], canViewCompletedSensitiveData: false })

    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')
    expect(wrapper.text()).toContain('数据已加密')
    expect(wrapper.find('[data-retest-id] input').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('91.234')
    expect(wrapper.html()).not.toContain('88.765')

    await wrapper.setProps({ canViewCompletedSensitiveData: true })
    expect(wrapper.find('[data-retest-id] input[data-retest-field="ironRaw"]').exists()).toBe(true)
  })

  it('passes history and lifecycle pending locks through to mobile retest cards', async () => {
    const parent = makeBlock('block-1', 1, { elementNote: '铁' })
    parent.retests = [makeRetest(parent.id, 2)]
    const wrapper = mountList({
      blocks: [parent],
      readonly: true,
      pendingRetestActionIds: ['retest-2']
    })
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')

    expect(wrapper.get('[data-retest-id="retest-2"] input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="void-retest-retest-2"]').exists()).toBe(false)
  })
})

function expandedBlockIds(wrapper: ReturnType<typeof mountList>) {
  return wrapper.findAll('.mobile-sample-card--expanded').map((card) => card.attributes('data-block-id'))
}

function getGroupToggle(wrapper: { findAll: ReturnType<typeof mountList>['findAll'] }, label: string) {
  const toggle = wrapper.findAll('.mobile-group-toggle').find((button) => button.text().includes(label))
  if (!toggle) throw new Error(`Missing mobile group toggle: ${label}`)
  return toggle
}

function getIdentityTab(wrapper: { findAll: ReturnType<typeof mountList>['findAll'] }, label: string) {
  const tab = wrapper.findAll('[role="tab"]').find((button) => button.text() === label)
  if (!tab) throw new Error(`Missing sample information tab: ${label}`)
  return tab
}

function getCalculationTab(wrapper: { findAll: ReturnType<typeof mountList>['findAll'] }, label: string) {
  const tab = wrapper.findAll('.mobile-calculation-tab').find((button) => button.text() === label)
  if (!tab) throw new Error(`Missing calculation data tab: ${label}`)
  return tab
}
