import { calculateResults, normalizeLabDetectionInputs, normalizeLabParameters } from '../common/lab'

export type SampleRetestRow = {
  id: string
  sampleBlockId: string
  sequence: number
  inputs: unknown
  results: unknown
  parameterSnapshot: unknown
  everFilled: boolean
  status: string
  voidReason: string | null
  createdById: string
  updatedById: string
  voidedById: string | null
  createdAt: Date
  updatedAt: Date
  voidedAt: Date | null
}

export type SampleRetestDtoOptions = {
  parentCompleted: boolean
  sheetReadonly: boolean
  canViewCompletedSensitiveData: boolean
}

function redactInputs(inputs: Record<string, number | null>) {
  return Object.fromEntries(Object.keys(inputs).map((key) => [key, null]))
}

function redactResults(results: Record<string, number>) {
  return Object.fromEntries(Object.keys(results).map((key) => [key, null]))
}

function toIso(value: Date) {
  return value.toISOString()
}

export function toSampleRetestDto(row: SampleRetestRow, options: SampleRetestDtoOptions) {
  const inputs = normalizeLabDetectionInputs(row.inputs)
  const results = calculateResults(inputs, normalizeLabParameters(row.parameterSnapshot))
  const hidden = options.parentCompleted && !options.canViewCompletedSensitiveData
  return {
    id: row.id,
    sampleBlockId: row.sampleBlockId,
    sequence: row.sequence,
    status: row.status,
    everFilled: row.everFilled,
    readonly: options.sheetReadonly || row.status === 'VOID',
    sensitiveFieldsHidden: hidden,
    inputs: hidden ? redactInputs(inputs) : inputs,
    results: hidden ? redactResults(results) : results,
    parameterSnapshot: hidden ? null : row.parameterSnapshot,
    voidReason: row.voidReason,
    createdById: row.createdById,
    updatedById: row.updatedById,
    voidedById: row.voidedById,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    voidedAt: row.voidedAt ? toIso(row.voidedAt) : null
  }
}
