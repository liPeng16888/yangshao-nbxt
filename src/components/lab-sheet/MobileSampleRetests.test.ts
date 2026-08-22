// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { SampleBlock, SampleRetest } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import MobileSampleRetests from './MobileSampleRetests.vue'

function makeRetest(sequence: number, overrides: Partial<SampleRetest> = {}): SampleRetest {
  const inputs: SampleRetest['inputs'] = sequence === 1 ? {} : { ironRaw: 0.5 }
  return {
    id: `retest-${sequence}`,
    sampleBlockId: 'block-1',
    sequence,
    status: 'ACTIVE',
    everFilled: sequence !== 1,
    readonly: false,
    sensitiveFieldsHidden: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: { ...defaultLabParameters, savedAt: `2026-08-20T0${sequence}:10:00.000Z` },
    voidReason: null,
    createdById: 'main-1',
    updatedById: 'main-1',
    voidedById: null,
    createdAt: `2026-08-20T0${sequence}:00:00.000Z`,
    updatedAt: `2026-08-20T0${sequence}:20:00.000Z`,
    voidedAt: null,
    ...overrides
  }
}

function makeParent(retests: SampleRetest[] = [makeRetest(1), makeRetest(2)], overrides: Partial<SampleBlock> = {}): SampleBlock {
  const inputs: SampleBlock['inputs'] = {
    sequence: '001',
    sampleNumber: '铝土矿 A',
    elementNote: '铁、镁'
  }
  return {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: { ...defaultLabParameters },
    retests,
    ...overrides
  }
}

function mountRetests(parent = makeParent(), overrides: Record<string, unknown> = {}) {
  return mount(MobileSampleRetests, {
    props: {
      parent,
      readonly: false,
      highlightRetestId: '',
      pendingRetestActionIds: [],
      ...overrides
    }
  })
}

function installScrollIntoViewMock(implementation: (this: HTMLElement) => void = () => undefined) {
  const mock = vi.fn(implementation)
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: mock
  })
  return mock
}

