<template>
  <div class="attendance-filters">
    <el-select
      :model-value="modelValue.frontendUserIds"
      multiple
      collapse-tags
      clearable
      placeholder="前台账号"
      @update:model-value="update('frontendUserIds', $event)"
    >
      <el-option v-for="item in accounts" :key="item.id" :label="`${item.name}（${item.account}）`" :value="item.id" />
    </el-select>
    <el-select
      v-if="showEmployee"
      :model-value="modelValue.employeeId"
      clearable
      filterable
      placeholder="员工"
      @update:model-value="update('employeeId', $event)"
    >
      <el-option v-for="item in employees" :key="item.id" :label="`${item.employeeNumber} ${item.name}`" :value="item.id" />
    </el-select>
    <el-date-picker
      v-if="showMonth"
      :model-value="modelValue.month"
      type="month"
      value-format="YYYY-MM"
      placeholder="月份"
      @update:model-value="update('month', $event)"
    />
    <el-date-picker
      v-if="showDates"
      :model-value="dateRange"
      type="daterange"
      value-format="YYYY-MM-DD"
      range-separator="至"
      start-placeholder="开始日期"
      end-placeholder="结束日期"
      @update:model-value="updateDateRange"
    />
    <el-select
      v-if="statusOptions.length"
      :model-value="modelValue.status"
      clearable
      placeholder="状态"
      @update:model-value="update('status', $event)"
    >
      <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
    </el-select>
    <el-button data-testid="employee-attendance-search" type="primary" @click="$emit('search')">查询</el-button>
    <el-button @click="$emit('reset')">重置</el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AdminAttendanceEmployee, AdminEmployeeAttendanceQuery, FrontendOption } from '../../types'

const props = defineProps<{
  modelValue: AdminEmployeeAttendanceQuery
  accounts: FrontendOption[]
  employees: AdminAttendanceEmployee[]
  statusOptions: Array<{ label: string; value: string }>
  showEmployee: boolean
  showMonth: boolean
  showDates: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: AdminEmployeeAttendanceQuery]
  search: []
  reset: []
}>()
const dateRange = computed(() => props.modelValue.startDate || props.modelValue.endDate
  ? [props.modelValue.startDate || '', props.modelValue.endDate || '']
  : [])

function update(key: keyof AdminEmployeeAttendanceQuery, value: unknown) {
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: value || undefined,
    ...(key === 'month' && value ? { startDate: undefined, endDate: undefined } : {})
  })
}

function updateDateRange(value: string[] | null) {
  emit('update:modelValue', {
    ...props.modelValue,
    ...(value?.length ? { month: undefined } : {}),
    startDate: value?.[0] || undefined,
    endDate: value?.[1] || undefined
  })
}
</script>

<style scoped>
.attendance-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.attendance-filters > * { min-width: 0; max-width: 100%; }
.attendance-filters > .el-select { flex: 1 1 180px; max-width: 320px; }
.attendance-filters :deep(.el-date-editor) { flex: 0 1 260px; min-width: 0; }
.attendance-filters > .el-button { flex: 0 0 auto; }
@media (max-width: 700px) {
  .attendance-filters > .el-select, .attendance-filters :deep(.el-date-editor) { flex-basis: 100%; max-width: 100%; }
}
</style>
