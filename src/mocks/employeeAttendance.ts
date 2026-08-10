import dayjs from 'dayjs'
import type {
  AttendanceOverview, AttendancePayload, AttendanceQuery, AttendanceRecord, BonusPayload, BonusRecord,
  CommissionPayload, CommissionRecord, CommissionType, CommissionTypePayload, CompensationTotal,
  DateOverridePayload, Employee, EmployeeAttendanceState, EmployeePayload, EmployeeQuery, LeaveRequest,
  LeaveRequestPayload, LeaveStatus, LeaveType, LeaveTypePayload, MonthlySetting, PayrollItem,
  RevealedEmployee, WeeklySchedulePayload
} from '@/types/employeeAttendance'

const STORAGE_KEY = 'ys_employee_attendance_v1'
const now = () => dayjs().toISOString()
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const later = async <T>(value: T) => clone(value)
const monthOf = (date: string) => date.slice(0, 7)
const masked = (value = '') => value ? `${value.slice(0, 3)}****${value.slice(-4)}` : ''
type SensitiveEmployee = { idCard: string; bankCard: string; address: string; emergencyContact: string }

function employee(seed: Partial<Employee> & Pick<Employee, 'id' | 'employeeNumber' | 'name'>, sensitive: NonNullable<EmployeeAttendanceState['employees'][number]['sensitive']>) {
  const date = now()
  return {
    status: 'ACTIVE', phone: '', hireDate: '2026-01-01', terminationDate: '', baseSalary: 5000, attendanceBonus: 300,
    overtimeHourlyRate: 30, restQuotaDays: 4, hasPhoto: false, createdAt: date, updatedAt: date,
    idCardMasked: masked(sensitive.idCard), bankCardMasked: masked(sensitive.bankCard), addressMasked: masked(sensitive.address),
    emergencyContactMasked: masked(sensitive.emergencyContact), ...seed, sensitive
  } as EmployeeAttendanceState['employees'][number]
}

function initialState(): EmployeeAttendanceState {
  const month = dayjs().format('YYYY-MM')
  const today = dayjs().format('YYYY-MM-DD')
  const employees = [
    employee({ id: 'emp-1', employeeNumber: 'YG001', name: '张三', phone: '13800000001', baseSalary: 6000 }, { idCard: '410000199001011234', bankCard: '6222021234567890', address: '洛阳市涧西区', emergencyContact: '张父 13800001001' }),
    employee({ id: 'emp-2', employeeNumber: 'YG002', name: '李四', phone: '13800000002', baseSalary: 5500, overtimeHourlyRate: 28 }, { idCard: '410000199202022345', bankCard: '6222022345678901', address: '三门峡市湖滨区', emergencyContact: '李母 13800001002' })
  ]
  const weeklySchedules = employees.flatMap((row) => Array.from({ length: 7 }, (_, weekday) => ({
    id: `ws-${row.id}-${weekday}`, employeeId: row.id, weekday, isWorkday: weekday > 0 && weekday < 6,
    scheduledMinutes: weekday > 0 && weekday < 6 ? 480 : 0
  })))
  const attendance: AttendanceRecord[] = employees.map((row, index) => ({
    id: `att-${row.id}`, employeeId: row.id, date: today, isScheduledWorkday: true, scheduledMinutes: 480,
    checkInAt: `${today}T08:${index ? '07' : '02'}:00`, checkOutAt: '', workedMinutes: 0, lateMinutes: index ? 7 : 2,
    earlyLeaveMinutes: 0, absenceMinutes: 0, overtimeMinutes: index ? 60 : 30, remark: '', manuallyEdited: true
  }))
  return {
    employees, weeklySchedules, overrides: [],
    monthSettings: employees.map((row) => ({ id: `ms-${row.id}`, employeeId: row.id, month, scheduledWorkDays: 22, restQuotaDays: row.restQuotaDays })),
    attendance,
    leaveTypes: [
      { id: 'leave-type-rest', name: '事假', active: true, countsTowardRestQuota: true },
      { id: 'leave-type-sick', name: '病假', active: true, countsTowardRestQuota: false }
    ],
    leaves: [{ id: 'leave-1', employeeId: 'emp-2', leaveTypeId: 'leave-type-rest', startDate: today, endDate: today, unit: 'HALF_DAY', reason: '个人事务', status: 'PENDING', countedDays: 0.5, reviewRemark: '' }],
    commissionTypes: [{ id: 'ct-1', name: '送样提成', unitName: '份', unitPrice: 12, active: true }],
    commissions: [{ id: 'com-1', employeeId: 'emp-1', commissionTypeId: 'ct-1', date: today, quantity: 8, unitPrice: 12, amount: 96, remark: '当日送样' }],
    bonuses: [{ id: 'bonus-1', employeeId: 'emp-1', date: today, amount: 200, reason: '月度安全奖' }], payrolls: []
  }
}

