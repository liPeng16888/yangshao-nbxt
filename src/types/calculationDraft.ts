import type { LabParameter } from './labSheet'
import type { AluminumStandardInput, RatioStandardInput } from '@/utils/standardSampleCalculator'

export type CalculationDraftKind = 'standard-sample' | 'coefficient'
export type CalculationDraftServerKind = 'STANDARD_SAMPLE' | 'COEFFICIENT'

export type CalculationDraftSyncStatus =
  | 'loading'
  | 'idle'
  | 'saving'
  | 'retrying'
  | 'saved'
  | 'error'
  | 'conflict'

export interface StandardSampleDraft {
  aluminum: AluminumStandardInput
  silicon: RatioStandardInput
  iron: RatioStandardInput
}

export type CoefficientElementKey = 'aluminum' | 'silicon' | 'iron' | 'calcium' | 'magnesium' | 'titanium'
export type CoefficientRawKey = 'ironRaw' | 'siliconRaw' | 'aluminumRaw' | 'calciumRaw' | 'magnesiumRaw' | 'titaniumRaw'

export interface StandardContentRow extends Record<CoefficientElementKey, number | null> {
  id: string
  code: string
  autoCode: boolean
}

export interface CalculationRow {
  id: string
  code: string
  autoCode: boolean
  inputs: Record<CoefficientRawKey, number | null>
}

export interface CoefficientDraftPayload {
  parameters: Omit<LabParameter, 'savedAt'>
  standardAddCount: number
  calculationAddCount: number
  standardRows: StandardContentRow[]
  calculationRows: CalculationRow[]
}

export interface CalculationDraft<T> {
  kind: CalculationDraftServerKind
  payload: T
  revision: number
  updatedAt: string | null
}

export interface CalculationDraftSaveRequest<T> {
  baseRevision: number
  payload: T
}

export interface CalculationDraftConflict<T> {
  serverDraft: CalculationDraft<T>
  localSnapshot: T
}
