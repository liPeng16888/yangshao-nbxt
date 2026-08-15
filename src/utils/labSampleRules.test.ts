import { describe, expect, it } from 'vitest'
import type { SampleBlock } from '@/types/labSheet'
import {
  getSampleAmountLabel,
  getSampleAmountPrecision,
  getSampleCalculationBlockMessage,
  isCompletedSampleSensitiveHidden,
  isSampleAmountRequired,
  isSampleCalculationBlocked
} from './labSampleRules'

function block(inputs: SampleBlock['inputs']): SampleBlock {
  return {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs,
    results: {
      iron: 0, silicon: 0, aluminum: 0, aluminumSiliconRatio: 0, total: 0,
      density: 0, calcium: 0, magnesium: 0, titanium: 0, bottleDensity: 0, moisture: 0, burnLoss: 0
    },
    parameterSnapshot: {
      ironBlank: 0, ironFactor: 0, siliconBlank: 0, siliconFactor: 0,
      aluminumFactor1: 0, aluminumFactor2: 0, calciumFactor: 0, magnesiumFactor: 0, titaniumFactor: 0
    }
  }
}

describe('shared lab sample rules', () => {
  it('requires amount, payment status, and elements only after sample identity is entered', () => {
    expect(isSampleAmountRequired(block({}))).toBe(false)
    expect(isSampleCalculationBlocked(block({}))).toBe(false)

    const identified = block({ sampleNumber: 'A-01' })
    expect(isSampleAmountRequired(identified)).toBe(true)
    expect(isSampleCalculationBlocked(identified)).toBe(true)
    expect(getSampleCalculationBlockMessage(identified)).toBe('请先输入样品金额、选择费用状态并选择化验元素')

    identified.inputs.price = 20
    identified.inputs.paymentStatus = '未结款'
    identified.inputs.elementNote = '铁、硅'
    expect(isSampleCalculationBlocked(identified)).toBe(false)
  })

  it('uses integer deduction counts for prepaid samples and money precision otherwise', () => {
    expect(getSampleAmountLabel(block({ paymentStatus: '预存款' }))).toBe('扣除次数')
    expect(getSampleAmountPrecision(block({ paymentStatus: '预存款' }))).toBe(0)
    expect(getSampleAmountLabel(block({ paymentStatus: '月结款' }))).toBe('样品金额')
    expect(getSampleAmountPrecision(block({ paymentStatus: '月结款' }))).toBe(2)
  })

  it('hides completed sample values until the existing access grant is present', () => {
    const completed = block({ completed: true })
    expect(isCompletedSampleSensitiveHidden(completed, false)).toBe(true)
    expect(isCompletedSampleSensitiveHidden(completed, true)).toBe(false)
    expect(isCompletedSampleSensitiveHidden(block({ completed: false }), false)).toBe(false)
  })
})
