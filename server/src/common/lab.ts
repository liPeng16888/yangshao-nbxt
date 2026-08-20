export const defaultLabParameters = {
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

export const defaultSampleBlockCount = 10

export const editableInputFields = [
  'sequence',
  'completed',
  'sampleNumber',
  'customerId',
  'customerIds',
  'customers',
  'customerText',
  'recipientCustomerId',
  'recipientCustomerIds',
  'recipientCustomers',
  'recipientCustomerText',
  'price',
  'paymentStatus',
  'prepaidMemberId',
  'prepaidMemberPhone',
  'ironRaw',
  'siliconRaw',
  'siliconAdjust',
  'aluminumRaw',
  'aluminumAdjust',
  'sulfur',
  'densityRaw',
  'whiteness',
  'calciumRaw',
  'magnesiumRaw',
  'carbon',
  'titaniumRaw',
  'waterSample',
  'bottleWater',
  'bottleWaterSample',
  'moisture',
  'crucible',
  'sampleWeight',
  'burnedCrucibleSample',
  'elementNote',
  'note'
]

export const labDetectionInputFields = [
  'ironRaw',
  'siliconRaw',
  'siliconAdjust',
  'aluminumRaw',
  'aluminumAdjust',
  'sulfur',
  'densityRaw',
  'whiteness',
  'calciumRaw',
  'magnesiumRaw',
  'carbon',
  'titaniumRaw',
  'waterSample',
  'bottleWater',
  'bottleWaterSample',
  'moisture',
  'crucible',
  'sampleWeight',
  'burnedCrucibleSample'
]

export function createEmptyInputs(index: number) {
  return {
    sequence: String(index).padStart(3, '0'),
    completed: false,
    sampleNumber: '',
    customerIds: [],
    customers: [],
    customerText: '',
    recipientCustomerIds: [],
    recipientCustomers: [],
    recipientCustomerText: '',
    price: null,
    paymentStatus: ''
  }
}

export function createEmptyRetestInputs() {
  return Object.fromEntries(labDetectionInputFields.map((field) => [field, null]))
}

export function normalizeLabDetectionInputs(value: unknown) {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return Object.fromEntries(labDetectionInputFields
    .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
    .map((field) => {
      const raw = row[field]
      return [field, typeof raw === 'number' && Number.isFinite(raw) ? raw : null]
    }))
}

export function normalizeLabParameters(value: unknown) {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return Object.fromEntries(Object.entries(defaultLabParameters).map(([key, fallback]) => [
    key,
    typeof row[key] === 'number' && Number.isFinite(row[key]) ? row[key] : fallback
  ])) as typeof defaultLabParameters
}

export function validateStoredLabParameters(value: unknown): typeof defaultLabParameters | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const entries = Object.keys(defaultLabParameters).map((key) => [key, row[key]] as const)
  if (entries.some(([, item]) => typeof item !== 'number' || !Number.isFinite(item))) return null
  return Object.fromEntries(entries) as typeof defaultLabParameters
}

export function hasLabDetectionInput(inputs: Record<string, unknown>) {
  return labDetectionInputFields.some((field) => hasDetectionInputValue(inputs[field]))
}

export function hasVisibleSampleBlockInput(inputs: Record<string, unknown>) {
  return editableInputFields
    .filter((field) => field !== 'sequence' && field !== 'completed')
    .some((field) => hasSavedInputValue(inputs[field]))
}

function hasDetectionInputValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed !== '' && Number.isFinite(Number(trimmed))
}

function hasSavedInputValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

export function calculateResults(inputs: Record<string, unknown>, parameters: typeof defaultLabParameters) {
  const result = {
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
  const number = (key: string) => {
    const value = inputs[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
  const optional = (key: string) => number(key) || 0
  const round = (value: number, precision = 4) => (Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 10 ** precision) / 10 ** precision : 0)
  const divide = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : 0)
  if (number('ironRaw') !== null) result.iron = round((number('ironRaw')! - parameters.ironBlank) * parameters.ironFactor)
  if (number('siliconRaw') !== null) result.silicon = round((number('siliconRaw')! - parameters.siliconBlank) * parameters.siliconFactor + optional('siliconAdjust'))
  if (number('aluminumRaw') !== null) {
    result.aluminum = round(((((number('aluminumRaw')! * parameters.aluminumFactor1 - 18) * parameters.aluminumFactor2) + result.iron * 0.6383) * -1) - optional('aluminumAdjust'))
  }
  result.aluminumSiliconRatio = round(divide(result.aluminum, result.silicon))
  result.total = round(result.aluminum + result.silicon + result.iron)
  if (number('densityRaw') !== null) result.density = round(divide(80, number('densityRaw')!))
  if (number('calciumRaw') !== null) result.calcium = round(number('calciumRaw')! * parameters.calciumFactor)
  if (number('magnesiumRaw') !== null && number('calciumRaw') !== null) result.magnesium = round((number('magnesiumRaw')! - number('calciumRaw')!) * parameters.magnesiumFactor)
  if (number('titaniumRaw') !== null) result.titanium = round(number('titaniumRaw')! * parameters.titaniumFactor)
  if (number('waterSample') !== null && number('bottleWater') !== null && number('bottleWaterSample') !== null) {
    const denominator = number('waterSample')! + number('bottleWater')! - number('bottleWaterSample')!
    result.bottleDensity = round(divide(number('waterSample')!, denominator) * 0.99823)
  }
  if (number('moisture') !== null) {
    result.moisture = round(number('moisture')!)
  }
  if (number('sampleWeight') !== null && number('crucible') !== null && number('burnedCrucibleSample') !== null) {
    result.burnLoss = round(divide(number('sampleWeight')! + number('crucible')! - number('burnedCrucibleSample')!, number('sampleWeight')!) * 100)
  }
  return result
}