const memories = new Map<string, EmployeeAttendanceState>()
const sensitiveMemories = new Map<string, Map<string, SensitiveEmployee>>()
function accountKey() {
  try { const user = JSON.parse(window.localStorage.getItem('ys_user') || '{}') as { id?: string; account?: string }; return user.id || user.account || 'mock-default' } catch { return 'mock-default' }
}
function storageKey() { return `${STORAGE_KEY}:${encodeURIComponent(accountKey())}` }
function stripAndRememberSensitive(state: EmployeeAttendanceState) {
  const secrets = sensitiveMemories.get(accountKey()) || new Map<string, SensitiveEmployee>()
  state.employees.forEach((row) => {
    const legacy = row as EmployeeAttendanceState['employees'][number] & Partial<SensitiveEmployee>
    const recovered = row.sensitive || (legacy.idCard || legacy.bankCard || legacy.address || legacy.emergencyContact ? { idCard: legacy.idCard || '', bankCard: legacy.bankCard || '', address: legacy.address || '', emergencyContact: legacy.emergencyContact || '' } : null)
    if (recovered) secrets.set(row.id, clone(recovered))
    delete row.sensitive
    delete legacy.idCard; delete legacy.bankCard; delete legacy.address; delete legacy.emergencyContact
  })
  sensitiveMemories.set(accountKey(), secrets)
  return state
}
function seedSecrets() {
  const secrets = sensitiveMemories.get(accountKey()) || new Map<string, SensitiveEmployee>()
  if (!secrets.has('emp-1')) secrets.set('emp-1', { idCard: '410000199001011234', bankCard: '6222021234567890', address: '洛阳市涧西区', emergencyContact: '张父 13800001001' })
  if (!secrets.has('emp-2')) secrets.set('emp-2', { idCard: '410000199202022345', bankCard: '6222022345678901', address: '三门峡市湖滨区', emergencyContact: '李母 13800001002' })
  sensitiveMemories.set(accountKey(), secrets)
  return secrets
}
function read() {
  const key = accountKey()
  const cached = memories.get(key)
  if (cached) return cached
  let state: EmployeeAttendanceState
  try { state = JSON.parse(window.localStorage.getItem(storageKey()) || '') as EmployeeAttendanceState } catch { state = initialState() }
  if (!state?.employees) state = initialState()
  stripAndRememberSensitive(state); seedSecrets(); memories.set(key, state); save()
  return state
}
function save() { const state = memories.get(accountKey()); if (state) window.localStorage.setItem(storageKey(), JSON.stringify(state)) }
function ensureDraftForDate(date: string) { if (read().payrolls.some((run) => run.month === monthOf(date) && run.status === 'CONFIRMED')) throw new Error('该月工资已确认，请先撤销确认') }
function required(value: string, label: string) { if (!value.trim()) throw new Error(`请填写${label}`) }
function entity<T extends { id: string }>(rows: T[], entityId: string, label: string) { const row = rows.find((item) => item.id === entityId); if (!row) throw new Error(`${label}不存在`); return row }
function remove<T extends { id: string }>(rows: T[], entityId: string) { const index = rows.findIndex((row) => row.id === entityId); if (index >= 0) rows.splice(index, 1); save() }
export function resetEmployeeAttendanceMock() { memories.clear(); sensitiveMemories.clear(); const state = stripAndRememberSensitive(initialState()); seedSecrets(); memories.set(accountKey(), state); save() }

