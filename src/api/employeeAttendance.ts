import type { AxiosRequestConfig } from 'axios'
import baseRequest, { useMocks } from '@/utils/request'
import { readAccessGuardSessions, selectAccessGuardGrant, type StoredAccessGuardSessions } from '@/api/accessGuard'
import * as mock from '@/mocks/employeeAttendance'
import type {
  ActualAttendanceSegment, AttendanceGenerationResult, AttendanceOverview, AttendancePayload, AttendanceQuery, AttendanceRecord, BonusPayload, BonusRecord, EmployeeAttendanceInput,
  BatchMonthlySchedulePayload, BatchMonthlyScheduleResult,
  CommissionPayload, CommissionRecord, CommissionType, CommissionTypePayload, CompensationTotal, DateOverride,
  DateOverridePayload, Employee, EmployeePayload, EmployeeQuery, LeaveRequest, LeaveRequestPayload, LeaveType,
  LeaveTypePayload, MonthlyScheduleDay, MonthlySchedulePayload, MonthlySetting, MonthlySettingPayload, PayrollAdjustment, PayrollRun, RevealedEmployee,
  ScheduleSegment, WeeklySchedule, WeeklySchedulePayload, AttendanceCalendarDay, ScheduleAttendanceOverview
} from '@/types/employeeAttendance'

export function selectEmployeeAttendanceGrant(sessions: StoredAccessGuardSessions) {
  return selectAccessGuardGrant(sessions, 'EMPLOYEE_ATTENDANCE')
}

function withAttendanceGrant(config: AxiosRequestConfig = {}) {
  try {
    const token = selectEmployeeAttendanceGrant(readAccessGuardSessions())
    return token ? { ...config, headers: { ...config.headers, 'X-YS-Access-Grant': token } } : config
  } catch { return config }
}

const attendanceRequest = {
  get: (url: string, config?: AxiosRequestConfig): Promise<any> => baseRequest.get(url, withAttendanceGrant(config)) as any,
  post: (url: string, data?: unknown, config?: AxiosRequestConfig): Promise<any> => baseRequest.post(url, data, withAttendanceGrant(config)) as any,
  put: (url: string, data?: unknown, config?: AxiosRequestConfig): Promise<any> => baseRequest.put(url, data, withAttendanceGrant(config)) as any,
  delete: (url: string, config?: AxiosRequestConfig): Promise<any> => baseRequest.delete(url, withAttendanceGrant(config)) as any
}

type VersionedTarget = { id: string; updatedAt?: string }
const versionedBody = (baseUpdatedAt?: string) => baseUpdatedAt ? { baseUpdatedAt } : {}
const targetId = (target: VersionedTarget | string) => typeof target === 'string' ? target : target.id
const targetVersion = (target: VersionedTarget | string) => typeof target === 'string' ? undefined : target.updatedAt

