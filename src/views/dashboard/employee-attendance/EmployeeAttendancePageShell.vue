<template>
  <div class="attendance-page" :class="{ 'attendance-page--mobile': isMobileLayout }">
    <section class="attendance-head">
      <div><h2>{{ title }}</h2><p>{{ description }}</p></div>
      <div v-if="!isMobileLayout" class="attendance-filters">
        <el-date-picker v-if="showMonth" :model-value="displayedMonth" type="month" value-format="YYYY-MM" placeholder="选择月份" :clearable="false" @update:model-value="selectMonth" />
        <el-select v-if="showEmployee && employeeMode === 'single'" v-model="store.employeeId" clearable filterable placeholder="全部员工" @change="refreshForEmployeeChange">
          <el-option v-for="row in store.employees" :key="row.id" :label="`${row.employeeNumber} ${row.name}`" :value="row.id" />
        </el-select>
        <el-select v-else-if="showEmployee" v-model="store.leaveEmployeeIds" multiple collapse-tags collapse-tags-tooltip filterable clearable placeholder="全部员工" data-testid="leave-employee-filter" @change="refreshForEmployeeChange">
          <el-option v-for="row in store.employees" :key="row.id" :label="`${row.employeeNumber} ${row.name}`" :value="row.id" />
        </el-select>
        <el-button :loading="store.loading" @click="emit('refresh')">刷新</el-button>
        <slot name="actions" />
      </div>
      <el-button v-else class="attendance-mobile-refresh mobile-touch-target" :loading="store.loading" @click="emit('refresh')">刷新</el-button>
    </section>
    <div v-if="isMobileLayout" class="attendance-mobile-controls" data-testid="mobile-attendance-filter">
      <MobileFilterDrawer
        v-model="mobileFilterOpen"
        title="筛选考勤数据"
        :summary="mobileFilterSummary"
        fullscreen
        @apply="applyMobileFilters"
        @reset="resetMobileFilters"
      >
        <div class="attendance-mobile-filter-form">
          <label v-if="showMonth">
            <span>月份</span>
            <input v-model="draftMonth" class="mobile-touch-target" type="month" />
          </label>
          <label v-if="showEmployee && employeeMode === 'single'">
            <span>员工</span>
            <select v-model="draftEmployeeId" class="mobile-touch-target">
              <option value="">全部员工</option>
              <option v-for="row in store.employees" :key="row.id" :value="row.id">{{ row.employeeNumber }} {{ row.name }}</option>
            </select>
          </label>
          <fieldset v-else-if="showEmployee">
            <legend>员工</legend>
            <label v-for="row in store.employees" :key="row.id" class="mobile-touch-target attendance-mobile-filter-check">
              <input v-model="draftLeaveEmployeeIds" type="checkbox" :value="row.id" />
              <span>{{ row.employeeNumber }} {{ row.name }}</span>
            </label>
          </fieldset>
        </div>
      </MobileFilterDrawer>
      <div class="attendance-mobile-actions"><slot name="actions" /></div>
    </div>
    <el-alert v-if="store.error" class="attendance-error" type="error" :title="store.error" show-icon :closable="false">
      <template #default><el-button link type="primary" @click="emit('refresh')">重试</el-button></template>
    </el-alert>
    <div v-loading="store.loading" class="attendance-body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { ref, watch } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import { useTenantRealtimeStore } from '@/stores/tenantRealtime'
