import type { LabSampleInput } from '@/types/labSheet'

const labDetectionInputFields: Array<keyof LabSampleInput> = [
  'ironRaw',
  'siliconRaw',
  'siliconAdjust',
  'aluminumRaw',
  'aluminumAdjust',
  'sulfur',
  'densityRaw',
  'whiteness',
  'calciumRaw',
  'magnesiumRaw',
  'carbon',
  'titaniumRaw',
  'waterSample',
  'bottleWater',
  'bottleWaterSample',
  'crucible',
  'sampleWeight',
  'burnedCrucibleSample'
]

export function hasSampleIdentity(inputs: LabSampleInput) {
  return Boolean(
    inputs.sampleNumber?.trim() ||
      inputs.customerText?.trim() ||
      inputs.customerIds?.length ||
      inputs.customers?.length
  )
}

export function hasSamplePrice(inputs: LabSampleInput) {
  return typeof inputs.price === 'number' && Number.isFinite(inputs.price)
}

export function hasLabDetectionInput(inputs: LabSampleInput) {
  return labDetectionInputFields.some((field) => hasDetectionInputValue(inputs[field]))
}

export function isReportableSample(inputs: LabSampleInput) {
  return hasSampleIdentity(inputs) && hasSamplePrice(inputs) && hasLabDetectionInput(inputs)
}

function hasDetectionInputValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed !== '' && Number.isFinite(Number(trimmed))
}
