<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MonthlySettlementDailyRow, MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'

const props = withDefaults(defineProps<{
  summaries: MonthlySettlementSummaryRow[]
  dailyRows: MonthlySettlementDailyRow[]
  loading?: boolean
  savingId?: string
}>(), {
  loading: false,
  savingId: ''
})

const emit = defineEmits<{
  statusChange: [row: MonthlySettlementSummaryRow, status: MonthlySettlementStatus]
  paidAmountChange: [row: MonthlySettlementSummaryRow, value: number | undefined]
  remarkCommit: [row: MonthlySettlementSummaryRow, remark: string]
  openDailyDetails: [row: MonthlySettlementSummaryRow]
}>()

const statusOptions: MonthlySettlementStatus[] = ['已结款', '未结款', '部分结款']
interface RemarkDraftState {
  identity: string
  base: string
  value: string
  submitted?: string
}

const remarkDrafts = ref<Record<string, RemarkDraftState>>({})
const dailyCountByCustomer = computed(() => {
  const counts = new Map<string, number>()
  props.dailyRows.forEach((row) => counts.set(row.customer, (counts.get(row.customer) || 0) + 1))
  return counts
})

watch(() => props.summaries, (summaries) => {
  const next: Record<string, RemarkDraftState> = {}
  summaries.forEach((row) => {
    const identity = remarkIdentity(row)
    const authoritative = row.remark || ''
    const current = remarkDrafts.value[row.id]
    if (!current || current.identity !== identity) {
      next[row.id] = { identity, base: authoritative, value: authoritative }
      return
    }

    if (current.submitted !== undefined && authoritative !== current.base) {
      const canResync = current.value === current.submitted || current.value === authoritative
      next[row.id] = {
        identity,
        base: authoritative,
        value: canResync ? authoritative : current.value
      }
      return
    }

    if (current.submitted === undefined && current.value === current.base) {
      next[row.id] = { identity, base: authoritative, value: authoritative }
      return
    }

    next[row.id] = current
  })
  remarkDrafts.value = next
}, { immediate: true, deep: true })

function paidAmount(row: MonthlySettlementSummaryRow) {
  if (row.settlementStatus === '已结款') return row.amount
  if (row.settlementStatus === '未结款') return 0
  return Math.min(Math.max(Number(row.paidAmount || 0), 0), row.amount)
}

function unpaidAmount(row: MonthlySettlementSummaryRow) {
  return Math.max(0, row.amount - paidAmount(row))
}

function updateRemark(id: string, value: string) {
  const current = remarkDrafts.value[id]
  if (!current) return
  remarkDrafts.value = {
    ...remarkDrafts.value,
    [id]: { ...current, value }
  }
}

function commitRemark(row: MonthlySettlementSummaryRow) {
  const current = remarkDrafts.value[row.id]
  const submitted = current?.value || ''
  if (current) {
    remarkDrafts.value = {
      ...remarkDrafts.value,
      [row.id]: { ...current, submitted }
    }
  }
  emit('remarkCommit', row, submitted)
}

function remarkIdentity(row: MonthlySettlementSummaryRow) {
  return `${row.month}\u0000${row.customer}`
}

function emitPaidAmount(row: MonthlySettlementSummaryRow, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  emit('paidAmountChange', row, raw === '' ? undefined : Number(raw))
}

function money(value: number) {
  return Number(value).toFixed(2)
}
</script>

<template>
  <section class="mobile-monthly-list" :aria-busy="loading">
    <p v-if="loading" class="mobile-monthly-list__state" role="status" aria-live="polite">月结款数据加载中…</p>
    <p v-else-if="!summaries.length" class="mobile-monthly-list__state empty-text" role="status">暂无月结款信息</p>
    <div v-else class="mobile-monthly-list__cards">
      <article
        v-for="row in summaries"
        :key="row.id"
        data-testid="mobile-monthly-summary-card"
        :data-customer="row.customer"
        class="mobile-monthly-summary-card"
        :aria-busy="savingId === row.id"
      >
        <header>
          <div>
            <strong>{{ row.customerDisplay || row.customer || '无信息' }}</strong>
            <small>{{ row.month }} · {{ row.sampleCount }} 个样品</small>
          </div>
          <span class="mobile-monthly-summary-card__status">{{ row.settlementStatus }}</span>
        </header>

        <div class="mobile-monthly-summary-card__money">
          <span>应收 ¥{{ money(row.amount) }}</span>
          <span>已收 ¥{{ money(paidAmount(row)) }}</span>
          <span>未收 ¥{{ money(unpaidAmount(row)) }}</span>
        </div>

        <label>
          <span>结款状态</span>
          <select
            :data-testid="`mobile-monthly-status-${row.id}`"
            class="mobile-touch-target"
            :value="row.settlementStatus"
            :disabled="savingId === row.id"
            @change="emit('statusChange', row, ($event.target as HTMLSelectElement).value as MonthlySettlementStatus)"
          >
            <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
          </select>
        </label>

        <label v-if="row.settlementStatus === '部分结款'">
          <span>结款金额</span>
          <input
            :data-testid="`mobile-monthly-paid-${row.id}`"
            class="mobile-touch-target"
            type="number"
            inputmode="decimal"
            step="0.01"
            :value="paidAmount(row)"
            :disabled="savingId === row.id"
            @change="emitPaidAmount(row, $event)"
          />
        </label>

        <label>
          <span>备注</span>
          <textarea
            :data-testid="`mobile-monthly-remark-${row.id}`"
            :value="remarkDrafts[row.id]?.value || ''"
            :disabled="savingId === row.id"
            rows="2"
            placeholder="可填写备注"
            @input="updateRemark(row.id, ($event.target as HTMLTextAreaElement).value)"
            @blur="commitRemark(row)"
          />
        </label>

        <button
          :data-testid="`mobile-monthly-details-${row.id}`"
          class="mobile-touch-target mobile-monthly-summary-card__details"
          type="button"
          :aria-label="`查看${row.customerDisplay || row.customer}每日明细`"
          @click="emit('openDailyDetails', row)"
        >查看每日明细（{{ dailyCountByCustomer.get(row.customer) || 0 }} 天）</button>
      </article>
    </div>
  </section>
</template>

<style scoped lang="scss">
.mobile-monthly-list,
.mobile-monthly-list__cards {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-monthly-list__state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
}

.mobile-monthly-summary-card {
  display: grid;
  min-width: 0;
  gap: 14px;
  padding: 14px;
  background: #fff;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
}

.mobile-monthly-summary-card header {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.mobile-monthly-summary-card header > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.mobile-monthly-summary-card strong,
.mobile-monthly-summary-card small {
  overflow-wrap: anywhere;
}

.mobile-monthly-summary-card small {
  color: #64748b;
}

.mobile-monthly-summary-card__status {
  flex: none;
  padding: 4px 8px;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.mobile-monthly-summary-card__money {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.mobile-monthly-summary-card__money > span {
  display: grid;
  min-width: 0;
  gap: 2px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 8px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.mobile-monthly-summary-card > label {
  display: grid;
  gap: 6px;
  color: #475569;
  font-size: 13px;
}

.mobile-monthly-summary-card select,
.mobile-monthly-summary-card input,
.mobile-monthly-summary-card textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 9px 10px;
  color: #0f172a;
  background: #fff;
  border: 1px solid #aebdcd;
  border-radius: 8px;
  font: inherit;
}

.mobile-monthly-summary-card textarea {
  resize: vertical;
}

.mobile-monthly-summary-card__details {
  width: 100%;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
}
</style>
