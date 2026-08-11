export type EmployeeStatus = 'ACTIVE' | 'INACTIVE'
export type LeaveUnit = 'FULL_DAY' | 'HALF_DAY' | 'HOUR'
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type PayrollStatus = 'DRAFT' | 'CONFIRMED'

export interface EmployeeQuery { keyword?: string; status?: EmployeeStatus | '' }
export interface AttendanceQuery { employeeId?: string; employeeIds?: string[]; month?: string; startDate?: string; endDate?: string; status?: LeaveStatus | '' }

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

export interface WeeklySchedulePayload { employeeId: string; weekday: number; isWorkday: boolean; plannedStartTime?: string | null; plannedEndTime?: string | null; scheduledMinutes: number }
export interface WeeklySchedule extends WeeklySchedulePayload { id: string }
export interface DateOverridePayload { employeeId: string; date: string; isWorkday: boolean; plannedStartTime?: string | null; plannedEndTime?: string | null; scheduledMinutes: number; remark?: string }
export interface DateOverride extends DateOverridePayload { id: string }
export interface MonthlySetting { id: string; employeeId: string; month: string; scheduledWorkDays: number; restQuotaDays: number }
export interface MonthlySettingPayload { employeeId: string; month: string; restQuotaDays: number }

export interface ScheduleSegment { id?: string; sequence?: number; startTime: string; endTime: string }
export interface MonthlySchedulePayload { employeeId: string; date: string; isWorkday: boolean; segments: ScheduleSegment[]; remark?: string }
export interface MonthlyScheduleDay extends MonthlySchedulePayload { id: string; scheduledMinutes: number; breakMinutes: number }
export interface BatchMonthlySchedulePayload extends Omit<MonthlySchedulePayload, 'date'> { dates: string[] }
export interface BatchMonthlyScheduleResult { rows: MonthlyScheduleDay[]; updated: number; overwritten: number }
export interface ActualAttendanceSegment { id?: string; sequence?: number; checkInAt: string; checkOutAt: string }

/**
 * The optional weekly-era fields let the existing attendance-record page migrate
 * incrementally. New monthly scheduling code uses actualSegments and
 * explicitAbsenceMinutes exclusively.
 */
export interface EmployeeAttendanceInput { employeeId: string; date: string; actualSegments: ActualAttendanceSegment[]; explicitAbsenceMinutes?: number; overtimeMinutes?: number; remark?: string }
/** @deprecated Compatibility input for the legacy weekly attendance page. */
export interface AttendancePayload { employeeId: string; date: string; isScheduledWorkday: boolean; scheduledMinutes: number; checkInAt?: string | null; checkOutAt?: string | null; workedMinutes?: number; lateMinutes?: number; earlyLeaveMinutes?: number; absenceMinutes?: number; overtimeMinutes?: number; remark?: string }
export interface AttendanceRecord extends EmployeeAttendanceInput { id: string; manuallyEdited: boolean; lockedAt?: string | null; isScheduledWorkday: boolean; scheduledMinutes: number; checkInAt?: string | null; checkOutAt?: string | null; workedMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; absenceMinutes: number }
export interface AttendanceGenerationResult { created: number; updated: number; skippedManual: number; generated: number }

export interface LeaveTypePayload { name: string; active?: boolean; countsTowardRestQuota: boolean }
export interface LeaveType extends Required<LeaveTypePayload> { id: string; referenced?: boolean }
export interface LeaveRequestPayload { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; unit: LeaveUnit; hours?: number; reason: string }
export interface LeaveRequest extends LeaveRequestPayload { id: string; status: LeaveStatus; countedDays: number; reviewRemark: string; lockedAt?: string | null }

export interface CommissionTypePayload { name: string; unitName: string; unitPrice: number; active?: boolean }
export interface CommissionType extends Required<CommissionTypePayload> { id: string; referenced?: boolean }
export interface CommissionPayload { employeeId: string; commissionTypeId: string; date: string; quantity: number; unitPrice?: number; remark?: string }
export interface CommissionRecord extends CommissionPayload { id: string; unitPrice: number; amount: number; lockedAt?: string | null }
export interface BonusPayload { employeeId: string; date: string; amount: number; reason: string }
export interface BonusRecord extends BonusPayload { id: string; lockedAt?: string | null }

export interface CompensationTotal { employeeId: string; commissionAmount: number; bonusAmount: number }
export interface PayrollAdjustment { id: string; payrollItemId: string; amount: number; reason: string }
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
export type AttendanceCalendarStatus = 'FUTURE' | 'ABSENT' | 'LEAVE' | 'REST' | 'NORMAL' | 'OVERTIME' | 'SHORT'
export type AttendanceCalendarTone = 'future' | 'normal' | 'leave' | 'absent' | 'rest' | 'overtime' | 'short'
export interface AttendanceCalendarDay {
  date: string; day: number; isFuture: boolean; status: AttendanceCalendarStatus; schedule: MonthlyScheduleDay | null;
  actualSegments: ActualAttendanceSegment[]; scheduledMinutes: number; workedMinutes: number; approvedLeaveMinutes: number;
  overtimeMinutes: number; displayMinutes: number; shortageMinutes: number; durationText: string; leaveTypeName: string;
  leaveReason: string; absenceReason: string; backgroundTone: AttendanceCalendarTone; durationTone: AttendanceCalendarTone
}
export interface ScheduleAttendanceOverview { month: string; employee: Pick<Employee, 'id' | 'employeeNumber' | 'name'> | null; days: AttendanceCalendarDay[]; overview: AttendanceOverview; readonly: boolean }

export interface EmployeeAttendanceState {
  schemaVersion: number;
  employees: Array<Employee & { sensitive?: { idCard: string; bankCard: string; address: string; emergencyContact: string } }>;
  weeklySchedules: WeeklySchedule[]; overrides: DateOverride[]; monthlySchedules: MonthlyScheduleDay[]; monthSettings: MonthlySetting[]; attendance: AttendanceRecord[];
  leaveTypes: LeaveType[]; leaves: LeaveRequest[]; commissionTypes: CommissionType[]; commissions: CommissionRecord[];
  bonuses: BonusRecord[]; payrolls: PayrollRun[]
}
