export type CalculationDraftKind = 'STANDARD_SAMPLE' | 'COEFFICIENT'

export interface AluminumStandardDraftInputs {
  highStandard: number | null
  highReading: number | null
  lowStandard: number | null
  lowReading: number | null
  baseValue: number | null
}

export interface RatioStandardDraftInputs {
  lowStandard: number | null
  lowReading: number | null
  highStandard: number | null
  highReading: number | null
}

export interface StandardSampleDraftPayload {
  aluminum: AluminumStandardDraftInputs
  silicon: RatioStandardDraftInputs
  iron: RatioStandardDraftInputs
}

export interface CalculationDraftParameters {
  ironBlank: number
  ironFactor: number
  siliconBlank: number
  siliconFactor: number
  aluminumFactor1: number
  aluminumFactor2: number
  calciumFactor: number
  magnesiumFactor: number
  titaniumFactor: number
}

export interface CoefficientStandardRow {
  id: string
  code: string
  autoCode: boolean
  aluminum: number | null
  silicon: number | null
  iron: number | null
  calcium: number | null
  magnesium: number | null
  titanium: number | null
}

export interface CoefficientCalculationInputs {
  ironRaw: number | null
  siliconRaw: number | null
  aluminumRaw: number | null
  calciumRaw: number | null
  magnesiumRaw: number | null
  titaniumRaw: number | null
}

export interface CoefficientCalculationRow {
  id: string
  code: string
  autoCode: boolean
  inputs: CoefficientCalculationInputs
}

export interface CoefficientDraftPayload {
  parameters: CalculationDraftParameters
  standardAddCount: number
  calculationAddCount: number
  standardRows: CoefficientStandardRow[]
  calculationRows: CoefficientCalculationRow[]
}

export interface CalculationDraftPayloadByKind {
  STANDARD_SAMPLE: StandardSampleDraftPayload
  COEFFICIENT: CoefficientDraftPayload
}

export type CalculationDraftPayload = CalculationDraftPayloadByKind[CalculationDraftKind]