function publicEmployee(row: EmployeeAttendanceState['employees'][number]): Employee { const { sensitive: _sensitive, idCard: _idCard, bankCard: _bankCard, address: _address, emergencyContact: _emergencyContact, ...safe } = row as EmployeeAttendanceState['employees'][number] & EmployeePayload; return clone(safe) }
export async function mockGetEmployees(query: EmployeeQuery = {}) { return later(read().employees.filter((row) => (!query.keyword || `${row.name}${row.employeeNumber}${row.phone}`.includes(query.keyword)) && (!query.status || row.status === query.status)).map(publicEmployee)) }
export async function mockGetEmployee(employeeId: string) { return later(publicEmployee(entity(read().employees, employeeId, '员工'))) }
export async function mockRevealEmployee(employeeId: string): Promise<RevealedEmployee> { const row = entity(read().employees, employeeId, '员工'); return later({ ...publicEmployee(row), ...(seedSecrets().get(employeeId) || { idCard: '', bankCard: '', address: '', emergencyContact: '' }) } as RevealedEmployee) }
export async function mockCreateEmployee(payload: EmployeePayload) {
  required(payload.employeeNumber, '员工编号'); required(payload.name, '姓名')
  if (read().employees.some((row) => row.employeeNumber === payload.employeeNumber)) throw new Error('员工编号已存在')
  const sensitive = { idCard: payload.idCard || '', bankCard: payload.bankCard || '', address: payload.address || '', emergencyContact: payload.emergencyContact || '' }
  const row = employee({ id: id('emp'), employeeNumber: payload.employeeNumber.trim(), name: payload.name.trim(), status: payload.status || 'ACTIVE', phone: payload.phone || '', hireDate: payload.hireDate, terminationDate: payload.terminationDate || '', baseSalary: payload.baseSalary || 0, attendanceBonus: payload.attendanceBonus || 0, overtimeHourlyRate: payload.overtimeHourlyRate || 0, restQuotaDays: payload.restQuotaDays || 0 }, sensitive)
  const secret = clone(row.sensitive!); delete row.sensitive; seedSecrets().set(row.id, secret); read().employees.push(row); save(); return later(publicEmployee(row))
}
export async function mockUpdateEmployee(employeeId: string, payload: EmployeePayload) { const old = entity(read().employees, employeeId, '员工'); const others = read().employees.some((row) => row.id !== employeeId && row.employeeNumber === payload.employeeNumber); if (others) throw new Error('员工编号已存在'); const existing = seedSecrets().get(employeeId) || { idCard: '', bankCard: '', address: '', emergencyContact: '' }; const { idCard: _idCard, bankCard: _bankCard, address: _address, emergencyContact: _emergencyContact, ...safePayload } = payload; const secret = { idCard: payload.idCard || existing.idCard, bankCard: payload.bankCard || existing.bankCard, address: payload.address || existing.address, emergencyContact: payload.emergencyContact || existing.emergencyContact }; Object.assign(old, safePayload, { updatedAt: now(), idCardMasked: masked(secret.idCard), bankCardMasked: masked(secret.bankCard), addressMasked: masked(secret.address), emergencyContactMasked: masked(secret.emergencyContact) }); seedSecrets().set(employeeId, secret); save(); return later(publicEmployee(old)) }
export async function mockDeleteEmployee(employeeId: string) {
  const state = read()
  const row = entity(state.employees, employeeId, '员工')
  const hasHistory = state.attendance.some((item) => item.employeeId === employeeId)
    || state.leaves.some((item) => item.employeeId === employeeId)
    || state.commissions.some((item) => item.employeeId === employeeId)
    || state.bonuses.some((item) => item.employeeId === employeeId)
    || state.payrolls.some((run) => run.items.some((item) => item.employeeId === employeeId))
  if (hasHistory) { row.status = 'INACTIVE'; row.terminationDate ||= dayjs().format('YYYY-MM-DD') }
  else { remove(state.employees, employeeId); seedSecrets().delete(employeeId) }
  save()
  return later(publicEmployee(row))
}
export async function mockUploadEmployeePhoto(employeeId: string, _file: File) { const row = entity(read().employees, employeeId, '员工'); row.hasPhoto = true; save(); return later({ id: row.id, hasPhoto: true }) }

