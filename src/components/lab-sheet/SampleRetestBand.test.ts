import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SampleRetestBand from './SampleRetestBand.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { calculateSampleResults } from '@/utils/formulaEngine'
import type { SampleBlock, SampleRetest } from '@/types/labSheet'

function makeParent(overrides: Partial<SampleBlock> = {}): SampleBlock {
  const inputs: SampleBlock['inputs'] = {
    sequence: '001',
    sampleNumber: 'A-001',
    elementNote: '铁、镁'
  }
  return {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: defaultLabParameters,
    retests: [],
    ...overrides
  }
}

function makeRetest(overrides: Partial<SampleRetest> = {}): SampleRetest {
  const inputs: SampleRetest['inputs'] = {
    ironRaw: 1,
    siliconRaw: 2,
    calciumRaw: 3,
    magnesiumRaw: 4
  }
  return {
    id: 'retest-1',
    sampleBlockId: 'block-1',
    sequence: 1,
    status: 'ACTIVE',
    everFilled: false,
    readonly: false,
    sensitiveFieldsHidden: false,
    inputs,
    results: {
      iron: 27.94,
      silicon: 25.65,
      aluminum: 0,
      aluminumSiliconRatio: 0,
      total: 53.59,
      density: 0,
      calcium: 3.45,
      magnesium: 2.22,
      titanium: 0,
      bottleDensity: 0,
      moisture: 0,
      burnLoss: 0
    },
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

describe('SampleRetestBand', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('uses the shared 23-column layout with enabled input above its frozen result', () => {
    const wrapper = mount(SampleRetestBand, {
      props: { parent: makeParent(), retest: makeRetest() }
    })

    const inputFields = wrapper.findAll('input[data-retest-field]').map((input) => input.attributes('data-retest-field'))
    expect(inputFields).toEqual(['ironRaw', 'calciumRaw', 'magnesiumRaw'])
    expect(wrapper.find('input[data-retest-field="siliconRaw"]').exists()).toBe(false)

    const ironCell = wrapper.get('[data-retest-column="C"]')
    expect(ironCell.get('.sample-retest-band__input').attributes('data-retest-field')).toBe('ironRaw')
    expect(ironCell.get('.sample-retest-band__result').text()).toBe('27.94')
    expect(Array.from(ironCell.element.children).map((element) => element.className)).toEqual([
      'sample-retest-band__input',
      'sample-retest-band__result'
    ])
    expect(wrapper.attributes('style')).toContain('78px')
    expect(wrapper.attributes('style')).toContain('240px')
  })

  it('shows the sequence, parameter snapshot time, save status, and no comparison judgement', () => {
    const wrapper = mount(SampleRetestBand, {
      props: { parent: makeParent(), retest: makeRetest() }
    })

    expect(wrapper.attributes('aria-label')).toBe('复样1')
    expect(wrapper.text()).toContain('复样1')
    expect(wrapper.text()).toContain('有效')
    expect(wrapper.text()).toContain('参数快照')
    expect(wrapper.text()).toContain('已保存')
    expect(wrapper.text()).not.toMatch(/差值|偏差|合格/)
  })

  it('emits parsed updates and an exact field commit from the original value', async () => {
    const wrapper = mount(SampleRetestBand, {
      props: { parent: makeParent(), retest: makeRetest() }
    })
    const input = wrapper.get('input[data-retest-field="ironRaw"]')

    await input.trigger('focus')
    await input.setValue('1.25')
    await input.trigger('blur')

    expect(wrapper.emitted('update')).toContainEqual(['retest-1', { ironRaw: 1.25 }])
    expect(wrapper.emitted('fieldCommit')).toContainEqual(['retest-1', 'ironRaw', 1, 1.25])
  })

  it('offers delete only while blank and void only after data has ever been saved', async () => {
    const wrapper = mount(SampleRetestBand, {
      props: { parent: makeParent(), retest: makeRetest({ inputs: {} }) }
    })

    expect(wrapper.get('[data-testid="delete-retest-retest-1"]').text()).toBe('删除')
    expect(wrapper.find('[data-testid="void-retest-retest-1"]').exists()).toBe(false)
    await wrapper.get('[data-testid="delete-retest-retest-1"]').trigger('click')
    expect(wrapper.emitted('delete')).toContainEqual(['retest-1'])

    await wrapper.setProps({ retest: makeRetest({ everFilled: true }) })
    expect(wrapper.find('[data-testid="delete-retest-retest-1"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="void-retest-retest-1"]').text()).toBe('作废')
    await wrapper.get('[data-testid="void-retest-retest-1"]').trigger('click')
    expect(wrapper.emitted('void')).toContainEqual(['retest-1'])
  })

  it('switches to void as soon as a local input exists before everFilled is refreshed', () => {
    const wrapper = mount(SampleRetestBand, {
      props: {
        parent: makeParent(),
        retest: makeRetest({ everFilled: false, inputs: { ironRaw: 0 } })
      }
    })

    expect(wrapper.find('[data-testid="delete-retest-retest-1"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="void-retest-retest-1"]').text()).toBe('作废')
  })

  it.each([
    ['VOID', { status: 'VOID', everFilled: true, readonly: true }],
    ['readonly', { readonly: true }],
    ['redacted', { sensitiveFieldsHidden: true }]
  ] as const)('locks every input and lifecycle action when the retest is %s', (_label, retestOverrides) => {
    const wrapper = mount(SampleRetestBand, {
      props: {
        parent: makeParent(),
        retest: makeRetest(retestOverrides as Partial<SampleRetest>)
      }
    })

    expect(wrapper.findAll('input[data-retest-field]').every((input) => input.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.find('[data-testid^="delete-retest-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="void-retest-"]').exists()).toBe(false)
    if ('status' in retestOverrides && retestOverrides.status === 'VOID') {
      expect(wrapper.classes()).toContain('is-void')
      expect(wrapper.text()).toContain('已作废')
    }
    if ('sensitiveFieldsHidden' in retestOverrides && retestOverrides.sensitiveFieldsHidden) {
      expect(wrapper.text()).toContain('数据已加密')
    }
  })

  it('locks the band when the completed parent data is hidden', () => {
    const wrapper = mount(SampleRetestBand, {
      props: {
        parent: makeParent({ sensitiveFieldsHidden: true }),
        retest: makeRetest()
      }
    })

    expect(wrapper.findAll('input[data-retest-field]').every((input) => input.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.text()).toContain('数据已加密')
  })

  it('scrolls and focuses the first enabled input when highlighted', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    })
    const wrapper = mount(SampleRetestBand, {
      attachTo: document.body,
      props: { parent: makeParent(), retest: makeRetest(), highlighted: true }
    })

    await nextTick()
    await nextTick()

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    expect(document.activeElement).toBe(wrapper.get('input[data-retest-field="ironRaw"]').element)
    expect(wrapper.classes()).toContain('is-highlighted')
    wrapper.unmount()
  })
})
