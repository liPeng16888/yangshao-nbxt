import axios from 'axios'
import request from '@/utils/request'
import type {
  CalculationDraft,
  CalculationDraftKind,
  CalculationDraftSaveRequest,
  CalculationDraftServerKind,
  CalculationRow,
  CoefficientDraftPayload,
  StandardContentRow,
  StandardSampleDraft
} from '@/types/calculationDraft'

const aluminumKeys = ['highStandard', 'highReading', 'lowStandard', 'lowReading', 'baseValue'] as const
const ratioKeys = ['lowStandard', 'lowReading', 'highStandard', 'highReading'] as const
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
const elementKeys = ['aluminum', 'silicon', 'iron', 'calcium', 'magnesium', 'titanium'] as const
const rawKeys = ['ironRaw', 'siliconRaw', 'aluminumRaw', 'calciumRaw', 'magnesiumRaw', 'titaniumRaw'] as const

export class CalculationDraftConflictError<T = unknown> extends Error {
  readonly serverDraft: CalculationDraft<T>
  readonly cause: unknown

  constructor(serverDraft: CalculationDraft<T>, cause?: unknown) {
    super('计算草稿与服务器版本冲突')
    this.name = 'CalculationDraftConflictError'
    this.serverDraft = deepFreeze(cloneJsonValue(serverDraft))
    this.cause = cause
  }
}

export async function getCalculationDraft<T>(kind: CalculationDraftKind): Promise<CalculationDraft<T>> {
  const value = await request.get<unknown, unknown>(`/calculation-drafts/${kind}`)
  return requireDraft<T>(value, kind)
}

export async function saveCalculationDraft<T>(
  kind: CalculationDraftKind,
  body: CalculationDraftSaveRequest<T>
): Promise<CalculationDraft<T>> {
  try {
    const value = await request.put<unknown, unknown>(`/calculation-drafts/${kind}`, body)
    return requireDraft<T>(value, kind)
  } catch (error) {
    const serverDraft = authoritativeConflict<T>(error, kind)
    if (serverDraft) throw new CalculationDraftConflictError(serverDraft, error)
    throw error
  }
}

function authoritativeConflict<T>(error: unknown, kind: CalculationDraftKind) {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null
  try {
    const data = error.response.data
    if (!isPlainObject(data) || data.code !== 'CALCULATION_DRAFT_CONFLICT') return null
    return parseDraft<T>(data.serverDraft, kind)
  } catch {
    return null
  }
}

function requireDraft<T>(value: unknown, kind: CalculationDraftKind): CalculationDraft<T> {
  const draft = parseDraft<T>(value, kind)
  if (!draft) throw new TypeError('计算草稿响应格式无效')
  return draft
}

function parseDraft<T>(value: unknown, kind: CalculationDraftKind): CalculationDraft<T> | null {
  if (!isPlainObject(value)) return null
  const expectedKind = serverKind(kind)
  const payload = normalizePayload(kind, value.payload)
  if (
    value.kind !== expectedKind ||
    !hasExactKeys(value, ['kind', 'payload', 'revision', 'updatedAt']) ||
    payload === null ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !isValidUpdatedAt(value.updatedAt)
  ) {
    return null
  }
  return deepFreeze({
    kind: expectedKind,
    payload: payload as T,
    revision: value.revision as number,
    updatedAt: value.updatedAt as string | null
  })
}