export async function mockGetWeeklySchedules(employeeId?: string) { return later(read().weeklySchedules.filter((row) => !employeeId || row.employeeId === employeeId)) }
export async function mockSaveWeeklySchedule(payload: WeeklySchedulePayload) { const duplicate = read().weeklySchedules.find((row) => row.employeeId === payload.employeeId && row.weekday === payload.weekday); if (duplicate) Object.assign(duplicate, payload); else read().weeklySchedules.push({ ...payload, id: id('ws') }); save(); return later(duplicate || read().weeklySchedules.at(-1)!) }
export async function mockDeleteWeeklySchedule(scheduleId: string) { remove(read().weeklySchedules, scheduleId) }
export async function mockGetDateOverrides(query: AttendanceQuery = {}) { return later(read().overrides.filter((row) => (!query.employeeId || row.employeeId === query.employeeId) && (!query.month || monthOf(row.date) === query.month))) }
export async function mockSaveDateOverride(payload: DateOverridePayload, overrideId?: string) {
  ensureDraftForDate(payload.date)
  const duplicate = read().overrides.find((row) => row.id !== overrideId && row.employeeId === payload.employeeId && row.date === payload.date)
  if (duplicate) throw new Error('该员工当日已有临时调班')
  const row = overrideId ? entity(read().overrides, overrideId, '临时调班') : { ...payload, id: id('override') }
  Object.assign(row, payload)
  if (!overrideId) read().overrides.push(row)
  save()
  return later(row)
}
export async function mockDeleteDateOverride(overrideId: string) { const row = entity(read().overrides, overrideId, '临时调班'); ensureDraftForDate(row.date); remove(read().overrides, overrideId) }
export async function mockGetMonthlySettings(month?: string) { return later(read().monthSettings.filter((row) => !month || row.month === month)) }
export async function mockSaveMonthlySetting(payload: Omit<MonthlySetting, 'id'>) { ensureDraftForDate(`${payload.month}-01`); const found = read().monthSettings.find((row) => row.employeeId === payload.employeeId && row.month === payload.month); if (found) Object.assign(found, payload); else read().monthSettings.push({ ...payload, id: id('month-setting') }); save(); return later(found || read().monthSettings.at(-1)!) }
export async function mockDeleteMonthlySetting(settingId: string) { const row = entity(read().monthSettings, settingId, '月休设置'); ensureDraftForDate(`${row.month}-01`); remove(read().monthSettings, settingId) }

