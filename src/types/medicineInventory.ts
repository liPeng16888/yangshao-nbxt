export type MedicineUnit = 'BOTTLE' | 'LITER' | 'MILLILITER' | 'GRAM'

export type MedicineMovementType = 'INBOUND' | 'OUTBOUND' | 'CORRECTION_IN' | 'CORRECTION_OUT'

export type MedicineMovementKind = 'inbound' | 'outbound'

export interface MedicineInventoryItem {
  id: string
  frontendUserId: string
  name: string
  unit: MedicineUnit
  unitLabel: string
  currentQuantity: number
  createdAt: string
  updatedAt: string
}

export interface MedicineInventoryMovement {
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
  createdAt: string
}

export interface MedicineCommonName {
  id: string
  frontendUserId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface MedicineMovementQuery {
  medicineItemIds?: string[]
  startDate?: string
  endDate?: string
}

export interface CreateMedicineInboundPayload {
  occurredOn: string
  name: string
  unit: MedicineUnit
  quantity: string | number
  remark?: string
}

export interface CreateMedicineOutboundPayload {
  occurredOn: string
  medicineItemId: string
  quantity: string | number
  remark?: string
}

export interface CreateMedicineCorrectionPayload {
  reason: string
}

export interface MedicineInventoryMutationResponse {
  item: MedicineInventoryItem
  movement: MedicineInventoryMovement
}
