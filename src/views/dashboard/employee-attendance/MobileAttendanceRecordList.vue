<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { AttendanceRecord, Employee } from '@/types/employeeAttendance'

export type MobileAttendanceFilterMode = 'month' | 'range'
export type MobileAttendanceStatus = '' | 'NORMAL' | 'EXCEPTION' | 'LOCKED'
export interface MobileAttendanceFilters {
  mode: MobileAttendanceFilterMode
  month: string
  startDate: string
  endDate: string
  employeeId: string
  status: MobileAttendanceStatus
}

const props = withDefaults(defineProps<{
  records: AttendanceRecord[]
  employees: Employee[]
  filters: MobileAttendanceFilters
  busy?: boolean
}>(), { busy: false })

const emit = defineEmits<{
  create: []
  edit: [record: AttendanceRecord]
  remove: [record: AttendanceRecord]
  applyFilters: [filters: MobileAttendanceFilters]
}>()

const draft = reactive<MobileAttendanceFilters>({ ...props.filters })
watch(() => props.filters, (filters) => Object.assign(draft, filters), { deep: true })

const filteredRecords = computed(() => props.records.filter((record) => !draft.status || statusCode(record) === draft.status))
const summary = computed(() => {
  const date = draft.mode === 'month' ? draft.month : `${draft.startDate || '不限'} 至 ${draft.endDate || '不限'}`
  const employee = props.employees.find((row) => row.id === draft.employeeId)?.name || '全部员工'
  const status = draft.status === 'NORMAL' ? '正常' : draft.status === 'EXCEPTION' ? '异常' : draft.status === 'LOCKED' ? '工资已锁定' : '全部状态'
  return `${draft.mode === 'month' ? '月份' : '日期范围'} ${date} · ${employee} · ${status}`
})

function nameOf(employeeId: string) { return props.employees.find((row) => row.id === employeeId)?.name || '未知员工' }
function statusCode(record: AttendanceRecord): Exclude<MobileAttendanceStatus, ''> {
  if (record.lockedAt) return 'LOCKED'
  return record.lateMinutes > 0 || record.earlyLeaveMinutes > 0 || record.absenceMinutes > 0 || Number(record.explicitAbsenceMinutes || 0) > 0 ? 'EXCEPTION' : 'NORMAL'
}
function statusName(record: AttendanceRecord) {
  const status = statusCode(record)
  return status === 'LOCKED' ? '工资已锁定' : status === 'EXCEPTION' ? '异常' : '正常'
}
function clock(value?: string | null) {
  const match = String(value || '').match(/T(\d{2}:\d{2})/)
  return match?.[1] || '未录入'
}
function actualText(record: AttendanceRecord) {
  const segments = record.actualSegments || []
  return segments.length ? segments.map((segment) => `${clock(segment.checkInAt)}—${clock(segment.checkOutAt)}`).join('；') : '未手工录入（默认正常）'
}
function exceptionText(record: AttendanceRecord) {
  const parts = [
    record.lateMinutes > 0 ? `迟到 ${record.lateMinutes} 分钟` : '',
    record.earlyLeaveMinutes > 0 ? `早退 ${record.earlyLeaveMinutes} 分钟` : '',
    record.absenceMinutes > 0 ? `缺勤 ${record.absenceMinutes} 分钟` : '',
    Number(record.overtimeMinutes || 0) > 0 ? `加班 ${record.overtimeMinutes} 分钟` : ''
  ].filter(Boolean)
  return parts.join('，') || '无异常'
}
function switchMode(mode: MobileAttendanceFilterMode) {
  draft.mode = mode
  if (mode === 'month') { draft.startDate = ''; draft.endDate = '' }
}
function applyFilters() { emit('applyFilters', { ...draft }) }
</script>

