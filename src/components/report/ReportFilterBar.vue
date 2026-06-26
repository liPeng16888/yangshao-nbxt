<template>
  <section class="panel report-filter">
    <div class="panel__body filter-body">
      <el-radio-group :model-value="mode" @update:model-value="emit('update:mode', $event as ReportMode)">
        <el-radio-button label="daily">日报</el-radio-button>
        <el-radio-button label="weekly">周报</el-radio-button>
        <el-radio-button label="monthly">月报</el-radio-button>
        <el-radio-button label="custom">筛选日期</el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-if="mode !== 'custom'"
        :model-value="date"
        type="date"
        value-format="YYYY-MM-DD"
        @update:model-value="emit('update:date', String($event))"
      />
      <template v-else>
        <el-date-picker :model-value="startDate" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" @update:model-value="emit('update:startDate', String($event))" />
        <el-date-picker :model-value="endDate" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" @update:model-value="emit('update:endDate', String($event))" />
      </template>
      <el-button type="primary" @click="emit('search')">查询</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ReportMode } from '@/types/report'

defineProps<{
  mode: ReportMode
  date: string
  startDate: string
  endDate: string
}>()

const emit = defineEmits<{
  'update:mode': [mode: ReportMode]
  'update:date': [date: string]
  'update:startDate': [date: string]
  'update:endDate': [date: string]
  search: []
}>()
</script>

<style scoped lang="scss">
.filter-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
</style>
