import type { AxiosRequestConfig } from 'axios'
import baseRequest, { useMocks } from '@/utils/request'
import * as mock from '@/mocks/employeeAttendance'
import type {
  AttendanceOverview, AttendancePayload, AttendanceQuery, AttendanceRecord, BonusPayload, BonusRecord,
  CommissionPayload, CommissionRecord, CommissionType, CommissionTypePayload, CompensationTotal, DateOverride,
  DateOverridePayload, Employee, EmployeePayload, EmployeeQuery, LeaveRequest, LeaveRequestPayload, LeaveType,
  LeaveTypePayload, MonthlySetting, PayrollAdjustment, PayrollRun, RevealedEmployee, WeeklySchedule, WeeklySchedulePayload
} from '@/types/employeeAttendance'

function withAttendanceGrant(config: AxiosRequestConfig = {}) {
  try {
    const sessions = JSON.parse(window.localStorage.getItem('ys_access_guard_group_sessions') || '{}') as Record<string, { expiresAt?: number; token?: string }>
    const token = Object.values(sessions).find((session) => (session.expiresAt || 0) > Date.now() && session.token)?.token
    return token ? { ...config, headers: { ...config.headers, 'X-YS-Access-Grant': token } } : config
  } catch { return config }
}

const attendanceRequest = {
  get: (url: string, config?: AxiosRequestConfig): Promise<any> => baseRequest.get(url, withAttendanceGrant(config)) as any,
  post: (url: string, data?: unknown, config?: AxiosRequestConfig): Promise<any> => baseRequest.post(url, data, withAttendanceGrant(config)) as any,
  put: (url: string, data?: unknown, config?: AxiosRequestConfig): Promise<any> => baseRequest.put(url, data, withAttendanceGrant(config)) as any,
  delete: (url: string, config?: AxiosRequestConfig): Promise<any> => baseRequest.delete(url, withAttendanceGrant(config)) as any
}

const amount = (value: unknown) => Number(value || 0)
function normalizeEmployee(row: any): Employee {
  return {
    ...row,
    idCardMasked: row.idCardMasked ?? row.idCard ?? '', bankCardMasked: row.bankCardMasked ?? row.bankCard ?? '',
    addressMasked: row.addressMasked ?? row.address ?? '', emergencyContactMasked: row.emergencyContactMasked ?? row.emergencyContact ?? '',
    phone: row.phone || '', terminationDate: row.terminationDate || '', baseSalary: amount(row.baseSalary),
    attendanceBonus: amount(row.attendanceBonus), overtimeHourlyRate: amount(row.overtimeHourlyRate), restQuotaDays: amount(row.restQuotaDays)
  }
}
function normalizePayroll(raw: any): PayrollRun | null {
  if (!raw) return null
  const items = (raw.items || []).map((item: any) => {
    const result = item.calculationSnapshot?.result || item.calculationSnapshot || item
    const input = item.calculationSnapshot?.input || item
    const calculationSnapshot = {
      baseSalary: amount(input.baseSalary ?? item.baseSalary), attendanceBonus: amount(result.attendanceBonus ?? item.attendanceBonus),
      overtimePay: amount(result.overtimePay ?? item.overtimePay), commissionAmount: amount(result.commissionAmount ?? item.commissionAmount),
      bonusAmount: amount(result.bonusAmount ?? item.bonusAmount), adjustmentAmount: amount(result.adjustmentAmount ?? item.adjustmentAmount),
      leaveDeduction: amount(result.leaveDeduction ?? item.leaveDeduction), absenceDeduction: amount(result.absenceDeduction ?? item.absenceDeduction),
      payableAmount: amount(result.payableAmount ?? item.payableAmount)
    }
    return {
      ...item, payableAmount: calculationSnapshot.payableAmount, calculationSnapshot,
      employee: item.employee || { id: item.employeeId, employeeNumber: item.employeeNumberSnapshot, name: item.employeeNameSnapshot },
      issues: Array.isArray(item.issues) ? item.issues : [], adjustments: (item.adjustments || []).map((row: any) => ({ ...row, amount: amount(row.amount) }))
    }
  })
  const issues = items.flatMap((item: any) => item.issues.map((issue: string) => `${item.employee.name}：${issue}`))
  return { ...raw, items, issues, issueCount: issues.length, totalAmount: items.reduce((sum: number, item: any) => sum + item.payableAmount, 0) }
}

