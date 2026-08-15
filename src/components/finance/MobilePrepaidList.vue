<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PrepaidCustomerRow, PrepaidDailyUsageRow, PrepaidRechargeRow } from '@/types/financeBills'

type PrepaidKind = 'recharge' | 'customer' | 'usage'
type RemarkRow = PrepaidCustomerRow | PrepaidDailyUsageRow

const props = withDefaults(defineProps<{
  kind: PrepaidKind
  rows: PrepaidRechargeRow[] | PrepaidCustomerRow[] | PrepaidDailyUsageRow[]
  loading?: boolean
  deletingId?: string
  savingId?: string
  savingIds?: string[]
}>(), {
  loading: false,
  deletingId: '',
  savingId: '',
  savingIds: () => []
})

const emit = defineEmits<{
  deleteRequest: [row: PrepaidRechargeRow]
  remarkCommit: [row: RemarkRow, remark: string]
  openUsage: [row: PrepaidCustomerRow]
}>()

interface RemarkDraftState {
  identity: string
  base: string
  value: string
  submitted?: string
}

const remarkDrafts = ref<Record<string, RemarkDraftState>>({})
const rechargeRows = computed(() => props.kind === 'recharge' ? props.rows as PrepaidRechargeRow[] : [])
const customerRows = computed(() => props.kind === 'customer' ? props.rows as PrepaidCustomerRow[] : [])
const usageRows = computed(() => props.kind === 'usage' ? props.rows as PrepaidDailyUsageRow[] : [])

watch(() => [props.kind, props.rows] as const, () => {
  if (props.kind === 'recharge') {
    remarkDrafts.value = {}
    return
  }
  const next: Record<string, RemarkDraftState> = {}
  ;(props.rows as RemarkRow[]).forEach((row) => {
    const key = remarkKey(row)
    const identity = remarkIdentity(row)
    const authoritative = row.remark || ''
    const current = remarkDrafts.value[key]
    if (!current || current.identity !== identity) {
      next[key] = { identity, base: authoritative, value: authoritative }
      return
    }
    if (current.submitted !== undefined && authoritative !== current.base) {
      const canResync = current.value === current.submitted || current.value === authoritative
      next[key] = { identity, base: authoritative, value: canResync ? authoritative : current.value }
      return
    }
    if (current.submitted === undefined && current.value === current.base) {
      next[key] = { identity, base: authoritative, value: authoritative }
      return
    }
    next[key] = current
  })
  remarkDrafts.value = next
}, { immediate: true, deep: true })

function remarkKey(row: RemarkRow) {
  return isCustomerRow(row) ? `customer:${row.id}` : `usage:${row.id}`
}

function remarkIdentity(row: RemarkRow) {
  return isCustomerRow(row)
    ? row.customer
    : `${row.date}\u0000${row.customer}`
}

function isCustomerRow(row: RemarkRow): row is PrepaidCustomerRow {
  return 'totalAmount' in row
}

function updateRemark(row: RemarkRow, value: string) {
  const key = remarkKey(row)
  const current = remarkDrafts.value[key]
  if (!current) return
  remarkDrafts.value = { ...remarkDrafts.value, [key]: { ...current, value } }
}

function commitRemark(row: RemarkRow) {
  const key = remarkKey(row)
  const current = remarkDrafts.value[key]
  const submitted = current?.value || ''
  if (current) remarkDrafts.value = { ...remarkDrafts.value, [key]: { ...current, submitted } }
  emit('remarkCommit', row, submitted)
}

function remarkValue(row: RemarkRow) {
  return remarkDrafts.value[remarkKey(row)]?.value || ''
}

function remarkSaving(row: RemarkRow) {
  const storeKey = isCustomerRow(row) ? `customer__${row.customer}` : row.id
  return props.savingId === storeKey || props.savingIds.includes(storeKey)
}

function money(value: number) {
  return Number(value || 0).toFixed(2)
}
</script>

