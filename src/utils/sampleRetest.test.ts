import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { SampleRetest } from '@/types/labSheet'
import {
  enabledRetestFields,
  hasRetestInput,
  isRetestColumnEnabled,
  retestGridColumns
} from './sampleRetest'

const redactedRetestContract = {
  id: 'retest-redacted',
  sampleBlockId: 'block-1',
  sequence: 1,
  status: 'ACTIVE',
  everFilled: true,
  readonly: false,
  sensitiveFieldsHidden: true,
  inputs: { ironRaw: null },
  results: {
    iron: null, silicon: null, aluminum: null, aluminumSiliconRatio: null, total: null,
    density: null, calcium: null, magnesium: null, titanium: null, bottleDensity: null,
    moisture: null, burnLoss: null
  },
  parameterSnapshot: defaultLabParameters,
  voidReason: null,
  createdById: 'user-1',
  updatedById: 'user-1',
  voidedById: null,
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
  voidedAt: null
} satisfies SampleRetest

describe('sample retest shared grid mapping', () => {
  it('models the always-present nullable protected wire response', () => {
    expect(redactedRetestContract.results.iron).toBeNull()
    expect(redactedRetestContract).toHaveProperty('sensitiveFieldsHidden', true)
    expect(redactedRetestContract).toHaveProperty('voidReason', null)
    expect(redactedRetestContract).toHaveProperty('voidedById', null)
    expect(redactedRetestContract).toHaveProperty('voidedAt', null)
  })

  it('maps parent element selection to every required retest input', () => {
    expect(enabledRetestFields('铁、硅、铝硅比、镁、水份、灼减')).toEqual(expect.arrayContaining([
      'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust',
      'calciumRaw', 'magnesiumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample',
      'moisture', 'crucible', 'sampleWeight', 'burnedCrucibleSample'
    ]))
    expect(enabledRetestFields('铁')).not.toContain('titaniumRaw')
  })

  it('falls back to the complete calculation mapping when no parent element is selected', () => {
    expect(enabledRetestFields('')).toHaveLength(19)
    expect(retestGridColumns.every((column) => isRetestColumnEnabled('', column))).toBe(true)
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
