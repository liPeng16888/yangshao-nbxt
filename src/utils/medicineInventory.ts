import type { MedicineUnit } from '@/types/medicineInventory'

export const medicineUnitOptions = [
  { value: 'BOTTLE', label: '瓶' },
  { value: 'LITER', label: '升' },
  { value: 'MILLILITER', label: '毫升' },
  { value: 'GRAM', label: '克' }
] as const

export type MedicineQuantityInput = string | number

export type MedicineQuantityValidation =
  | { ok: true; value: string }
  | { ok: false; message: string }

const MAX_MEDICINE_QUANTITY = 99999999999.999

export function validateMedicineQuantity(unit: MedicineUnit, value: unknown): MedicineQuantityValidation {
  if (!medicineUnitOptions.some((option) => option.value === unit)) {
    return { ok: false, message: '药品单位无效' }
  }

  const normalized = normalizeQuantityInput(value)
  if (!normalized) return { ok: false, message: '数量必须是正数' }

  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { ok: false, message: '数量必须是正数' }
  }
  if (numeric > MAX_MEDICINE_QUANTITY) {
    return { ok: false, message: '数量超出允许范围' }
  }
  if (unit === 'BOTTLE' && !Number.isInteger(numeric)) {
    return { ok: false, message: '瓶数量必须是正整数' }
  }
  if (decimalPlaces(normalized) > 3) {
    return { ok: false, message: '数量最多保留 3 位小数' }
  }

  return { ok: true, value: formatMedicineQuantity(normalized) }
}

export function formatMedicineQuantity(value: string | number): string {
  const normalized = normalizeQuantityInput(value)
  if (!normalized) return String(value)

  const expanded = expandScientificNotation(normalized)
  const sign = expanded.startsWith('-') ? '-' : ''
  const unsigned = sign ? expanded.slice(1) : expanded
  const [integerPart, fractionPart = ''] = unsigned.split('.')
  const integer = integerPart.replace(/^0+(?=\d)/, '') || '0'
  const fraction = fractionPart.replace(/0+$/, '')
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`
}

function normalizeQuantityInput(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && Number.isFinite(Number(normalized)) ? normalized : null
}

function decimalPlaces(value: string): number {
  const [coefficient, exponentText] = value.toLowerCase().split('e')
  const exponent = exponentText ? Number(exponentText) : 0
  const unsigned = coefficient.replace(/^[+-]/, '')
  const [integerPart, fractionPart = ''] = unsigned.split('.')
  const digits = `${integerPart}${fractionPart}`.replace(/0+$/, '')
  const decimalPosition = integerPart.length + exponent
  return Math.max(0, digits.length - decimalPosition)
}

function expandScientificNotation(value: string): string {
  const [coefficient, exponentText] = value.toLowerCase().split('e')
  if (!exponentText) return value

  const exponent = Number(exponentText)
  const sign = coefficient.startsWith('-') || coefficient.startsWith('+') ? coefficient[0] : ''
  const unsigned = sign ? coefficient.slice(1) : coefficient
  const [integerPart, fractionPart = ''] = unsigned.split('.')
  const digits = `${integerPart}${fractionPart}`
  const decimalPosition = integerPart.length + exponent

  if (decimalPosition <= 0) return `${sign}0.${'0'.repeat(-decimalPosition)}${digits}`
  if (decimalPosition >= digits.length) return `${sign}${digits}${'0'.repeat(decimalPosition - digits.length)}`
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
}
