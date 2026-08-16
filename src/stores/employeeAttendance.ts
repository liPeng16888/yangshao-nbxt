import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import * as api from '@/api/employeeAttendance'
import type {
  AttendanceOverview, AttendanceRecord, BonusRecord, CommissionRecord, CommissionType, DateOverride, Employee,
  LeaveRequest, LeaveType, MonthlyScheduleDay, MonthlySetting, PayrollRun, WeeklySchedule
} from '@/types/employeeAttendance'

export function syncPendingLeaveIssue(run: Pick<PayrollRun, 'issues' | 'issueCount'>, pendingLeaves: number) {
  const issues = run.issues.filter((issue) => !issue.includes('请假待审批'))
  if (pendingLeaves > 0) issues.push(`${pendingLeaves} 条请假待审批`)
  run.issues = issues
  run.issueCount = issues.length
}

interface LeaveLoadScope {
  signal?: AbortSignal
  isCurrent?: () => boolean
}

function abortError() { return new DOMException('The operation was aborted', 'AbortError') }

function abortable<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return action()
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      handler()
    }
    const abort = () => finish(() => reject(abortError()))
    signal.addEventListener('abort', abort, { once: true })
    action().then((value) => finish(() => resolve(value)), (reason) => finish(() => reject(reason)))
  })
}

