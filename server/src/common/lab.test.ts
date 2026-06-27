import { describe, expect, it } from 'vitest'
import { calculateResults, createEmptyInputs, defaultLabParameters } from './lab'

describe('server lab helpers', () => {
  it('creates empty sample inputs with padded sequence', () => {
    expect(createEmptyInputs(3)).toMatchObject({
      sequence: '003',
      sampleNumber: '',
      customerText: '',
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
})
