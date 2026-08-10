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
.attendance-filters { display: grid; grid-template-columns: minmax(210px, 1.4fr) minmax(160px, 1fr) 150px minmax(240px, 1.3fr) 140px auto auto; gap: 10px; align-items: center; }
@media (max-width: 1200px) { .attendance-filters { grid-template-columns: repeat(3, minmax(180px, 1fr)); } }
</style>
