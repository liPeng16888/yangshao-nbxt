import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { calculateSampleResults, formatFormulaValue } from './formulaEngine'

describe('calculateSampleResults', () => {
  it('returns zero for empty inputs and never exposes invalid formula values', () => {
    const result = calculateSampleResults({}, defaultLabParameters)

    expect(Object.values(result).every((value) => Number.isFinite(value))).toBe(true)
    expect(Object.values(result).every((value) => value === 0)).toBe(true)
    expect(formatFormulaValue(0)).toBe('0.00')
    expect(formatFormulaValue(Number.POSITIVE_INFINITY)).toBe('0.00')
    expect(formatFormulaValue(Number.NaN)).toBe('0.00')
  })

  it('calculates core metal formulas from the saved parameter snapshot', () => {
    const result = calculateSampleResults(
      {
        ironRaw: 0.08,
        siliconRaw: 0.08,
        siliconAdjust: 0.5,
        aluminumRaw: 0.5,
        aluminumAdjust: 0.1,
        calciumRaw: 1,
        magnesiumRaw: 2,
        titaniumRaw: 3
      },
      defaultLabParameters
    )

    expect(result.iron).toBe(1.164)
    expect(result.silicon).toBe(1.189)
    expect(result.aluminum).toBeCloseTo(87.547, 4)
    expect(result.aluminumSiliconRatio).toBeCloseTo(73.6308, 4)
    expect(result.total).toBeCloseTo(89.9, 4)
    expect(result.calcium).toBe(1.15)
    expect(result.magnesium).toBe(0.556)
    expect(result.titanium).toBe(1.71)
  })

  it('guards divisions by zero for density, moisture, and burn loss', () => {
    const result = calculateSampleResults(
      {
        densityRaw: 0,
        waterSample: 1,
        bottleWater: 2,
        bottleWaterSample: 3,
        sampleWeight: 0,
        crucible: 1,
        burnedCrucibleSample: 1
      },
      defaultLabParameters
    )

    expect(result.density).toBe(0)
    expect(result.moisture).toBe(0)
    expect(result.burnLoss).toBe(0)
  })

  it('uses directly entered moisture instead of the derived moisture formula', () => {
    const result = calculateSampleResults(
      {
        moisture: 4.268,
        waterSample: 1,
        bottleWater: 2,
        bottleWaterSample: 2.5
      },
      defaultLabParameters
    )

    expect(result.moisture).toBe(4.268)
  })

  it('calculates bottle density independently from directly entered moisture', () => {
    const result = calculateSampleResults(
      {
        moisture: 4.268,
        waterSample: 1,
        bottleWater: 2,
        bottleWaterSample: 2.5
      },
      defaultLabParameters
    )

    expect(result.moisture).toBe(4.268)
    expect(result.bottleDensity).toBe(1.9965)
  })

  it('does not derive moisture from sample and bottle measurements', () => {
    const result = calculateSampleResults(
      {
        waterSample: 0.5,
        bottleWater: 1,
        bottleWaterSample: 1.4
      },
      defaultLabParameters
    )

    expect(result.moisture).toBe(0)
  })
})