describe('MobileSampleRetests', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('expands the sorted records, edits one retest, and exposes delete or void by lifecycle', async () => {
    const wrapper = mountRetests(makeParent([makeRetest(2), makeRetest(1)]))
    const toggle = wrapper.get('[data-testid="mobile-retests-toggle"]')

    expect(toggle.text()).toContain('复样记录（2）')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')

    expect(wrapper.findAll('[data-retest-id]').map((card) => card.attributes('data-retest-id'))).toEqual([
      'retest-1',
      'retest-2'
    ])
    const iron = wrapper.get('[data-retest-id="retest-1"] input[data-retest-field="ironRaw"]')
    await iron.trigger('focus')
    await iron.setValue('1')
    await iron.trigger('blur')

    expect(wrapper.emitted('update')).toContainEqual(['retest-1', { ironRaw: 1 }])
    expect(wrapper.emitted('fieldCommit')).toContainEqual(['retest-1', 'ironRaw', null, 1])
    expect(wrapper.get('[data-retest-id="retest-1"]').text()).toContain('删除')
    expect(wrapper.get('[data-retest-id="retest-2"]').text()).toContain('作废')
  })

  it('uses only the shared parent-element mapping and shows frozen results without comparison text', async () => {
    const retest = makeRetest(1, {
      inputs: { ironRaw: 1, siliconRaw: 2, calciumRaw: 3, magnesiumRaw: 4 },
      results: {
        ...calculateSampleResults({ ironRaw: 1, siliconRaw: 2, calciumRaw: 3, magnesiumRaw: 4 }, defaultLabParameters),
        iron: 27.94,
        silicon: 25.65,
        calcium: 3.45,
        magnesium: 2.22
      }
    })
    const wrapper = mountRetests(makeParent([retest]))
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')

    expect(wrapper.findAll('input[data-retest-field]').map((input) => input.attributes('data-retest-field'))).toEqual([
      'ironRaw',
      'calciumRaw',
      'magnesiumRaw'
    ])
    expect(wrapper.find('input[data-retest-field="siliconRaw"]').exists()).toBe(false)
    expect(wrapper.get('[data-retest-field-card="ironRaw"] output').text()).toBe('27.94')
    expect(wrapper.text()).toContain('参数快照')
    expect(wrapper.text()).toContain('创建时间')
    expect(wrapper.text()).not.toMatch(/差值|偏差|合格/)
  })

  it('offers the complete calculation form when the parent has no element selection', async () => {
    const wrapper = mountRetests(makeParent([makeRetest(1, {
      inputs: { ironRaw: 1 },
      results: {
        ...calculateSampleResults({ ironRaw: 1 }, defaultLabParameters),
        iron: 27.94
      }
    })], {
      inputs: { sequence: '001', sampleNumber: '铝土矿 A', elementNote: '' }
    }))

    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')

    expect(wrapper.findAll('input[data-retest-field]')).toHaveLength(19)
    expect(wrapper.get('input[data-retest-field="ironRaw"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-retest-field-card="ironRaw"] output').text()).toBe('27.94')
    expect(wrapper.get('[data-retest-result-card="aluminumSiliconRatio"] output').text()).toBe('0.00')
  })

  it('shows shared output-only formula results for the selected parent element', async () => {
    const retest = makeRetest(1, {
      inputs: { ironRaw: 1, siliconRaw: 2, aluminumRaw: 3 },
      results: {
        ...calculateSampleResults({ ironRaw: 1, siliconRaw: 2, aluminumRaw: 3 }, defaultLabParameters),
        aluminumSiliconRatio: 1.5,
        total: 44.25
      }
    })
    const wrapper = mountRetests(makeParent([retest], {
      inputs: { sequence: '001', elementNote: '铝硅比' }
    }))
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')

    expect(wrapper.get('[data-retest-result-card="aluminumSiliconRatio"] output').text()).toBe('1.50')
    expect(wrapper.get('[data-retest-result-card="total"] output').text()).toBe('44.25')
  })

  it('counts VOID records and renders their status as readonly', async () => {
    const voided = makeRetest(2, {
      status: 'VOID',
      readonly: true,
      voidReason: '重测污染',
      voidedAt: '2026-08-20T03:00:00.000Z'
    })
    const wrapper = mountRetests(makeParent([makeRetest(1), voided]))

    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').text()).toContain('复样记录（2）')
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')
    const card = wrapper.get('[data-retest-id="retest-2"]')
    expect(card.classes()).toContain('is-void')
    expect(card.text()).toContain('已作废')
    expect(card.text()).toContain('重测污染')
    expect(card.findAll('input').every((input) => input.attributes('disabled') !== undefined)).toBe(true)
    expect(card.find('[data-testid^="delete-retest-"]').exists()).toBe(false)
    expect(card.find('[data-testid^="void-retest-"]').exists()).toBe(false)
  })

  it.each([
    ['history', { readonly: true }, {}, {}],
    ['readonly parent', {}, { readonly: true }, {}],
    ['readonly retest', {}, {}, { readonly: true }]
  ] as const)('locks inputs and lifecycle actions for %s', async (_label, propsOverrides, parentOverrides, retestOverrides) => {
    const wrapper = mountRetests(
      makeParent([makeRetest(1, retestOverrides as Partial<SampleRetest>)], parentOverrides as Partial<SampleBlock>),
      propsOverrides
    )
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')

    expect(wrapper.findAll('input[data-retest-field]').every((input) => input.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('[data-testid^="delete-retest-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="void-retest-"]').exists()).toBe(false)
  })

  it('suppresses sensitive inputs and result values from the DOM', async () => {
    const retest = makeRetest(1, {
      inputs: { ironRaw: 91.234 },
      results: { ...calculateSampleResults({ ironRaw: 91.234 }, defaultLabParameters), iron: 88.765 }
    })
    const wrapper = mountRetests(makeParent([retest]), { sensitiveHidden: true })
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')

    expect(wrapper.text()).toContain('数据已加密')
    expect(wrapper.find('input[data-retest-field]').exists()).toBe(false)
    expect(wrapper.find('output').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('91.234')
    expect(wrapper.html()).not.toContain('88.765')
  })

  it('commits zero as entered data and switches lifecycle from delete to void after local state updates', async () => {
    const retest = reactive(makeRetest(1, { inputs: {}, everFilled: false }))
    const wrapper = mountRetests(makeParent([retest]))
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')
    const input = wrapper.get('input[data-retest-field="ironRaw"]')

    await input.trigger('focus')
    await input.setValue('0')
    retest.inputs.ironRaw = 0
    await nextTick()
    await input.trigger('blur')

    expect(wrapper.emitted('fieldCommit')).toContainEqual(['retest-1', 'ironRaw', null, 0])
    expect(wrapper.find('[data-testid="delete-retest-retest-1"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="void-retest-retest-1"]').text()).toBe('作废')
  })

  it('locks only the pending retest card until its deferred lifecycle action settles', async () => {
    const wrapper = mountRetests(makeParent([makeRetest(1), makeRetest(2)]), {
      pendingRetestActionIds: ['retest-1']
    })
    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')
    const pendingCard = wrapper.get('[data-retest-id="retest-1"]')
    const pendingButton = pendingCard.get('[data-testid="delete-retest-retest-1"]')
    const pendingInput = pendingCard.get<HTMLInputElement>('input[data-retest-field="ironRaw"]')

    expect(pendingCard.attributes('aria-busy')).toBe('true')
    expect(pendingCard.classes()).toContain('is-locked')
    expect(pendingInput.attributes('disabled')).toBeDefined()
    expect(pendingButton.attributes('disabled')).toBeDefined()
    expect(pendingButton.text()).toBe('处理中…')
    pendingInput.element.value = '9'
    await pendingInput.trigger('input')
    await pendingInput.trigger('blur')
    await pendingButton.trigger('click')
    expect(wrapper.emitted('update')).toBeUndefined()
    expect(wrapper.emitted('fieldCommit')).toBeUndefined()
    expect(wrapper.emitted('delete')).toBeUndefined()

    const independentInput = wrapper.get('[data-retest-id="retest-2"] input[data-retest-field="ironRaw"]')
    expect(independentInput.attributes('disabled')).toBeUndefined()
    await independentInput.trigger('focus')
    await independentInput.setValue('2')
    await independentInput.trigger('blur')
    expect(wrapper.emitted('update')).toContainEqual(['retest-2', { ironRaw: 2 }])
    expect(wrapper.emitted('fieldCommit')).toContainEqual(['retest-2', 'ironRaw', 0.5, 2])

    await wrapper.setProps({ pendingRetestActionIds: [] })
    expect(pendingInput.attributes('disabled')).toBeUndefined()
    await pendingInput.trigger('focus')
    await pendingInput.setValue('1')
    await pendingInput.trigger('blur')
    expect(wrapper.emitted('update')).toContainEqual(['retest-1', { ironRaw: 1 }])
    expect(wrapper.emitted('fieldCommit')).toContainEqual(['retest-1', 'ironRaw', null, 1])
  })

  it('expands, scrolls, and focuses only the latest highlighted retest after rapid changes', async () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const scrolledRetestIds: string[] = []
    installScrollIntoViewMock(function () {
      scrolledRetestIds.push((this as HTMLElement).dataset.retestId || '')
    })
    const wrapper = mount(MobileSampleRetests, {
      attachTo: document.body,
      props: {
        parent: makeParent(),
        highlightRetestId: ''
      }
    })

    await wrapper.setProps({ highlightRetestId: 'retest-1' })
    await wrapper.setProps({ highlightRetestId: 'retest-2' })
    await nextTick()
    await nextTick()

    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(scrolledRetestIds).toEqual(['retest-2'])
    expect(focusSpy).toHaveBeenCalledTimes(1)
    expect((document.activeElement as HTMLElement | null)?.closest('[data-retest-id]')?.getAttribute('data-retest-id')).toBe('retest-2')

    focusSpy.mockRestore()
    wrapper.unmount()
  })

  it('cancels deferred highlight focus when the target is cleared', async () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const scrollSpy = installScrollIntoViewMock()
    const wrapper = mount(MobileSampleRetests, {
      attachTo: document.body,
      props: { parent: makeParent(), highlightRetestId: '' }
    })

    await wrapper.setProps({ highlightRetestId: 'retest-1' })
    await wrapper.setProps({ highlightRetestId: '' })
    await nextTick()
    await nextTick()

    expect(focusSpy).not.toHaveBeenCalled()
    expect(scrollSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('waits for an absent highlight once, consumes it, and ignores later sibling collection changes', async () => {
    const focusSpy = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const scrollSpy = installScrollIntoViewMock()
    const parent = reactive(makeParent([makeRetest(1)]))
    const wrapper = mount(MobileSampleRetests, {
      attachTo: document.body,
      props: { parent, highlightRetestId: 'retest-3' }
    })
    await nextTick()
    await nextTick()
    expect(focusSpy).not.toHaveBeenCalled()

    parent.retests.push(makeRetest(3))
    await nextTick()
    await nextTick()
    await nextTick()
    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(focusSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-testid="mobile-retests-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('false')
    parent.retests.push(makeRetest(2))
    await nextTick()
    await nextTick()
    await nextTick()
    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('false')
    expect(focusSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ highlightRetestId: '' })
    await wrapper.setProps({ highlightRetestId: 'retest-3' })
    await nextTick()
    await nextTick()
    await nextTick()
    expect(wrapper.get('[data-testid="mobile-retests-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(focusSpy).toHaveBeenCalledTimes(2)
    expect(scrollSpy).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

})