const filterDates = <T extends { employeeId: string; date: string }>(rows: T[], query: AttendanceQuery) => rows.filter((row) => (!query.employeeId || row.employeeId === query.employeeId) && (!query.month || monthOf(row.date) === query.month) && (!query.startDate || row.date >= query.startDate) && (!query.endDate || row.date <= query.endDate))
export async function mockGetAttendance(query: AttendanceQuery = {}) { return later(filterDates(read().attendance, query)) }
export async function mockSaveAttendance(payload: AttendancePayload, attendanceId?: string) { ensureDraftForDate(payload.date); const duplicate = read().attendance.find((row) => row.employeeId === payload.employeeId && row.date === payload.date && row.id !== attendanceId); if (duplicate) throw new Error('该员工当日考勤已存在'); const row = attendanceId ? entity(read().attendance, attendanceId, '考勤记录') : { ...payload, id: id('attendance'), manuallyEdited: true }; Object.assign(row, payload, { manuallyEdited: true }); if (!attendanceId) read().attendance.push(row as AttendanceRecord); save(); return later(row as AttendanceRecord) }
export async function mockDeleteAttendance(attendanceId: string) { const row = entity(read().attendance, attendanceId, '考勤记录'); ensureDraftForDate(row.date); remove(read().attendance, attendanceId) }
export async function mockGenerateAttendance(month: string, employeeIds: string[]) {
  ensureDraftForDate(`${month}-01`)
  const days = dayjs(`${month}-01`).daysInMonth()
  let created = 0; let updated = 0; let skippedManual = 0
  for (const employeeId of employeeIds) {
    const employee = entity(read().employees, employeeId, '员工')
    if (employee.status !== 'ACTIVE' && !employee.terminationDate) continue
    for (let day = 1; day <= days; day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`
      if (date < employee.hireDate || (employee.terminationDate && date > employee.terminationDate)) continue
      const found = read().attendance.find((row) => row.employeeId === employeeId && row.date === date)
      if (found?.manuallyEdited) { skippedManual += 1; continue }
      const weekday = dayjs(date).day()
      const schedule = read().overrides.find((row) => row.employeeId === employeeId && row.date === date)
        || read().weeklySchedules.find((row) => row.employeeId === employeeId && row.weekday === weekday)
      if (!schedule) continue
      const value: AttendanceRecord = { id: found?.id || id('attendance'), employeeId, date, isScheduledWorkday: schedule.isWorkday, scheduledMinutes: schedule.scheduledMinutes, checkInAt: '', checkOutAt: '', workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0, overtimeMinutes: 0, remark: '', manuallyEdited: false }
      if (found) { Object.assign(found, value); updated += 1 } else { read().attendance.push(value); created += 1 }
    }
  }
  save()
  return later({ created, updated, skippedManual, generated: created + updated })
}

export async function mockGetLeaveTypes() { return later(read().leaveTypes) }
export async function mockSaveLeaveType(payload: LeaveTypePayload, typeId?: string) { required(payload.name, '请假类型'); const row = typeId ? entity(read().leaveTypes, typeId, '请假类型') : { id: id('leave-type'), active: true, ...payload }; Object.assign(row, payload); if (!typeId) read().leaveTypes.push(row as LeaveType); save(); return later(row as LeaveType) }
export async function mockDeleteLeaveType(typeId: string) { const row = entity(read().leaveTypes, typeId, '请假类型'); if (read().leaves.some((item) => item.leaveTypeId === typeId)) row.active = false; else remove(read().leaveTypes, typeId); save() }
export async function mockGetLeaves(query: AttendanceQuery = {}) {
  const monthStart = query.month ? `${query.month}-01` : ''
  const monthEnd = query.month ? dayjs(monthStart).endOf('month').format('YYYY-MM-DD') : ''
  return later(read().leaves.filter((row) => (!query.employeeId || row.employeeId === query.employeeId)
    && (!query.month || (row.startDate <= monthEnd && row.endDate >= monthStart))
    && (!query.startDate || row.endDate >= query.startDate) && (!query.endDate || row.startDate <= query.endDate)
    && (!query.status || row.status === query.status)))
}
function mockCountedLeaveDays(payload: LeaveRequestPayload) { const dates: string[] = []; for (let cursor = dayjs(payload.startDate); cursor.isBefore(payload.endDate) || cursor.isSame(payload.endDate, 'day'); cursor = cursor.add(1, 'day')) dates.push(cursor.format('YYYY-MM-DD')); const scheduled = dates.map((date) => { const override = read().overrides.find((row) => row.employeeId === payload.employeeId && row.date === date); const weekly = read().weeklySchedules.find((row) => row.employeeId === payload.employeeId && row.weekday === dayjs(date).day()); const row = override || weekly; return row?.isWorkday ? row.scheduledMinutes : 0 }); const workdays = scheduled.filter((minutes) => minutes > 0).length; if (!workdays) throw new Error('请假日期不包含排班工作日'); if (payload.unit === 'FULL_DAY') return workdays; if (payload.unit === 'HALF_DAY') return workdays * 0.5; if (dates.length !== 1) throw new Error('小时请假必须在同一天'); const leaveMinutes = (payload.hours || 0) * 60; if (leaveMinutes <= 0 || leaveMinutes > scheduled[0]) throw new Error('请假小时必须大于 0 且不能超过当日排班'); return Number((leaveMinutes / scheduled[0]).toFixed(2)) }
export async function mockSaveLeave(payload: LeaveRequestPayload, leaveId?: string) { ensureDraftForDate(payload.startDate); ensureDraftForDate(payload.endDate); required(payload.reason, '请假原因'); const leaveType = entity(read().leaveTypes, payload.leaveTypeId, '请假类型'); if (!leaveType.active) throw new Error('该请假类型已停用'); const overlap = read().leaves.some((row) => row.id !== leaveId && row.employeeId === payload.employeeId && row.status !== 'REJECTED' && row.startDate <= payload.endDate && row.endDate >= payload.startDate); if (overlap) throw new Error('请假时间重叠'); const countedDays = mockCountedLeaveDays(payload); const row = leaveId ? entity(read().leaves, leaveId, '请假记录') : { id: id('leave'), status: 'PENDING' as LeaveStatus, countedDays, reviewRemark: '', ...payload }; Object.assign(row, payload, { countedDays }); if (!leaveId) read().leaves.push(row as LeaveRequest); save(); return later(row as LeaveRequest) }
export async function mockReviewLeave(leaveId: string, status: Exclude<LeaveStatus, 'PENDING'>, reviewRemark = '') { const row = entity(read().leaves, leaveId, '请假记录'); ensureDraftForDate(row.startDate); ensureDraftForDate(row.endDate); if (row.status !== 'PENDING') throw new Error('该请假已处理'); row.status = status; row.reviewRemark = reviewRemark; save(); return later(row) }
export async function mockDeleteLeave(leaveId: string) { const row = entity(read().leaves, leaveId, '请假记录'); ensureDraftForDate(row.startDate); ensureDraftForDate(row.endDate); remove(read().leaves, leaveId) }

export async function mockGetCommissionTypes() { return later(read().commissionTypes) }
export async function mockSaveCommissionType(payload: CommissionTypePayload, typeId?: string) { const row = typeId ? entity(read().commissionTypes, typeId, '提成类型') : { id: id('commission-type'), active: true, ...payload }; Object.assign(row, payload); if (!typeId) read().commissionTypes.push(row as CommissionType); save(); return later(row as CommissionType) }
export async function mockDeleteCommissionType(typeId: string) { const row = entity(read().commissionTypes, typeId, '提成类型'); if (read().commissions.some((item) => item.commissionTypeId === typeId)) row.active = false; else remove(read().commissionTypes, typeId); save() }
export async function mockGetCommissions(query: AttendanceQuery = {}) { return later(filterDates(read().commissions, query)) }
export async function mockSaveCommission(payload: CommissionPayload, recordId?: string) { ensureDraftForDate(payload.date); const type = entity(read().commissionTypes, payload.commissionTypeId, '提成类型'); if (!type.active) throw new Error('该提成类型已停用'); const unitPrice = payload.unitPrice ?? type.unitPrice; const row = recordId ? entity(read().commissions, recordId, '提成记录') : { id: id('commission'), ...payload, unitPrice, amount: 0 }; Object.assign(row, payload, { unitPrice, amount: Number((unitPrice * payload.quantity).toFixed(2)) }); if (!recordId) read().commissions.push(row as CommissionRecord); save(); return later(row as CommissionRecord) }
export async function mockDeleteCommission(recordId: string) { const row = entity(read().commissions, recordId, '提成记录'); ensureDraftForDate(row.date); remove(read().commissions, recordId) }
export async function mockGetBonuses(query: AttendanceQuery = {}) { return later(filterDates(read().bonuses, query)) }
export async function mockSaveBonus(payload: BonusPayload, bonusId?: string) { ensureDraftForDate(payload.date); required(payload.reason, '奖金发放原因'); if (payload.amount <= 0) throw new Error('奖金金额必须大于 0'); const row = bonusId ? entity(read().bonuses, bonusId, '奖金') : { id: id('bonus'), ...payload }; Object.assign(row, payload); if (!bonusId) read().bonuses.push(row as BonusRecord); save(); return later(row as BonusRecord) }
export async function mockDeleteBonus(bonusId: string) { const row = entity(read().bonuses, bonusId, '奖金'); ensureDraftForDate(row.date); remove(read().bonuses, bonusId) }
export async function mockGetCompensationTotals(month: string): Promise<CompensationTotal[]> { return later(read().employees.map((employee) => ({ employeeId: employee.id, commissionAmount: read().commissions.filter((row) => row.employeeId === employee.id && monthOf(row.date) === month).reduce((sum, row) => sum + row.amount, 0), bonusAmount: read().bonuses.filter((row) => row.employeeId === employee.id && monthOf(row.date) === month).reduce((sum, row) => sum + row.amount, 0) }))) }

const money = (value: number) => Number(value.toFixed(2))
const overlapsMonth = (startDate: string, endDate: string, month: string) => startDate <= dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD') && endDate >= `${month}-01`
function payrollItem(emp: EmployeeAttendanceState['employees'][number], month: string, old?: PayrollItem): PayrollItem {
  const state = read()
  const setting = state.monthSettings.find((row) => row.employeeId === emp.id && row.month === month)
  const records = state.attendance.filter((row) => row.employeeId === emp.id && monthOf(row.date) === month && row.isScheduledWorkday)
  const approvedLeaves = state.leaves.filter((row) => row.employeeId === emp.id && row.status === 'APPROVED' && overlapsMonth(row.startDate, row.endDate, month))
  const coverageFor = (record: AttendanceRecord) => Math.min(1, approvedLeaves.filter((leave) => leave.startDate <= record.date && leave.endDate >= record.date).reduce((sum, leave) => {
    if (leave.unit === 'FULL_DAY') return sum + 1
    if (leave.unit === 'HALF_DAY') return sum + 0.5
    return sum + ((leave.hours || 0) * 60 / Math.max(1, record.scheduledMinutes || 480))
  }, 0))
  const unresolvedNoPunch = records.filter((row) => !row.checkInAt && !row.checkOutAt && !(row.absenceMinutes || 0) && coverageFor(row) < 1)
  const quotaLeaveDays = approvedLeaves.reduce((sum, row) => sum + (state.leaveTypes.find((type) => type.id === row.leaveTypeId)?.countsTowardRestQuota ? row.countedDays : 0), 0)
  const excessLeaveDays = Math.max(0, quotaLeaveDays - (setting?.restQuotaDays ?? emp.restQuotaDays))
  const absenceDays = records.reduce((sum, row) => sum + Math.max(0, Math.min(1, (row.absenceMinutes || 0) / Math.max(1, row.scheduledMinutes || 480)) - coverageFor(row)), 0)
  const dailyRate = setting?.scheduledWorkDays ? emp.baseSalary / setting.scheduledWorkDays : 0
  const commissionAmount = money(state.commissions.filter((row) => row.employeeId === emp.id && monthOf(row.date) === month).reduce((sum, row) => sum + row.amount, 0))
  const bonusAmount = money(state.bonuses.filter((row) => row.employeeId === emp.id && monthOf(row.date) === month).reduce((sum, row) => sum + row.amount, 0))
  const overtimeMinutes = records.reduce((sum, row) => sum + (row.overtimeMinutes || 0), 0)
  const overtimePay = money(overtimeMinutes / 60 * emp.overtimeHourlyRate)
  const adjustments = old?.adjustments || []
  const adjustmentAmount = money(adjustments.reduce((sum, row) => sum + row.amount, 0))
  const leaveDeduction = money(dailyRate * excessLeaveDays)
  const absenceDeduction = money(dailyRate * absenceDays)
  const attendanceBonus = excessLeaveDays > 0 || absenceDays > 0 ? 0 : emp.attendanceBonus
  const issues: string[] = []
  if (!state.weeklySchedules.some((row) => row.employeeId === emp.id) && !state.overrides.some((row) => row.employeeId === emp.id && monthOf(row.date) === month)) issues.push('缺少排班设置')
  if (!setting || setting.scheduledWorkDays <= 0) issues.push('缺少当月应出勤天数')
  else if (records.length < setting.scheduledWorkDays) issues.push(`缺少 ${setting.scheduledWorkDays - records.length} 天考勤记录`)
  if (unresolvedNoPunch.length) issues.push(`有 ${unresolvedNoPunch.length} 天未打卡且未处理`)
  if (absenceDays > 0) issues.push(`有 ${money(absenceDays)} 天缺勤待处理`)
  const payableAmount = money(emp.baseSalary + attendanceBonus + overtimePay + commissionAmount + bonusAmount + adjustmentAmount - leaveDeduction - absenceDeduction)
  return {
    id: old?.id || id('payroll-item'), employeeId: emp.id, employee: publicEmployee(emp), payableAmount, issues, adjustments,
    calculationSnapshot: { baseSalary: emp.baseSalary, attendanceBonus, overtimePay, commissionAmount, bonusAmount, adjustmentAmount, leaveDeduction, absenceDeduction, payableAmount }
  }
}
export async function mockGeneratePayroll(month: string) {
  const state = read()
  const confirmed = state.payrolls.find((row) => row.month === month && row.status === 'CONFIRMED')
  if (confirmed) throw new Error('该月工资已确认')
  let run = state.payrolls.find((row) => row.month === month && row.status === 'DRAFT')
  const monthStart = `${month}-01`; const monthEnd = dayjs(monthStart).endOf('month').format('YYYY-MM-DD')
  const employees = state.employees.filter((row) => row.hireDate <= monthEnd && (!row.terminationDate || row.terminationDate >= monthStart) && (row.status === 'ACTIVE' || Boolean(row.terminationDate)))
  const items = employees.map((row) => payrollItem(row, month, run?.items.find((item) => item.employeeId === row.id)))
  const pendingLeaves = state.leaves.filter((row) => row.status === 'PENDING' && overlapsMonth(row.startDate, row.endDate, month)).length
  const issues = [...items.flatMap((item) => item.issues.map((issue) => `${item.employee.name}：${issue}`)), ...(pendingLeaves ? [`${pendingLeaves} 条请假待审批`] : [])]
  if (!run) { run = { id: id('payroll'), month, status: 'DRAFT', totalAmount: 0, issueCount: 0, issues: [], items }; state.payrolls.push(run) }
  Object.assign(run, { items, issues, issueCount: issues.length, totalAmount: money(items.reduce((sum, item) => sum + item.payableAmount, 0)) })
  save()
  return later(run)
}
export async function mockGetPayroll(month: string) { return later(read().payrolls.find((row) => row.month === month) || null) }
function draftRunForItem(itemId: string) { const run = read().payrolls.find((row) => row.items.some((item) => item.id === itemId)); if (!run) throw new Error('工资单不存在'); if (run.status !== 'DRAFT') throw new Error('该月工资已确认，不能修改'); return run }
export async function mockCreatePayrollAdjustment(itemId: string, payload: { amount: number; reason: string }) { if (!payload.amount || !payload.reason.trim()) throw new Error('调整金额和原因必填'); const run = draftRunForItem(itemId); const item = entity(run.items, itemId, '工资明细'); const adjustment = { id: id('adjustment'), payrollItemId: itemId, ...payload }; item.adjustments.push(adjustment); Object.assign(item, payrollItem(read().employees.find((row) => row.id === item.employeeId)!, run.month, item)); run.totalAmount = run.items.reduce((sum, row) => sum + row.payableAmount, 0); save(); return later(adjustment) }
export async function mockUpdatePayrollAdjustment(adjustmentId: string, payload: { amount: number; reason: string }) { const run = read().payrolls.find((row) => row.items.some((item) => item.adjustments.some((adjustment) => adjustment.id === adjustmentId))); if (!run) throw new Error('调整记录不存在'); if (run.status !== 'DRAFT') throw new Error('该月工资已确认'); if (!payload.amount || !payload.reason.trim()) throw new Error('调整金额和原因必填'); const item = run.items.find((row) => row.adjustments.some((adjustment) => adjustment.id === adjustmentId))!; Object.assign(entity(item.adjustments, adjustmentId, '调整记录'), payload); Object.assign(item, payrollItem(read().employees.find((row) => row.id === item.employeeId)!, run.month, item)); run.totalAmount = money(run.items.reduce((sum, row) => sum + row.payableAmount, 0)); save(); return later(entity(item.adjustments, adjustmentId, '调整记录')) }
export async function mockDeletePayrollAdjustment(adjustmentId: string) { const run = read().payrolls.find((row) => row.items.some((item) => item.adjustments.some((adjustment) => adjustment.id === adjustmentId))); if (!run) throw new Error('调整记录不存在'); if (run.status !== 'DRAFT') throw new Error('该月工资已确认'); const item = run.items.find((row) => row.adjustments.some((adjustment) => adjustment.id === adjustmentId))!; remove(item.adjustments, adjustmentId); Object.assign(item, payrollItem(read().employees.find((row) => row.id === item.employeeId)!, run.month, item)); run.totalAmount = money(run.items.reduce((sum, row) => sum + row.payableAmount, 0)); save() }
function setPayrollLocks(month: string, lockedAt: string | null) {
  const state = read()
  state.attendance.filter((row) => monthOf(row.date) === month).forEach((row) => { row.lockedAt = lockedAt })
  state.leaves.filter((row) => overlapsMonth(row.startDate, row.endDate, month)).forEach((row) => { row.lockedAt = lockedAt })
  state.commissions.filter((row) => monthOf(row.date) === month).forEach((row) => { row.lockedAt = lockedAt })
  state.bonuses.filter((row) => monthOf(row.date) === month).forEach((row) => { row.lockedAt = lockedAt })
}
export async function mockConfirmPayroll(runId: string) {
  const run = entity(read().payrolls, runId, '工资单')
  if (run.status === 'CONFIRMED') throw new Error('该月工资已确认')
  const refreshed = await mockGeneratePayroll(run.month)
  const current = entity(read().payrolls, refreshed.id, '工资单')
  if (current.issueCount) throw new Error(`暂不能确认：${current.issues.join('；')}`)
  current.status = 'CONFIRMED'; current.confirmedAt = now(); current.items = clone(current.items)
  setPayrollLocks(current.month, current.confirmedAt)
  save()
  return later(current)
}
export async function mockReopenPayroll(runId: string, reason: string) { required(reason, '撤销确认原因'); const run = entity(read().payrolls, runId, '工资单'); run.status = 'DRAFT'; run.confirmedAt = null; run.reopenReason = reason; setPayrollLocks(run.month, null); save(); return later(run) }
export async function mockGetOverview(month: string): Promise<AttendanceOverview> { const employees = read().employees.filter((row) => row.status === 'ACTIVE'); const today = dayjs().format('YYYY-MM-DD'); const records = read().attendance.filter((row) => row.date === today); const pendingLeaves = read().leaves.filter((row) => row.status === 'PENDING').length; const payroll = read().payrolls.find((row) => row.month === month); return later({ month, activeEmployees: employees.length, todayPresent: records.filter((row) => row.checkInAt).length, todayOnLeave: read().leaves.filter((row) => row.status === 'APPROVED' && row.startDate <= today && row.endDate >= today).length, todayAbsent: records.filter((row) => (row.absenceMinutes || 0) > 0).length, overtimeHours: Number((records.reduce((sum, row) => sum + (row.overtimeMinutes || 0), 0) / 60).toFixed(1)), pendingLeaves, projectedPayroll: payroll?.totalAmount || employees.reduce((sum, row) => sum + row.baseSalary + row.attendanceBonus, 0), issueCount: (payroll?.issueCount || 0) + pendingLeaves, issues: [...(payroll?.issues || []), ...(pendingLeaves ? [`${pendingLeaves} 条请假待审批`] : [])] }) }
