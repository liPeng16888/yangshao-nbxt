import type { LabFormulaResult, LabSampleInput } from './labSheet'

export type LabReportElementKey =
  | 'aluminum'
  | 'silicon'
  | 'iron'
  | 'aluminumSiliconRatio'
  | 'sulfur'
  | 'carbon'
  | 'moisture'
  | 'calcium'
  | 'magnesium'
  | 'whiteness'
  | 'density'
  | 'titanium'
  | 'burnLoss'

export interface LabReportElement {
  key: LabReportElementKey
  label: string
  symbol: string
  source: 'result' | 'input'
  field: keyof LabFormulaResult | keyof LabSampleInput
}

export interface LabReportTemplate {
  title: string
  sampleUnit: string
  inspector: string
  reviewer: string
  address: string
  phone: string
  statements: string[]
  sealImage: string
  updatedAt?: string
}

export interface LabReportSmsTemplate {
  prefix: string
  suffix: string
  updatedAt?: string
}

export interface LabReportElementSelection {
  blockId: string
  elementKeys: LabReportElementKey[]
}

export interface LabReportDraftElement {
  key: LabReportElementKey
  label: string
  symbol: string
}

export interface LabReportDraftRow {
  blockId: string
  sampleName: string
  values: Record<LabReportElementKey, string>
}

export interface LabReportDraft {
  title: string
  sampleDate: string
  reportDate: string
  sampleUnit: string
  sampleCount: string
  inspector: string
  reviewer: string
  address: string
  phone: string
  statements: string[]
  sealImage: string
  elements: LabReportDraftElement[]
  rows: LabReportDraftRow[]
}
