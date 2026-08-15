import { BadRequestException } from '@nestjs/common'
import type {
  AluminumStandardDraftInputs,
  CalculationDraftKind,
  CalculationDraftParameters,
  CalculationDraftPayloadByKind,
  CoefficientCalculationInputs,
  CoefficientCalculationRow,
  CoefficientDraftPayload,
  CoefficientStandardRow,
  RatioStandardDraftInputs,
  StandardSampleDraftPayload
} from './calculation-draft.types'

const draftKinds = ['STANDARD_SAMPLE', 'COEFFICIENT'] as const
const standardPayloadKeys = ['aluminum', 'silicon', 'iron'] as const
const aluminumInputKeys = ['highStandard', 'highReading', 'lowStandard', 'lowReading', 'baseValue'] as const
const ratioInputKeys = ['lowStandard', 'lowReading', 'highStandard', 'highReading'] as const
const parameterKeys = [
  'ironBlank',
  'ironFactor',
  'siliconBlank',
  'siliconFactor',
  'aluminumFactor1',
  'aluminumFactor2',
  'calciumFactor',
  'magnesiumFactor',
  'titaniumFactor'
] as const
const standardRowValueKeys = ['aluminum', 'silicon', 'iron', 'calcium', 'magnesium', 'titanium'] as const
const calculationInputKeys = ['ironRaw', 'siliconRaw', 'aluminumRaw', 'calciumRaw', 'magnesiumRaw', 'titaniumRaw'] as const
const coefficientPayloadKeys = ['parameters', 'standardAddCount', 'calculationAddCount', 'standardRows', 'calculationRows'] as const
const standardRowKeys = ['id', 'code', 'autoCode', ...standardRowValueKeys] as const
const calculationRowKeys = ['id', 'code', 'autoCode', 'inputs'] as const

type PlainObject = Record<string, unknown>

export function parseCalculationDraftKind(value: unknown): CalculationDraftKind {
  if (typeof value !== 'string' || !draftKinds.includes(value as CalculationDraftKind)) {
    throw new BadRequestException('计算草稿类型无效')
  }
  return value as CalculationDraftKind
}

export function normalizeCalculationDraft<K extends CalculationDraftKind>(
  kind: K,
  payload: unknown
): CalculationDraftPayloadByKind[K] {
  const parsedKind = parseCalculationDraftKind(kind)
  return (parsedKind === 'STANDARD_SAMPLE'
    ? normalizeStandardSampleDraft(payload)
    : normalizeCoefficientDraft(payload)) as CalculationDraftPayloadByKind[K]
}

function normalizeStandardSampleDraft(payload: unknown): StandardSampleDraftPayload {
  const source = requirePlainObject(payload)
  requireAllowedKeys(source, standardPayloadKeys)
  return {
    aluminum: normalizeNullableNumbers<AluminumStandardDraftInputs>(source.aluminum, aluminumInputKeys),
    silicon: normalizeNullableNumbers<RatioStandardDraftInputs>(source.silicon, ratioInputKeys),
    iron: normalizeNullableNumbers<RatioStandardDraftInputs>(source.iron, ratioInputKeys)
  }
}

function normalizeCoefficientDraft(payload: unknown): CoefficientDraftPayload {
  const source = requirePlainObject(payload)
  requireAllowedKeys(source, coefficientPayloadKeys)
  return {
    parameters: normalizeParameters(source.parameters),
    standardAddCount: requireAddCount(source.standardAddCount),
    calculationAddCount: requireAddCount(source.calculationAddCount),
    standardRows: normalizeRows(source.standardRows, normalizeStandardRow),
    calculationRows: normalizeRows(source.calculationRows, normalizeCalculationRow)
  }
}

function normalizeParameters(value: unknown): CalculationDraftParameters {
  const source = requirePlainObject(value)
  requireAllowedKeys(source, parameterKeys)
  return Object.fromEntries(parameterKeys.map((key) => [key, requireFiniteNumber(source[key])])) as unknown as CalculationDraftParameters
}

function normalizeStandardRow(source: PlainObject): CoefficientStandardRow {
  requireAllowedKeys(source, standardRowKeys)
  return {
    ...normalizeRowIdentity(source),
    ...normalizeNullableNumbers<Pick<CoefficientStandardRow, typeof standardRowValueKeys[number]>>(
      source,
      standardRowValueKeys,
      false
    )
  }
}

function normalizeCalculationRow(source: PlainObject): CoefficientCalculationRow {
  requireAllowedKeys(source, calculationRowKeys)
  return {
    ...normalizeRowIdentity(source),
    inputs: normalizeNullableNumbers<CoefficientCalculationInputs>(source.inputs, calculationInputKeys)
  }
}

function normalizeRowIdentity(source: PlainObject) {
  if (typeof source.id !== 'string' || !source.id.trim()) {
    throw new BadRequestException('样品标识不能为空')
  }
  if (typeof source.code !== 'string') {
    throw new BadRequestException('样品编号必须是字符串')
  }
  if (source.code.length > 40) {
    throw new BadRequestException('样品编号最多 40 个字符')
  }
  if (typeof source.autoCode !== 'boolean') {
    throw new BadRequestException('自动编号标记必须是布尔值')
  }
  return {
    id: source.id.trim(),
    code: source.code,
    autoCode: source.autoCode
  }
}

function normalizeRows<T>(value: unknown, normalizeRow: (source: PlainObject) => T): T[] {
  if (!Array.isArray(value)) throw new BadRequestException('样品必须是数组')
  if (value.length < 1) throw new BadRequestException('样品至少 1 项')
  if (value.length > 50) throw new BadRequestException('样品最多 50 项')
  const ids = new Set<string>()
  return value.map((row) => {
    const normalized = normalizeRow(requirePlainObject(row))
    const id = (normalized as { id: string }).id
    if (ids.has(id)) throw new BadRequestException('样品标识不能重复')
    ids.add(id)
    return normalized
  })
}

function normalizeNullableNumbers<T>(
  value: unknown,
  keys: readonly string[],
  validateKeys = true
): T {
  const source = requirePlainObject(value)
  if (validateKeys) requireAllowedKeys(source, keys)
  return Object.fromEntries(keys.map((key) => [key, requireNullableFiniteNumber(source[key])])) as T
}

function requireAllowedKeys(source: PlainObject, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys)
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new BadRequestException('草稿字段无效')
  }
}

function requirePlainObject(value: unknown): PlainObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('草稿格式无效')
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new BadRequestException('草稿格式无效')
  }
  return value as PlainObject
}

function requireFiniteNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException('参数必须是有限数字')
  }
  return value
}

function requireNullableFiniteNumber(value: unknown) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new BadRequestException('输入必须是有限数字或 null')
  }
  return value as number | null
}

function requireAddCount(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 50) {
    throw new BadRequestException('添加数量必须是 1 至 50 的整数')
  }
  return value as number
}
