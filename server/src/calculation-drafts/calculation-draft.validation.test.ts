import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { normalizeCalculationDraft, parseCalculationDraftKind } from './calculation-draft.validation'

const validStandard = {
  aluminum: {
    highStandard: 69.74,
    highReading: 7.7,
    lowStandard: 52,
    lowReading: 12.2,
    baseValue: 214.38
  },
  silicon: {
    lowStandard: 4.88,
    lowReading: 0.405,
    highStandard: 17.05,
    highReading: null
  },
  iron: {
    lowStandard: 6.09,
    lowReading: 0.147,
    highStandard: 15.31,
    highReading: 0.461
  }
}

const validCoefficient = {
  parameters: {
    ironBlank: 0.04,
    ironFactor: 29.1,
    siliconBlank: 0.027,
    siliconFactor: 13,
    aluminumFactor1: 0.502,
    aluminumFactor2: 4.98,
    calciumFactor: 1.15,
    magnesiumFactor: 0.556,
    titaniumFactor: 0.57
  },
  standardAddCount: 2,
  calculationAddCount: 3,
  standardRows: [{
    id: 'standard-1',
    code: 'STD-A',
    autoCode: false,
    aluminum: 12.3,
    silicon: null,
    iron: 5.2,
    calcium: 1.1,
    magnesium: 0.8,
    titanium: null
  }],
  calculationRows: [{
    id: 'calculation-1',
    code: '001',
    autoCode: true,
    inputs: {
      ironRaw: 0.2,
      siliconRaw: null,
      aluminumRaw: 2.1,
      calciumRaw: 0.4,
      magnesiumRaw: null,
      titaniumRaw: 0.3
    }
  }]
}

function withPollutedObjectPrototype<T>(key: string, value: unknown, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, key)
  Object.defineProperty(Object.prototype, key, { configurable: true, value })
  try {
    return run()
  } finally {
    if (previous) Object.defineProperty(Object.prototype, key, previous)
    else Reflect.deleteProperty(Object.prototype, key)
  }
}

