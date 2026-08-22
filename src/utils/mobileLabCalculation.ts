import type { LabFormulaResult, SampleRetestInputField } from '@/types/labSheet'

export type MobileCalculationTabKey = 'metal' | 'otherElements' | 'density' | 'water' | 'burn'

export type MobileCalculationInputField = {
  key: SampleRetestInputField
  label: string
}

export type MobileCalculationResultField =
  | { label: string; source: 'input'; key: SampleRetestInputField }
  | { label: string; source: 'result'; key: keyof LabFormulaResult }

export type MobileCalculationGroup = {
  key: MobileCalculationTabKey
  label: string
  fields: MobileCalculationInputField[]
  results: MobileCalculationResultField[]
}

export const mobileCalculationGroups: MobileCalculationGroup[] = [
  {
    key: 'metal',
    label: '金属元素',
    fields: [
      { key: 'ironRaw', label: '铁' }, { key: 'siliconRaw', label: '硅' }, { key: 'siliconAdjust', label: '硅调整数' },
      { key: 'aluminumRaw', label: '铝' }, { key: 'aluminumAdjust', label: '铝调整数' }
    ],
    results: [
      { label: '铁结果', source: 'result', key: 'iron' }, { label: '硅结果', source: 'result', key: 'silicon' },
      { label: '铝结果', source: 'result', key: 'aluminum' }, { label: '铝硅比', source: 'result', key: 'aluminumSiliconRatio' },
      { label: '合量', source: 'result', key: 'total' }
    ]
  },
  {
    key: 'otherElements',
    label: '微量元素',
    fields: [
      { key: 'sulfur', label: '硫' }, { key: 'calciumRaw', label: '钙' }, { key: 'magnesiumRaw', label: '镁' },
      { key: 'carbon', label: '碳' }, { key: 'titaniumRaw', label: '钛' }
    ],
    results: [
      { label: '硫', source: 'input', key: 'sulfur' },
      { label: '钙结果', source: 'result', key: 'calcium' }, { label: '镁结果', source: 'result', key: 'magnesium' },
      { label: '碳', source: 'input', key: 'carbon' }, { label: '钛结果', source: 'result', key: 'titanium' }
    ]
  },
  {
    key: 'density',
    label: '比重/白度',
    fields: [
      { key: 'densityRaw', label: '比重' }, { key: 'whiteness', label: '白度' }
    ],
    results: [
      { label: '比重结果', source: 'result', key: 'density' }, { label: '白度', source: 'input', key: 'whiteness' }
    ]
  },
  {
    key: 'water',
    label: '水份',
    fields: [
      { key: 'waterSample', label: '样' }, { key: 'bottleWater', label: '瓶＋水' },
      { key: 'bottleWaterSample', label: '瓶＋水＋样' }, { key: 'moisture', label: '水份' }
    ],
    results: [
      { label: '水份', source: 'result', key: 'moisture' }, { label: '瓶比重', source: 'result', key: 'bottleDensity' }
    ]
  },
  {
    key: 'burn',
    label: '灼烧',
    fields: [
      { key: 'crucible', label: '坩埚' }, { key: 'sampleWeight', label: '样重' },
      { key: 'burnedCrucibleSample', label: '烧坩埚＋样' }
    ],
    results: [{ label: '烧失量', source: 'result', key: 'burnLoss' }]
  }
]