export const getEmployees = (query: EmployeeQuery = {}): Promise<Employee[]> => useMocks ? mock.mockGetEmployees(query) : attendanceRequest.get('/employee-attendance/employees', { params: query }).then((rows: any[]) => rows.map(normalizeEmployee))
export const getEmployee = (id: string): Promise<Employee> => useMocks ? mock.mockGetEmployee(id) : attendanceRequest.get(`/employee-attendance/employees/${id}`).then(normalizeEmployee)
export const revealEmployee = (id: string): Promise<RevealedEmployee> => useMocks ? mock.mockRevealEmployee(id) : attendanceRequest.get(`/employee-attendance/employees/${id}/reveal`).then((row: any) => ({ ...normalizeEmployee(row), idCard: row.idCard || '', bankCard: row.bankCard || '', address: row.address || '', emergencyContact: row.emergencyContact || '' }))
export const createEmployee = (payload: EmployeePayload): Promise<Employee> => useMocks ? mock.mockCreateEmployee(payload) : attendanceRequest.post('/employee-attendance/employees', payload).then(normalizeEmployee)
export const updateEmployee = (id: string, payload: EmployeePayload): Promise<Employee> => useMocks ? mock.mockUpdateEmployee(id, payload) : attendanceRequest.put(`/employee-attendance/employees/${id}`, payload).then(normalizeEmployee)
export const deleteEmployee = async (id: string): Promise<Employee | void> => useMocks ? mock.mockDeleteEmployee(id) : attendanceRequest.delete(`/employee-attendance/employees/${id}`)
export const uploadEmployeePhoto = (id: string, photo: File): Promise<Employee> => { if (useMocks) return mock.mockUploadEmployeePhoto(id, photo); const body = new FormData(); body.append('photo', photo); return attendanceRequest.post(`/employee-attendance/employees/${id}/photo`, body) }
export const readEmployeePhoto = (id: string): Promise<Blob | null> => useMocks ? Promise.resolve(null) : attendanceRequest.get(`/employee-attendance/employees/${id}/photo`, { responseType: 'blob' })

export const getWeeklySchedules = (employeeId?: string): Promise<WeeklySchedule[]> => useMocks ? mock.mockGetWeeklySchedules(employeeId) : attendanceRequest.get('/employee-attendance/weekly-schedules', { params: { employeeId } })
export const saveWeeklySchedule = (payload: WeeklySchedulePayload, id?: string): Promise<WeeklySchedule> => useMocks ? mock.mockSaveWeeklySchedule(payload) : id ? attendanceRequest.put(`/employee-attendance/weekly-schedules/${id}`, payload) : attendanceRequest.post('/employee-attendance/weekly-schedules', payload)
export const deleteWeeklySchedule = async (id: string) => useMocks ? mock.mockDeleteWeeklySchedule(id) : attendanceRequest.delete(`/employee-attendance/weekly-schedules/${id}`)
export const getDateOverrides = (query: AttendanceQuery = {}): Promise<DateOverride[]> => useMocks ? mock.mockGetDateOverrides(query) : attendanceRequest.get('/employee-attendance/overrides', { params: query })
export const saveDateOverride = (payload: DateOverridePayload): Promise<DateOverride> => useMocks ? mock.mockSaveDateOverride(payload) : attendanceRequest.post('/employee-attendance/overrides', payload)
export const deleteDateOverride = async (id: string) => useMocks ? mock.mockDeleteDateOverride(id) : attendanceRequest.delete(`/employee-attendance/overrides/${id}`)
export const getMonthlySettings = (month?: string): Promise<MonthlySetting[]> => useMocks ? mock.mockGetMonthlySettings(month) : attendanceRequest.get('/employee-attendance/month-settings', { params: { month } }).then((rows: any[]) => rows.map((row) => ({ ...row, scheduledWorkDays: amount(row.scheduledWorkDays), restQuotaDays: amount(row.restQuotaDays) })))
export const saveMonthlySetting = (payload: Omit<MonthlySetting, 'id'>): Promise<MonthlySetting> => useMocks ? mock.mockSaveMonthlySetting(payload) : attendanceRequest.post('/employee-attendance/month-settings', payload)

