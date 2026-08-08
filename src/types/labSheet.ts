import type { Customer } from './customer'

export type LabParameterKey =
  | 'ironBlank'
  | 'ironFactor'
  | 'siliconBlank'
  | 'siliconFactor'
  | 'aluminumFactor1'
  | 'aluminumFactor2'
  | 'calciumFactor'
  | 'magnesiumFactor'
  | 'titaniumFactor'

export type SamplePaymentStatus = '已结款' | '未结款' | '月结款' | '预存款'

export interface LabParameter {
  ironBlank: number
  ironFactor: number
  siliconBlank: number
  siliconFactor: number
  aluminumFactor1: number
  aluminumFactor2: number
  calciumFactor: number
  magnesiumFactor: number
  titaniumFactor: number
  savedAt?: string
}

export interface LabSampleInput {
  sequence?: string
  completed?: boolean
  sampleNumber?: string
  customerId?: string
  customerIds?: string[]
  customers?: Customer[]
  customerText?: string
  recipientCustomerId?: string
  recipientCustomerIds?: string[]
  recipientCustomers?: Customer[]
  recipientCustomerText?: string
  price?: number | null
  paymentStatus?: SamplePaymentStatus | ''
  ironRaw?: number | null
  siliconRaw?: number | null
  siliconAdjust?: number | null
  aluminumRaw?: number | null
  aluminumAdjust?: number | null
  sulfur?: number | null
  densityRaw?: number | null
  whiteness?: number | null
  calciumRaw?: number | null
  magnesiumRaw?: number | null
  carbon?: number | null
  titaniumRaw?: number | null
  waterSample?: number | null
  bottleWater?: number | null
  bottleWaterSample?: number | null
  moisture?: number | null
  crucible?: number | null
  sampleWeight?: number | null
  burnedCrucibleSample?: number | null
  elementNote?: string
  note?: string
}

export interface LabFormulaResult {
  iron: number
  silicon: number
  aluminum: number
  aluminumSiliconRatio: number
  total: number
  density: number
  calcium: number
  magnesium: number
  titanium: number
  bottleDensity: number
  moisture: number
  burnLoss: number
}

export interface SampleBlock {
  id: string
  index: number
  readonly: boolean
  updatedAt?: string
  sensitiveFieldsHidden?: boolean
  inputs: LabSampleInput
  results: LabFormulaResult
  parameterSnapshot: LabParameter
}

export interface LabChangeLogField {
  field: keyof LabSampleInput
  oldValue: unknown
  newValue: unknown
}

export interface SampleBlockSavePayload {
  id: string
  baseUpdatedAt?: string
  baseInputs?: Partial<LabSampleInput>
  changedFields?: Partial<LabSampleInput>
  inputs?: LabSampleInput
  changeLogFields?: LabChangeLogField[]
}

export interface LabSheet {
  id: string
  date: string
  readonly: boolean
  parameters: LabParameter
  sampleBlocks: SampleBlock[]
}

export type LabCellKind = 'input' | 'formula' | 'readonly' | 'label' | 'customer'

export interface LabCell {
  key: string
  column: string
  row: number
  columnSpan?: number
  rowSpan?: number
  label?: string
  kind: LabCellKind
  field?: keyof LabSampleInput | keyof LabFormulaResult
  section?: 'metal' | 'water' | 'remark' | 'default'
}
