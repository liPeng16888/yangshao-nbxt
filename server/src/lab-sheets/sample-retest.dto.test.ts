import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '../common/lab'
import { toSampleRetestDto } from './sample-retest.dto'

function makeRetest(overrides: Partial<Parameters<typeof toSampleRetestDto>[0]> = {}) {
  return {
    id: 'retest-1',
    sampleBlockId: 'block-1',
    sequence: 1,
    inputs: { ironRaw: 1 },
    results: { iron: 999 },
    parameterSnapshot: { ...defaultLabParameters, ironFactor: 10 },
    everFilled: true,
    status: 'ACTIVE' as const,
    voidReason: null,
    createdById: 'user-1',
    updatedById: 'user-1',
    voidedById: null,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    voidedAt: null,
    ...overrides
  }
}

describe('toSampleRetestDto', () => {
  it('recalculates a retest from its own snapshot and redacts it with a completed parent', () => {
    const row = makeRetest()

    const visible = toSampleRetestDto(row, {
      parentCompleted: true,
      sheetReadonly: false,
      canViewCompletedSensitiveData: true
    })
    expect(visible.results.iron).toBe(9.6)
    expect(visible.readonly).toBe(false)

    const hidden = toSampleRetestDto(row, {
      parentCompleted: true,
      sheetReadonly: false,
      canViewCompletedSensitiveData: false
    })
    expect(hidden.sensitiveFieldsHidden).toBe(true)
    expect(hidden.inputs.ironRaw).toBeNull()
    expect(hidden.results.iron).toBeNull()
    expect(hidden.parameterSnapshot).toBeNull()
    expect(visible.parameterSnapshot).toEqual(row.parameterSnapshot)
  })

  it('marks void and historical retests readonly', () => {
    expect(toSampleRetestDto(makeRetest({ status: 'VOID' }), {
      parentCompleted: false,
      sheetReadonly: false,
      canViewCompletedSensitiveData: true
    }).readonly).toBe(true)
    expect(toSampleRetestDto(makeRetest(), {
      parentCompleted: false,
      sheetReadonly: true,
      canViewCompletedSensitiveData: true
    }).readonly).toBe(true)
  })
})
