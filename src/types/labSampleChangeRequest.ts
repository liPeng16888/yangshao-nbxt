import type { LabFormulaResult, LabParameterSnapshot, LabSampleInput, SamplePaymentStatus } from './labSheet'

export type LabSampleChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
export type LabSampleChangeRawField =
  | 'ironRaw' | 'siliconRaw' | 'siliconAdjust' | 'aluminumRaw' | 'aluminumAdjust'
  | 'sulfur' | 'densityRaw' | 'whiteness' | 'calciumRaw' | 'magnesiumRaw' | 'carbon'
  | 'titaniumRaw' | 'waterSample' | 'bottleWater' | 'bottleWaterSample' | 'moisture'
  | 'crucible' | 'sampleWeight' | 'burnedCrucibleSample'

export type PayerCustomerChange = { customerIds: string[]; customerText: string }

export type LabSampleChangePatch = {
  sampleNumber?: string
  payerCustomer?: PayerCustomerChange
  price?: number | null
  paymentStatus?: SamplePaymentStatus | ''
  elementNote?: string
} & Partial<Record<LabSampleChangeRawField, number | null>>

export type LabSampleChangeRequestSummary = {
  id: string
  date: string
  blockId: string
  blockIndex: number
  sampleName: string
  changedFieldLabels: string[]
  reason: string
  status: LabSampleChangeRequestStatus
  review: { remark: string | null; reviewedAt: string | null } | null
  withdrawnAt: string | null
  createdAt: string
  updatedAt: string
}

export type LabSampleChangeSourceSnapshot = {
  inputs: LabSampleInput
  results: LabFormulaResult
  parameterSnapshot: LabParameterSnapshot
  updatedAt: string
}

export type LabSampleChangeRequestDetail = LabSampleChangeRequestSummary & {
  sourceSnapshot: LabSampleChangeSourceSnapshot
  requestedChanges: LabSampleChangePatch
  previewResults: LabFormulaResult
  settlementEffects: unknown[]
  actualResults?: LabFormulaResult
}

export type CreateLabSampleChangeRequestPayload = {
  blockId: string
  baseUpdatedAt: string
  changes: LabSampleChangePatch
  reason: string
}

export type LabSampleChangeRequestFilters = {
  date?: string
  status?: LabSampleChangeRequestStatus
}

export type LabSampleChangeDiffRow = {
  field: keyof LabSampleChangePatch
  label: string
  oldValue: unknown
  newValue: unknown
}
