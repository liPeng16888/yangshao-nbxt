<template>
  <div class="page-stack">
    <ReportSummaryCards :items="summaryItems" :mobile="mobile" />
    <div
      class="report-grid report-charts"
      :class="{ 'mobile-report-charts--single-column': mobile }"
      data-testid="mobile-report-charts"
    >
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
      <div class="report-table-scroll" :class="{ 'report-table-scroll--mobile': mobile }" aria-label="日期明细">
        <el-table :data="report.rows" border>
          <el-table-column prop="date" label="日期" />
          <el-table-column align="right" prop="amount" label="开支金额">
            <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column align="right" prop="count" label="开支笔数" />
          <el-table-column prop="mainCategory" label="主要类目" />
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import { chartCategoryColors, chartColors } from '../../../shared/chartTheme'
import type { FinanceReport } from '@/types/report'
import ReportChart from './ReportChart.vue'
import ReportSummaryCards from './ReportSummaryCards.vue'

const props = defineProps<{
  report: FinanceReport
  mobile?: boolean
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
    { name: '开支金额', type: 'bar', data: props.report.rows.map((row) => row.amount), itemStyle: { color: chartColors.expense, borderRadius: [3, 3, 0, 0] } },
    { name: '开支笔数', type: 'line', yAxisIndex: 1, data: props.report.rows.map((row) => row.count), itemStyle: { color: chartColors.total } }
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
      data: props.report.categories.map((row) => ({ name: `${row.category} (${row.count}笔)`, value: row.amount, itemStyle: { color: chartCategoryColors[row.category] || row.color } }))
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

.mobile-report-charts--single-column {
  grid-template-columns: minmax(0, 1fr);
}

.report-table-scroll--mobile {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 1100px) {
  .report-grid {
    grid-template-columns: 1fr;
  }
}

</style>