<template>
  <section class="mobile-attendance-record-list" aria-label="考勤记录列表">
    <section class="mobile-attendance-record-list__filters" data-testid="mobile-attendance-record-filter" aria-label="筛选考勤记录">
      <p data-testid="mobile-attendance-filter-summary">{{ summary }}</p>
      <div class="mobile-attendance-record-list__mode" role="group" aria-label="日期筛选方式">
        <button data-testid="mobile-attendance-mode-month" class="mobile-touch-target" type="button" :aria-pressed="draft.mode === 'month'" @click="switchMode('month')">按月份</button>
        <button data-testid="mobile-attendance-mode-range" class="mobile-touch-target" type="button" :aria-pressed="draft.mode === 'range'" @click="switchMode('range')">按日期范围</button>
      </div>
      <label v-if="draft.mode === 'month'">
        <span>月份</span>
        <input v-model="draft.month" data-testid="mobile-attendance-month" class="mobile-touch-target" type="month" />
      </label>
      <div v-else class="mobile-attendance-record-list__date-range">
        <label><span>开始日期</span><input v-model="draft.startDate" data-testid="mobile-attendance-start-date" class="mobile-touch-target" type="date" /></label>
        <label><span>结束日期</span><input v-model="draft.endDate" data-testid="mobile-attendance-end-date" class="mobile-touch-target" type="date" /></label>
      </div>
      <div class="mobile-attendance-record-list__selects">
        <label>
          <span>员工</span>
          <select v-model="draft.employeeId" data-testid="mobile-attendance-employee" class="mobile-touch-target">
            <option value="">全部员工</option>
            <option v-for="employee in employees" :key="employee.id" :value="employee.id">{{ employee.employeeNumber }} {{ employee.name }}</option>
          </select>
        </label>
        <label>
          <span>状态</span>
          <select v-model="draft.status" data-testid="mobile-attendance-status" class="mobile-touch-target">
            <option value="">全部状态</option><option value="NORMAL">正常</option><option value="EXCEPTION">异常</option><option value="LOCKED">工资已锁定</option>
          </select>
        </label>
      </div>
      <button data-testid="mobile-attendance-apply-filter" class="mobile-touch-target mobile-attendance-record-list__apply" type="button" :disabled="busy" @click="applyFilters">应用筛选</button>
    </section>

    <button data-testid="mobile-create-attendance" class="mobile-touch-target mobile-attendance-record-list__create" type="button" :disabled="busy" @click="emit('create')">手工新增实际出勤</button>
    <p v-if="!filteredRecords.length" class="mobile-attendance-record-list__empty" role="status">暂无手工考勤记录</p>
    <div v-else class="mobile-attendance-record-list__cards">
      <div v-for="record in filteredRecords" :key="record.id" data-testid="mobile-attendance-record-card">
        <article :data-testid="`mobile-attendance-record-card-${record.id}`" class="mobile-attendance-record-card">
          <header>
            <div><strong>{{ nameOf(record.employeeId) }}</strong><span>{{ record.date }}</span></div>
            <span :class="['mobile-attendance-record-card__status', `is-${statusCode(record).toLowerCase()}`]">{{ statusName(record) }}</span>
          </header>
          <dl>
            <div><dt>排班</dt><dd>{{ record.isScheduledWorkday ? `${record.scheduledMinutes / 60} 小时` : '休息' }}</dd></div>
            <div class="wide"><dt>实际时段</dt><dd>{{ actualText(record) }}</dd></div>
            <div class="wide"><dt>异常</dt><dd>{{ exceptionText(record) }}</dd></div>
          </dl>
          <p v-if="record.remark" class="mobile-attendance-record-card__remark">备注：{{ record.remark }}</p>
          <footer>
            <button :data-testid="`mobile-edit-attendance-${record.id}`" class="mobile-touch-target" type="button" :disabled="busy || !!record.lockedAt" @click="emit('edit', record)">编辑</button>
            <button :data-testid="`mobile-remove-attendance-${record.id}`" class="mobile-touch-target mobile-attendance-record-card__danger" type="button" :disabled="busy || !!record.lockedAt" @click="emit('remove', record)">删除</button>
          </footer>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mobile-attendance-record-list{display:grid;min-width:0;gap:12px;padding-bottom:max(12px,env(safe-area-inset-bottom))}.mobile-attendance-record-list__filters{display:grid;gap:10px;padding:12px;background:#f8fafc;border:1px solid #d8e1eb;border-radius:10px}.mobile-attendance-record-list__filters p{margin:0;color:#475569;font-size:13px;overflow-wrap:anywhere}.mobile-attendance-record-list__mode,.mobile-attendance-record-list__selects,.mobile-attendance-record-list__date-range{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-attendance-record-list__mode button{color:#334155;background:#fff;border:1px solid #aebdcd;border-radius:8px}.mobile-attendance-record-list__mode button[aria-pressed='true']{color:#1d4ed8;background:#eff6ff;border-color:#60a5fa}.mobile-attendance-record-list__filters label{display:grid;min-width:0;gap:5px;color:#475569;font-size:13px}.mobile-attendance-record-list__filters input,.mobile-attendance-record-list__filters select{box-sizing:border-box;width:100%;padding:8px 9px;color:#0f172a;background:#fff;border:1px solid #aebdcd;border-radius:8px;font:inherit}.mobile-attendance-record-list__apply,.mobile-attendance-record-list__create{padding:8px 12px;color:#fff;background:#2563eb;border:1px solid #1d4ed8;border-radius:8px}.mobile-attendance-record-list__cards{display:grid;gap:10px}.mobile-attendance-record-card{min-width:0;padding:14px;background:#fff;border:1px solid #d8e1eb;border-radius:12px}.mobile-attendance-record-card header{display:flex;min-width:0;align-items:flex-start;gap:10px}.mobile-attendance-record-card header>div{display:grid;min-width:0;gap:3px}.mobile-attendance-record-card header strong,.mobile-attendance-record-card header span{overflow-wrap:anywhere}.mobile-attendance-record-card header>div span{color:#64748b;font-size:13px}.mobile-attendance-record-card__status{margin-left:auto;padding:4px 8px;color:#166534;background:#dcfce7;border-radius:999px;font-size:12px}.mobile-attendance-record-card__status.is-exception{color:#b45309;background:#fef3c7}.mobile-attendance-record-card__status.is-locked{color:#475569;background:#e2e8f0}.mobile-attendance-record-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.mobile-attendance-record-card dl .wide{grid-column:1/-1}.mobile-attendance-record-card dt{color:#64748b;font-size:12px}.mobile-attendance-record-card dd{margin:3px 0 0;line-height:1.5;overflow-wrap:anywhere}.mobile-attendance-record-card__remark{margin:0 0 12px;padding:8px;color:#475569;background:#f8fafc;border-radius:7px;overflow-wrap:anywhere}.mobile-attendance-record-card footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding-top:10px;border-top:1px solid #edf2f7}.mobile-attendance-record-card footer button{color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px}.mobile-attendance-record-card footer .mobile-attendance-record-card__danger{color:#b91c1c;background:#fef2f2;border-color:#fecaca}.mobile-attendance-record-card footer button:disabled{color:#94a3b8;background:#f1f5f9;border-color:#e2e8f0}.mobile-attendance-record-list__empty{margin:12px 0;color:#64748b;text-align:center}@media(max-width:390px){.mobile-attendance-record-list__selects,.mobile-attendance-record-list__date-range{grid-template-columns:1fr}.mobile-attendance-record-card dl{grid-template-columns:1fr}.mobile-attendance-record-card dl .wide{grid-column:auto}}
</style>
