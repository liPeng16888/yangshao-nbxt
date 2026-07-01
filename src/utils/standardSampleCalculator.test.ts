import { describe, expect, it } from 'vitest'
import { calculateAluminumStandard, calculateRatioStandard, formatStandardNumber } from './standardSampleCalculator'

describe('standard sample calculator', () => {
  it('matches the aluminum sample values from the reference CSV', () => {
    const result = calculateAluminumStandard({
      highStandard: 69.74,
      highReading: 7.7,
      lowStandard: 52,
      lowReading: 12.2,
      baseValue: 214.38
    })

    expect(result.highProduct).toBeCloseTo(400.4, 6)
    expect(result.lowProduct).toBeCloseTo(850.828, 6)
    expect(result.difference).toBeCloseTo(450.428, 6)
    expect(result.coefficient1).toBeCloseTo(0.4759473212144895, 12)
    expect(result.coefficient2).toBeCloseTo(-5.065837567, 9)
    expect(result.backCalculatedStandard1).toBeCloseTo(72.61982318779783, 7)
  })

  it('matches the silicon sample values from the reference CSV', () => {
    const result = calculateRatioStandard({
      lowStandard: 4.88,
      lowReading: 0.405,
      highStandard: 17.05,
      highReading: 1.31
    })

    expect(result.lowProduct).toBeCloseTo(6.90525, 6)
    expect(result.highProduct).toBeCloseTo(6.3928, 6)
    expect(result.standardDelta).toBeCloseTo(12.17, 6)
    expect(result.blank).toBeCloseTo(0.04210764174198852, 12)
    expect(result.factor).toBeCloseTo(13.447513812154696, 12)
    expect(result.backCalculatedStandard1).toBeCloseTo(4.88, 12)
  })

  it('matches the iron sample values from the reference CSV', () => {
    const result = calculateRatioStandard({
      lowStandard: 6.09,
      lowReading: 0.147,
      highStandard: 15.31,
      highReading: 0.461
    })

    expect(result.lowProduct).toBeCloseTo(2.25057, 6)
    expect(result.highProduct).toBeCloseTo(2.80749, 6)
    expect(result.standardDelta).toBeCloseTo(9.22, 6)
    expect(result.blank).toBeCloseTo(-0.060403471, 9)
    expect(result.factor).toBeCloseTo(29.363057324840764, 12)
    expect(result.backCalculatedStandard1).toBeCloseTo(6.09, 12)
  })

  it('formats invalid results as blank placeholders', () => {
    expect(formatStandardNumber(Number.NaN)).toBe('-')
    expect(formatStandardNumber(1.23456, 2)).toBe('1.23')
  })
})
