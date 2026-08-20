import { LAB_SAMPLE_CHANGE_RAW_FIELDS, labSampleChangeFieldLabels } from '@/constants/labSampleChangeRequest'
import type { LabSampleInput, SampleBlock } from '@/types/labSheet'
import type { LabSampleChangeDiffRow, LabSampleChangePatch } from '@/types/labSampleChangeRequest'
import { businessDateInBeijing } from './date'

const paymentStatuses = new Set(['已结款', '未结款', '月结款', '预存款', ''])

export function createSampleChangeDraft(block: SampleBlock): LabSampleInput {
  return clone(block.inputs)
}

export function buildSampleChangePatch(source: SampleBlock, draft: LabSampleInput): LabSampleChangePatch {
  const changes: LabSampleChangePatch = {}
  const sampleNumber = normalizedText(draft.sampleNumber)
  if (normalizedText(source.inputs.sampleNumber) !== sampleNumber) changes.sampleNumber = sampleNumber
  const price = normalizedNumber(draft.price)
  if (normalizedNumber(source.inputs.price) !== price) changes.price = price
  const paymentStatus = normalizedPaymentStatus(draft.paymentStatus)
  if (normalizedPaymentStatus(source.inputs.paymentStatus) !== paymentStatus) changes.paymentStatus = paymentStatus
  const elementNote = normalizedText(draft.elementNote)
  if (normalizedText(source.inputs.elementNote) !== elementNote) changes.elementNote = elementNote
  const sourcePayer = payerValue(source.inputs)
  const draftPayer = payerValue(draft)
  if (!same(sourcePayer, draftPayer)) {
    changes.payerCustomer = draftPayer
  }
  for (const field of LAB_SAMPLE_CHANGE_RAW_FIELDS) {
    const value = normalizedNumber(draft[field])
    if (normalizedNumber(source.inputs[field]) !== value) changes[field] = value
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
      oldValue: payer ? payerValue(source.inputs) : normalizedFieldValue(source.inputs, typedField),
      newValue: payer ? payerValue(draft) : patch[typedField]
    }
  })
}

export function isHistoricalSampleChangeEligible(block: SampleBlock, sheetDate: string): boolean {
  return sheetDate < businessDateInBeijing() && !block.sensitiveFieldsHidden && hasVisibleBusinessInput(block.inputs)
}

function payerValue(inputs: LabSampleInput) {
  return {
    customerIds: Array.from(new Set((inputs.customerIds || [])
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean))),
    customerText: normalizedText(inputs.customerText)
  }
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

function normalizedText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizedPaymentStatus(value: unknown) {
  const paymentStatus = normalizedText(value)
  if (!paymentStatuses.has(paymentStatus)) throw new Error('付款状态无效')
  return paymentStatus as NonNullable<LabSampleChangePatch['paymentStatus']>
}

function normalizedNumber(value: unknown) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('数值必须是有限数字或空值')
  return value
}

function normalizedFieldValue(inputs: LabSampleInput, field: keyof LabSampleChangePatch) {
  if (field === 'sampleNumber' || field === 'elementNote') return normalizedText(inputs[field])
  if (field === 'paymentStatus') return normalizedPaymentStatus(inputs[field])
  return normalizedNumber(inputs[field as keyof LabSampleInput])
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
