import { LAB_SAMPLE_CHANGE_RAW_FIELDS, labSampleChangeFieldLabels } from '@/constants/labSampleChangeRequest'
import type { LabSampleInput, SampleBlock } from '@/types/labSheet'
import type { LabSampleChangeDiffRow, LabSampleChangePatch } from '@/types/labSampleChangeRequest'

const scalarFields = ['sampleNumber', 'price', 'paymentStatus', 'elementNote'] as const

export function createSampleChangeDraft(block: SampleBlock): LabSampleInput {
  return clone(block.inputs)
}

export function buildSampleChangePatch(source: SampleBlock, draft: LabSampleInput): LabSampleChangePatch {
  const changes: LabSampleChangePatch = {}
  for (const field of scalarFields) {
    if (!same(source.inputs[field], draft[field])) {
      Object.assign(changes, { [field]: draft[field] })
    }
  }
  if (!samePayer(source.inputs, draft)) {
    changes.payerCustomer = { customerIds: [...(draft.customerIds || [])], customerText: draft.customerText || '' }
  }
  for (const field of LAB_SAMPLE_CHANGE_RAW_FIELDS) {
    if (!same(source.inputs[field], draft[field])) {
      changes[field] = draft[field] ?? null
    }
  }
  return changes
}

export function sampleChangeDiffRows(source: SampleBlock, draft: LabSampleInput): LabSampleChangeDiffRow[] {
  const patch = buildSampleChangePatch(source, draft)
  return Object.keys(patch).map((field) => {
    const typedField = field as keyof LabSampleChangePatch
    const payer = typedField === 'payerCustomer'
    return {
      field: typedField,
      label: labSampleChangeFieldLabels[typedField],
      oldValue: payer ? payerValue(source.inputs) : source.inputs[typedField as keyof LabSampleInput] ?? null,
      newValue: payer ? payerValue(draft) : patch[typedField]
    }
  })
}

export function isHistoricalSampleChangeEligible(block: SampleBlock): boolean {
  return block.readonly && !block.sensitiveFieldsHidden && hasVisibleBusinessInput(block.inputs)
}

function payerValue(inputs: LabSampleInput) {
  return { customerIds: [...(inputs.customerIds || [])], customerText: inputs.customerText || '' }
}

function samePayer(left: LabSampleInput, right: LabSampleInput) {
  return same(payerValue(left), payerValue(right))
}

function hasVisibleBusinessInput(inputs: LabSampleInput) {
  return Object.entries(inputs)
    .filter(([field]) => field !== 'sequence' && field !== 'completed')
    .some(([, value]) => {
      if (typeof value === 'number') return Number.isFinite(value)
      if (typeof value === 'string') return value.trim() !== ''
      if (Array.isArray(value)) return value.length > 0
      return Boolean(value)
    })
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
