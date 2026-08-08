import type { LabFormulaResult, LabParameter, LabSampleInput } from '@/types/labSheet'

const ZERO_RESULTS: LabFormulaResult = {
  iron: 0,
  silicon: 0,
  aluminum: 0,
  aluminumSiliconRatio: 0,
  total: 0,
  density: 0,
  calcium: 0,
  magnesium: 0,
  titanium: 0,
  bottleDensity: 0,
  moisture: 0,
  burnLoss: 0
}

function hasNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalNumber(value: number | null | undefined) {
  return hasNumber(value) ? value : 0
}

function safeRound(value: number, precision = 4) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0
  return numerator / denominator
}

export function calculateSampleResults(inputs: LabSampleInput, parameters: LabParameter): LabFormulaResult {
  const result = { ...ZERO_RESULTS }

  if (hasNumber(inputs.ironRaw)) {
    result.iron = safeRound((inputs.ironRaw - parameters.ironBlank) * parameters.ironFactor)
  }

  if (hasNumber(inputs.siliconRaw)) {
    result.silicon = safeRound((inputs.siliconRaw - parameters.siliconBlank) * parameters.siliconFactor + optionalNumber(inputs.siliconAdjust))
  }

  if (hasNumber(inputs.aluminumRaw)) {
    result.aluminum = safeRound(((((inputs.aluminumRaw * parameters.aluminumFactor1 - 18) * parameters.aluminumFactor2) + result.iron * 0.6383) * -1) - optionalNumber(inputs.aluminumAdjust))
  }

  result.aluminumSiliconRatio = safeRound(safeDivide(result.aluminum, result.silicon))
  result.total = safeRound(result.aluminum + result.silicon + result.iron)

  if (hasNumber(inputs.densityRaw)) {
    result.density = safeRound(safeDivide(80, inputs.densityRaw))
  }

  if (hasNumber(inputs.calciumRaw)) {
    result.calcium = safeRound(inputs.calciumRaw * parameters.calciumFactor)
  }

  if (hasNumber(inputs.magnesiumRaw) && hasNumber(inputs.calciumRaw)) {
    result.magnesium = safeRound((inputs.magnesiumRaw - inputs.calciumRaw) * parameters.magnesiumFactor)
  }

  if (hasNumber(inputs.titaniumRaw)) {
    result.titanium = safeRound(inputs.titaniumRaw * parameters.titaniumFactor)
  }

  if (hasNumber(inputs.waterSample) && hasNumber(inputs.bottleWater) && hasNumber(inputs.bottleWaterSample)) {
    const denominator = inputs.waterSample + inputs.bottleWater - inputs.bottleWaterSample
    result.bottleDensity = safeRound(safeDivide(inputs.waterSample, denominator) * 0.99823)
  }

  if (hasNumber(inputs.moisture)) {
    result.moisture = safeRound(inputs.moisture)
  }

  if (hasNumber(inputs.sampleWeight) && hasNumber(inputs.crucible) && hasNumber(inputs.burnedCrucibleSample)) {
    result.burnLoss = safeRound(safeDivide(inputs.sampleWeight + inputs.crucible - inputs.burnedCrucibleSample, inputs.sampleWeight) * 100)
  }

  return result
}

export function formatFormulaValue(value: number) {
  if (!Number.isFinite(value)) return '0.00'
  return value.toFixed(2)
}

export function parseNumericInput(value: unknown) {
  if (value === '' || value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}
