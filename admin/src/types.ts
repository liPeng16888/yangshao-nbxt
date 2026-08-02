export type AdminRole = 'ROOT_ADMIN' | 'SUB_ADMIN'

export interface AdminUser {
  id: string
  account: string
  username: string
  role: AdminRole
}

export interface FrontendOption {
  id: string
  account: string
  name: string
  disabled: boolean
}

export interface ApiPageState {
  loading: boolean
}

export interface AdminCustomerOverviewRow {
  frontendUserId: string
  frontendUserName: string
  customerKey: string
  customer: string
  customerDisplay: string
  sampleCount: number
  totalAmount: number
  firstDetectionDate: string
  lastDetectionDate: string
}

export type MedicineUnit = 'BOTTLE' | 'LITER' | 'MILLILITER' | 'GRAM'

export type MedicineMovementType = 'INBOUND' | 'OUTBOUND' | 'CORRECTION_IN' | 'CORRECTION_OUT'

export interface AdminMedicineInventoryItem {
  id: string
  frontendUserId: string
  name: string
  unit: MedicineUnit
  unitLabel: string
  currentQuantity: number
  createdAt: string
  updatedAt: string
}

export interface AdminMedicineInventoryMovement {
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
