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

export type AdminEmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
export type AdminLeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type AdminPayrollStatus = 'DRAFT' | 'CONFIRMED'

export interface AdminEmployeeAttendanceQuery {
  frontendUserIds: string[]
  employeeId?: string
  month?: string
  startDate?: string
  endDate?: string
  status?: string
}

export interface AdminAttendanceEmployee {
  id: string
  frontendUserId: string
  employeeNumber: string
  name: string
  status: AdminEmployeeStatus
  phone: string
  idCardMasked: string
  bankCardMasked: string
  addressMasked: string
  emergencyContactMasked: string
  hireDate: string
  terminationDate?: string | null
  baseSalary: number | string
  attendanceBonus: number | string
  overtimeHourlyRate: number | string
  restQuotaDays: number | string
  hasPhoto?: boolean
  frontendUser?: { account: string; username: string; displayRemark?: string | null }
}

export interface AdminRevealedAttendanceEmployee extends AdminAttendanceEmployee {
  idCard: string
  bankCard: string
  address: string
  emergencyContact: string
}

export interface AdminAttendanceOverview {
  month: string
  workforce: number
  attendanceRecords: number
  pendingLeave: number
  payrollRuns: number
  readonly: true
}

export interface AdminAttendanceSchedules {
  weekly: Record<string, any>[]
  overrides: Record<string, any>[]
  monthly: Record<string, any>[]
}

export interface AdminAttendancePayrollRun extends Record<string, any> {
  id: string
  frontendUserId: string
  month: string
  status: AdminPayrollStatus
  items: Record<string, any>[]
}

export interface AdminAttendanceAuditRow extends Record<string, any> {
  id: string
  frontendUserId: string
  action: string
  entityType: string
  entityId: string
  reason?: string | null
  createdAt: string
}
