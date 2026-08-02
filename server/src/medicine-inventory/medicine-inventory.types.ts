import { MedicineMovementType, MedicineUnit, Prisma } from '@prisma/client'

export const MEDICINE_UNIT_LABELS: Record<MedicineUnit, string> = {
  BOTTLE: '瓶',
  LITER: '升',
  MILLILITER: '毫升',
  GRAM: '克'
}

export const MAX_MEDICINE_QUANTITY = new Prisma.Decimal('99999999999.999')

export type MedicineQuantityValidation =
  | { ok: true; value: string }
  | { ok: false; message: string }

export type MedicineQuantityInput = string | number | Prisma.Decimal

export type MedicineMovementKind = 'inbound' | 'outbound'

export interface MedicineMovementQuery {
  startDate?: string
  endDate?: string
  medicineItemIds?: string[]
}

export interface CreateMedicineInboundPayload {
  occurredOn: string
  name: string
  unit: MedicineUnit
  quantity: MedicineQuantityInput
  remark?: string
}

export interface CreateMedicineOutboundPayload {
  occurredOn: string
  medicineItemId: string
  quantity: MedicineQuantityInput
  remark?: string
}

export interface MedicineInventoryItemDto {
  id: string
  frontendUserId: string
  name: string
  unit: MedicineUnit
  unitLabel: string
  currentQuantity: number
  createdAt: Date
  updatedAt: Date
}

export interface MedicineInventoryMovementDto {
  id: string
  frontendUserId: string
  medicineItemId: string
  type: MedicineMovementType
  occurredOn: string
  quantity: number
  nameSnapshot: string
  unitSnapshot: MedicineUnit
  unitLabel: string
  remark: string | null
  correctionOfId: string | null
  createdAt: Date
}

export function validateMedicineQuantity(unit: MedicineUnit, input: unknown): MedicineQuantityValidation {
  if (!Object.values(MedicineUnit).includes(unit)) {
    return { ok: false, message: '药品单位无效' }
  }
  if (typeof input === 'string' && !input.trim()) {
    return { ok: false, message: '数量必须是正数' }
  }

  let quantity: Prisma.Decimal
  try {
    quantity = new Prisma.Decimal(input as Prisma.Decimal.Value)
  } catch {
    return { ok: false, message: '数量必须是有效数字' }
  }

  if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0)) {
    return { ok: false, message: '数量必须是正数' }
  }
  if (quantity.greaterThan(MAX_MEDICINE_QUANTITY)) {
    return { ok: false, message: '数量超出允许范围' }
  }
  if (unit === MedicineUnit.BOTTLE && !quantity.isInteger()) {
    return { ok: false, message: '瓶数量必须是正整数' }
  }
  if (quantity.decimalPlaces() > 3) {
    return { ok: false, message: '数量最多保留 3 位小数' }
  }

  return { ok: true, value: quantity.toString() }
}
