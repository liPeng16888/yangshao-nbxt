<template>
  <div class="page-stack" :class="{ 'mobile-page': isMobileLayout }">
    <MobileIncomeList
      v-if="isMobileLayout"
      :month="store.month"
      :report="report"
      :rows="visibleRows"
      :status-summaries="visibleStatusSummaries"
      :statuses="visibleStatuses"
      :loading="store.loading"
      :format-money="money"
      @month-change="handleMonthChange"
    />

    <template v-else>
      <section class="panel">
        <div class="panel__header">
          <h2>收入账单</h2>
          <el-date-picker :model-value="store.month" type="month" value-format="YYYY-MM" @update:model-value="handleMonthChange" />
        </div>
        <div class="panel__body income-summary" v-loading="store.loading">
          <div class="summary-card">
            <span>样品数量</span>
            <strong>{{ report?.totalSamples || 0 }}</strong>
          </div>
          <div class="summary-card">
            <span>应收金额</span>
            <strong>¥{{ money(report?.totalAmount || 0) }}</strong>
          </div>
          <div v-for="summary in visibleStatusSummaries" :key="summary.status" class="summary-card">
            <span>{{ summary.status }}</span>
            <strong>{{ summary.count }} 个</strong>
            <small>¥{{ money(summary.amount) }}</small>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2>每日收入明细</h2>
        </div>
        <el-table :data="visibleRows" border v-loading="store.loading" empty-text="暂无收入数据">
          <el-table-column prop="date" label="日期" width="130" />
          <el-table-column prop="sampleCount" label="样品数量" width="110" />
          <el-table-column label="应收金额" width="130">
            <template #default="{ row }">¥{{ money(row.totalAmount) }}</template>
          </el-table-column>
          <el-table-column v-for="status in visibleStatuses" :key="status" :label="status" min-width="150">
            <template #default="{ row }">
              <span>{{ getSummary(row, status).count }} 个 / ¥{{ money(getSummary(row, status).amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import MobileIncomeList from '@/components/finance/MobileIncomeList.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { IncomeDailyRow, IncomePaymentStatus } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { getStatusSummary, incomePaymentStatuses } from '@/utils/financeBills'

const store = useFinanceBillsStore()
const { isMobileLayout } = useMobileLayout()
const incomeLoadScope = Symbol('finance-income-page')
const report = computed(() => store.incomeReport)
const visibleRows = computed(() => report.value?.rows.filter((row) => row.sampleCount > 0) || [])
const visibleStatusSummaries = computed(() => report.value?.statusSummaries.filter((summary) => summary.count > 0 || summary.status !== '未选择') || [])
const visibleStatuses = computed(() => {
  const hasUnselected = report.value?.statusSummaries.some((summary) => summary.status === '未选择' && summary.count > 0)
  return hasUnselected ? incomePaymentStatuses : incomePaymentStatuses.filter((status) => status !== '未选择')
})

onMounted(() => {
  requestIncomeReport()
})

onBeforeUnmount(() => {
  store.cancelIncomeLoads(incomeLoadScope)
})

function handleMonthChange(value: string) {
  requestIncomeReport(value)
}

function requestIncomeReport(value?: string) {
  void store.loadIncomeReport(value, { scope: incomeLoadScope }).catch(() => undefined)
}

function getSummary(row: IncomeDailyRow, status: IncomePaymentStatus) {
  return getStatusSummary(row, status)
}

function money(value: number) {
  return value.toFixed(2)
}
</script>

<style scoped lang="scss">
.income-summary {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.summary-card {
  display: grid;
  gap: 4px;
  min-height: 82px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;

  span {
    color: #64748b;
    font-size: 13px;
  }

  strong {
    color: #0f172a;
    font-size: 22px;
  }

  small {
    color: #475569;
    font-size: 13px;
  }
}
</style>
