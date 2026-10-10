<template>
  <div class="attendance-admin-page">
    <section class="panel page-heading">
      <div>
        <h3>{{ currentNavigation.label }}</h3>
        <p>后台仅查看，所有数据请在前台维护。</p>
      </div>
      <el-tag type="info" effect="plain">只读数据</el-tag>
    </section>

    <section class="panel filter-panel">
      <AdminAttendanceFilters
        :model-value="filters"
        :accounts="accounts"
        :employees="employeeOptions"
        :status-options="statusOptions"
        :show-employee="filterVisibility.employee"
        :show-month="filterVisibility.month"
        :show-dates="filterVisibility.dates"
        @update:model-value="updateFilters"
        @search="loadSection"
        @reset="resetFilters"
      />
    </section>

    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon>
      <template #default><el-button link type="primary" @click="loadSection">重试</el-button></template>
    </el-alert>

    <section v-loading="loading" class="panel data-panel">
      <template v-if="section === 'schedules'">
        <div v-if="calendarView?.employee" class="calendar-identity" data-testid="admin-calendar-identity">
          <strong>{{ selectedAccountLabel }}</strong><span>{{ calendarView.employee.employeeNumber }} {{ calendarView.employee.name }}</span>
        </div>
        <AdminMonthlyAttendanceCalendar v-if="calendarView?.employee" :month="calendarView.month" :days="calendarView.days" />
        <el-empty v-else description="请选择员工后查看每日排班考勤状态" />
        <div class="overview-grid calendar-overview" data-testid="admin-attendance-overview-cards">
          <el-card v-for="card in calendarOverviewCards" :key="card.label" shadow="never"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></el-card>
        </div>
        <div class="calendar-issues" data-testid="admin-attendance-overview-issues">
          <h4>待处理问题</h4>
          <el-empty v-if="!calendarIssues.length" description="当前没有异常" />
          <el-alert v-for="issue in calendarIssues" v-else :key="issue" :title="issue" type="warning" :closable="false" show-icon />
        </div>
      </template>
      <template v-if="section === 'overview'">
        <div class="overview-grid">
          <el-card v-for="card in overviewCards" :key="card.label" shadow="never">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </el-card>
        </div>
      </template>
      <AdminAttendanceTable
        v-else-if="section !== 'schedules'"
        :section="section"
        :rows="tableRows"
        :columns="tableColumns"
        @reveal="openReveal"
      />
      <el-empty v-if="!loading && section !== 'overview' && section !== 'schedules' && !tableRows.length" description="暂无数据" />
    </section>

    <section v-if="section === 'employees'" class="panel audit-panel">
      <div class="section-title">
        <h3>员工考勤审计</h3>
        <el-button @click="loadAudit">刷新</el-button>
      </div>
      <p class="audit-hint">审计记录仅按上方选择的前台账号范围显示；员工和状态筛选不影响审计列表。</p>
      <el-table :data="auditRows" border>
        <el-table-column prop="accountName" label="前台账号" min-width="160" />
        <el-table-column prop="createdAt" label="操作时间" min-width="180" />
        <el-table-column prop="actorLabel" label="操作账号" min-width="140" />
        <el-table-column prop="actionLabel" label="操作类型" min-width="120" />
        <el-table-column prop="entityLabel" label="数据类型" min-width="130" />
        <el-table-column prop="entityId" label="记录 ID" min-width="180" />
        <el-table-column prop="reason" label="原因" min-width="220" />
      </el-table>
    </section>

    <el-dialog v-model="revealVisible" title="敏感信息二次验证" width="620px" :close-on-click-modal="false">
      <template v-if="!revealedEmployee">
        <p>请输入当前后台账号密码。验证成功后本次显示完整信息，并记录审计日志。</p>
        <el-form label-position="top">
          <el-form-item label="当前账号密码" required>
            <el-input v-model="revealPassword" type="password" show-password autocomplete="current-password" />
          </el-form-item>
        </el-form>
        <el-alert v-if="revealError" :title="revealError" type="error" :closable="false" />
      </template>
      <el-descriptions v-else :column="1" border>
        <el-descriptions-item label="员工">{{ revealedEmployee.employeeNumber }} {{ revealedEmployee.name }}</el-descriptions-item>
        <el-descriptions-item label="身份证号">{{ revealedEmployee.idCard || '-' }}</el-descriptions-item>
        <el-descriptions-item label="银行卡号">{{ revealedEmployee.bankCard || '-' }}</el-descriptions-item>
        <el-descriptions-item label="住址">{{ revealedEmployee.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="紧急联系人">{{ revealedEmployee.emergencyContact || '-' }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="revealVisible = false">关闭</el-button>
        <el-button
          v-if="!revealedEmployee"
          data-testid="confirm-employee-reveal"
          type="primary"
          :loading="revealing"
          @click="submitReveal"
        >验证并查看</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as api from '../api'
import AdminAttendanceFilters from '../components/employee-attendance/AdminAttendanceFilters.vue'
import AdminAttendanceTable from '../components/employee-attendance/AdminAttendanceTable.vue'
import AdminMonthlyAttendanceCalendar from '../components/employee-attendance/AdminMonthlyAttendanceCalendar.vue'
import { employeeAttendanceColumns } from '../config/employeeAttendanceColumns'
import {
  employeeAttendanceNavigation,
  resolveEmployeeAttendancePage,
  type EmployeeAttendanceAdminPage
} from '../config/employeeAttendanceNavigation'
import type {
  AdminAttendanceAuditRow,
  AdminAttendanceAuditDisplayRow,
  AdminBonusRecord,
  AdminCommissionRecord,
  AdminAttendanceEmployee,
  AdminAttendanceFrontendAccount,
  AdminLeaveRequest,
  AdminAttendanceOverview,
  AdminAttendancePayrollRun,
  AdminAttendanceRecord,
  AdminAttendanceSchedules,
  AdminScheduleAttendanceOverview,
  AdminAttendanceTableRow,
  AdminEmployeeAttendanceQuery,
  AdminRevealedAttendanceEmployee,
  FrontendOption
} from '../types'

const route = useRoute()
const section = computed<EmployeeAttendanceAdminPage>(() => {
  const fromMeta = route.meta.employeeAttendancePage as EmployeeAttendanceAdminPage | undefined
  return fromMeta || resolveEmployeeAttendancePage(route.path)
})
const currentNavigation = computed(() => employeeAttendanceNavigation.find((item) => item.page === section.value) || employeeAttendanceNavigation[0])
const accounts = ref<FrontendOption[]>([])
const employeeOptions = ref<AdminAttendanceEmployee[]>([])
const overview = ref<AdminAttendanceOverview | null>(null)
const calendarView = ref<AdminScheduleAttendanceOverview | null>(null)
const rows = ref<AdminAttendanceTableRow[]>([])
const auditRows = ref<AdminAttendanceAuditDisplayRow[]>([])
const loading = ref(false)
const error = ref('')
const revealVisible = ref(false)
const revealPassword = ref('')
const revealEmployeeId = ref('')
const revealedEmployee = ref<AdminRevealedAttendanceEmployee | null>(null)
const revealing = ref(false)
const revealError = ref('')
let calendarLoadSequence = 0
const defaultMonth = dayjs().format('YYYY-MM')
const filters = reactive<AdminEmployeeAttendanceQuery>({ frontendUserIds: [], month: defaultMonth })

const statusOptionMap: Partial<Record<EmployeeAttendanceAdminPage, Array<{ label: string; value: string }>>> = {
  employees: [{ label: '在职', value: 'ACTIVE' }, { label: '停用/离职', value: 'INACTIVE' }],
  leave: [{ label: '待审核', value: 'PENDING' }, { label: '已批准', value: 'APPROVED' }, { label: '已拒绝', value: 'REJECTED' }],
  payroll: [{ label: '草稿', value: 'DRAFT' }, { label: '已确认', value: 'CONFIRMED' }]
}
const statusOptions = computed(() => statusOptionMap[section.value] || [])
const filterVisibility = computed(() => ({
  employee: section.value !== 'overview',
  month: section.value !== 'employees',
  dates: ['records', 'leave', 'compensation'].includes(section.value)
}))

const tableColumns = computed(() => section.value === 'overview' ? [] : employeeAttendanceColumns[section.value])
const tableRows = computed(() => rows.value)
const overviewCards = computed(() => [
  { label: '在职员工', value: overview.value?.workforce ?? 0 },
  { label: '本月考勤记录', value: overview.value?.attendanceRecords ?? 0 },
  { label: '待审核请假', value: overview.value?.pendingLeave ?? 0 },
  { label: '本月工资批次', value: overview.value?.payrollRuns ?? 0 }
])
const calendarOverviewCards = computed(() => {
  const data = calendarView.value?.overview
  return [
    { label: '在职员工', value: data?.activeEmployees ?? 0 }, { label: '今日出勤', value: data?.todayPresent ?? 0 },
    { label: '今日请假', value: data?.todayOnLeave ?? 0 }, { label: '今日缺勤', value: data?.todayAbsent ?? 0 },
    { label: '本月加班总时长', value: `${data?.overtimeHours ?? 0} 小时` }, { label: '待审请假', value: data?.pendingLeaves ?? 0 },
    { label: '预计应发', value: `¥${(data?.projectedPayroll ?? 0).toFixed(2)}` }, { label: '异常数', value: data?.issueCount ?? 0 }
  ]
})
const calendarIssues = computed(() => calendarView.value?.overview.issues || [])
const selectedAccountLabel = computed(() => {
  const selected = employeeOptions.value.find((item) => item.id === calendarView.value?.employee?.id)
  const account = accounts.value.find((item) => item.id === selected?.frontendUserId)
  return account ? `${account.name}（${account.account}）` : selected?.frontendUserId || '-'
})

function query(): AdminEmployeeAttendanceQuery {
  const selected = filters.frontendUserIds.length ? filters.frontendUserIds : accounts.value.map((item) => item.id)
  const supportsEmployee = section.value !== 'overview'
  const supportsMonth = section.value !== 'employees'
  const supportsDates = ['records', 'leave', 'compensation'].includes(section.value)
  return {
    frontendUserIds: selected,
    employeeId: supportsEmployee ? filters.employeeId || undefined : undefined,
    month: supportsMonth ? filters.month || undefined : undefined,
    startDate: supportsDates ? filters.startDate || undefined : undefined,
    endDate: supportsDates ? filters.endDate || undefined : undefined,
    status: filters.status || undefined
  }
}

function employeeLabel(employeeId: string, embedded?: { employeeNumber?: string; name?: string }) {
  if (embedded) return `${embedded.employeeNumber || ''} ${embedded.name || ''}`.trim()
  const employee = employeeOptions.value.find((item) => item.id === employeeId)
  return employee ? `${employee.employeeNumber} ${employee.name}` : employeeId || '-'
}

function accountLabel(row: { frontendUserId: string; frontendUser?: AdminAttendanceFrontendAccount }) {
  const user = row.frontendUser
  const option = accounts.value.find((item) => item.id === row.frontendUserId)
  const name = user?.displayRemark || user?.username || option?.name || ''
  const account = user?.account || option?.account || ''
  if (name && account && name !== account) return `${name}（${account}）`
  return account || name || row.frontendUserId
}

function normalizeEmployee(row: AdminAttendanceEmployee) {
  return { ...row, accountName: accountLabel(row) }
}

function normalizeSchedule(data: AdminAttendanceSchedules): AdminAttendanceTableRow[] {
  return data.map((row) => ({
    ...row,
    accountName: accountLabel(row),
    employeeLabel: employeeLabel(row.employeeId, row.employee),
    workdayLabel: row.isWorkday ? '工作日' : '休息日',
    intervalsText: row.segments.length ? row.segments.map((segment) => `${segment.startTime}—${segment.endTime}`).join('；') : '-',
    restText: row.isWorkday ? `休息 ${row.breakMinutes} 分钟` : '-',
    scheduledHoursText: `${(row.scheduledMinutes / 60).toFixed(2)} 小时`
  }))
}

function normalizeCommon<T extends AdminAttendanceRecord | AdminLeaveRequest | AdminCommissionRecord | AdminBonusRecord>(row: T) {
  return { ...row, accountName: accountLabel(row), employeeLabel: employeeLabel(row.employeeId, row.employee) }
}

function normalizeAttendance(row: AdminAttendanceRecord): AdminAttendanceTableRow {
  const actualIntervals = row.actualSegments || []
  return {
    ...normalizeCommon(row),
    checkInText: formatPunchTime(actualIntervals[0]?.checkInAt || row.checkInAt),
    checkOutText: formatPunchTime(actualIntervals.at(-1)?.checkOutAt || row.checkOutAt),
    actualIntervalsText: actualIntervals.length
      ? actualIntervals.map((segment) => `${formatPunchTime(segment.checkInAt)}—${formatPunchTime(segment.checkOutAt)}`).join('；')
      : '未手工录入（按排班正常）'
  }
}

function formatPunchTime(value?: string | null) {
  if (!value) return '未录入'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : new Date(parsed.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

function normalizeLeave(row: AdminLeaveRequest): AdminAttendanceTableRow {
  const unitLabels: Record<string, string> = { FULL_DAY: '整天', HALF_DAY: '半天', HOUR: '小时' }
  return { ...normalizeCommon(row), leaveTypeLabel: row.leaveType?.name || row.leaveTypeId, unitLabel: unitLabels[row.unit] || row.unit }
}

function normalizePayroll(runs: AdminAttendancePayrollRun[]): AdminAttendanceTableRow[] {
  return runs.flatMap((run) => (run.items || []).map((item) => {
    const result = item.calculationSnapshot?.result || item
    const input = item.calculationSnapshot?.input || item
    return {
      id: item.id,
      month: run.month,
      accountName: accountLabel(run),
      employeeLabel: `${item.employeeNumberSnapshot || ''} ${item.employeeNameSnapshot || ''}`.trim() || employeeLabel(item.employeeId),
      status: run.status,
      baseSalary: input.baseSalary ?? item.baseSalary,
      overtimePay: result.overtimePay ?? item.overtimePay,
      commissionAmount: result.commissionAmount ?? item.commissionAmount,
      bonusAmount: result.bonusAmount ?? item.bonusAmount,
      deductionAmount: Number(result.leaveDeduction || 0) + Number(result.absenceDeduction || 0),
      payableAmount: result.payableAmount ?? item.payableAmount,
      issuesText: (item.issues || result.issues || []).join('；')
    }
  }))
}

async function ensureEmployees() {
  const employeeRows = await api.getAdminAttendanceEmployees({ frontendUserIds: query().frontendUserIds })
  employeeOptions.value = employeeRows
  if (filters.employeeId && !employeeRows.some((item) => item.id === filters.employeeId)) filters.employeeId = undefined
  return employeeRows
}

async function loadSection() {
  const requestId = section.value === 'schedules' ? ++calendarLoadSequence : 0
  loading.value = true
  error.value = ''
  try {
    if (section.value === 'schedules') {
      const requestQuery = query()
      const employeeRows = await api.getAdminAttendanceEmployees({ frontendUserIds: requestQuery.frontendUserIds })
      if (requestId !== calendarLoadSequence || section.value !== 'schedules') return
      const validEmployeeId = requestQuery.employeeId && employeeRows.some((item) => item.id === requestQuery.employeeId) ? requestQuery.employeeId : undefined
      const result = await api.getAdminScheduleAttendanceOverview({ ...requestQuery, employeeId: validEmployeeId })
      if (requestId !== calendarLoadSequence || section.value !== 'schedules') return
      employeeOptions.value = employeeRows
      if (!validEmployeeId) filters.employeeId = undefined
      calendarView.value = result
      return
    }
    if (section.value !== 'employees') await ensureEmployees()
    const requestQuery = query()
    if (section.value === 'overview') overview.value = await api.getAdminAttendanceOverview(requestQuery)
    else if (section.value === 'employees') {
      employeeOptions.value = await api.getAdminAttendanceEmployees(requestQuery)
      rows.value = employeeOptions.value.map(normalizeEmployee)
      await loadAudit()
    } else if (section.value === 'records') rows.value = (await api.getAdminAttendanceRecords(requestQuery)).map(normalizeAttendance)
    else if (section.value === 'leave') rows.value = (await api.getAdminAttendanceLeaves(requestQuery)).map(normalizeLeave)
    else if (section.value === 'compensation') {
      const [commissions, bonuses] = await Promise.all([
        api.getAdminAttendanceCommissions(requestQuery), api.getAdminAttendanceBonuses(requestQuery)
      ])
      rows.value = [
        ...commissions.map((row) => ({ ...normalizeCommon(row), categoryLabel: '提成', typeLabel: row.commissionType?.name || row.commissionTypeId, unitPrice: row.unitPriceSnapshot, reason: row.remark || '-' })),
        ...bonuses.map((row) => ({ ...normalizeCommon(row), categoryLabel: '奖金', typeLabel: '奖金', quantity: '-', unitPrice: '-', reason: row.reason }))
      ]
    } else rows.value = normalizePayroll(await api.getAdminAttendancePayroll(requestQuery))
  } catch (caught) {
    if (!requestId || requestId === calendarLoadSequence) error.value = caught instanceof Error ? caught.message : '员工考勤数据加载失败'
  } finally {
    if (!requestId || requestId === calendarLoadSequence) loading.value = false
  }
}

async function loadAudit() {
  try {
    const audit = await api.getAdminAttendanceAudit({ frontendUserIds: query().frontendUserIds })
    const actionLabels: Record<string, string> = { CREATE: '新建', UPDATE: '修改', DELETE: '删除', APPROVE: '批准', REJECT: '拒绝', CONFIRM: '确认工资', REOPEN: '撤销确认', REVEAL: '查看完整信息' }
    const entityLabels: Record<string, string> = { Employee: '员工档案', EmployeeAttendanceRecord: '考勤记录', EmployeeLeaveRequest: '请假记录', EmployeeCommissionRecord: '提成记录', EmployeeBonus: '奖金记录', EmployeePayrollRun: '工资批次' }
    auditRows.value = audit.map((row: AdminAttendanceAuditRow) => ({
      id: row.id,
      accountName: accountLabel(row),
      createdAt: dayjs(row.createdAt).isValid() ? dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss') : row.createdAt,
      actorLabel: row.actorUser?.username || row.actorUser?.account || '-',
      actionLabel: actionLabels[row.action] || row.action,
      entityLabel: entityLabels[row.entityType] || row.entityType,
      entityId: row.entityId,
      reason: row.reason || '-'
    }))
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '审计数据加载失败'
  }
}

function resetFilters() {
  Object.assign(filters, { frontendUserIds: accounts.value.map((item) => item.id), employeeId: undefined, month: defaultMonth, startDate: undefined, endDate: undefined, status: undefined })
  void loadSection()
}

function updateFilters(value: AdminEmployeeAttendanceQuery) {
  Object.assign(filters, value)
}

function openReveal(employee: AdminAttendanceTableRow) {
  revealEmployeeId.value = employee.id
  revealPassword.value = ''
  revealError.value = ''
  revealedEmployee.value = null
  revealVisible.value = true
}

async function submitReveal() {
  if (!revealPassword.value) {
    revealError.value = '请输入当前后台账号密码'
    return
  }
  revealing.value = true
  revealError.value = ''
  try {
    revealedEmployee.value = await api.revealAdminAttendanceEmployee(
      revealEmployeeId.value,
      revealPassword.value,
      query().frontendUserIds
    )
    revealPassword.value = ''
    await loadAudit()
  } catch (caught) {
    revealError.value = caught instanceof Error ? caught.message : '密码验证失败'
  } finally {
    revealing.value = false
  }
}

watch(() => route.path, () => {
  calendarLoadSequence += 1
  rows.value = []
  error.value = ''
  filters.status = undefined
  void loadSection()
})

onMounted(async () => {
  try {
    accounts.value = await api.getFrontendOptions()
    filters.frontendUserIds = accounts.value.map((item) => item.id)
    await loadSection()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '可查看账号加载失败'
  }
})
</script>

<style scoped>
.attendance-admin-page { display: grid; gap: 14px; }
.panel { background: #fff; border: 1px solid #dce5f0; border-radius: 8px; padding: 16px; }
.page-heading, .section-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.page-heading h3, .section-title h3 { margin: 0; color: #1f2d3d; }
.page-heading p { margin: 8px 0 0; color: #718096; }
.overview-grid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 14px; }
.overview-grid :deep(.el-card__body) { display: grid; gap: 10px; }
.overview-grid span { color: #718096; }
.overview-grid strong { color: #172b4d; font-size: 28px; }
.audit-panel { display: grid; gap: 14px; }
.audit-hint { margin: -4px 0 0; color: #718096; }
@media (max-width: 1000px) { .overview-grid { grid-template-columns: repeat(2, minmax(160px, 1fr)); } }
@media (max-width: 700px) { .overview-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
