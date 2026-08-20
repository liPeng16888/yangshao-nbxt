import type { LabReportElementKey } from '@/types/labReport'
import type {
  LabFormulaResult,
  SampleRetestInput,
  SampleRetestInputField
} from '@/types/labSheet'
import { sampleRetestInputFields } from '@/types/labSheet'
import { parseLabElementKeys } from './labReport'

export interface RetestGridColumn {
  key: string
  label: string
  inputField?: SampleRetestInputField
  resultField?: keyof LabFormulaResult
  elementKeys: LabReportElementKey[]
}

const elements = (...elementKeys: LabReportElementKey[]) => elementKeys

export const retestGridColumns: RetestGridColumn[] = [
  { key: 'C', label: '铁', inputField: 'ironRaw', resultField: 'iron', elementKeys: elements('iron', 'aluminumSiliconRatio') },
  { key: 'D', label: '硅', inputField: 'siliconRaw', resultField: 'silicon', elementKeys: elements('silicon', 'aluminumSiliconRatio') },
  { key: 'E', label: '调整数', inputField: 'siliconAdjust', elementKeys: elements('silicon', 'aluminumSiliconRatio') },
  { key: 'F', label: '铝', inputField: 'aluminumRaw', resultField: 'aluminum', elementKeys: elements('aluminum', 'aluminumSiliconRatio') },
  { key: 'G', label: '调整数', inputField: 'aluminumAdjust', elementKeys: elements('aluminum', 'aluminumSiliconRatio') },
  { key: 'H', label: '铝硅比', resultField: 'aluminumSiliconRatio', elementKeys: elements('aluminumSiliconRatio') },
  { key: 'I', label: '合量', resultField: 'total', elementKeys: elements('iron', 'silicon', 'aluminum', 'aluminumSiliconRatio') },
  { key: 'J', label: '硫', inputField: 'sulfur', elementKeys: elements('sulfur') },
  { key: 'K', label: '比重', inputField: 'densityRaw', resultField: 'density', elementKeys: elements('density') },
  { key: 'L', label: '白度', inputField: 'whiteness', elementKeys: elements('whiteness') },
  { key: 'M', label: '钙', inputField: 'calciumRaw', resultField: 'calcium', elementKeys: elements('calcium', 'magnesium') },
  { key: 'N', label: '镁', inputField: 'magnesiumRaw', resultField: 'magnesium', elementKeys: elements('magnesium') },
  { key: 'O', label: '碳', inputField: 'carbon', elementKeys: elements('carbon') },
  { key: 'P', label: '钛', inputField: 'titaniumRaw', resultField: 'titanium', elementKeys: elements('titanium') },
  { key: 'Q', label: '样', inputField: 'waterSample', resultField: 'bottleDensity', elementKeys: elements('moisture') },
  { key: 'R', label: '瓶+水', inputField: 'bottleWater', elementKeys: elements('moisture') },
  { key: 'S', label: '瓶+水+样', inputField: 'bottleWaterSample', elementKeys: elements('moisture') },
  { key: 'T', label: '水份', inputField: 'moisture', resultField: 'moisture', elementKeys: elements('moisture') },
  { key: 'U', label: '坩埚', inputField: 'crucible', resultField: 'burnLoss', elementKeys: elements('burnLoss') },
  { key: 'V', label: '样重', inputField: 'sampleWeight', elementKeys: elements('burnLoss') },
  { key: 'W', label: '烧坩埚+样', inputField: 'burnedCrucibleSample', elementKeys: elements('burnLoss') }
]

export function isRetestColumnEnabled(elementNote: string, column: RetestGridColumn) {
  const selected = new Set(parseLabElementKeys(elementNote))
  return column.elementKeys.some((key) => selected.has(key))
}

export function enabledRetestFields(elementNote: string): SampleRetestInputField[] {
  const enabled = new Set(retestGridColumns
    .filter((column) => column.inputField && isRetestColumnEnabled(elementNote, column))
    .map((column) => column.inputField!))
  return sampleRetestInputFields.filter((field) => enabled.has(field))
}

export function hasRetestInput(inputs: SampleRetestInput) {
  return sampleRetestInputFields.some((field) => {
    const value = inputs[field]
    return typeof value === 'number' && Number.isFinite(value)
  })
}
