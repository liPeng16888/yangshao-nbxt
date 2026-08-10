export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
export type LeaveUnit = 'FULL_DAY' | 'HALF_DAY' | 'HOUR'
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type PayrollStatus = 'DRAFT' | 'CONFIRMED'

export interface EmployeeQuery { keyword?: string; status?: EmployeeStatus | '' }
export interface AttendanceQuery { employeeId?: string; month?: string; startDate?: string; endDate?: string; status?: LeaveStatus | '' }

export interface EmployeePayload {
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

export interface WeeklySchedulePayload { employeeId: string; weekday: number; isWorkday: boolean; scheduledMinutes: number }
export interface WeeklySchedule extends WeeklySchedulePayload { id: string }
export interface DateOverridePayload { employeeId: string; date: string; isWorkday: boolean; scheduledMinutes: number; remark?: string }
export interface DateOverride extends DateOverridePayload { id: string }
export interface MonthlySetting { id: string; employeeId: string; month: string; scheduledWorkDays: number; restQuotaDays: number }

export interface AttendancePayload {
  employeeId: string; date: string; isScheduledWorkday: boolean; scheduledMinutes: number; checkInAt?: string; checkOutAt?: string;
  workedMinutes?: number; lateMinutes?: number; earlyLeaveMinutes?: number; absenceMinutes?: number; overtimeMinutes?: number; remark?: string
}
export interface AttendanceRecord extends AttendancePayload { id: string; manuallyEdited: boolean; lockedAt?: string | null }

export interface LeaveTypePayload { name: string; active?: boolean; countsTowardRestQuota: boolean }
export interface LeaveType extends Required<LeaveTypePayload> { id: string }
export interface LeaveRequestPayload { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; unit: LeaveUnit; hours?: number; reason: string }
export interface LeaveRequest extends LeaveRequestPayload { id: string; status: LeaveStatus; countedDays: number; reviewRemark: string; lockedAt?: string | null }

export interface CommissionTypePayload { name: string; unitName: string; unitPrice: number; active?: boolean }
export interface CommissionType extends Required<CommissionTypePayload> { id: string }
export interface CommissionPayload { employeeId: string; commissionTypeId: string; date: string; quantity: number; unitPrice?: number; remark?: string }
export interface CommissionRecord extends CommissionPayload { id: string; unitPrice: number; amount: number; lockedAt?: string | null }
export interface BonusPayload { employeeId: string; date: string; amount: number; reason: string }
export interface BonusRecord extends BonusPayload { id: string; lockedAt?: string | null }

export interface CompensationTotal { employeeId: string; commissionAmount: number; bonusAmount: number }
export interface PayrollAdjustment { id: string; payrollItemId: string; amount: number; reason: string }
export interface PayrollSnapshot {
  baseSalary: number; attendanceBonus: number; overtimePay: number; commissionAmount: number; bonusAmount: number;
  adjustmentAmount: number; leaveDeduction: number; absenceDeduction: number; payableAmount: number
}
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
