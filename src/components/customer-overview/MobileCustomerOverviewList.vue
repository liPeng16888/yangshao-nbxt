<script setup lang="ts">
import type { CustomerOverviewRow } from '@/types/customerOverview'

defineProps<{
  rows: CustomerOverviewRow[]
  summary: {
    customerCount: number
    sampleCount: number
    totalAmount: number
  }
  loading: boolean
}>()

const emit = defineEmits<{
  showDetails: [row: CustomerOverviewRow]
}>()

function customerName(row: CustomerOverviewRow) {
  return row.customer?.trim() || row.customerDisplay?.trim() || '未提供客户信息'
}

function contact(row: CustomerOverviewRow) {
  const display = row.customerDisplay?.trim()
  const name = row.customer?.trim()
  if (!display) return '暂无联系方式'
  const detail = name && display.startsWith(name) ? display.slice(name.length).trim() : display
  return detail || '暂无联系方式'
}

function date(value: string | null | undefined) {
  return value || '暂无'
}

function amount(value: number | null | undefined) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'
}

function count(value: number | null | undefined) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}
</script>

<template>
  <div class="mobile-customer-overview-list" data-testid="mobile-customer-overview-list">
    <div class="mobile-customer-overview-summary" aria-label="当前客户汇总">
      <div><span>客户</span><strong>{{ summary.customerCount }}</strong></div>
      <div><span>样品</span><strong>{{ summary.sampleCount }}</strong></div>
      <div><span>金额</span><strong>¥{{ amount(summary.totalAmount) }}</strong></div>
    </div>

    <p v-if="loading" class="mobile-customer-overview-state" role="status" aria-live="polite">客户总览加载中…</p>
    <p v-else-if="!rows.length" class="mobile-customer-overview-state empty-text" role="status">暂无客户检测数据</p>
    <div v-else class="mobile-customer-overview-cards">
      <article v-for="row in rows" :key="row.customerKey" class="mobile-customer-overview-card" data-testid="mobile-customer-card">
        <div class="mobile-customer-overview-card__heading">
          <strong>{{ customerName(row) }}</strong>
          <span>{{ count(row.sampleCount) }} 个样品</span>
        </div>
        <dl>
          <div><dt>联系方式</dt><dd>{{ contact(row) }}</dd></div>
          <div><dt>首次检测</dt><dd>{{ date(row.firstDetectionDate) }}</dd></div>
          <div><dt>最后检测</dt><dd>{{ date(row.lastDetectionDate) }}</dd></div>
          <div><dt>累计金额</dt><dd>¥{{ amount(row.totalAmount) }}</dd></div>
        </dl>
        <button
          class="mobile-customer-overview-card__details mobile-touch-target"
          type="button"
          :aria-label="`查看${customerName(row)}详情`"
          @click="emit('showDetails', row)"
        >
          查看详情
        </button>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
.mobile-customer-overview-list,
.mobile-customer-overview-cards {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-customer-overview-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid #d8e1eb;
  border-radius: 12px;

  > div {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 12px;
    border-right: 1px solid #d8e1eb;

    &:last-child {
      border-right: 0;
    }
  }

  span {
    color: #64748b;
    font-size: 12px;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    color: #0f172a;
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.mobile-customer-overview-state {
  margin: 0;
  padding: 28px 12px;
  text-align: center;
}

.mobile-customer-overview-card {
  display: grid;
  min-width: 0;
  gap: 12px;
  padding: 14px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
}

.mobile-customer-overview-card__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;

  strong {
    min-width: 0;
    overflow: hidden;
    color: #0f172a;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    color: #2563eb;
    font-weight: 600;
  }
}

dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

dl div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

dt {
  flex: 0 0 auto;
  color: #64748b;
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
}

.mobile-customer-overview-card__details {
  justify-self: start;
  min-height: 44px;
  padding: 8px 12px;
  color: #2563eb;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
</style>