export const useEmployeeAttendanceStore = defineStore('employeeAttendance', () => {
  const month = ref(dayjs().format('YYYY-MM'))
  const employeeId = ref('')
  const startDate = ref('')
  const endDate = ref('')
  const leaveStatus = ref<'' | 'PENDING' | 'APPROVED' | 'REJECTED'>('')
  const pendingLoads = ref(0)
  const pendingSaves = ref(0)
  const loading = computed(() => pendingLoads.value > 0)
  const saving = computed(() => pendingSaves.value > 0)
  const error = ref('')
  const employees = ref<Employee[]>([])
  const overview = ref<AttendanceOverview | null>(null)
  const scheduleAttendanceOverview = ref<import('@/types/employeeAttendance').ScheduleAttendanceOverview | null>(null)
  const weeklySchedules = ref<WeeklySchedule[]>([])
  const overrides = ref<DateOverride[]>([])
  const monthlySchedules = ref<MonthlyScheduleDay[]>([])
  const monthSettings = ref<MonthlySetting[]>([])
  const attendance = ref<AttendanceRecord[]>([])
  const leaveTypes = ref<LeaveType[]>([])
  const leaves = ref<LeaveRequest[]>([])
  const leaveEmployeeIds = ref<string[]>([])
  const commissionTypes = ref<CommissionType[]>([])
  const commissions = ref<CommissionRecord[]>([])
  const bonuses = ref<BonusRecord[]>([])
  const payroll = ref<PayrollRun | null>(null)
  let attendanceLoadVersion = 0
  let leaveLoadVersion = 0
  let scheduleAttendanceOverviewVersion = 0
  const activeEmployees = computed(() => employees.value.filter((row) => row.status === 'ACTIVE'))

  async function run<T>(action: () => Promise<T>, save = false) {
    error.value = ''; if (save) pendingSaves.value += 1; else pendingLoads.value += 1
    try { return await action() } catch (reason) { error.value = reason instanceof Error ? reason.message : '操作失败'; throw reason }
    finally { if (save) pendingSaves.value -= 1; else pendingLoads.value -= 1 }
  }
  async function runQuiet<T>(action: () => Promise<T>, save = false) {
    if (save) pendingSaves.value += 1; else pendingLoads.value += 1
    try { return await action() }
    finally { if (save) pendingSaves.value -= 1; else pendingLoads.value -= 1 }
  }
  async function runScopedLoad<T>(action: () => Promise<T>, signal?: AbortSignal) {
    if (signal?.aborted) throw abortError()
    pendingLoads.value += 1
    let counted = true
    const finishLoading = () => { if (counted) { counted = false; pendingLoads.value -= 1 } }
    signal?.addEventListener('abort', finishLoading, { once: true })
    try { return await abortable(action, signal) }
    finally { signal?.removeEventListener('abort', finishLoading); finishLoading() }
  }
  const loadEmployees = () => run(async () => { employees.value = await api.getEmployees(); return employees.value })
  const loadOverview = () => run(async () => { overview.value = await api.getOverview(month.value); return overview.value })
  const loadSchedules = () => run(async () => { [weeklySchedules.value, overrides.value, monthSettings.value] = await Promise.all([api.getWeeklySchedules(employeeId.value || undefined), api.getDateOverrides({ employeeId: employeeId.value || undefined, month: month.value }), api.getMonthlySettings(month.value)]); return weeklySchedules.value })
  const loadMonthlySchedules = () => run(async () => {
    monthlySchedules.value = employeeId.value ? await api.getMonthlySchedules(employeeId.value, month.value) : []
    return monthlySchedules.value
  })
  const loadScheduleAttendanceOverview = async () => {
    const version = ++scheduleAttendanceOverviewVersion
    const key = `${employeeId.value}:${month.value}`
    error.value = ''
    try {
      const result = await runQuiet(() => api.getScheduleAttendanceOverview(employeeId.value || undefined, month.value))
      if (version === scheduleAttendanceOverviewVersion && key === `${employeeId.value}:${month.value}`) {
        scheduleAttendanceOverview.value = result
        monthlySchedules.value = result.days.flatMap((day) => day.schedule ? [day.schedule] : [])
        overview.value = result.overview
      }
      return result
    } catch (reason) {
      if (version === scheduleAttendanceOverviewVersion) { error.value = reason instanceof Error ? reason.message : '操作失败'; throw reason }
      return scheduleAttendanceOverview.value
    }
  }
  function selectMonth(value: string) {
    month.value = value
    startDate.value = ''
    endDate.value = ''
  }
  function selectDateRange(start: string, end: string) {
    startDate.value = start
    endDate.value = end
  }
  function restoreMonthMode() {
    startDate.value = ''
    endDate.value = ''
  }
  const dateQuery = () => {
    const usesDateRange = Boolean(startDate.value || endDate.value)
    return {
      employeeId: employeeId.value || undefined,
      month: usesDateRange ? undefined : month.value || undefined,
      startDate: usesDateRange ? startDate.value || undefined : undefined,
      endDate: usesDateRange ? endDate.value || undefined : undefined
    }
  }
  const loadAttendance = async () => {
    const version = ++attendanceLoadVersion
    const query = dateQuery()
    error.value = ''
    try {
      const rows = await runQuiet(() => api.getAttendance(query))
      if (version === attendanceLoadVersion) attendance.value = rows
      return rows
    } catch (reason) {
      if (version === attendanceLoadVersion) {
        error.value = reason instanceof Error ? reason.message : '操作失败'
        throw reason
      }
      return attendance.value
    }
  }
  const loadLeaves = async (scope: LeaveLoadScope = {}) => {
    const version = ++leaveLoadVersion
    const query = { ...dateQuery(), employeeId: undefined, employeeIds: [...leaveEmployeeIds.value], status: leaveStatus.value || undefined }
    const canCommit = () => version === leaveLoadVersion && !scope.signal?.aborted && (scope.isCurrent?.() ?? true)
    error.value = ''
    try {
      const [types, rows] = await runScopedLoad(() => Promise.all([api.getLeaveTypes(), api.getLeaves(query)]), scope.signal)
      if (canCommit()) {
        leaveTypes.value = types
        leaves.value = rows
      }
      return rows
    } catch (reason) {
      if (scope.signal?.aborted || !canCommit()) return leaves.value
      if (version === leaveLoadVersion) {
        error.value = reason instanceof Error ? reason.message : '操作失败'
        throw reason
      }
      return leaves.value
    }
  }
  const loadCompensation = () => run(async () => { [commissionTypes.value, commissions.value, bonuses.value] = await Promise.all([api.getCommissionTypes(), api.getCommissions(dateQuery()), api.getBonuses(dateQuery())]); return commissions.value })
  const loadPayroll = () => run(async () => {
    const [run, summary] = await Promise.all([api.getPayroll(month.value), api.getOverview(month.value)])
    overview.value = summary
    if (run) syncPendingLeaveIssue(run, summary.pendingLeaves)
    payroll.value = run
    return payroll.value
  })
  function clearError() { error.value = '' }
  function setError(message: string) { error.value = message }
  return { month, employeeId, startDate, endDate, leaveStatus, leaveEmployeeIds, loading, saving, error, employees, activeEmployees, overview, scheduleAttendanceOverview, weeklySchedules, overrides, monthlySchedules, monthSettings, attendance, leaveTypes, leaves, commissionTypes, commissions, bonuses, payroll, run, runQuiet, clearError, setError, selectMonth, selectDateRange, restoreMonthMode, dateQuery, loadEmployees, loadOverview, loadSchedules, loadMonthlySchedules, loadScheduleAttendanceOverview, loadAttendance, loadLeaves, loadCompensation, loadPayroll }
})