function serverKind(kind: CalculationDraftKind): CalculationDraftServerKind {
  return kind === 'standard-sample' ? 'STANDARD_SAMPLE' : 'COEFFICIENT'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function normalizePayload(kind: CalculationDraftKind, value: unknown) {
  try {
    return kind === 'standard-sample' ? normalizeStandardPayload(value) : normalizeCoefficientPayload(value)
  } catch {
    return null
  }
}

function normalizeStandardPayload(value: unknown): StandardSampleDraft {
  const source = requirePlainObject(value)
  requireExactKeys(source, ['aluminum', 'silicon', 'iron'])
  return {
    aluminum: normalizeNullableNumbers(source.aluminum, aluminumKeys),
    silicon: normalizeNullableNumbers(source.silicon, ratioKeys),
    iron: normalizeNullableNumbers(source.iron, ratioKeys)
  }
}

function normalizeCoefficientPayload(value: unknown): CoefficientDraftPayload {
  const source = requirePlainObject(value)
  requireExactKeys(source, ['parameters', 'standardAddCount', 'calculationAddCount', 'standardRows', 'calculationRows'])
  const parameters = requirePlainObject(source.parameters)
  requireExactKeys(parameters, parameterKeys)
  return {
    parameters: Object.fromEntries(parameterKeys.map((key) => [key, requireFiniteNumber(parameters[key])])) as CoefficientDraftPayload['parameters'],
    standardAddCount: requireAddCount(source.standardAddCount),
    calculationAddCount: requireAddCount(source.calculationAddCount),
    standardRows: normalizeRows(source.standardRows, normalizeStandardRow),
    calculationRows: normalizeRows(source.calculationRows, normalizeCalculationRow)
  }
}

function normalizeStandardRow(value: unknown): StandardContentRow {
  const source = requirePlainObject(value)
  requireExactKeys(source, ['id', 'code', 'autoCode', ...elementKeys])
  return {
    ...normalizeRowIdentity(source),
    ...normalizeNullableNumbers(source, elementKeys, false)
  }
}

function normalizeCalculationRow(value: unknown): CalculationRow {
  const source = requirePlainObject(value)
  requireExactKeys(source, ['id', 'code', 'autoCode', 'inputs'])
  return {
    ...normalizeRowIdentity(source),
    inputs: normalizeNullableNumbers(source.inputs, rawKeys)
  }
}

function normalizeRowIdentity(source: Record<string, unknown>) {
  if (typeof source.id !== 'string' || !source.id.trim()) throw new TypeError('invalid row id')
  if (typeof source.code !== 'string' || source.code.length > 40) throw new TypeError('invalid row code')
  if (typeof source.autoCode !== 'boolean') throw new TypeError('invalid auto-code flag')
  return { id: source.id.trim(), code: source.code, autoCode: source.autoCode }
}

function normalizeRows<T>(value: unknown, normalize: (row: unknown) => T) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new TypeError('invalid rows')
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError('sparse rows')
  }
  const ids = new Set<string>()
  return value.map((row) => {
    const normalized = normalize(row)
    const id = (normalized as { id: string }).id
    if (ids.has(id)) throw new TypeError('duplicate row id')
    ids.add(id)
    return normalized
  })
}

function normalizeNullableNumbers<T>(
  value: unknown,
  keys: readonly string[],
  validateKeys = true
) {
  const source = requirePlainObject(value)
  if (validateKeys) requireExactKeys(source, keys)
  return Object.fromEntries(keys.map((key) => [key, requireNullableFiniteNumber(source[key])])) as T
}

function requireFiniteNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('invalid number')
  return value
}

function requireNullableFiniteNumber(value: unknown) {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new TypeError('invalid nullable number')
  }
  return value as number | null
}

function requireAddCount(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 50) {
    throw new TypeError('invalid add count')
  }
  return value as number
}

function requirePlainObject(value: unknown) {
  if (!isPlainObject(value)) throw new TypeError('invalid object')
  return value
}

function requireExactKeys(source: Record<string, unknown>, expected: readonly string[]) {
  if (!hasExactKeys(source, expected)) throw new TypeError('invalid fields')
}

function hasExactKeys(source: Record<string, unknown>, expected: readonly string[]) {
  const keys = Reflect.ownKeys(source)
  return keys.length === expected.length &&
    keys.every((key) => typeof key === 'string' && expected.includes(key)) &&
    expected.every((key) => Object.hasOwn(source, key))
}

function isValidUpdatedAt(value: unknown) {
  if (value === null) return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function cloneJsonValue<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('invalid JSON number')
    return value
  }
  if (typeof value !== 'object') throw new TypeError('invalid JSON value')
  if (seen.has(value)) throw new TypeError('cyclic JSON value')
  seen.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError('sparse JSON array')
    }
    const clone = value.map((item) => cloneJsonValue(item, seen))
    seen.delete(value)
    return clone as T
  }
  const source = requirePlainObject(value)
  const clone: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(source)) {
    if (typeof key !== 'string') throw new TypeError('invalid JSON key')
    clone[key] = cloneJsonValue(source[key], seen)
  }
  seen.delete(value)
  return clone as T
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}
