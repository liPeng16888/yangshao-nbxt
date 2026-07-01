export interface AluminumStandardInput {
  highStandard: number | null
  highReading: number | null
  lowStandard: number | null
  lowReading: number | null
  baseValue: number | null
}

export interface RatioStandardInput {
  lowStandard: number | null
  lowReading: number | null
  highStandard: number | null
  highReading: number | null
}

export interface AluminumStandardResult {
  highProduct: number
  lowProduct: number
  difference: number
  coefficient1: number
  coefficient2: number
  backCalculatedStandard1: number
}

export interface RatioStandardResult {
  lowProduct: number
  highProduct: number
  standardDelta: number
  blank: number
  factor: number
  backCalculatedStandard1: number
}

const ALUMINUM_CONSTANT = 18
const ALUMINUM_COEFFICIENT2_MULTIPLIER = -10.643693831647893

export function calculateAluminumStandard(input: AluminumStandardInput): AluminumStandardResult {
  const highProduct = multiply(input.highReading, input.lowStandard)
  const lowProduct = multiply(input.lowReading, input.highStandard)
  const difference = lowProduct - highProduct
  const coefficient1 = divide(input.baseValue, difference)
  const coefficient2 = safeNumber(coefficient1) ? coefficient1 * ALUMINUM_COEFFICIENT2_MULTIPLIER : Number.NaN
  const backCalculatedStandard1 = safeNumber(coefficient1) && safeNumber(coefficient2) && safeNumber(input.highReading)
    ? (Number(input.highReading) * coefficient1 - ALUMINUM_CONSTANT) * coefficient2
    : Number.NaN

  return {
    highProduct,
    lowProduct,
    difference,
    coefficient1,
    coefficient2,
    backCalculatedStandard1
  }
}

export function calculateRatioStandard(input: RatioStandardInput): RatioStandardResult {
  const lowProduct = multiply(input.lowReading, input.highStandard)
  const highProduct = multiply(input.highReading, input.lowStandard)
  const standardDelta = subtract(input.highStandard, input.lowStandard)
  const blank = divide(lowProduct - highProduct, standardDelta)
  const factor = safeNumber(blank) ? divide(input.lowStandard, subtract(input.lowReading, blank)) : Number.NaN
  const backCalculatedStandard1 = safeNumber(blank) && safeNumber(factor) && safeNumber(input.lowReading)
    ? (Number(input.lowReading) - blank) * factor
    : Number.NaN

  return {
    lowProduct,
    highProduct,
    standardDelta,
    blank,
    factor,
    backCalculatedStandard1
  }
}

export function formatStandardNumber(value: number, precision = 3) {
  if (!Number.isFinite(value)) return '-'
  return value.toFixed(precision)
}

function multiply(left: number | null, right: number | null) {
  if (!safeNumber(left) || !safeNumber(right)) return Number.NaN
  return Number(left) * Number(right)
}

function subtract(left: number | null, right: number | null) {
  if (!safeNumber(left) || !safeNumber(right)) return Number.NaN
  return Number(left) - Number(right)
}

function divide(left: number | null, right: number | null) {
  if (!safeNumber(left) || !safeNumber(right) || Number(right) === 0) return Number.NaN
  return Number(left) / Number(right)
}

function safeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
