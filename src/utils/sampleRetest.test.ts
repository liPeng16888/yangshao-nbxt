import { describe, expect, it } from 'vitest'
import {
  enabledRetestFields,
  hasRetestInput,
  isRetestColumnEnabled,
  retestGridColumns
} from './sampleRetest'

describe('sample retest shared grid mapping', () => {
  it('maps parent element selection to every required retest input', () => {
    expect(enabledRetestFields('铁、硅、铝硅比、镁、水份、灼减')).toEqual(expect.arrayContaining([
      'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust',
      'calciumRaw', 'magnesiumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample',
      'moisture', 'crucible', 'sampleWeight', 'burnedCrucibleSample'
    ]))
    expect(enabledRetestFields('铁')).not.toContain('titaniumRaw')
  })

  it('treats zero as entered data and never exposes difference columns', () => {
    expect(hasRetestInput({ ironRaw: 0 })).toBe(true)
    expect(hasRetestInput({ ironRaw: Number.NaN })).toBe(false)
    expect(hasRetestInput({ ironRaw: Number.POSITIVE_INFINITY })).toBe(false)
    expect(retestGridColumns.some((column) => /差值|偏差|合格/.test(column.label))).toBe(false)
  })

  it('shares exactly the C through W input/result metadata with element dependencies', () => {
    expect(retestGridColumns).toHaveLength(21)
    expect(retestGridColumns.map((column) => column.key)).toEqual([
      'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
      'Q', 'R', 'S', 'T', 'U', 'V', 'W'
    ])
    expect(retestGridColumns.find((column) => column.key === 'C')).toMatchObject({
      inputField: 'ironRaw', resultField: 'iron'
    })
    expect(retestGridColumns.find((column) => column.key === 'Q')).toMatchObject({
      inputField: 'waterSample', resultField: 'bottleDensity'
    })
    expect(retestGridColumns.find((column) => column.key === 'U')).toMatchObject({
      inputField: 'crucible', resultField: 'burnLoss'
    })

    const calcium = retestGridColumns.find((column) => column.inputField === 'calciumRaw')!
    const siliconAdjust = retestGridColumns.find((column) => column.inputField === 'siliconAdjust')!
    expect(isRetestColumnEnabled('镁', calcium)).toBe(true)
    expect(isRetestColumnEnabled('A/S', siliconAdjust)).toBe(true)
  })
})
