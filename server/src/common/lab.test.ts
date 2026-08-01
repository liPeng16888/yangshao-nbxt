import { describe, expect, it } from 'vitest'
import { calculateResults, createEmptyInputs, defaultLabParameters, hasLabDetectionInput } from './lab'

describe('server lab helpers', () => {
  it('creates empty sample inputs with padded sequence', () => {
    expect(createEmptyInputs(3)).toMatchObject({
      sequence: '003',
      completed: false,
      sampleNumber: '',
      customerText: '',
      recipientCustomerIds: [],
      recipientCustomers: [],
      recipientCustomerText: '',
      price: null,
      paymentStatus: ''
    })
  })

  it('calculates finite results and accepts negative raw inputs', () => {
    const result = calculateResults({ ironRaw: -1, siliconRaw: -11.5, aluminumRaw: 3 }, defaultLabParameters)
    expect(Number.isFinite(result.iron)).toBe(true)
    expect(Number.isFinite(result.silicon)).toBe(true)
    expect(Number.isFinite(result.aluminum)).toBe(true)
  })

  it('detects manually entered element calculation data', () => {
    expect(hasLabDetectionInput({ sampleNumber: 'A-001', customerText: '客户甲', price: 20, paymentStatus: '未结款' })).toBe(false)
    expect(hasLabDetectionInput({ ironRaw: 0 })).toBe(true)
    expect(hasLabDetectionInput({ calciumRaw: '0.8' })).toBe(true)
    expect(hasLabDetectionInput({ moisture: 4.268 })).toBe(true)
  })

  it('uses directly entered moisture instead of deriving it again', () => {
    const result = calculateResults(
      { moisture: 4.268, waterSample: 1, bottleWater: 2, bottleWaterSample: 2.5 },
      defaultLabParameters
    )

    expect(result.moisture).toBe(4.268)
  })

  it('does not calculate moisture from sample and bottle measurements', () => {
    const result = calculateResults(
      { waterSample: 0.5, bottleWater: 1, bottleWaterSample: 1.4 },
      defaultLabParameters
    )

    expect(result.moisture).toBe(0)
  })
})
