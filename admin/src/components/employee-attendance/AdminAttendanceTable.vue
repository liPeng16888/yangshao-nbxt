<template>
  <el-table :data="rows" border stripe>
    <el-table-column v-for="column in columns" :key="column.key" :label="column.label" :min-width="column.width || 120">
      <template #default="scope">
        <el-tag v-if="column.key === 'status'" size="small">{{ statusText(scope.row?.[column.key]) }}</el-tag>
        <span v-else>{{ format(scope.row?.[column.key], column.key) }}</span>
      </template>
    </el-table-column>
    <el-table-column v-if="section === 'employees'" label="敏感信息" width="130" fixed="right">
      <template #default="scope">
        <el-button
          link
          type="primary"
          :data-testid="`reveal-employee-${scope.row?.id || ''}`"
          :disabled="!scope.row"
          @click="scope.row && $emit('reveal', scope.row)"
        >查看完整信息</el-button>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import type { EmployeeAttendanceAdminPage } from '../../config/employeeAttendanceNavigation'

defineProps<{
  section: EmployeeAttendanceAdminPage
  rows: Record<string, any>[]
  columns: Array<{ key: string; label: string; width?: number }>
}>()
defineEmits<{ reveal: [employee: Record<string, any>] }>()

const statusLabels: Record<string, string> = {
  ACTIVE: '在职', INACTIVE: '停用', TERMINATED: '离职',
  PENDING: '待审核', APPROVED: '已批准', REJECTED: '已拒绝',
  DRAFT: '草稿', CONFIRMED: '已确认'
}
const statusText = (value: unknown) => statusLabels[String(value || '')] || String(value || '-')

function format(value: unknown, key: string) {
  if (value == null || value === '') return '-'
  if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('salary') || key.toLowerCase().includes('price')) {
    const number = Number(value)
    return Number.isFinite(number) ? `¥${number.toFixed(2)}` : String(value)
  }
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>