const props = withDefaults(defineProps<{ title: string; description: string; showMonth?: boolean; showEmployee?: boolean; dirty?: boolean; employeeMode?: 'single' | 'leave-multiple'; employeeChangeRefresh?: boolean; monthChangeRefresh?: boolean }>(), { showMonth: true, showEmployee: true, dirty: false, employeeMode: 'single', employeeChangeRefresh: true, monthChangeRefresh: true })
const emit = defineEmits<{ refresh: [] }>()
const store = useEmployeeAttendanceStore()
const tenantRealtime = useTenantRealtimeStore()
let unregisterRealtime: (() => void) | undefined
const { isMobileLayout } = useMobileLayout()
const mobileFilterOpen = ref(false)
const draftMonth = ref('')
const draftEmployeeId = ref('')
const draftLeaveEmployeeIds = ref<string[]>([])
const displayedMonth = computed(() => store.startDate || store.endDate ? '' : store.month)
const selectedEmployeeLabel = computed(() => {
  if (!props.showEmployee) return ''
  if (props.employeeMode === 'leave-multiple') {
    if (!store.leaveEmployeeIds.length) return '全部员工'
    return store.leaveEmployeeIds.map((id) => store.employees.find((row) => row.id === id)).filter(Boolean).map((row) => `${row!.employeeNumber} ${row!.name}`).join('、')
  }
  const employee = store.employees.find((row) => row.id === store.employeeId)
  return employee ? `${employee.employeeNumber} ${employee.name}` : '全部员工'
})
const mobileFilterSummary = computed(() => [props.showMonth ? store.month : '', selectedEmployeeLabel.value].filter(Boolean).join(' · '))
function selectMonth(value: unknown) { store.selectMonth(typeof value === 'string' ? value : ''); if (props.monthChangeRefresh) emit('refresh') }
function refreshForEmployeeChange() { if (props.employeeChangeRefresh) emit('refresh') }
onMounted(() => {
  if (!store.employees.length) void store.loadEmployees().catch(() => undefined)
  unregisterRealtime = tenantRealtime.registerModule('employee-attendance', {
    isDirty: () => props.dirty || store.saving,
    refresh: () => emit('refresh')
  })
})
onBeforeUnmount(() => unregisterRealtime?.())
function syncMobileDrafts() {
  draftMonth.value = store.month
  draftEmployeeId.value = store.employeeId
  draftLeaveEmployeeIds.value = [...store.leaveEmployeeIds]
}
function applyMobileFilters() {
  const monthChanged = props.showMonth && draftMonth.value !== store.month
  const employeeChanged = props.showEmployee && (props.employeeMode === 'single'
    ? draftEmployeeId.value !== store.employeeId
    : draftLeaveEmployeeIds.value.join('|') !== store.leaveEmployeeIds.join('|'))
  if (monthChanged) store.selectMonth(draftMonth.value)
  if (props.showEmployee && props.employeeMode === 'single') store.employeeId = draftEmployeeId.value
  if (props.showEmployee && props.employeeMode === 'leave-multiple') store.leaveEmployeeIds = [...draftLeaveEmployeeIds.value]
  mobileFilterOpen.value = false
  if ((monthChanged && props.monthChangeRefresh) || (employeeChanged && props.employeeChangeRefresh)) emit('refresh')
}
function resetMobileFilters() {
  draftMonth.value = store.month
  draftEmployeeId.value = ''
  draftLeaveEmployeeIds.value = []
  applyMobileFilters()
}
watch(mobileFilterOpen, (open) => { if (open) syncMobileDrafts() })
</script>

<style scoped>
.attendance-page{display:grid;min-width:0;gap:14px}.attendance-head,.attendance-body{background:#fff;border:1px solid var(--ui-line);border-radius:8px;padding:16px}.attendance-head{display:flex;align-items:center;justify-content:space-between;gap:18px}.attendance-head h2{margin:0 0 6px;font-size:18px}.attendance-head p{margin:0;color:var(--ui-text-muted);font-size:13px}.attendance-filters{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.attendance-filters :deep(.el-select),.attendance-filters :deep(.el-date-editor){width:170px}.attendance-body{min-width:0;min-height:180px}.attendance-error{margin:0}.attendance-body :deep(.toolbar){display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-bottom:12px}.attendance-body :deep(.money){font-variant-numeric:tabular-nums;font-weight:600}.attendance-body :deep(.muted){color:var(--ui-text-placeholder)}.attendance-body :deep(.form-grid){display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}.attendance-body :deep(.wide){grid-column:1/-1}.attendance-mobile-refresh{flex:0 0 auto}.attendance-mobile-controls{display:grid;min-width:0;gap:10px}.attendance-mobile-filter-form{display:grid;gap:16px}.attendance-mobile-filter-form>label{display:grid;gap:6px}.attendance-mobile-filter-form input[type="month"],.attendance-mobile-filter-form select{width:100%;padding:8px 10px;color:var(--ui-text);background:#fff;border:1px solid var(--ui-line);border-radius:8px}.attendance-mobile-filter-form fieldset{display:grid;gap:4px;margin:0;padding:0;border:0}.attendance-mobile-filter-check{display:flex;align-items:center;gap:10px}.attendance-mobile-actions{display:flex;flex-wrap:wrap;gap:8px}.attendance-mobile-actions:empty{display:none}@media(max-width:900px){.attendance-head{align-items:flex-start;flex-direction:column}.attendance-page--mobile .attendance-head{flex-direction:row}.attendance-head>div:first-child{min-width:0}.attendance-head p{line-height:1.55;overflow-wrap:anywhere}.attendance-body :deep(.form-grid){grid-template-columns:1fr}}@media(max-width:560px){.attendance-page--mobile .attendance-head,.attendance-page--mobile .attendance-body{padding:12px}.attendance-page--mobile .attendance-head h2{font-size:17px}}
</style>
