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

export type FrontendMenuPermission =
  | 'DATA_MAIN'
  | 'DATA_STANDARD_SAMPLE'
  | 'DATA_COEFFICIENT'
  | 'LAB_REPORT_IMAGE_TEMPLATE'
  | 'LAB_REPORT_SMS_TEMPLATE'
  | 'ATTENDANCE_OVERVIEW'
  | 'ATTENDANCE_EMPLOYEES'
  | 'ATTENDANCE_SCHEDULES'
  | 'ATTENDANCE_RECORDS'
  | 'ATTENDANCE_LEAVE'
  | 'ATTENDANCE_COMPENSATION'
  | 'ATTENDANCE_PAYROLL'
  | 'PREPAID_RECHARGE'
  | 'PREPAID_CUSTOMERS'
  | 'PREPAID_CONSUMPTIONS'
  | 'PREPAID_SETTLEMENTS'
  | 'FINANCE_EXPENSES'
  | 'FINANCE_INCOME'
  | 'FINANCE_UNSETTLED'
  | 'FINANCE_MONTHLY_SETTLEMENT'
  | 'REPORTS'
  | 'MEDICINE_STOCK'
  | 'MEDICINE_INBOUND'
  | 'MEDICINE_OUTBOUND'
  | 'CUSTOMER_OVERVIEW'
  | 'BLACKLIST'

export interface AdminFrontendSubAccount {
  id: string
  account: string
  username: string
  disabled: boolean
  requiresAccessGuardPassword: boolean
  permissions: FrontendMenuPermission[]
  createdAt: string
  lastLoginAt?: string | null
}

export interface AdminFrontendAccount {
  id: string
  account: string
  username: string
  displayRemark: string
  displayName: string
  role: 'FRONTEND_USER'
  disabled: boolean
  disabledReason: string
  password: string
  accessGuard: Record<string, unknown>
  accessGroups: Array<Record<string, any>>
  frontendSubAccounts: AdminFrontendSubAccount[]
  createdAt: string
  lastDataUpdatedAt?: string | null
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

export type AdminEmployeeStatus = 'ACTIVE' | 'INACTIVE'
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

export interface AdminAttendanceRevealPayload {
  password: string
}

export interface AdminRevealedAttendanceEmployeeResponse extends AdminAttendanceEmployeeResponse {
  idCard: string
  bankCard: string
  address: string
  emergencyContact: string
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

export type AdminAttendanceCalendarStatus = 'FUTURE' | 'ABSENT' | 'LEAVE' | 'REST' | 'NORMAL' | 'OVERTIME' | 'SHORT'
export type AdminAttendanceCalendarTone = 'future' | 'normal' | 'leave' | 'absent' | 'rest' | 'overtime' | 'short'
export interface AdminAttendanceCalendarOverview {
  month: string
  activeEmployees: number
  todayPresent: number
  todayOnLeave: number
  todayAbsent: number
  overtimeHours: number
  pendingLeaves: number
  projectedPayroll: number
  issueCount: number
  issues: string[]
}
export interface AdminAttendanceCalendarSchedule {
  id: string
  employeeId: string
  date: string
  isWorkday: boolean
  scheduledMinutes: number
  breakMinutes: number
  segments: AdminScheduleSegment[]
  remark?: string
}
export interface AdminAttendanceCalendarDay {
  date: string
  day: number
  isFuture: boolean
  status: AdminAttendanceCalendarStatus
  schedule: AdminAttendanceCalendarSchedule | null
  actualSegments: Array<{ sequence?: number; checkInAt: string; checkOutAt: string }>
  scheduledMinutes: number
  workedMinutes: number
  approvedLeaveMinutes: number
  overtimeMinutes: number
  displayMinutes: number
  shortageMinutes: number
  durationText: string
  leaveTypeName: string
  leaveReason: string
  absenceReason: string
  backgroundTone: AdminAttendanceCalendarTone
  durationTone: AdminAttendanceCalendarTone
}
export interface AdminScheduleAttendanceOverview {
  month: string
  employee: { id: string; employeeNumber: string; name: string } | null
  days: AdminAttendanceCalendarDay[]
  overview: AdminAttendanceCalendarOverview
  readonly: true
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

export interface AdminScheduleSegment {
  sequence: number
  startTime: string
  endTime: string
}

export interface AdminMonthlyScheduleDay {
  id: string
  frontendUserId: string
  employeeId: string
  date: string
  isWorkday: boolean
  scheduledMinutes: number
  breakMinutes: number
  segments: AdminScheduleSegment[]
  remark?: string | null
  employee: AdminAttendanceEmbeddedEmployee
  frontendUser?: AdminAttendanceFrontendAccount
}

export type AdminAttendanceSchedules = AdminMonthlyScheduleDay[]

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
  explicitAbsenceMinutes: number
  absenceMinutes: number
  overtimeMinutes: number
  remark?: string | null
  employee: AdminAttendanceEmbeddedEmployee
  actualSegments?: Array<{ sequence: number; checkInAt: string; checkOutAt: string }>
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
  workdayLabel?: string
  intervalsText?: string
  restText?: string
  scheduledHoursText?: string
  scheduledMinutes?: number
  date?: string
  checkInText?: string
  checkOutText?: string
  actualIntervalsText?: string
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
