import type { LabSampleInput } from '@/types/labSheet'

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

export function isReportableSample(inputs: LabSampleInput) {
  return hasSampleIdentity(inputs) && hasSamplePrice(inputs)
}