const amount = (value: unknown) => Number(value || 0)
const finiteAmount = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const sensitiveEmployeeFields = ['idCard', 'bankCard', 'address', 'emergencyContact'] as const
export function buildEmployeeMutationPayload(form: EmployeePayload, editing: boolean): EmployeePayload {
  const payload = { ...form }
  if (!payload.terminationDate?.trim()) delete payload.terminationDate
  if (editing) for (const field of sensitiveEmployeeFields) if (!payload[field]?.trim()) delete payload[field]
  return payload
}
export function normalizeEmployeeResponse(row: any): Employee {
  const { idCard, bankCard, address, emergencyContact, ...safe } = row
  return {
    ...safe,
    idCardMasked: row.idCardMasked ?? row.idCard ?? '', bankCardMasked: row.bankCardMasked ?? row.bankCard ?? '',
    addressMasked: row.addressMasked ?? row.address ?? '', emergencyContactMasked: row.emergencyContactMasked ?? row.emergencyContact ?? '',
    phone: row.phone || '', terminationDate: row.terminationDate || '', baseSalary: amount(row.baseSalary),
    attendanceBonus: amount(row.attendanceBonus), overtimeHourlyRate: amount(row.overtimeHourlyRate), restQuotaDays: amount(row.restQuotaDays)
  }
}
export function normalizeCommissionResponse(row: any): CommissionRecord {
  return { ...row, quantity: amount(row.quantity), unitPrice: amount(row.unitPriceSnapshot ?? row.unitPrice), amount: amount(row.amount), lockedAt: row.lockedAt ?? row.payrollLockedAt ?? null }
}
export function normalizeMonthlySettingResponse(row: any): MonthlySetting {
  return { ...row, scheduledWorkDays: amount(row.scheduledWorkDays), restQuotaDays: amount(row.restQuotaDays) }
}
function responseObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function responseSegments(value: unknown): ScheduleSegment[] {
  if (!Array.isArray(value)) return []
  return value.map((segment, index) => {
    const row = responseObject(segment)
    return {
      ...(typeof row.id === 'string' ? { id: row.id } : {}),
      ...(Number.isFinite(Number(row.sequence)) ? { sequence: Number(row.sequence) } : { sequence: index }),
      startTime: String(row.startTime || ''), endTime: String(row.endTime || '')
    }
  }).sort((left, right) => (left.sequence || 0) - (right.sequence || 0))
}
export function normalizeMonthlyScheduleResponse(value: unknown): MonthlyScheduleDay {
  const row = responseObject(value)
  return {
    id: String(row.id || ''), employeeId: String(row.employeeId || ''), date: String(row.date || ''), isWorkday: Boolean(row.isWorkday),
    segments: responseSegments(row.segments), remark: typeof row.remark === 'string' ? row.remark : undefined,
    scheduledMinutes: amount(row.scheduledMinutes), breakMinutes: amount(row.breakMinutes), updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined
  }
}
function responseActualSegments(value: unknown): ActualAttendanceSegment[] {
  if (!Array.isArray(value)) return []
  return value.map((segment, index) => {
    const row = responseObject(segment)
    return {
      ...(typeof row.id === 'string' ? { id: row.id } : {}),
      ...(Number.isFinite(Number(row.sequence)) ? { sequence: Number(row.sequence) } : { sequence: index }),
      checkInAt: String(row.checkInAt || ''), checkOutAt: String(row.checkOutAt || '')
    }
  }).sort((left, right) => (left.sequence || 0) - (right.sequence || 0))
}
function legacyActualSegment(checkInAt: unknown, checkOutAt: unknown): ActualAttendanceSegment[] {
  const checkIn = typeof checkInAt === 'string' ? checkInAt : ''
  const checkOut = typeof checkOutAt === 'string' ? checkOutAt : ''
  if (!checkIn || !checkOut || Number.isNaN(new Date(checkIn).getTime()) || Number.isNaN(new Date(checkOut).getTime()) || new Date(checkOut).getTime() <= new Date(checkIn).getTime()) return []
  return [{ sequence: 0, checkInAt: checkIn, checkOutAt: checkOut }]
}
export function normalizeAttendanceResponse(value: unknown): AttendanceRecord {
  const row = responseObject(value)
  const actualSegments = Array.isArray(row.actualSegments) ? responseActualSegments(row.actualSegments) : legacyActualSegment(row.checkInAt, row.checkOutAt)
  const explicitAbsenceMinutes = amount(row.explicitAbsenceMinutes)
  return {
    id: String(row.id || ''), employeeId: String(row.employeeId || ''), date: String(row.date || ''), isScheduledWorkday: Boolean(row.isScheduledWorkday),
    scheduledMinutes: amount(row.scheduledMinutes), actualSegments, explicitAbsenceMinutes,
    overtimeMinutes: amount(row.overtimeMinutes), remark: typeof row.remark === 'string' ? row.remark : undefined,
    checkInAt: typeof row.checkInAt === 'string' ? row.checkInAt : actualSegments[0]?.checkInAt || '',
    checkOutAt: typeof row.checkOutAt === 'string' ? row.checkOutAt : actualSegments.at(-1)?.checkOutAt || '',
    workedMinutes: amount(row.workedMinutes), lateMinutes: amount(row.lateMinutes), earlyLeaveMinutes: amount(row.earlyLeaveMinutes),
    absenceMinutes: amount(row.absenceMinutes), manuallyEdited: Boolean(row.manuallyEdited), updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
    lockedAt: typeof row.lockedAt === 'string' ? row.lockedAt : typeof row.payrollLockedAt === 'string' ? row.payrollLockedAt : null
  }
}
export function normalizeLeaveResponse(row: any): LeaveRequest {
  return { ...normalizeLocked(row), hours: row.hours == null ? undefined : amount(row.hours), countedDays: amount(row.countedDays) }
}
export function normalizeCommissionTypeResponse(row: any): CommissionType { return { ...row, unitPrice: amount(row.unitPrice) } }
export function normalizeBonusResponse(row: any): BonusRecord { return { ...normalizeLocked(row), amount: amount(row.amount) } }
export function normalizePayrollAdjustmentResponse(row: any): PayrollAdjustment { return { ...row, amount: amount(row.amount) } }
export function normalizeDeleteEmployeeResponse(row: any): Employee | { ok: true } {
  return row?.ok === true ? { ok: true } : normalizeEmployeeResponse(row)
}
export function normalizeAttendanceGenerationResponse(row: any): AttendanceGenerationResult {
  const created = Number(row.created || 0), updated = Number(row.updated || 0), skippedManual = Number(row.skippedManual || 0)
  return { created, updated, skippedManual, generated: Number(row.generated ?? created + updated) }
}
export function normalizeAttendanceQuery<T extends AttendanceQuery>(query: T): T {
  if (query.month && (query.startDate || query.endDate)) throw new Error('月份和日期范围不能同时筛选')
  return { ...query }
}

