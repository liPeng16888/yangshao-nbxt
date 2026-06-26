import type { LabParameter, LabParameterKey } from '@/types/labSheet'

export const LAB_TEMPLATE_DIMENSION = 'A1:AD29'
export const LAB_BUSINESS_COLUMNS = 23
export const LAB_TOTAL_COLUMNS = 30
export const DEFAULT_SAMPLE_BLOCK_COUNT = 10

export const defaultLabParameters: LabParameter = {
  ironBlank: 0.04,
  ironFactor: 29.1,
  siliconBlank: 0.027,
  siliconFactor: 13,
  aluminumFactor1: 0.502,
  aluminumFactor2: 4.98,
  calciumFactor: 1.15,
  magnesiumFactor: 0.556,
  titaniumFactor: 0.57
}

export const labParameterLabels: Array<{ key: LabParameterKey; label: string; excelCell: string }> = [
  { key: 'ironBlank', label: '铁空白', excelCell: 'A3' },
  { key: 'ironFactor', label: '铁系数', excelCell: 'B3' },
  { key: 'siliconBlank', label: '硅空白', excelCell: 'C3' },
  { key: 'siliconFactor', label: '硅系数', excelCell: 'D3' },
  { key: 'aluminumFactor1', label: '铝系数1', excelCell: 'E3' },
  { key: 'aluminumFactor2', label: '铝系数2', excelCell: 'F3' },
  { key: 'calciumFactor', label: '钙系数', excelCell: 'G3' },
  { key: 'magnesiumFactor', label: '镁系数', excelCell: 'H3' },
  { key: 'titaniumFactor', label: '钛系数', excelCell: 'I3' }
]

export const labSheetColumns = [
  { key: 'A', label: '编号', width: 78 },
  { key: 'B', label: '来样单位/样品编号', width: 240 },
  { key: 'C', label: '铁', width: 82 },
  { key: 'D', label: '硅', width: 82 },
  { key: 'E', label: '调整数', width: 82 },
  { key: 'F', label: '铝', width: 82 },
  { key: 'G', label: '调整数', width: 82 },
  { key: 'H', label: '铝硅比', width: 82 },
  { key: 'I', label: '合量', width: 82 },
  { key: 'J', label: '硫', width: 82 },
  { key: 'K', label: '比重', width: 82 },
  { key: 'L', label: '白度', width: 82 },
  { key: 'M', label: '钙', width: 82 },
  { key: 'N', label: '镁', width: 82 },
  { key: 'O', label: '碳', width: 82 },
  { key: 'P', label: '钛', width: 82 },
  { key: 'Q', label: '样', width: 70 },
  { key: 'R', label: '瓶+水', width: 88 },
  { key: 'S', label: '瓶+水+样', width: 104 },
  { key: 'T', label: '水份', width: 76 },
  { key: 'U', label: '坩埚', width: 78 },
  { key: 'V', label: '样重', width: 78 },
  { key: 'W', label: '烧坩埚+样', width: 112 }
]
