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
export type AdminAttendanceNumeric = number | string

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
  baseSalary: AdminAttendanceNumeric
  attendanceBonus: AdminAttendanceNumeric
  overtimeHourlyRate: AdminAttendanceNumeric
  restQuotaDays: AdminAttendanceNumeric
  hasPhoto?: boolean
  frontendUser?: AdminAttendanceFrontendAccount
}

export interface AdminAttendanceEmployeeResponse extends Omit<AdminAttendanceEmployee, 'idCardMasked' | 'bankCardMasked' | 'addressMasked' | 'emergencyContactMasked'> {
  idCard?: string
  bankCard?: string
  address?: string
  emergencyContact?: string
  idCardMasked?: string
  bankCardMasked?: string
  addressMasked?: string
  emergencyContactMasked?: string
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
  weekly: AdminWeeklySchedule[]
  overrides: AdminDateOverride[]
  monthly: AdminMonthlyAttendanceSetting[]
}

export interface AdminAttendanceFrontendAccount {
  account: string
  username: string
  displayRemark?: string | null
}

export interface AdminAttendanceEmbeddedEmployee {
  employeeNumber: string
  name: string
}

export interface AdminWeeklySchedule {
  id: string
  frontendUserId: string
  employeeId: string
  weekday: number
  isWorkday: boolean
  scheduledMinutes: number
}

export interface AdminDateOverride {
  id: string
  frontendUserId: string
  employeeId: string
  date: string
  isWorkday: boolean
  scheduledMinutes: number
  remark?: string | null
}

export interface AdminMonthlyAttendanceSetting {
  id: string
  frontendUserId: string
  employeeId: string
  month: string
  scheduledWorkDays: AdminAttendanceNumeric
  restQuotaDays: AdminAttendanceNumeric
}

export interface AdminAttendanceRecord {
  id: string
  frontendUserId: string
  employeeId: string
  date: string
  isScheduledWorkday?: boolean
  scheduledMinutes: number
  checkInAt?: string | null
  checkOutAt?: string | null
  workedMinutes: number
  lateMinutes: number
  earlyLeaveMinutes: number
  absenceMinutes: number
  overtimeMinutes: number
  remark?: string | null
  employee: AdminAttendanceEmbeddedEmployee
}

export interface AdminLeaveTypeSummary {
  id: string
  name: string
  countsTowardRestQuota?: boolean
}

export interface AdminLeaveRequest {
  id: string
  frontendUserId: string
  employeeId: string
  leaveTypeId: string
  startDate: string
  endDate: string
  unit: 'FULL_DAY' | 'HALF_DAY' | 'HOUR'
  countedDays: AdminAttendanceNumeric
  reason: string
  status: AdminLeaveStatus
  reviewRemark?: string | null
  employee: AdminAttendanceEmbeddedEmployee
  leaveType: AdminLeaveTypeSummary
}

export interface AdminCommissionTypeSummary {
  id: string
  name: string
  unitName?: string
}

export interface AdminCommissionRecord {
  id: string
  frontendUserId: string
  employeeId: string
  commissionTypeId: string
  date: string
  quantity: AdminAttendanceNumeric
  unitPriceSnapshot: AdminAttendanceNumeric
  amount: AdminAttendanceNumeric
  remark?: string | null
  employee: AdminAttendanceEmbeddedEmployee
  commissionType: AdminCommissionTypeSummary
}

export interface AdminBonusRecord {
  id: string
  frontendUserId: string
  employeeId: string
  date: string
  amount: AdminAttendanceNumeric
  reason: string
  employee: AdminAttendanceEmbeddedEmployee
}

export interface AdminPayrollCalculationInput {
  baseSalary?: AdminAttendanceNumeric
  attendanceBonus?: AdminAttendanceNumeric
  scheduledWorkDays?: AdminAttendanceNumeric
  restQuotaDays?: AdminAttendanceNumeric
  countedLeaveDays?: AdminAttendanceNumeric
  absenceDays?: AdminAttendanceNumeric
  overtimeMinutes?: AdminAttendanceNumeric
  overtimeHourlyRate?: AdminAttendanceNumeric
  commissionAmount?: AdminAttendanceNumeric
  bonusAmount?: AdminAttendanceNumeric
}