const timezoneSuffix = /(?:Z|[+-]\d{2}:\d{2})$/i
const localDateTime = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/

function toBeijingOffsetIso(value?: string | null): string | null {
  const text = String(value || '').trim()
  if (!text) return null
  if (timezoneSuffix.test(text)) return text
  const match = text.match(localDateTime)
  if (!match) return text
  return `${match[1]}T${match[2]}:${match[3] || '00'}+08:00`
}

export function normalizeAttendanceMutationPayload(payload: EmployeeAttendanceInput): EmployeeAttendanceInput {
  return {
    ...payload,
    actualSegments: payload.actualSegments.map((segment) => ({
      ...segment,
      checkInAt: toBeijingOffsetIso(segment.checkInAt) || '', checkOutAt: toBeijingOffsetIso(segment.checkOutAt) || ''
    }))
  }
}
/** @deprecated Only the existing weekly attendance screen uses this migration adapter. */
export function normalizeLegacyAttendanceMutationPayload(payload: AttendancePayload): AttendancePayload {
  return { ...payload, checkInAt: toBeijingOffsetIso(payload.checkInAt), checkOutAt: toBeijingOffsetIso(payload.checkOutAt) }
}

export function toBeijingDateTimeLocal(value?: string | null): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!timezoneSuffix.test(text)) return text.match(localDateTime)?.[0]?.slice(0, 16) || text
  const instant = new Date(text)
  if (Number.isNaN(instant.getTime())) return text
  return new Date(instant.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}
const normalizeLocked = <T extends Record<string, any>>(row: T) => ({ ...row, lockedAt: row.lockedAt ?? row.payrollLockedAt ?? null })
export function normalizePayrollResponse(raw: any): PayrollRun | null {
  if (!raw) return null
  const items = (raw.items || []).map((item: any) => {
    const rawResult = item.calculationSnapshot?.result || item.calculationSnapshot || item
    const rawInput = item.calculationSnapshot?.input || item
    const issues = Array.isArray(item.issues) ? item.issues : Array.isArray(rawResult.issues) ? rawResult.issues : []
    const calculationSnapshot = {
      input: {
        baseSalary: amount(rawInput.baseSalary ?? item.baseSalary), attendanceBonus: amount(rawInput.attendanceBonus),
        scheduledWorkDays: amount(rawInput.scheduledWorkDays ?? item.scheduledWorkDays), restQuotaDays: amount(rawInput.restQuotaDays ?? item.restQuotaDays),
        countedLeaveDays: amount(rawInput.countedLeaveDays ?? item.countedLeaveDays), absenceDays: amount(rawInput.absenceDays ?? item.absenceDays),
        overtimeMinutes: amount(rawInput.overtimeMinutes ?? item.overtimeMinutes), overtimeHourlyRate: amount(rawInput.overtimeHourlyRate ?? item.overtimeHourlyRate),
        commissionAmount: amount(rawInput.commissionAmount ?? item.commissionAmount), bonusAmount: amount(rawInput.bonusAmount ?? item.bonusAmount),
        adjustments: (rawInput.adjustments || item.adjustments || []).map((row: any) => ({ amount: amount(row.amount) }))
      },
      result: {
        dailyRate: amount(rawResult.dailyRate ?? item.dailyRate), excessLeaveDays: amount(rawResult.excessLeaveDays ?? item.excessLeaveDays),
        leaveDeduction: amount(rawResult.leaveDeduction ?? item.leaveDeduction), absenceDeduction: amount(rawResult.absenceDeduction ?? item.absenceDeduction),
        overtimeHours: amount(rawResult.overtimeHours ?? amount(rawInput.overtimeMinutes ?? item.overtimeMinutes) / 60),
        overtimePay: amount(rawResult.overtimePay ?? item.overtimePay), commissionAmount: amount(rawResult.commissionAmount ?? item.commissionAmount),
        bonusAmount: amount(rawResult.bonusAmount ?? item.bonusAmount), adjustmentAmount: amount(rawResult.adjustmentAmount ?? item.adjustmentAmount),
        attendanceBonus: amount(rawResult.attendanceBonus ?? item.attendanceBonus),
        grossEarningsAmount: finiteAmount(rawResult.grossEarningsAmount),
        deductionAmount: finiteAmount(rawResult.deductionAmount),
        payableAmount: amount(rawResult.payableAmount ?? item.payableAmount), issues
      },
      generatedAt: item.calculationSnapshot?.generatedAt || item.updatedAt || raw.updatedAt || ''
    }
    return {
      ...item, payableAmount: calculationSnapshot.result.payableAmount, calculationSnapshot,
      employee: item.employee || { id: item.employeeId, employeeNumber: item.employeeNumberSnapshot, name: item.employeeNameSnapshot },
      issues, adjustments: (item.adjustments || []).map(normalizePayrollAdjustmentResponse)
    }
  })
  const itemIssues = items.flatMap((item: any) => item.issues.map((issue: string) => `${item.employee.name}：${issue}`))
  const issueCount = Number(raw.issueCount ?? itemIssues.length)
  const issues = Array.isArray(raw.issues) && raw.issues.length ? raw.issues : itemIssues.length ? itemIssues : issueCount ? [`当前有 ${issueCount} 项工资确认阻断问题`] : []
  return { ...raw, items, issues, issueCount, totalAmount: amount(raw.totalAmount) || items.reduce((sum: number, item: any) => sum + item.payableAmount, 0) }
}

