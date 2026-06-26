<template>
  <div class="page-stack">
    <ReportSummaryCards :items="summaryItems" />
    <section class="panel">
      <div class="panel__header">
        <h2>样品数量与总价格趋势</h2>
      </div>
      <div class="panel__body">
        <el-empty v-if="!report.rows.length" description="当前周期暂无统计数据" />
        <ReportChart v-else :option="chartOption" />
      </div>
    </section>
    <section class="panel">
      <div class="panel__header">
        <h2>日期明细</h2>
      </div>
      <el-table :data="report.rows" border>
        <el-table-column prop="date" label="日期" />
        <el-table-column prop="sampleCount" label="样品数量" />
        <el-table-column prop="totalPrice" label="样品总价格">
          <template #default="{ row }">¥{{ row.totalPrice.toFixed(2) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import type { SampleDetectionReport } from '@/types/report'
import ReportSummaryCards from './ReportSummaryCards.vue'
import ReportChart from './ReportChart.vue'

const props = defineProps<{
  report: SampleDetectionReport
}>()

const summaryItems = computed(() => [
  { label: '样品总数', value: props.report.summary.totalSamples },
  { label: '样品总价格', value: `¥${props.report.summary.totalPrice.toFixed(2)}` },
  { label: '日均样品数', value: props.report.summary.averageSamples },
  { label: '日均价格', value: `¥${props.report.summary.averagePrice.toFixed(2)}` }
])

const chartOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['样品数量', '样品总价格'] },
  grid: { left: 48, right: 54, top: 48, bottom: 38 },
  xAxis: { type: 'category', data: props.report.rows.map((row) => row.date) },
  yAxis: [{ type: 'value', name: '数量' }, { type: 'value', name: '价格' }],
  series: [
    { name: '样品数量', type: 'bar', data: props.report.rows.map((row) => row.sampleCount), itemStyle: { color: '#2563eb' } },
    { name: '样品总价格', type: 'line', yAxisIndex: 1, data: props.report.rows.map((row) => row.totalPrice), itemStyle: { color: '#d9472f' } }
  ]
}))
</script>