<template>
  <section class="mobile-prepaid-list" :aria-busy="loading">
    <p v-if="loading" class="mobile-prepaid-list__state" role="status" aria-live="polite">预存款数据加载中…</p>

    <template v-else-if="kind === 'recharge'">
      <p v-if="!rechargeRows.length" class="mobile-prepaid-list__state empty-text" role="status">暂无预存款添加记录</p>
      <div v-else class="mobile-prepaid-list__cards">
        <article v-for="row in rechargeRows" :key="row.id" data-testid="mobile-prepaid-recharge-card" class="mobile-prepaid-card" :aria-busy="deletingId === row.id">
          <header><div><strong>{{ row.customer || '无信息' }}</strong><small>{{ row.rechargeDate }}</small></div><b>¥{{ money(row.amount) }}</b></header>
          <dl><div><dt>可使用次数</dt><dd>{{ row.usableTimes }} 次</dd></div><div><dt>备注</dt><dd>{{ row.remark || '无信息' }}</dd></div></dl>
          <span v-if="row.deleteRequestStatus === 'PENDING'" class="mobile-prepaid-card__pending">删除待审核</span>
          <button v-else :data-testid="`mobile-prepaid-delete-${row.id}`" class="mobile-prepaid-card__danger mobile-touch-target" type="button" :disabled="deletingId === row.id" :aria-label="`申请删除${row.customer}${row.rechargeDate}预存款记录`" @click="emit('deleteRequest', row)">{{ deletingId === row.id ? '提交中…' : '删除' }}</button>
        </article>
      </div>
    </template>

    <template v-else-if="kind === 'customer'">
      <p v-if="!customerRows.length" class="mobile-prepaid-list__state empty-text" role="status">暂无预存款客户</p>
      <div v-else class="mobile-prepaid-list__cards">
        <article v-for="row in customerRows" :key="row.id" data-testid="mobile-prepaid-customer-card" class="mobile-prepaid-card" :aria-busy="remarkSaving(row)">
          <header><strong>{{ row.customer || '无信息' }}</strong><b>累计充值 ¥{{ money(row.totalAmount) }}</b></header>
          <dl class="mobile-prepaid-card__balance"><div><dt>总可用</dt><dd>{{ row.totalUsableTimes }} 次</dd></div><div><dt>已使用</dt><dd>{{ row.usedTimes }} 次</dd></div><div><dt>剩余</dt><dd>{{ row.availableTimes }} 次</dd></div></dl>
          <label><span>备注</span><textarea :data-testid="`mobile-prepaid-customer-remark-${row.id}`" :value="remarkValue(row)" rows="2" maxlength="120" :disabled="remarkSaving(row)" placeholder="可填写备注" @input="updateRemark(row, ($event.target as HTMLTextAreaElement).value)" @blur="commitRemark(row)" /></label>
          <button :data-testid="`mobile-prepaid-customer-usage-${row.id}`" class="mobile-prepaid-card__details mobile-touch-target" type="button" :aria-label="`查看${row.customer}使用明细`" @click="emit('openUsage', row)">查看使用明细</button>
        </article>
      </div>
    </template>

    <template v-else>
      <p v-if="!usageRows.length" class="mobile-prepaid-list__state empty-text" role="status">暂无预存款样品消耗</p>
      <div v-else class="mobile-prepaid-list__cards">
        <article v-for="row in usageRows" :key="row.id" data-testid="mobile-prepaid-usage-card" class="mobile-prepaid-card" :aria-busy="remarkSaving(row)">
          <header><div><strong>{{ row.date }}</strong><small>{{ row.customer || '无信息' }}</small></div><b>{{ row.sampleCount }} 个样品</b></header>
          <label><span>备注</span><textarea :data-testid="`mobile-prepaid-usage-remark-${row.id}`" :value="remarkValue(row)" rows="2" maxlength="120" :disabled="remarkSaving(row)" placeholder="可填写备注" @input="updateRemark(row, ($event.target as HTMLTextAreaElement).value)" @blur="commitRemark(row)" /></label>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.mobile-prepaid-list,
.mobile-prepaid-list__cards {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-prepaid-list {
  padding-bottom: max(8px, env(safe-area-inset-bottom));
}

.mobile-prepaid-list__state {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
}

.mobile-prepaid-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: 14px;
  background: #fff;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
}

.mobile-prepaid-card header,
.mobile-prepaid-card dl > div {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.mobile-prepaid-card header > div,
.mobile-prepaid-card label {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.mobile-prepaid-card strong,
.mobile-prepaid-card small,
.mobile-prepaid-card b,
.mobile-prepaid-card dd {
  overflow-wrap: anywhere;
}

.mobile-prepaid-card small,
.mobile-prepaid-card dt,
.mobile-prepaid-card label > span {
  color: #64748b;
  font-size: 13px;
}

.mobile-prepaid-card b {
  color: #0f766e;
}

.mobile-prepaid-card dl {
  display: grid;
  gap: 7px;
  margin: 0;
}

.mobile-prepaid-card dl.mobile-prepaid-card__balance {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.mobile-prepaid-card dl.mobile-prepaid-card__balance > div {
  display: grid;
  gap: 3px;
  padding: 8px;
  background: #f8fafc;
  border-radius: 8px;
}

.mobile-prepaid-card dt,
.mobile-prepaid-card dd {
  margin: 0;
}

.mobile-prepaid-card textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 72px;
  padding: 9px 10px;
  color: #0f172a;
  background: #fff;
  border: 1px solid #aebdcd;
  border-radius: 8px;
  font: inherit;
  resize: vertical;
}

.mobile-prepaid-card__pending {
  justify-self: start;
  padding: 5px 9px;
  color: #9a6700;
  background: #fff7d6;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
}

.mobile-prepaid-card__danger,
.mobile-prepaid-card__details {
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
}

.mobile-prepaid-card__danger {
  color: #b91c1c;
  background: #fff;
  border: 1px solid #fecaca;
}

.mobile-prepaid-card__details {
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}
</style>