export const getEmployees = (query: EmployeeQuery = {}): Promise<Employee[]> => useMocks ? mock.mockGetEmployees(query) : attendanceRequest.get('/employee-attendance/employees', { params: query }).then((rows: any[]) => rows.map(normalizeEmployeeResponse))
export const getEmployee = (id: string): Promise<Employee> => useMocks ? mock.mockGetEmployee(id) : attendanceRequest.get(`/employee-attendance/employees/${id}`).then(normalizeEmployeeResponse)
export const revealEmployee = (id: string): Promise<RevealedEmployee> => useMocks ? mock.mockRevealEmployee(id) : attendanceRequest.get(`/employee-attendance/employees/${id}/reveal`).then((row: any) => ({ ...normalizeEmployeeResponse(row), idCard: row.idCard || '', bankCard: row.bankCard || '', address: row.address || '', emergencyContact: row.emergencyContact || '' }))
export const createEmployee = (payload: EmployeePayload): Promise<Employee> => useMocks ? mock.mockCreateEmployee(payload) : attendanceRequest.post('/employee-attendance/employees', payload).then(normalizeEmployeeResponse)
export const updateEmployee = (id: string, payload: EmployeePayload, baseUpdatedAt?: string): Promise<Employee> => useMocks ? mock.mockUpdateEmployee(id, payload) : attendanceRequest.put(`/employee-attendance/employees/${id}`, { ...payload, baseUpdatedAt }).then(normalizeEmployeeResponse)
export const deleteEmployee = async (target: VersionedTarget | string): Promise<Employee | { ok: true }> => (useMocks ? mock.mockDeleteEmployee(targetId(target)) : attendanceRequest.delete(`/employee-attendance/employees/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })).then(normalizeDeleteEmployeeResponse)
export const uploadEmployeePhoto = (id: string, photo: File): Promise<{ id: string; hasPhoto: boolean }> => { if (useMocks) return mock.mockUploadEmployeePhoto(id, photo); const body = new FormData(); body.append('photo', photo); return attendanceRequest.post(`/employee-attendance/employees/${id}/photo`, body) }
export const readEmployeePhoto = (id: string): Promise<Blob | null> => useMocks ? mock.mockReadEmployeePhoto(id) : attendanceRequest.get(`/employee-attendance/employees/${id}/photo`, { responseType: 'blob' })

export const getWeeklySchedules = (employeeId?: string): Promise<WeeklySchedule[]> => useMocks ? mock.mockGetWeeklySchedules(employeeId) : attendanceRequest.get('/employee-attendance/weekly-schedules', { params: { employeeId } })
export const saveWeeklySchedule = (payload: WeeklySchedulePayload, id?: string, baseUpdatedAt?: string): Promise<WeeklySchedule> => useMocks ? mock.mockSaveWeeklySchedule(payload) : id ? attendanceRequest.put(`/employee-attendance/weekly-schedules/${id}`, { ...payload, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/weekly-schedules', payload)
export const deleteWeeklySchedule = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteWeeklySchedule(targetId(target)) : attendanceRequest.delete(`/employee-attendance/weekly-schedules/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const getDateOverrides = (query: AttendanceQuery = {}): Promise<DateOverride[]> => { const normalized = normalizeAttendanceQuery(query); return useMocks ? mock.mockGetDateOverrides(normalized) : attendanceRequest.get('/employee-attendance/overrides', { params: normalized }) }
export const saveDateOverride = (payload: DateOverridePayload, id?: string, baseUpdatedAt?: string): Promise<DateOverride> => useMocks ? mock.mockSaveDateOverride(payload, id) : id ? attendanceRequest.put(`/employee-attendance/overrides/${id}`, { ...payload, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/overrides', payload)
export const deleteDateOverride = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteDateOverride(targetId(target)) : attendanceRequest.delete(`/employee-attendance/overrides/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const getMonthlySettings = (month?: string): Promise<MonthlySetting[]> => useMocks ? mock.mockGetMonthlySettings(month) : attendanceRequest.get('/employee-attendance/month-settings', { params: { month } }).then((rows: any[]) => rows.map(normalizeMonthlySettingResponse))
export const saveMonthlySetting = (payload: MonthlySettingPayload): Promise<MonthlySetting> => (useMocks ? mock.mockSaveMonthlySetting(payload) : attendanceRequest.post('/employee-attendance/month-settings', payload)).then(normalizeMonthlySettingResponse)
export const deleteMonthlySetting = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteMonthlySetting(targetId(target)) : attendanceRequest.delete(`/employee-attendance/month-settings/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })

export const getMonthlySchedules = (employeeId: string, month: string): Promise<MonthlyScheduleDay[]> => useMocks
  ? mock.mockGetMonthlySchedules(employeeId, month)
  : attendanceRequest.get('/employee-attendance/monthly-schedules', { params: { employeeId, month } }).then((rows: unknown[]) => rows.map(normalizeMonthlyScheduleResponse))
export const saveMonthlyScheduleDay = (payload: MonthlySchedulePayload): Promise<MonthlyScheduleDay> => (useMocks
  ? mock.mockSaveMonthlyScheduleDay(payload)
  : attendanceRequest.post('/employee-attendance/monthly-schedules/day', payload)).then(normalizeMonthlyScheduleResponse)
export const deleteMonthlyScheduleDay = async (target: VersionedTarget | string): Promise<void> => {
  if (useMocks) return mock.mockDeleteMonthlyScheduleDay(targetId(target))
  await attendanceRequest.delete(`/employee-attendance/monthly-schedules/day/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
}
export const batchSaveMonthlySchedules = (payload: BatchMonthlySchedulePayload): Promise<BatchMonthlyScheduleResult> => (useMocks
  ? mock.mockBatchSaveMonthlySchedules(payload)
  : attendanceRequest.post('/employee-attendance/monthly-schedules/batch', payload)).then((result: unknown) => {
  if (Array.isArray(result)) return { rows: result.map(normalizeMonthlyScheduleResponse), updated: result.length, overwritten: 0 }
  const row = responseObject(result)
  const rows = Array.isArray(row.rows) ? row.rows.map(normalizeMonthlyScheduleResponse) : []
  return { rows, updated: amount(row.updated), overwritten: amount(row.overwritten) }
})
export const copyPreviousMonthSchedules = (employeeId: string, targetMonth: string, overwrite: boolean): Promise<{ copied: number; targetMonth: string }> => (useMocks
  ? mock.mockCopyPreviousMonthSchedules(employeeId, targetMonth, overwrite)
  : attendanceRequest.post('/employee-attendance/monthly-schedules/copy-previous', { employeeId, targetMonth, overwrite })).then((result: unknown) => {
  const row = responseObject(result)
  return { copied: amount(row.copied), targetMonth: String(row.targetMonth || targetMonth) }
})

export const getAttendance = (query: AttendanceQuery = {}): Promise<AttendanceRecord[]> => { const normalized = normalizeAttendanceQuery(query); return useMocks ? mock.mockGetAttendance(normalized) : attendanceRequest.get('/employee-attendance/attendance', { params: normalized }).then((rows: unknown[]) => rows.map(normalizeAttendanceResponse)) }
export function saveAttendance(payload: EmployeeAttendanceInput, id?: string, baseUpdatedAt?: string): Promise<AttendanceRecord>
export function saveAttendance(payload: EmployeeAttendanceInput, id?: string, baseUpdatedAt?: string): Promise<AttendanceRecord> {
  const normalized = normalizeAttendanceMutationPayload(payload)
  return (useMocks ? mock.mockSaveAttendance(normalized, id) : id ? attendanceRequest.put(`/employee-attendance/attendance/${id}`, { ...normalized, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/attendance', normalized)).then(normalizeAttendanceResponse)
}
export const deleteAttendance = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteAttendance(targetId(target)) : attendanceRequest.delete(`/employee-attendance/attendance/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const generateAttendance = (month: string, employeeIds: string[]): Promise<AttendanceGenerationResult> => useMocks
  ? mock.mockGenerateAttendance(month, employeeIds)
  : attendanceRequest.post('/employee-attendance/attendance/generate', { month, employeeIds }).then(normalizeAttendanceGenerationResponse)

export const getLeaveTypes = (): Promise<LeaveType[]> => useMocks ? mock.mockGetLeaveTypes() : attendanceRequest.get('/employee-attendance/leave-types')
export const saveLeaveType = (payload: LeaveTypePayload, id?: string, baseUpdatedAt?: string): Promise<LeaveType> => useMocks ? mock.mockSaveLeaveType(payload, id) : id ? attendanceRequest.put(`/employee-attendance/leave-types/${id}`, { ...payload, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/leave-types', payload)
export const deleteLeaveType = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteLeaveType(targetId(target)) : attendanceRequest.delete(`/employee-attendance/leave-types/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const getLeaves = (query: AttendanceQuery = {}): Promise<LeaveRequest[]> => {
  const normalized = normalizeAttendanceQuery(query)
  const params = { ...normalized, employeeIds: normalized.employeeIds?.length ? normalized.employeeIds.join(',') : undefined }
  return useMocks ? mock.mockGetLeaves(normalized) : attendanceRequest.get('/employee-attendance/leaves', { params }).then((rows: any[]) => rows.map(normalizeLeaveResponse))
}
export const saveLeave = (payload: LeaveRequestPayload, id?: string, baseUpdatedAt?: string): Promise<LeaveRequest> => (useMocks ? mock.mockSaveLeave(payload, id) : id ? attendanceRequest.put(`/employee-attendance/leaves/${id}`, { ...payload, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/leaves', payload)).then(normalizeLeaveResponse)
export const deleteLeave = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteLeave(targetId(target)) : attendanceRequest.delete(`/employee-attendance/leaves/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const reviewLeave = (id: string, action: 'approve' | 'reject', reviewRemark = ''): Promise<LeaveRequest> => (useMocks ? mock.mockReviewLeave(id, action === 'approve' ? 'APPROVED' : 'REJECTED', reviewRemark) : attendanceRequest.post(`/employee-attendance/leaves/${id}/${action}`, { reviewRemark })).then(normalizeLeaveResponse)

export const getCommissionTypes = (): Promise<CommissionType[]> => useMocks ? mock.mockGetCommissionTypes() : attendanceRequest.get('/employee-attendance/commission-types').then((rows: any[]) => rows.map(normalizeCommissionTypeResponse))
export const saveCommissionType = (payload: CommissionTypePayload, id?: string, baseUpdatedAt?: string): Promise<CommissionType> => (useMocks ? mock.mockSaveCommissionType(payload, id) : id ? attendanceRequest.put(`/employee-attendance/commission-types/${id}`, { ...payload, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/commission-types', payload)).then(normalizeCommissionTypeResponse)
export const deleteCommissionType = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteCommissionType(targetId(target)) : attendanceRequest.delete(`/employee-attendance/commission-types/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const getCommissions = (query: AttendanceQuery = {}): Promise<CommissionRecord[]> => { const normalized = normalizeAttendanceQuery(query); return useMocks ? mock.mockGetCommissions(normalized) : attendanceRequest.get('/employee-attendance/commissions', { params: normalized }).then((rows: any[]) => rows.map(normalizeCommissionResponse)) }
export const saveCommission = (payload: CommissionPayload, id?: string, baseUpdatedAt?: string): Promise<CommissionRecord> => useMocks ? mock.mockSaveCommission(payload, id) : (id ? attendanceRequest.put(`/employee-attendance/commissions/${id}`, { ...payload, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/commissions', payload)).then(normalizeCommissionResponse)
export const deleteCommission = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteCommission(targetId(target)) : attendanceRequest.delete(`/employee-attendance/commissions/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const getBonuses = (query: AttendanceQuery = {}): Promise<BonusRecord[]> => { const normalized = normalizeAttendanceQuery(query); return useMocks ? mock.mockGetBonuses(normalized) : attendanceRequest.get('/employee-attendance/bonuses', { params: normalized }).then((rows: any[]) => rows.map(normalizeBonusResponse)) }
export const saveBonus = (payload: BonusPayload, id?: string, baseUpdatedAt?: string): Promise<BonusRecord> => (useMocks ? mock.mockSaveBonus(payload, id) : id ? attendanceRequest.put(`/employee-attendance/bonuses/${id}`, { ...payload, baseUpdatedAt }) : attendanceRequest.post('/employee-attendance/bonuses', payload)).then(normalizeBonusResponse)
export const deleteBonus = async (target: VersionedTarget | string) => useMocks ? mock.mockDeleteBonus(targetId(target)) : attendanceRequest.delete(`/employee-attendance/bonuses/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const getCompensationTotals = (month: string): Promise<CompensationTotal[]> => useMocks ? mock.mockGetCompensationTotals(month) : attendanceRequest.get('/employee-attendance/compensation/totals', { params: { month } })

export const getOverview = (month: string): Promise<AttendanceOverview> => useMocks ? mock.mockGetOverview(month) : attendanceRequest.get('/employee-attendance/overview', { params: { month } }).then((row: any) => {
  const issueCount = Number(row.issueCount || 0)
  const issues = Array.isArray(row.issues) ? row.issues : []
  return { month: row.month, activeEmployees: row.activeEmployees ?? row.workforce ?? 0, todayPresent: row.todayPresent ?? row.todayAttendance ?? 0, todayOnLeave: row.todayOnLeave ?? row.todayLeave ?? 0, todayAbsent: row.todayAbsent ?? row.todayAbsence ?? 0, overtimeHours: row.overtimeHours ?? amount(row.overtimeMinutes) / 60, pendingLeaves: row.pendingLeaves ?? row.pendingLeave ?? 0, projectedPayroll: amount(row.projectedPayroll), issueCount, issues: issues.length ? issues : issueCount ? [`当前有 ${issueCount} 项考勤或工资问题，请进入工资统计查看详情`] : [] }
})
function normalizeCalendarDay(value: unknown): AttendanceCalendarDay {
  const row = responseObject(value)
  const statuses: AttendanceCalendarDay['status'][] = ['FUTURE', 'ABSENT', 'LEAVE', 'REST', 'NORMAL', 'OVERTIME', 'SHORT']
  const tones: AttendanceCalendarDay['backgroundTone'][] = ['future', 'normal', 'leave', 'absent', 'rest', 'overtime', 'short']
  if (typeof row.date !== 'string' || !statuses.includes(row.status as AttendanceCalendarDay['status'])
    || !tones.includes(row.backgroundTone as AttendanceCalendarDay['backgroundTone'])
    || !tones.includes(row.durationTone as AttendanceCalendarDay['durationTone'])
    || !Array.isArray(row.actualSegments)) throw new Error('排班考勤概览响应格式无效')
  if (row.schedule) {
    const rawSchedule = responseObject(row.schedule)
    if (typeof rawSchedule.id !== 'string' || typeof rawSchedule.employeeId !== 'string' || typeof rawSchedule.date !== 'string' || !Array.isArray(rawSchedule.segments)) {
      throw new Error('排班考勤概览响应格式无效')
    }
  }
  const schedule = row.schedule ? normalizeMonthlyScheduleResponse(row.schedule) : null
  if (row.schedule && (!schedule?.id || !schedule.employeeId || !schedule.date)) throw new Error('排班考勤概览响应格式无效')
  return {
    date: row.date, day: amount(row.day), isFuture: Boolean(row.isFuture), status: row.status as AttendanceCalendarDay['status'],
    schedule, actualSegments: responseActualSegments(row.actualSegments),
    scheduledMinutes: amount(row.scheduledMinutes), workedMinutes: amount(row.workedMinutes), approvedLeaveMinutes: amount(row.approvedLeaveMinutes), overtimeMinutes: amount(row.overtimeMinutes),
    displayMinutes: amount(row.displayMinutes), shortageMinutes: amount(row.shortageMinutes), durationText: String(row.durationText || ''), leaveTypeName: String(row.leaveTypeName || ''),
    leaveReason: String(row.leaveReason || ''), absenceReason: String(row.absenceReason || ''), backgroundTone: String(row.backgroundTone || 'normal') as AttendanceCalendarDay['backgroundTone'], durationTone: String(row.durationTone || 'normal') as AttendanceCalendarDay['durationTone']
  }
}
export function normalizeScheduleAttendanceOverview(value: unknown): ScheduleAttendanceOverview {
  const row = responseObject(value)
  if (typeof row.month !== 'string' || !Array.isArray(row.days) || !row.overview) throw new Error('排班考勤概览响应格式无效')
  const overview = responseObject(row.overview)
  return { month: row.month, employee: row.employee ? { id: String(responseObject(row.employee).id || ''), employeeNumber: String(responseObject(row.employee).employeeNumber || ''), name: String(responseObject(row.employee).name || '') } : null, days: row.days.map(normalizeCalendarDay), overview: { month: String(overview.month || row.month), activeEmployees: amount(overview.activeEmployees ?? overview.workforce), todayPresent: amount(overview.todayPresent ?? overview.todayAttendance), todayOnLeave: amount(overview.todayOnLeave ?? overview.todayLeave), todayAbsent: amount(overview.todayAbsent ?? overview.todayAbsence), overtimeHours: amount(overview.overtimeHours ?? amount(overview.overtimeMinutes) / 60), pendingLeaves: amount(overview.pendingLeaves ?? overview.pendingLeave), projectedPayroll: amount(overview.projectedPayroll), issueCount: amount(overview.issueCount), issues: Array.isArray(overview.issues) ? overview.issues.map(String) : [] }, readonly: Boolean(row.readonly) }
}
export const getScheduleAttendanceOverview = (employeeId: string | undefined, month: string): Promise<ScheduleAttendanceOverview> => useMocks
  ? mock.mockGetScheduleAttendanceOverview(employeeId, month)
  : attendanceRequest.get('/employee-attendance/schedule-attendance-overview', { params: { ...(employeeId ? { employeeId } : {}), month } }).then(normalizeScheduleAttendanceOverview)
export const getPayroll = (month: string): Promise<PayrollRun | null> => useMocks ? mock.mockGetPayroll(month) : attendanceRequest.get('/employee-attendance/payroll', { params: { month } }).then(normalizePayrollResponse)
export const generatePayroll = (month: string): Promise<PayrollRun> => useMocks ? mock.mockGeneratePayroll(month) : attendanceRequest.post('/employee-attendance/payroll/generate', { month }).then((row) => normalizePayrollResponse(row)!)
export const createPayrollAdjustment = (itemId: string, payload: { amount: number; reason: string }): Promise<PayrollAdjustment> => (useMocks ? mock.mockCreatePayrollAdjustment(itemId, payload) : attendanceRequest.post(`/employee-attendance/payroll/items/${itemId}/adjustments`, payload)).then(normalizePayrollAdjustmentResponse)
export const updatePayrollAdjustment = (id: string, payload: { amount: number; reason: string }, baseUpdatedAt?: string): Promise<PayrollAdjustment> => (useMocks ? mock.mockUpdatePayrollAdjustment(id, payload) : attendanceRequest.put(`/employee-attendance/payroll/adjustments/${id}`, { ...payload, baseUpdatedAt })).then(normalizePayrollAdjustmentResponse)
export const deletePayrollAdjustment = async (target: VersionedTarget | string) => useMocks ? mock.mockDeletePayrollAdjustment(targetId(target)) : attendanceRequest.delete(`/employee-attendance/payroll/adjustments/${targetId(target)}`, { data: versionedBody(targetVersion(target)) })
export const confirmPayroll = (id: string): Promise<PayrollRun> => useMocks ? mock.mockConfirmPayroll(id) : attendanceRequest.post(`/employee-attendance/payroll/${id}/confirm`).then((row) => normalizePayrollResponse(row)!)
export async function reopenPayroll(id: string, reason: string): Promise<PayrollRun> { if (useMocks) return mock.mockReopenPayroll(id, reason); const reopened = await attendanceRequest.post(`/employee-attendance/payroll/${id}/reopen`, { reason }); return (await getPayroll(reopened.month))! }