describe('calculation draft validation', () => {
  it('preserves a complete standard-sample draft', () => {
    expect(normalizeCalculationDraft('STANDARD_SAMPLE', validStandard)).toEqual(validStandard)
  })

  it('rejects unknown standard-sample keys at the payload and element levels', () => {
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', { ...validStandard, injected: true }))
      .toThrow('草稿字段无效')
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', {
      ...validStandard,
      aluminum: { ...validStandard.aluminum, injected: true }
    })).toThrow('草稿字段无效')
  })

  it('rejects an inherited top-level field supplied by Object.prototype pollution', () => {
    const { parameters: _omitted, ...payloadWithoutParameters } = validCoefficient

    withPollutedObjectPrototype('parameters', validCoefficient.parameters, () => {
      expect(() => normalizeCalculationDraft('COEFFICIENT', payloadWithoutParameters))
        .toThrow('草稿字段无效')
    })
  })

  it('rejects an inherited nested input supplied by Object.prototype pollution', () => {
    const { highReading: _omitted, ...aluminumWithoutHighReading } = validStandard.aluminum

    withPollutedObjectPrototype('highReading', validStandard.aluminum.highReading, () => {
      expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', {
        ...validStandard,
        aluminum: aluminumWithoutHighReading
      })).toThrow('草稿字段无效')
    })
  })

  it('rejects an inherited row identity supplied by Object.prototype pollution', () => {
    const { id: _omitted, ...rowWithoutId } = validCoefficient.standardRows[0]

    withPollutedObjectPrototype('id', validCoefficient.standardRows[0].id, () => {
      expect(() => normalizeCalculationDraft('COEFFICIENT', {
        ...validCoefficient,
        standardRows: [rowWithoutId]
      })).toThrow('草稿字段无效')
    })
  })

  it('rejects symbol own keys', () => {
    const symbolPayload = { ...validStandard }
    Object.defineProperty(symbolPayload, Symbol('injected'), { enumerable: true, value: true })
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', symbolPayload)).toThrow('草稿字段无效')
  })

  it('rejects non-enumerable unknown own keys', () => {
    const hiddenPayload = { ...validStandard }
    Object.defineProperty(hiddenPayload, 'injected', { enumerable: false, value: true })
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', hiddenPayload)).toThrow('草稿字段无效')
  })

  it('rejects objects with custom prototypes', () => {
    const customPrototypePayload = Object.assign(Object.create({ injected: true }), validStandard)
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', customPrototypePayload)).toThrow('草稿格式无效')
  })

  it('safely rebuilds a complete null-prototype payload', () => {
    const nullPrototypePayload = Object.assign(Object.create(null), validStandard)
    const normalized = normalizeCalculationDraft('STANDARD_SAMPLE', nullPrototypePayload)
    expect(normalized).toEqual(validStandard)
    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype)
    expect(Reflect.ownKeys(normalized)).toEqual(['aluminum', 'silicon', 'iron'])
  })

  it('requires every standard-sample input to be a finite number or null', () => {
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', {
      ...validStandard,
      aluminum: { ...validStandard.aluminum, highReading: Number.POSITIVE_INFINITY }
    })).toThrow('必须是有限数字或 null')
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', {
      ...validStandard,
      iron: { ...validStandard.iron, lowReading: '0.147' }
    })).toThrow(BadRequestException)
  })

  it('preserves a complete coefficient draft', () => {
    expect(normalizeCalculationDraft('COEFFICIENT', validCoefficient)).toEqual(validCoefficient)
  })

  it('rejects unknown coefficient keys at every object level', () => {
    const cases = [
      { ...validCoefficient, injected: true },
      { ...validCoefficient, parameters: { ...validCoefficient.parameters, injected: 1 } },
      {
        ...validCoefficient,
        standardRows: [{ ...validCoefficient.standardRows[0], injected: true }]
      },
      {
        ...validCoefficient,
        calculationRows: [{ ...validCoefficient.calculationRows[0], injected: true }]
      },
      {
        ...validCoefficient,
        calculationRows: [{
          ...validCoefficient.calculationRows[0],
          inputs: { ...validCoefficient.calculationRows[0].inputs, injected: 1 }
        }]
      }
    ]

    cases.forEach((payload) => {
      expect(() => normalizeCalculationDraft('COEFFICIENT', payload)).toThrow('草稿字段无效')
    })
  })

  it('requires all nine coefficient parameters to be finite numbers', () => {
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      parameters: { ...validCoefficient.parameters, ironBlank: Number.NaN }
    })).toThrow('必须是有限数字')

    const { titaniumFactor: _omitted, ...missingParameter } = validCoefficient.parameters
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      parameters: missingParameter
    })).toThrow('草稿字段无效')
  })

  it.each([0, 51, 1.5, Number.NaN])('rejects unsupported add count %s', (count) => {
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      standardAddCount: count
    })).toThrow(BadRequestException)
  })

  it('requires one to 50 rows in each coefficient collection', () => {
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      standardRows: []
    })).toThrow('样品至少 1 项')
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      calculationRows: Array.from({ length: 51 }, (_, index) => ({
        ...validCoefficient.calculationRows[0],
        id: `calculation-${index + 1}`
      }))
    })).toThrow('样品最多 50 项')
  })

  it.each(['standardRows', 'calculationRows'] as const)('rejects sparse %s arrays', (collection) => {
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      [collection]: new Array(1)
    })).toThrow('样品格式无效')
  })

  it('requires non-empty unique row ids within each collection', () => {
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      standardRows: [{ ...validCoefficient.standardRows[0], id: '   ' }]
    })).toThrow('样品标识不能为空')
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      standardRows: [
        validCoefficient.standardRows[0],
        { ...validCoefficient.standardRows[0], code: 'STD-B' }
      ]
    })).toThrow('样品标识不能重复')
  })

  it('requires a code of at most 40 characters and a boolean autoCode', () => {
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      calculationRows: [{ ...validCoefficient.calculationRows[0], code: 'X'.repeat(41) }]
    })).toThrow('样品编号最多 40 个字符')
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      calculationRows: [{ ...validCoefficient.calculationRows[0], autoCode: 1 }]
    })).toThrow('自动编号标记必须是布尔值')
  })

  it('requires exactly the six known nullable numeric fields for both row shapes', () => {
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      standardRows: [{ ...validCoefficient.standardRows[0], aluminum: Number.NEGATIVE_INFINITY }]
    })).toThrow('必须是有限数字或 null')
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      calculationRows: [{
        ...validCoefficient.calculationRows[0],
        inputs: { ...validCoefficient.calculationRows[0].inputs, ironRaw: undefined }
      }]
    })).toThrow('必须是有限数字或 null')
  })

  it('rejects arrays and primitives where draft objects are required', () => {
    expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', [])).toThrow(BadRequestException)
    expect(() => normalizeCalculationDraft('COEFFICIENT', 'draft')).toThrow(BadRequestException)
    expect(() => normalizeCalculationDraft('COEFFICIENT', {
      ...validCoefficient,
      standardRows: [null]
    })).toThrow(BadRequestException)
  })

  it('parses only the two calculation draft kinds', () => {
    expect(parseCalculationDraftKind('STANDARD_SAMPLE')).toBe('STANDARD_SAMPLE')
    expect(parseCalculationDraftKind('COEFFICIENT')).toBe('COEFFICIENT')
    expect(() => parseCalculationDraftKind('other')).toThrow('计算草稿类型无效')
  })
})