export const getAttendance = (query: AttendanceQuery = {}): Promise<AttendanceRecord[]> => useMocks ? mock.mockGetAttendance(query) : attendanceRequest.get('/employee-attendance/attendance', { params: query })
export const saveAttendance = (payload: AttendancePayload, id?: string): Promise<AttendanceRecord> => useMocks ? mock.mockSaveAttendance(payload, id) : id ? attendanceRequest.put(`/employee-attendance/attendance/${id}`, payload) : attendanceRequest.post('/employee-attendance/attendance', payload)
export const deleteAttendance = async (id: string) => useMocks ? mock.mockDeleteAttendance(id) : attendanceRequest.delete(`/employee-attendance/attendance/${id}`)
export const generateAttendance = (month: string, employeeIds: string[]): Promise<{ generated: number }> => useMocks
  ? mock.mockGenerateAttendance(month, employeeIds)
  : attendanceRequest.post('/employee-attendance/attendance/generate', { month, employeeIds }) as unknown as Promise<{ generated: number }>

export const getLeaveTypes = (): Promise<LeaveType[]> => useMocks ? mock.mockGetLeaveTypes() : attendanceRequest.get('/employee-attendance/leave-types')
export const saveLeaveType = (payload: LeaveTypePayload, id?: string): Promise<LeaveType> => useMocks ? mock.mockSaveLeaveType(payload, id) : id ? attendanceRequest.put(`/employee-attendance/leave-types/${id}`, payload) : attendanceRequest.post('/employee-attendance/leave-types', payload)
export const deleteLeaveType = async (id: string) => useMocks ? mock.mockDeleteLeaveType(id) : attendanceRequest.delete(`/employee-attendance/leave-types/${id}`)
export const getLeaves = (query: AttendanceQuery = {}): Promise<LeaveRequest[]> => useMocks ? mock.mockGetLeaves(query) : attendanceRequest.get('/employee-attendance/leaves', { params: query }).then((rows: any[]) => rows.map((row) => ({ ...row, countedDays: amount(row.countedDays) })))
export const saveLeave = (payload: LeaveRequestPayload, id?: string): Promise<LeaveRequest> => useMocks ? mock.mockSaveLeave(payload, id) : id ? attendanceRequest.put(`/employee-attendance/leaves/${id}`, payload) : attendanceRequest.post('/employee-attendance/leaves', payload)
export const deleteLeave = async (id: string) => useMocks ? mock.mockDeleteLeave(id) : attendanceRequest.delete(`/employee-attendance/leaves/${id}`)
export const reviewLeave = (id: string, action: 'approve' | 'reject', reviewRemark = ''): Promise<LeaveRequest> => useMocks ? mock.mockReviewLeave(id, action === 'approve' ? 'APPROVED' : 'REJECTED', reviewRemark) : attendanceRequest.post(`/employee-attendance/leaves/${id}/${action}`, { reviewRemark })