export interface AdminPayrollCalculationResult {
  overtimePay?: AdminAttendanceNumeric
  commissionAmount?: AdminAttendanceNumeric
  bonusAmount?: AdminAttendanceNumeric
  leaveDeduction?: AdminAttendanceNumeric
  absenceDeduction?: AdminAttendanceNumeric
  payableAmount?: AdminAttendanceNumeric
  issues?: string[]
}

export interface AdminPayrollItem {
  id: string
  employeeId: string
  employeeNumberSnapshot: string
  employeeNameSnapshot: string
  payableAmount: AdminAttendanceNumeric
  issues?: string[]
  baseSalary?: AdminAttendanceNumeric
  overtimePay?: AdminAttendanceNumeric
  commissionAmount?: AdminAttendanceNumeric
  bonusAmount?: AdminAttendanceNumeric
  leaveDeduction?: AdminAttendanceNumeric
  absenceDeduction?: AdminAttendanceNumeric
  adjustments: Array<{ id?: string; amount: AdminAttendanceNumeric; reason?: string }>
  calculationSnapshot?: { input?: AdminPayrollCalculationInput; result?: AdminPayrollCalculationResult }
}

export interface AdminAttendancePayrollRun {
  id: string
  frontendUserId: string
  month: string
  status: AdminPayrollStatus
  frontendUser?: AdminAttendanceFrontendAccount
  items: AdminPayrollItem[]
}

export interface AdminAttendanceAuditActor {
  account: string
  username: string
  role: AdminRole | 'FRONTEND_USER'
}

export interface AdminAttendanceAuditRow {
  id: string
  frontendUserId: string
  action: string
  entityType: string
  entityId: string
  reason?: string | null
  createdAt: string
  actorUser?: AdminAttendanceAuditActor
}

export interface AdminAttendanceAuditQuery {
  frontendUserIds: string[]
  month?: string
}

export interface AdminAttendanceTableRow {
  id: string
  accountName?: string
  frontendUserId?: string
  employeeNumber?: string
  name?: string
  status?: string
  phone?: string
  idCardMasked?: string
  bankCardMasked?: string
  addressMasked?: string
  hireDate?: string
  baseSalary?: AdminAttendanceNumeric
  attendanceBonus?: AdminAttendanceNumeric
  categoryLabel?: string
  employeeLabel?: string
  scheduleDate?: string
  weekdayLabel?: string | number
  isWorkday?: boolean
  scheduledMinutes?: number
  scheduledWorkDays?: AdminAttendanceNumeric
  restQuotaDays?: AdminAttendanceNumeric
  date?: string
  checkInText?: string
  checkOutText?: string
  workedMinutes?: number
  lateMinutes?: number
  earlyLeaveMinutes?: number
  absenceMinutes?: number
  overtimeMinutes?: number
  leaveTypeLabel?: string
  startDate?: string
  endDate?: string
  unitLabel?: string
  countedDays?: AdminAttendanceNumeric
  reason?: string
  reviewRemark?: string | null
  typeLabel?: string
  quantity?: AdminAttendanceNumeric | '-'
  unitPrice?: AdminAttendanceNumeric | '-'
  amount?: AdminAttendanceNumeric
  month?: string
  overtimePay?: AdminAttendanceNumeric
  commissionAmount?: AdminAttendanceNumeric
  bonusAmount?: AdminAttendanceNumeric
  deductionAmount?: number
  payableAmount?: AdminAttendanceNumeric
  issuesText?: string
  remark?: string | null
}

export interface AdminAttendanceAuditDisplayRow {
  id: string
  accountName: string
  createdAt: string
  actorLabel: string
  actionLabel: string
  entityLabel: string
  entityId: string
  reason: string
}
