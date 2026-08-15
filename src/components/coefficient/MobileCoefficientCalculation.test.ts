// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useCoefficientCalculation } from '@/composables/useCoefficientCalculation'
import MobileCoefficientCalculation from './MobileCoefficientCalculation.vue'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') }
}))

function mountMobile() {
  const calculation = useCoefficientCalculation()
  return {
    calculation,
    wrapper: mount(MobileCoefficientCalculation, {
      props: { calculation, disabled: false, applicationLoading: false }
    })
  }
}

async function expand(wrapper: ReturnType<typeof mountMobile>['wrapper'], key: string) {
  await wrapper.get(`[data-testid="mobile-coefficient-toggle-${key}"]`).trigger('click')
  await nextTick()
}

describe('MobileCoefficientCalculation', () => {
  it('snapshots and applies the complete normalized draft without object aliasing', () => {
    const source = useCoefficientCalculation()
    source.standardRows[0].aluminum = 6.25
    source.calculationRows[0].inputs.ironRaw = 0.5
    const payload = source.snapshot()
    const target = useCoefficientCalculation()

    target.apply(payload)
    payload.standardRows[0].aluminum = 99
    payload.calculationRows[0].inputs.ironRaw = 99

    expect(target.snapshot()).toMatchObject({
      parameters: expect.objectContaining({ ironBlank: 0.04, titaniumFactor: 0.57 }),
      standardAddCount: 1,
      calculationAddCount: 1
    })
    expect(target.standardRows[0].aluminum).toBe(6.25)
    expect(target.calculationRows[0].inputs.ironRaw).toBe(0.5)
    expect(target.snapshot().standardRows).not.toBe(target.standardRows)
    expect(target.snapshot().calculationRows[0].inputs).not.toBe(target.calculationRows[0].inputs)
  })

  it('renders three accessible sections collapsed by default without horizontal table markup', () => {
    const { wrapper } = mountMobile()
    const sections = wrapper.findAll('[data-testid="mobile-coefficient-section"]')

    expect(sections).toHaveLength(3)
    expect(sections.map((section) => section.get('strong').text())).toEqual(['标样含量', '标样系数计算', '九项参数'])
    expect(wrapper.findAll('[data-testid^="mobile-coefficient-toggle-"]').every((toggle) => toggle.attributes('aria-expanded') === 'false')).toBe(true)
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('shows six decimal content inputs and preserves the initial automatic code', async () => {
    const { wrapper } = mountMobile()
    await expand(wrapper, 'standard')

    const card = wrapper.get('[data-testid="mobile-standard-card-standard-1"]')
    expect(card.text()).toContain('001')
    expect(card.findAll('input[inputmode="decimal"]')).toHaveLength(6)
    expect(card.findAll('input').every((input) => input.classes().includes('mobile-touch-target'))).toBe(true)
  })

  it('shows six raw inputs and the six existing calculated results', async () => {
    const { wrapper, calculation } = mountMobile()
    calculation.calculationRows[0].inputs.ironRaw = 0.5
    await expand(wrapper, 'calculation')

    const card = wrapper.get('[data-testid="mobile-calculation-card-calculation-1"]')
    expect(card.text()).toContain('铁')
    expect(card.findAll('input[inputmode="decimal"]')).toHaveLength(6)
    expect(card.findAll('[data-testid^="mobile-calculation-result-"]')).toHaveLength(6)
    expect(card.text()).toContain('13.39')
  })

  it('keeps standard and calculation additions and deletion selections independent', async () => {
    const { wrapper, calculation } = mountMobile()
    await expand(wrapper, 'standard')
    await expand(wrapper, 'calculation')

    await wrapper.get('[data-testid="mobile-add-standard-rows"]').trigger('click')
    expect(calculation.standardRows).toHaveLength(4)
    expect(calculation.calculationRows).toHaveLength(3)

    await wrapper.get('[data-testid="mobile-delete-standard-rows"]').trigger('click')
    expect(wrapper.find('.mobile-action-bar').exists()).toBe(true)
    await wrapper.get('[data-testid="mobile-select-all-standard-rows"]').setValue(true)
    expect(calculation.selectedStandardRowIds.value).toHaveLength(4)
    expect(calculation.selectedCalculationRowIds.value).toHaveLength(0)
    expect(wrapper.text()).toContain('至少保留一个样品')
  })

  it('renders all nine parameter controls with decimal keyboards and 44px touch classes', async () => {
    const { wrapper } = mountMobile()
    await expand(wrapper, 'parameters')

    const section = wrapper.get('[data-testid="mobile-coefficient-content-parameters"]')
    expect(section.findAll('input[inputmode="decimal"]')).toHaveLength(9)
    expect(section.findAll('input').every((input) => input.classes().includes('mobile-touch-target'))).toBe(true)
  })
})
