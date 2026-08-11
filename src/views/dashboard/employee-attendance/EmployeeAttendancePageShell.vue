<template>
  <div class="attendance-page">
    <section class="attendance-head">
      <div><h2>{{ title }}</h2><p>{{ description }}</p></div>
      <div class="attendance-filters">
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
    </section>
    <el-alert v-if="store.error" class="attendance-error" type="error" :title="store.error" show-icon :closable="false">
      <template #default><el-button link type="primary" @click="emit('refresh')">重试</el-button></template>
    </el-alert>
    <div v-loading="store.loading" class="attendance-body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
const props = withDefaults(defineProps<{ title: string; description: string; showMonth?: boolean; showEmployee?: boolean; employeeMode?: 'single' | 'leave-multiple'; employeeChangeRefresh?: boolean; monthChangeRefresh?: boolean }>(), { showMonth: true, showEmployee: true, employeeMode: 'single', employeeChangeRefresh: true, monthChangeRefresh: true })
const emit = defineEmits<{ refresh: [] }>()
const store = useEmployeeAttendanceStore()
const displayedMonth = computed(() => store.startDate || store.endDate ? '' : store.month)
function selectMonth(value: unknown) { store.selectMonth(typeof value === 'string' ? value : ''); if (props.monthChangeRefresh) emit('refresh') }
function refreshForEmployeeChange() { if (props.employeeChangeRefresh) emit('refresh') }
onMounted(() => { if (!store.employees.length) void store.loadEmployees().catch(() => undefined) })
</script>

<style scoped>
.attendance-page{display:grid;gap:14px}.attendance-head,.attendance-body{background:#fff;border:1px solid #dbe5f0;border-radius:8px;padding:16px}.attendance-head{display:flex;align-items:center;justify-content:space-between;gap:18px}.attendance-head h2{margin:0 0 6px;font-size:18px}.attendance-head p{margin:0;color:#64748b;font-size:13px}.attendance-filters{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.attendance-filters :deep(.el-select),.attendance-filters :deep(.el-date-editor){width:170px}.attendance-body{min-height:180px}.attendance-error{margin:0}.attendance-body :deep(.toolbar){display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-bottom:12px}.attendance-body :deep(.money){font-variant-numeric:tabular-nums;font-weight:600}.attendance-body :deep(.muted){color:#94a3b8}.attendance-body :deep(.form-grid){display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}.attendance-body :deep(.wide){grid-column:1/-1}@media(max-width:900px){.attendance-head{align-items:flex-start;flex-direction:column}.attendance-filters{justify-content:flex-start}.attendance-body :deep(.form-grid){grid-template-columns:1fr}}
</style>
