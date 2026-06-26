<template>
  <div class="page-stack">
    <ReportSummaryCards :items="summaryItems" />
    <div class="report-grid">
      <section class="panel">
        <div class="panel__header">
          <h2>开支金额与笔数趋势</h2>
        </div>
        <div class="panel__body">
          <el-empty v-if="!report.rows.length" description="当前周期暂无统计数据" />
          <ReportChart v-else :option="trendOption" />
        </div>
      </section>
      <section class="panel">
        <div class="panel__header">
          <h2>开支类目分布</h2>
        </div>
        <div class="panel__body">
          <el-empty v-if="!report.categories.length" description="暂无分类数据" />
          <ReportChart v-else :option="categoryOption" />
        </div>
      </section>
    </div>
    <section class="panel">
      <div class="panel__header">
        <h2>日期明细</h2>
      </div>
      <el-table :data="report.rows" border>
        <el-table-column prop="date" label="日期" />
        <el-table-column prop="amount" label="开支金额">
          <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="count" label="开支笔数" />
        <el-table-column prop="mainCategory" label="主要类目" />
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import type { FinanceReport } from '@/types/report'
import ReportChart from './ReportChart.vue'
import ReportSummaryCards from './ReportSummaryCards.vue'

const props = defineProps<{
  report: FinanceReport
}>()

const summaryItems = computed(() => [
  { label: '开支总额', value: `¥${props.report.summary.totalAmount.toFixed(2)}` },
  { label: '开支笔数', value: props.report.summary.totalCount },
  { label: '日均开支', value: `¥${props.report.summary.averageAmount.toFixed(2)}` },
  { label: '最高开支日', value: props.report.summary.highestExpenseDay }
])

const trendOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['开支金额', '开支笔数'] },
  grid: { left: 56, right: 48, top: 48, bottom: 38 },
  xAxis: { type: 'category', data: props.report.rows.map((row) => row.date) },
  yAxis: [{ type: 'value', name: '金额' }, { type: 'value', name: '笔数' }],
  series: [
    { name: '开支金额', type: 'bar', data: props.report.rows.map((row) => row.amount), itemStyle: { color: '#16a34a' } },
    { name: '开支笔数', type: 'line', yAxisIndex: 1, data: props.report.rows.map((row) => row.count), itemStyle: { color: '#d9472f' } }
  ]
}))

const categoryOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      name: '开支类目',
      type: 'pie',
      radius: ['40%', '68%'],
      data: props.report.categories.map((row) => ({ name: `${row.category} (${row.count}笔)`, value: row.amount, itemStyle: { color: row.color } }))
    }
  ]
}))
</script>

<style scoped lang="scss">
.report-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
  gap: 16px;
}

@media (max-width: 1100px) {
  .report-grid {
    grid-template-columns: 1fr;
  }
}
</style>
