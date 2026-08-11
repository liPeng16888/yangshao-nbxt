export type EmployeeStatus = 'ACTIVE' | 'INACTIVE'
export type LeaveUnit = 'FULL_DAY' | 'HALF_DAY' | 'HOUR'
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type PayrollStatus = 'DRAFT' | 'CONFIRMED'
export interface OptimisticVersion { updatedAt?: string }
export interface VersionedMutation { baseUpdatedAt?: string }

export interface EmployeeQuery { keyword?: string; status?: EmployeeStatus | '' }
export interface AttendanceQuery { employeeId?: string; month?: string; startDate?: string; endDate?: string; status?: LeaveStatus | '' }

export interface EmployeePayload extends VersionedMutation {
  employeeNumber: string; name: string; status?: EmployeeStatus; phone?: string; idCard?: string; bankCard?: string;
  address?: string; emergencyContact?: string; hireDate: string; terminationDate?: string;
  baseSalary?: number; attendanceBonus?: number; overtimeHourlyRate?: number; restQuotaDays?: number
}
export interface Employee extends Required<Pick<EmployeePayload, 'employeeNumber' | 'name' | 'hireDate'>> {
  id: string; status: EmployeeStatus; phone: string; idCardMasked: string; bankCardMasked: string; addressMasked: string;
  emergencyContactMasked: string; terminationDate: string; baseSalary: number; attendanceBonus: number;
  overtimeHourlyRate: number; restQuotaDays: number; hasPhoto: boolean; createdAt: string; updatedAt: string
}
export interface RevealedEmployee extends Employee { idCard: string; bankCard: string; address: string; emergencyContact: string }

export interface WeeklySchedulePayload extends VersionedMutation { employeeId: string; weekday: number; isWorkday: boolean; plannedStartTime?: string | null; plannedEndTime?: string | null; scheduledMinutes: number }
export interface WeeklySchedule extends WeeklySchedulePayload, OptimisticVersion { id: string }
export interface DateOverridePayload extends VersionedMutation { employeeId: string; date: string; isWorkday: boolean; plannedStartTime?: string | null; plannedEndTime?: string | null; scheduledMinutes: number; remark?: string }
export interface DateOverride extends DateOverridePayload, OptimisticVersion { id: string }
export interface MonthlySetting extends OptimisticVersion { id: string; employeeId: string; month: string; scheduledWorkDays: number; restQuotaDays: number }

export interface AttendancePayload extends VersionedMutation {
  employeeId: string; date: string; isScheduledWorkday: boolean; scheduledMinutes: number; checkInAt?: string | null; checkOutAt?: string | null;
  workedMinutes?: number; lateMinutes?: number; earlyLeaveMinutes?: number; absenceMinutes?: number; overtimeMinutes?: number; remark?: string
}
export interface AttendanceRecord extends AttendancePayload, OptimisticVersion { id: string; manuallyEdited: boolean; lockedAt?: string | null }
export interface AttendanceGenerationResult { created: number; updated: number; skippedManual: number; generated: number }

export interface LeaveTypePayload extends VersionedMutation { name: string; active?: boolean; countsTowardRestQuota: boolean }
export interface LeaveType extends Required<Omit<LeaveTypePayload, 'baseUpdatedAt'>>, OptimisticVersion { id: string; referenced?: boolean; baseUpdatedAt?: string }
export interface LeaveRequestPayload extends VersionedMutation { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; unit: LeaveUnit; hours?: number; reason: string }
export interface LeaveRequest extends LeaveRequestPayload, OptimisticVersion { id: string; status: LeaveStatus; countedDays: number; reviewRemark: string; lockedAt?: string | null }

export interface CommissionTypePayload extends VersionedMutation { name: string; unitName: string; unitPrice: number; active?: boolean }
export interface CommissionType extends Required<Omit<CommissionTypePayload, 'baseUpdatedAt'>>, OptimisticVersion { id: string; referenced?: boolean; baseUpdatedAt?: string }
export interface CommissionPayload extends VersionedMutation { employeeId: string; commissionTypeId: string; date: string; quantity: number; unitPrice?: number; remark?: string }
export interface CommissionRecord extends CommissionPayload, OptimisticVersion { id: string; unitPrice: number; amount: number; lockedAt?: string | null }
export interface BonusPayload extends VersionedMutation { employeeId: string; date: string; amount: number; reason: string }
export interface BonusRecord extends BonusPayload, OptimisticVersion { id: string; lockedAt?: string | null }

export interface CompensationTotal { employeeId: string; commissionAmount: number; bonusAmount: number }
export interface PayrollAdjustment extends OptimisticVersion { id: string; payrollItemId: string; amount: number; reason: string }
export interface PayrollCalculationInput {
  baseSalary: number; attendanceBonus: number; scheduledWorkDays: number; restQuotaDays: number; countedLeaveDays: number;
  absenceDays: number; overtimeMinutes: number; overtimeHourlyRate: number; commissionAmount: number; bonusAmount: number;
  adjustments: Array<{ amount: number }>
}
export interface PayrollCalculationResult {
  dailyRate: number; excessLeaveDays: number; leaveDeduction: number; absenceDeduction: number; overtimeHours: number;
  overtimePay: number; commissionAmount: number; bonusAmount: number; adjustmentAmount: number; attendanceBonus: number;
  payableAmount: number; issues: string[]
}
export interface PayrollSnapshot { input: PayrollCalculationInput; result: PayrollCalculationResult; generatedAt: string }
export interface PayrollItem { id: string; employeeId: string; employee: Employee; payableAmount: number; calculationSnapshot: PayrollSnapshot; issues: string[]; adjustments: PayrollAdjustment[] }
export interface PayrollRun { id: string; month: string; status: PayrollStatus; totalAmount: number; issueCount: number; issues: string[]; items: PayrollItem[]; confirmedAt?: string | null; reopenReason?: string }
export interface AttendanceOverview {
  month: string; activeEmployees: number; todayPresent: number; todayOnLeave: number; todayAbsent: number;
  overtimeHours: number; pendingLeaves: number; projectedPayroll: number; issueCount: number; issues: string[]
}

export interface EmployeeAttendanceState {
  employees: Array<Employee & { sensitive?: { idCard: string; bankCard: string; address: string; emergencyContact: string } }>;
  weeklySchedules: WeeklySchedule[]; overrides: DateOverride[]; monthSettings: MonthlySetting[]; attendance: AttendanceRecord[];
  leaveTypes: LeaveType[]; leaves: LeaveRequest[]; commissionTypes: CommissionType[]; commissions: CommissionRecord[];
  bonuses: BonusRecord[]; payrolls: PayrollRun[]
}
