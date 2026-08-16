import { computed, reactive } from 'vue'
import {
  calculateAluminumStandard,
  calculateRatioStandard,
  type AluminumStandardInput,
  type RatioStandardInput
} from '@/utils/standardSampleCalculator'
import type { StandardSampleDraft } from '@/types/calculationDraft'

const defaultAluminum: AluminumStandardInput = {
  highStandard: 69.74,
  highReading: 7.7,
  lowStandard: 52,
  lowReading: 12.2,
  baseValue: 214.38
}

const defaultSilicon: RatioStandardInput = {
  lowStandard: 4.88,
  lowReading: 0.405,
  highStandard: 17.05,
  highReading: 1.31
}

const defaultIron: RatioStandardInput = {
  lowStandard: 6.09,
  lowReading: 0.147,
  highStandard: 15.31,
  highReading: 0.461
}

export function useStandardSampleCalculation() {
  const aluminum = reactive<AluminumStandardInput>({ ...defaultAluminum })
  const silicon = reactive<RatioStandardInput>({ ...defaultSilicon })
  const iron = reactive<RatioStandardInput>({ ...defaultIron })

  const aluminumResult = computed(() => calculateAluminumStandard(aluminum))
  const siliconResult = computed(() => calculateRatioStandard(silicon))
  const ironResult = computed(() => calculateRatioStandard(iron))

  function snapshot(): StandardSampleDraft {
    return {
      aluminum: { ...aluminum },
      silicon: { ...silicon },
      iron: { ...iron }
    }
  }

  return {
    aluminum,
    silicon,
    iron,
    aluminumResult,
    siliconResult,
    ironResult,
    resetAluminum: () => Object.assign(aluminum, defaultAluminum),
    resetSilicon: () => Object.assign(silicon, defaultSilicon),
    resetIron: () => Object.assign(iron, defaultIron),
    snapshot
  }
}
