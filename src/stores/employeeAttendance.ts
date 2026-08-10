import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import * as api from '@/api/employeeAttendance'
import type {
  AttendanceOverview, AttendanceRecord, BonusRecord, CommissionRecord, CommissionType, DateOverride, Employee,
  LeaveRequest, LeaveType, MonthlySetting, PayrollRun, WeeklySchedule
} from '@/types/employeeAttendance'

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
  const weeklySchedules = ref<WeeklySchedule[]>([])
  const overrides = ref<DateOverride[]>([])
  const monthSettings = ref<MonthlySetting[]>([])
  const attendance = ref<AttendanceRecord[]>([])
  const leaveTypes = ref<LeaveType[]>([])
  const leaves = ref<LeaveRequest[]>([])
  const commissionTypes = ref<CommissionType[]>([])
  const commissions = ref<CommissionRecord[]>([])
  const bonuses = ref<BonusRecord[]>([])
  const payroll = ref<PayrollRun | null>(null)
  const activeEmployees = computed(() => employees.value.filter((row) => row.status === 'ACTIVE'))

  async function run<T>(action: () => Promise<T>, save = false) {
    error.value = ''; if (save) pendingSaves.value += 1; else pendingLoads.value += 1
    try { return await action() } catch (reason) { error.value = reason instanceof Error ? reason.message : '操作失败'; throw reason }
    finally { if (save) pendingSaves.value -= 1; else pendingLoads.value -= 1 }
  }
  const loadEmployees = () => run(async () => { employees.value = await api.getEmployees(); return employees.value })
  const loadOverview = () => run(async () => { overview.value = await api.getOverview(month.value); return overview.value })
  const loadSchedules = () => run(async () => { [weeklySchedules.value, overrides.value, monthSettings.value] = await Promise.all([api.getWeeklySchedules(employeeId.value || undefined), api.getDateOverrides({ employeeId: employeeId.value || undefined, month: month.value }), api.getMonthlySettings(month.value)]); return weeklySchedules.value })
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
  const loadAttendance = () => run(async () => { attendance.value = await api.getAttendance(dateQuery()); return attendance.value })
  const loadLeaves = () => run(async () => { [leaveTypes.value, leaves.value] = await Promise.all([api.getLeaveTypes(), api.getLeaves({ ...dateQuery(), status: leaveStatus.value || undefined })]); return leaves.value })
  const loadCompensation = () => run(async () => { [commissionTypes.value, commissions.value, bonuses.value] = await Promise.all([api.getCommissionTypes(), api.getCommissions(dateQuery()), api.getBonuses(dateQuery())]); return commissions.value })
  const loadPayroll = () => run(async () => {
    const [run, summary] = await Promise.all([api.getPayroll(month.value), api.getOverview(month.value)])
    overview.value = summary
    if (run && summary.pendingLeaves > 0 && !run.issues.some((issue) => issue.includes('请假待审批'))) {
      run.issues = [...run.issues, `${summary.pendingLeaves} 条请假待审批`]
      run.issueCount += 1
    }
    payroll.value = run
    return payroll.value
  })
  function clearError() { error.value = '' }
  function setError(message: string) { error.value = message }
  return { month, employeeId, startDate, endDate, leaveStatus, loading, saving, error, employees, activeEmployees, overview, weeklySchedules, overrides, monthSettings, attendance, leaveTypes, leaves, commissionTypes, commissions, bonuses, payroll, run, clearError, setError, selectMonth, selectDateRange, restoreMonthMode, dateQuery, loadEmployees, loadOverview, loadSchedules, loadAttendance, loadLeaves, loadCompensation, loadPayroll }
})
