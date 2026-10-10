<script setup lang="ts">
import { ref, watch } from 'vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import type {
  IncomeBillReport,
  IncomeDailyRow,
  IncomePaymentStatus,
  IncomeStatusSummary
} from '@/types/financeBills'

const props = defineProps<{
  month: string
  report: IncomeBillReport | null
  rows: IncomeDailyRow[]
  statusSummaries: IncomeStatusSummary[]
  statuses: IncomePaymentStatus[]
  loading?: boolean
  formatMoney: (value: number) => string
}>()

const emit = defineEmits<{
  monthChange: [month: string]
}>()

const filterOpen = ref(false)
const draftMonth = ref(props.month)

watch(filterOpen, (open) => {
  if (open) draftMonth.value = props.month
})

function applyMonth() {
  const month = draftMonth.value || props.month
  filterOpen.value = false
  if (month) emit('monthChange', month)
}

function resetMonth() {
  draftMonth.value = props.month
  filterOpen.value = false
  emit('monthChange', props.month)
}

function statusSummary(row: IncomeDailyRow, status: IncomePaymentStatus) {
  return row.statusSummaries.find((summary) => summary.status === status)
}

function visibleStatuses(row: IncomeDailyRow) {
  return props.statuses.filter((status) => (statusSummary(row, status)?.count ?? 0) > 0)
}
</script>

<template>
  <section class="panel mobile-income-list" :aria-busy="loading">
    <header class="mobile-income-list__header">
      <h2>收入账单</h2>
      <div data-testid="mobile-income-month-summary">
        <MobileFilterDrawer
          v-model="filterOpen"
          title="选择收入月份"
          :summary="`当前月份：${month}`"
          @apply="applyMonth"
          @reset="resetMonth"
        >
          <label class="mobile-income-list__month-field">
            <span>收入月份</span>
            <input
              v-model="draftMonth"
              data-testid="mobile-income-month-input"
              class="mobile-touch-target"
              type="month"
            />
          </label>
        </MobileFilterDrawer>
      </div>
    </header>

    <div data-testid="mobile-income-summary" class="mobile-income-summary">
      <div>
        <span>收入合计</span>
        <strong>¥{{ formatMoney(report?.totalAmount ?? 0) }}</strong>
        <small>{{ report?.totalSamples ?? 0 }} 个样品</small>
      </div>
      <div
        v-for="summary in statusSummaries"
        :key="summary.status"
        :data-testid="`mobile-income-status-${summary.status}`"
      >
        <span>{{ summary.status }}</span>
        <strong>{{ summary.count }} 个</strong>
        <small>¥{{ formatMoney(summary.amount) }}</small>
      </div>
    </div>

    <p v-if="loading" class="mobile-income-list__state" role="status" aria-live="polite">收入账单加载中…</p>
    <p v-else-if="!rows.length" class="mobile-income-list__state empty-text" role="status">本月暂无收入数据</p>
    <div v-else class="mobile-income-list__cards">
      <article
        v-for="row in rows"
        :key="row.date"
        data-testid="mobile-income-day-card"
        class="mobile-income-day-card"
      >
        <header>
          <div>
            <strong>{{ row.date }}</strong>
            <small>{{ row.sampleCount }} 个样品</small>
          </div>
          <b>¥{{ formatMoney(row.totalAmount) }}</b>
        </header>
        <dl>
          <div
            v-for="status in visibleStatuses(row)"
            :key="status"
          >
            <dt>{{ status }}</dt>
            <dd>
              {{ statusSummary(row, status)?.count ?? 0 }} 个 ·
              ¥{{ formatMoney(statusSummary(row, status)?.amount ?? 0) }}
            </dd>
          </div>
        </dl>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.mobile-income-list,
.mobile-income-list__cards {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-income-list {
  box-sizing: border-box;
  padding: 14px 14px max(18px, env(safe-area-inset-bottom));
}

.mobile-income-list__header,
.mobile-income-day-card header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-income-list__header h2,
.mobile-income-day-card header strong,
.mobile-income-day-card header small {
  margin: 0;
  overflow-wrap: anywhere;
}

.mobile-income-list__month-field {
  display: grid;
  gap: 8px;
  color: var(--ui-text-secondary);
}

.mobile-income-list__month-field input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  color: var(--ui-text);
  background: #fff;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
}

.mobile-income-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.mobile-income-summary > div,
.mobile-income-day-card {
  min-width: 0;
  padding: 12px;
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-line);
  border-radius: 12px;
}

.mobile-income-summary > div {
  display: grid;
  gap: 4px;
}

.mobile-income-summary span,
.mobile-income-summary small,
.mobile-income-day-card small,
.mobile-income-day-card dt {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.mobile-income-summary strong,
.mobile-income-summary small,
.mobile-income-day-card b,
.mobile-income-day-card dd {
  overflow-wrap: anywhere;
}

.mobile-income-day-card header > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.mobile-income-day-card dl {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--ui-line-soft);
}

.mobile-income-day-card dl > div {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  gap: 12px;
}

.mobile-income-day-card dt,
.mobile-income-day-card dd {
  margin: 0;
}

.mobile-income-list__state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
}
</style>
