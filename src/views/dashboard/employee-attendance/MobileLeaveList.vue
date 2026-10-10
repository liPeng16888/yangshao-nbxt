<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import type { Employee, LeaveRequest, LeaveStatus, LeaveType } from '@/types/employeeAttendance'

export type MobileLeaveTab = 'records' | 'types'
export interface MobileLeaveFilters {
  employeeIds: string[]
  status: '' | LeaveStatus
  startDate: string
  endDate: string
}

const props = withDefaults(defineProps<{
  tab: MobileLeaveTab
  rows: LeaveRequest[]
  types: LeaveType[]
  employees: Employee[]
  filters: MobileLeaveFilters
  month: string
  busy?: boolean
  pendingLeaveIds?: string[]
  pendingTypeIds?: string[]
}>(), { busy: false, pendingLeaveIds: () => [], pendingTypeIds: () => [] })

const emit = defineEmits<{
  changeTab: [tab: MobileLeaveTab]
  applyFilters: [filters: MobileLeaveFilters]
  create: []
  edit: [row: LeaveRequest]
  approve: [row: LeaveRequest]
  reject: [row: LeaveRequest]
  remove: [row: LeaveRequest]
  createType: []
  editType: [row: LeaveType]
  removeType: [row: LeaveType]
}>()

const filterOpen = ref(false)
const draft = reactive<MobileLeaveFilters>({ employeeIds: [], status: '', startDate: '', endDate: '' })
const statusLabel: Record<LeaveStatus, string> = { PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回' }
const unitLabel = { FULL_DAY: '整天', HALF_DAY: '半天', HOUR: '小时' } as const
const summary = computed(() => {
  const employeeNames = props.filters.employeeIds.map((id) => props.employees.find((row) => row.id === id)?.name).filter(Boolean)
  const employees = employeeNames.length ? employeeNames.join('、') : '全部员工'
  const status = props.filters.status ? statusLabel[props.filters.status] : '全部状态'
  const date = props.filters.startDate || props.filters.endDate
    ? `${props.filters.startDate || '不限'} 至 ${props.filters.endDate || '不限'}`
    : `本月 ${props.month}`
  return `${date} · ${employees} · ${status}`
})

watch(filterOpen, (open) => { if (open) Object.assign(draft, props.filters, { employeeIds: [...props.filters.employeeIds] }) })

function employeeName(id: string) {
  const employee = props.employees.find((row) => row.id === id)
  return employee ? `${employee.employeeNumber} ${employee.name}` : '未知员工'
}
function typeName(id: string) { return props.types.find((row) => row.id === id)?.name || '未知类型' }
function unitName(row: LeaveRequest) { return row.unit === 'HOUR' ? `${unitLabel[row.unit]} ${row.hours ?? 0}小时` : unitLabel[row.unit] }
function leavePending(row: LeaveRequest) { return props.pendingLeaveIds.includes(row.id) }
function leaveDisabled(row: LeaveRequest) { return props.busy || leavePending(row) || row.status !== 'PENDING' || Boolean(row.lockedAt) }
function applyFilters() { emit('applyFilters', { ...draft, employeeIds: [...draft.employeeIds] }); filterOpen.value = false }
function resetFilters() {
  const reset: MobileLeaveFilters = { employeeIds: [], status: '', startDate: '', endDate: '' }
  Object.assign(draft, reset, { employeeIds: [] })
  emit('applyFilters', reset)
  filterOpen.value = false
}
</script>

<template>
  <section class="mobile-leave-list" aria-label="请假管理">
    <div class="mobile-leave-list__tabs" role="tablist" aria-label="请假管理分类">
      <button data-testid="mobile-leave-tab-records" class="mobile-touch-target" type="button" role="tab" :aria-selected="tab === 'records'" @click="emit('changeTab', 'records')">请假记录</button>
      <button data-testid="mobile-leave-tab-types" class="mobile-touch-target" type="button" role="tab" :aria-selected="tab === 'types'" @click="emit('changeTab', 'types')">请假类型</button>
    </div>

    <section v-if="tab === 'records'" role="tabpanel" aria-label="请假记录">
      <div data-testid="mobile-leave-filter">
        <MobileFilterDrawer v-model="filterOpen" title="筛选请假记录" :summary="summary" fullscreen @apply="applyFilters" @reset="resetFilters">
          <div class="mobile-leave-list__filters">
            <fieldset>
              <legend>员工</legend>
              <label v-for="employee in employees" :key="employee.id" class="mobile-touch-target mobile-leave-list__check">
                <input v-model="draft.employeeIds" :data-testid="`mobile-leave-employee-${employee.id}`" type="checkbox" :value="employee.id" />
                <span>{{ employee.employeeNumber }} {{ employee.name }}</span>
              </label>
            </fieldset>
            <label><span>审批状态</span><select v-model="draft.status" data-testid="mobile-leave-status" class="mobile-touch-target"><option value="">全部状态</option><option value="PENDING">待审批</option><option value="APPROVED">已批准</option><option value="REJECTED">已驳回</option></select></label>
            <div class="mobile-leave-list__dates">
              <label><span>开始日期</span><input v-model="draft.startDate" data-testid="mobile-leave-start-date" class="mobile-touch-target" type="date" /></label>
              <label><span>结束日期</span><input v-model="draft.endDate" data-testid="mobile-leave-end-date" class="mobile-touch-target" type="date" /></label>
            </div>
          </div>
        </MobileFilterDrawer>
      </div>
      <button data-testid="mobile-create-leave" class="mobile-touch-target mobile-leave-list__primary" type="button" :disabled="busy" @click="emit('create')">新增请假</button>
      <p v-if="!rows.length" class="mobile-leave-list__empty" role="status">暂无请假记录</p>
      <div v-else class="mobile-leave-list__cards">
        <div v-for="row in rows" :key="row.id" data-testid="mobile-leave-card">
          <article :data-testid="`mobile-leave-card-${row.id}`" class="mobile-leave-card">
            <header><div><strong>{{ employeeName(row.employeeId) }}</strong><span>{{ typeName(row.leaveTypeId) }}</span></div><span :class="['mobile-leave-card__status', `is-${row.status.toLowerCase()}`]">{{ statusLabel[row.status] }}</span></header>
            <dl>
              <div class="wide"><dt>请假时间</dt><dd>{{ row.startDate }} 至 {{ row.endDate }}</dd></div>
              <div><dt>请假单位</dt><dd>{{ unitName(row) }}</dd></div>
              <div><dt>计入天数</dt><dd>{{ row.countedDays }} 天</dd></div>
              <div class="wide"><dt>请假原因</dt><dd>{{ row.reason || '-' }}</dd></div>
              <div v-if="row.reviewRemark" class="wide"><dt>审批备注</dt><dd>{{ row.reviewRemark }}</dd></div>
            </dl>
            <p v-if="row.lockedAt" class="mobile-leave-card__lock">工资已锁定</p><p v-else-if="row.status !== 'PENDING'" class="mobile-leave-card__lock">已处理</p>
            <footer>
              <button :data-testid="`mobile-edit-leave-${row.id}`" class="mobile-touch-target" type="button" :disabled="leaveDisabled(row)" @click="emit('edit', row)">编辑</button>
              <button :data-testid="`mobile-approve-leave-${row.id}`" class="mobile-touch-target is-success" type="button" :disabled="leaveDisabled(row)" @click="emit('approve', row)">批准</button>
              <button :data-testid="`mobile-reject-leave-${row.id}`" class="mobile-touch-target is-danger" type="button" :disabled="leaveDisabled(row)" @click="emit('reject', row)">驳回</button>
              <button :data-testid="`mobile-remove-leave-${row.id}`" class="mobile-touch-target is-danger" type="button" :disabled="leaveDisabled(row)" @click="emit('remove', row)">删除</button>
            </footer>
          </article>
        </div>
      </div>
    </section>

    <section v-else role="tabpanel" aria-label="请假类型">
      <button data-testid="mobile-create-leave-type" class="mobile-touch-target mobile-leave-list__primary" type="button" :disabled="busy" @click="emit('createType')">新增请假类型</button>
      <p v-if="!types.length" class="mobile-leave-list__empty" role="status">暂无请假类型</p>
      <div v-else class="mobile-leave-list__cards">
        <div v-for="row in types" :key="row.id" data-testid="mobile-leave-type-card">
          <article :data-testid="`mobile-leave-type-card-${row.id}`" class="mobile-leave-type-card">
            <header><strong>{{ row.name }}</strong><span :class="{ 'is-inactive': !row.active }">{{ row.active ? '启用' : '停用' }}</span></header>
            <p>{{ row.countsTowardRestQuota ? '占用月休额度' : '不占用月休额度' }}</p>
            <p v-if="row.referenced" class="mobile-leave-type-card__referenced">已使用，仅可停用</p>
            <footer>
              <button :data-testid="`mobile-edit-leave-type-${row.id}`" class="mobile-touch-target" type="button" :disabled="busy || pendingTypeIds.includes(row.id) || !!row.referenced" @click="emit('editType', row)">编辑</button>
              <button :data-testid="`mobile-remove-leave-type-${row.id}`" class="mobile-touch-target is-danger" type="button" :disabled="busy || pendingTypeIds.includes(row.id)" @click="emit('removeType', row)">删除/停用</button>
            </footer>
          </article>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.mobile-leave-list{display:grid;min-width:0;gap:12px;padding-bottom:max(12px,env(safe-area-inset-bottom))}.mobile-leave-list__tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-leave-list__tabs button{color:var(--ui-text-secondary);background:var(--ui-surface-subtle);border:1px solid var(--ui-line);border-radius:10px}.mobile-leave-list__tabs button[aria-selected='true']{color:var(--ui-accent-hover);background:var(--ui-accent-soft);border-color:var(--ui-accent);font-weight:700}.mobile-leave-list>section{display:grid;min-width:0;gap:12px}.mobile-leave-list__filters{display:grid;gap:14px}.mobile-leave-list__filters fieldset{display:grid;gap:4px;margin:0;padding:0;border:0}.mobile-leave-list__check{display:flex;align-items:center;gap:10px}.mobile-leave-list__filters>label,.mobile-leave-list__dates label{display:grid;min-width:0;gap:5px;color:var(--ui-text-secondary);font-size:13px}.mobile-leave-list__filters select,.mobile-leave-list__filters input[type='date']{box-sizing:border-box;width:100%;padding:8px 9px;color:var(--ui-text);background:#fff;border:1px solid var(--ui-line);border-radius:8px;font:inherit}.mobile-leave-list__dates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mobile-leave-list__primary{width:100%;padding:8px 12px;color:#fff;background:var(--ui-accent);border:1px solid var(--ui-accent-hover);border-radius:9px}.mobile-leave-list__cards{display:grid;gap:10px}.mobile-leave-card,.mobile-leave-type-card{min-width:0;padding:14px;background:#fff;border:1px solid var(--ui-line);border-radius:12px}.mobile-leave-card header,.mobile-leave-type-card header{display:flex;min-width:0;align-items:flex-start;gap:10px}.mobile-leave-card header>div{display:grid;min-width:0;gap:3px}.mobile-leave-card header strong,.mobile-leave-card header span,.mobile-leave-type-card header strong{overflow-wrap:anywhere}.mobile-leave-card header>div span{color:var(--ui-text-muted);font-size:13px}.mobile-leave-card__status,.mobile-leave-type-card header>span{margin-left:auto;padding:4px 8px;color:var(--ui-success);background:var(--ui-success-soft);border-radius:999px;font-size:12px;white-space:nowrap}.mobile-leave-card__status.is-pending{color:var(--ui-warning);background:#fef3c7}.mobile-leave-card__status.is-rejected{color:var(--ui-danger);background:var(--ui-danger-soft)}.mobile-leave-type-card header>span.is-inactive{color:var(--ui-text-secondary);background:var(--ui-line-soft)}.mobile-leave-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.mobile-leave-card dl .wide{grid-column:1/-1}.mobile-leave-card dt{color:var(--ui-text-muted);font-size:12px}.mobile-leave-card dd{margin:3px 0 0;line-height:1.5;overflow-wrap:anywhere}.mobile-leave-card__lock,.mobile-leave-type-card__referenced{margin:0 0 10px;padding:8px;color:var(--ui-warning);background:var(--ui-warning-soft);border-radius:7px;font-size:13px;overflow-wrap:anywhere}.mobile-leave-type-card>p{margin:12px 0;color:var(--ui-text-secondary);overflow-wrap:anywhere}.mobile-leave-card footer,.mobile-leave-type-card footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding-top:10px;border-top:1px solid #edf2f7}.mobile-leave-card footer button,.mobile-leave-type-card footer button{min-width:0;color:var(--ui-accent-hover);background:var(--ui-accent-soft);border:1px solid var(--ui-accent-line);border-radius:8px;overflow-wrap:anywhere}.mobile-leave-card footer button.is-success{color:var(--ui-success);background:var(--ui-success-soft);border-color:var(--ui-success-line)}.mobile-leave-card footer button.is-danger,.mobile-leave-type-card footer button.is-danger{color:var(--ui-danger);background:var(--ui-danger-soft);border-color:var(--ui-danger-line)}.mobile-leave-card footer button:disabled,.mobile-leave-type-card footer button:disabled{color:var(--ui-text-placeholder);background:var(--ui-surface-subtle);border-color:var(--ui-line-soft)}.mobile-leave-list__empty{margin:12px 0;color:var(--ui-text-muted);text-align:center}@media(max-width:380px){.mobile-leave-list__dates,.mobile-leave-card dl{grid-template-columns:1fr}.mobile-leave-card dl .wide{grid-column:auto}}
</style>
