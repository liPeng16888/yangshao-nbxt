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
  const loading = ref(false)
  const saving = ref(false)
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
    error.value = ''; if (save) saving.value = true; else loading.value = true
    try { return await action() } catch (reason) { error.value = reason instanceof Error ? reason.message : '操作失败'; throw reason }
    finally { if (save) saving.value = false; else loading.value = false }
  }
  const loadEmployees = () => run(async () => { employees.value = await api.getEmployees(); return employees.value })
  const loadOverview = () => run(async () => { overview.value = await api.getOverview(month.value); return overview.value })
  const loadSchedules = () => run(async () => { [weeklySchedules.value, overrides.value, monthSettings.value] = await Promise.all([api.getWeeklySchedules(employeeId.value || undefined), api.getDateOverrides({ employeeId: employeeId.value || undefined, month: month.value }), api.getMonthlySettings(month.value)]); return weeklySchedules.value })
  const loadAttendance = () => run(async () => { attendance.value = await api.getAttendance({ employeeId: employeeId.value || undefined, month: month.value }); return attendance.value })
  const loadLeaves = () => run(async () => { [leaveTypes.value, leaves.value] = await Promise.all([api.getLeaveTypes(), api.getLeaves({ employeeId: employeeId.value || undefined, month: month.value })]); return leaves.value })
  const loadCompensation = () => run(async () => { [commissionTypes.value, commissions.value, bonuses.value] = await Promise.all([api.getCommissionTypes(), api.getCommissions({ employeeId: employeeId.value || undefined, month: month.value }), api.getBonuses({ employeeId: employeeId.value || undefined, month: month.value })]); return commissions.value })
  const loadPayroll = () => run(async () => { payroll.value = await api.getPayroll(month.value); return payroll.value })
  function clearError() { error.value = '' }
  return { month, employeeId, loading, saving, error, employees, activeEmployees, overview, weeklySchedules, overrides, monthSettings, attendance, leaveTypes, leaves, commissionTypes, commissions, bonuses, payroll, run, clearError, loadEmployees, loadOverview, loadSchedules, loadAttendance, loadLeaves, loadCompensation, loadPayroll }
})
