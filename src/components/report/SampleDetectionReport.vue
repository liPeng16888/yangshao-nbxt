<template>
  <div class="page-stack">
    <ReportSummaryCards :items="summaryItems" :mobile="mobile" />
    <section
      class="panel report-charts"
      :class="{ 'mobile-report-charts--single-column': mobile }"
      data-testid="mobile-report-charts"
    >
      <div class="panel__header">
        <h2>收入分类汇总</h2>
      </div>
      <div class="panel__body">
        <div class="status-grid" :class="{ 'status-grid--mobile': mobile }">
          <div v-for="summary in statusSummaries" :key="summary.status" class="status-card">
            <span class="status-card__name">{{ summary.status }}</span>
            <strong>{{ summary.count }} 个</strong>
            <span class="status-card__amount">¥{{ summary.amount.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel__header">
        <h2>每日收入分类统计</h2>
        <div class="chart-metric-toggle" aria-label="图表统计维度">
          <el-button
            data-testid="chart-metric-amount"
            size="small"
            :type="chartMetric === 'amount' ? 'primary' : 'default'"
            @click="chartMetric = 'amount'"
          >
            金额
          </el-button>
          <el-button
            data-testid="chart-metric-count"
            size="small"
            :type="chartMetric === 'count' ? 'primary' : 'default'"
            @click="chartMetric = 'count'"
          >
            样品数量
          </el-button>
        </div>
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
      <div class="report-table-scroll" :class="{ 'report-table-scroll--mobile': mobile }" aria-label="日期明细">
        <el-table :data="report.rows" border>
          <el-table-column prop="date" label="日期" />
          <el-table-column prop="sampleCount" label="样品数量" width="100" />
          <el-table-column prop="totalPrice" label="收入金额" width="120">
            <template #default="{ row }">¥{{ row.totalPrice.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column v-for="status in visibleStatuses" :key="status" :label="status" min-width="130">
            <template #default="{ row }">
              <div class="status-cell">
                <strong>{{ getRowStatusSummary(row, status).count }} 个</strong>
                <span>¥{{ getRowStatusSummary(row, status).amount.toFixed(2) }}</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { EChartsOption } from 'echarts'
import type { IncomePaymentStatus } from '@/types/financeBills'
import type { SampleDetectionDailyRow, SampleDetectionReport } from '@/types/report'
import { incomePaymentStatuses } from '@/utils/financeBills'
import ReportSummaryCards from './ReportSummaryCards.vue'
import ReportChart from './ReportChart.vue'

const props = defineProps<{
  report: SampleDetectionReport
  mobile?: boolean
}>()

const summaryItems = computed(() => [
  { label: '收入总数', value: props.report.summary.totalSamples },
  { label: '收入总金额', value: `¥${props.report.summary.totalPrice.toFixed(2)}` },
  { label: '日均收入数量', value: props.report.summary.averageSamples },
  { label: '日均收入金额', value: `¥${props.report.summary.averagePrice.toFixed(2)}` }
])

const visibleStatuses = computed(() => incomePaymentStatuses)
const chartMetric = ref<'amount' | 'count'>('amount')

const statusSummaries = computed(() =>
  visibleStatuses.value.map((status) => props.report.summary.statusSummaries.find((item) => item.status === status) || { status, count: 0, amount: 0 })
)

const chartOption = computed<EChartsOption>(() => {
  const isAmountMetric = chartMetric.value === 'amount'
  const totalAmountSeries = {
    name: '当日总金额',
    type: 'line' as const,
    data: props.report.rows.map((row) => row.totalPrice),
    symbol: 'circle',
    symbolSize: 7,
    z: 10,
    itemStyle: { color: '#0f172a' },
    lineStyle: { color: '#0f172a', width: 2 }
  }

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: [...visibleStatuses.value, ...(isAmountMetric ? [totalAmountSeries.name] : [])] },
    grid: { left: 56, right: 32, top: 52, bottom: 38 },
    xAxis: { type: 'category', data: props.report.rows.map((row) => row.date) },
    yAxis: { type: 'value', name: isAmountMetric ? '金额（元）' : '样品数量（个）' },
    series: [
      ...visibleStatuses.value.map((status) => ({
        name: status,
        type: 'bar' as const,
        stack: 'income',
        data: props.report.rows.map((row) => {
          const summary = getRowStatusSummary(row, status)
          return isAmountMetric ? summary.amount : summary.count
        }),
        itemStyle: { color: statusColors[status] }
      })),
      ...(isAmountMetric ? [totalAmountSeries] : [])
    ]
  }
})

const statusColors: Record<IncomePaymentStatus, string> = {
  已结款: '#16a34a',
  未结款: '#d9472f',
  月结款: '#2563eb',
  预存款: '#7c3aed',
  未选择: '#64748b'
}

function getRowStatusSummary(row: SampleDetectionDailyRow, status: IncomePaymentStatus) {
  return row.statusSummaries.find((item) => item.status === status) || { status, count: 0, amount: 0 }
}
</script>

<style scoped lang="scss">
.status-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 12px;
}

.report-table-scroll--mobile {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.status-card {
  padding: 14px;
  border: 1px solid #dce5ef;
  border-radius: 8px;
  background: #ffffff;

  &__name,
  &__amount {
    display: block;
    color: #64748b;
    font-size: 13px;
  }

  strong {
    display: block;
    margin: 8px 0 4px;
    color: #10233f;
    font-size: 22px;
  }
}

.status-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    color: #10233f;
    font-weight: 700;
  }

  span {
    color: #64748b;
    font-size: 12px;
  }
}

.chart-metric-toggle {
  display: flex;
  gap: 8px;
}

@media (max-width: 1200px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }
}

.status-grid.status-grid--mobile {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 760px) {
  .status-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