export const getCommissionTypes = (): Promise<CommissionType[]> => useMocks ? mock.mockGetCommissionTypes() : attendanceRequest.get('/employee-attendance/commission-types')
export const saveCommissionType = (payload: CommissionTypePayload, id?: string): Promise<CommissionType> => useMocks ? mock.mockSaveCommissionType(payload, id) : id ? attendanceRequest.put(`/employee-attendance/commission-types/${id}`, payload) : attendanceRequest.post('/employee-attendance/commission-types', payload)
export const deleteCommissionType = async (id: string) => useMocks ? mock.mockDeleteCommissionType(id) : attendanceRequest.delete(`/employee-attendance/commission-types/${id}`)
export const getCommissions = (query: AttendanceQuery = {}): Promise<CommissionRecord[]> => useMocks ? mock.mockGetCommissions(query) : attendanceRequest.get('/employee-attendance/commissions', { params: query }).then((rows: any[]) => rows.map((row) => ({ ...row, quantity: amount(row.quantity), unitPrice: amount(row.unitPrice), amount: amount(row.amount) })))
export const saveCommission = (payload: CommissionPayload, id?: string): Promise<CommissionRecord> => useMocks ? mock.mockSaveCommission(payload, id) : id ? attendanceRequest.put(`/employee-attendance/commissions/${id}`, payload) : attendanceRequest.post('/employee-attendance/commissions', payload)
export const deleteCommission = async (id: string) => useMocks ? mock.mockDeleteCommission(id) : attendanceRequest.delete(`/employee-attendance/commissions/${id}`)
export const getBonuses = (query: AttendanceQuery = {}): Promise<BonusRecord[]> => useMocks ? mock.mockGetBonuses(query) : attendanceRequest.get('/employee-attendance/bonuses', { params: query }).then((rows: any[]) => rows.map((row) => ({ ...row, amount: amount(row.amount) })))
export const saveBonus = (payload: BonusPayload, id?: string): Promise<BonusRecord> => useMocks ? mock.mockSaveBonus(payload, id) : id ? attendanceRequest.put(`/employee-attendance/bonuses/${id}`, payload) : attendanceRequest.post('/employee-attendance/bonuses', payload)
export const deleteBonus = async (id: string) => useMocks ? mock.mockDeleteBonus(id) : attendanceRequest.delete(`/employee-attendance/bonuses/${id}`)
export const getCompensationTotals = (month: string): Promise<CompensationTotal[]> => useMocks ? mock.mockGetCompensationTotals(month) : attendanceRequest.get('/employee-attendance/compensation/totals', { params: { month } })

export const getOverview = (month: string): Promise<AttendanceOverview> => useMocks ? mock.mockGetOverview(month) : attendanceRequest.get('/employee-attendance/overview', { params: { month } }).then((row: any) => ({ month: row.month, activeEmployees: row.activeEmployees ?? row.workforce ?? 0, todayPresent: row.todayPresent ?? row.todayAttendance ?? 0, todayOnLeave: row.todayOnLeave ?? row.todayLeave ?? 0, todayAbsent: row.todayAbsent ?? row.todayAbsence ?? 0, overtimeHours: row.overtimeHours ?? amount(row.overtimeMinutes) / 60, pendingLeaves: row.pendingLeaves ?? row.pendingLeave ?? 0, projectedPayroll: amount(row.projectedPayroll), issueCount: row.issueCount || 0, issues: row.issues || [] }))
export const getPayroll = (month: string): Promise<PayrollRun | null> => useMocks ? mock.mockGetPayroll(month) : attendanceRequest.get('/employee-attendance/payroll', { params: { month } }).then(normalizePayroll)
export const generatePayroll = (month: string): Promise<PayrollRun> => useMocks ? mock.mockGeneratePayroll(month) : attendanceRequest.post('/employee-attendance/payroll/generate', { month }).then((row) => normalizePayroll(row)!)
export const createPayrollAdjustment = (itemId: string, payload: { amount: number; reason: string }): Promise<PayrollAdjustment> => useMocks ? mock.mockCreatePayrollAdjustment(itemId, payload) : attendanceRequest.post(`/employee-attendance/payroll/items/${itemId}/adjustments`, payload)
export const updatePayrollAdjustment = (id: string, payload: { amount: number; reason: string }): Promise<PayrollAdjustment> => useMocks ? mock.mockUpdatePayrollAdjustment(id, payload) : attendanceRequest.put(`/employee-attendance/payroll/adjustments/${id}`, payload)
export const deletePayrollAdjustment = async (id: string) => useMocks ? mock.mockDeletePayrollAdjustment(id) : attendanceRequest.delete(`/employee-attendance/payroll/adjustments/${id}`)
export const confirmPayroll = (id: string): Promise<PayrollRun> => useMocks ? mock.mockConfirmPayroll(id) : attendanceRequest.post(`/employee-attendance/payroll/${id}/confirm`).then((row) => normalizePayroll(row)!)
export const reopenPayroll = (id: string, reason: string): Promise<PayrollRun> => useMocks ? mock.mockReopenPayroll(id, reason) : attendanceRequest.post(`/employee-attendance/payroll/${id}/reopen`, { reason }).then((row) => normalizePayroll(row)!)
