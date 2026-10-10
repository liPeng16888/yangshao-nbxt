<template>
  <div class="page-stack" :class="{ 'mobile-page mobile-monthly-page': isMobileLayout }">
    <template v-if="isMobileLayout">
      <section class="panel mobile-monthly-overview">
        <header class="mobile-monthly-overview__header">
          <div><h2>月结款</h2><p class="muted">按月份查看客户月结金额与收款进度。</p></div>
          <button class="mobile-touch-target" type="button" :disabled="store.loading" @click="requestMonthlyReport()">{{ store.loading ? '刷新中…' : '刷新' }}</button>
        </header>
        <label class="mobile-monthly-overview__month">
          <span>月份</span>
          <input data-testid="mobile-monthly-month-input" class="mobile-touch-target" type="month" :value="requestedMonth" :disabled="store.loading" @change="handleMonthChange(($event.target as HTMLInputElement).value)" />
        </label>
        <div class="mobile-monthly-overview__totals" aria-label="本月汇总">
          <div><span>样品数量</span><strong>{{ report?.totalSamples || 0 }}</strong></div>
          <div><span>月结金额</span><strong>¥{{ money(report?.totalAmount || 0) }}</strong></div>
        </div>
        <div v-if="loadError" data-testid="mobile-monthly-load-error" class="mobile-monthly-load-error" role="alert">
          <span>月结款数据加载失败，请重试。</span>
          <button data-testid="mobile-monthly-retry" class="mobile-touch-target" type="button" @click="requestMonthlyReport()">重试</button>
        </div>
      </section>

      <section class="panel mobile-monthly-summary-panel">
        <header><div><h2>月结款信息收录</h2><p class="muted">结款状态、金额与备注会保存到同一份月结记录。</p></div></header>
        <div class="mobile-monthly-sort" role="group" aria-label="月结款排序">
          <button
            v-for="option in mobileSortOptions"
            :key="option.key"
            :data-testid="`mobile-monthly-sort-${option.key}`"
            class="mobile-touch-target"
            type="button"
            :aria-pressed="mobileSort.key === option.key && mobileSort.order !== null"
            @click="cycleMobileSort(option.key)"
          >{{ option.label }}{{ mobileSortLabel(option.key) }}</button>
        </div>
        <MobileMonthlySettlementList
          :summaries="mobileSummaryRows"
          :daily-rows="report?.dailyRows || []"
          :loading="store.loading"
          :saving-id="store.monthlySavingId"
          @status-change="handleStatusChange"
          @paid-amount-change="handlePaidAmountChange"
          @remark-commit="handleRemarkBlur"
          @open-daily-details="openDailyDetails"
        />
      </section>

      <section class="panel mobile-monthly-daily-panel">
        <header>
          <div><h2>每日客户明细</h2><p class="muted">可按客户筛选，导出仍使用本月完整明细。</p></div>
          <button data-testid="open-monthly-bill-export-mobile" class="mobile-touch-target mobile-monthly-export-button" type="button" @click="billExportVisible = true">导出本月明细</button>
        </header>
        <fieldset class="mobile-monthly-customer-filter">
          <legend>客户筛选</legend>
          <label v-for="customer in dailyCustomerOptions" :key="customer.value" class="mobile-touch-target">
            <input :data-testid="`mobile-monthly-customer-${customer.value}`" type="checkbox" :checked="selectedDailyCustomers.includes(customer.value)" @change="toggleDailyCustomer(customer.value, ($event.target as HTMLInputElement).checked)" />
            <span>{{ customer.label }}</span>
          </label>
        </fieldset>
        <p v-if="!filteredDailyRows.length" class="empty-text" role="status">暂无月结款样品</p>
        <div v-else class="mobile-monthly-daily-rows">
          <article v-for="row in filteredDailyRows" :key="row.id" data-testid="mobile-monthly-daily-row">
            <header><strong>{{ row.date }}</strong><b>¥{{ money(row.amount) }}</b></header>
            <p>{{ getCustomerDisplay(row) }} · {{ row.sampleCount }} 个样品</p>
            <p>{{ formatElementCounts(row.elementCounts) }}</p>
          </article>
        </div>
      </section>

      <MobileFullscreenDialog v-if="dailyDetailVisible && dailyDetailCustomer" v-model="dailyDetailVisible" :title="`${dailyDetailCustomer.label}每日明细`" fullscreen>
        <section data-testid="mobile-monthly-daily-dialog" role="region" aria-labelledby="mobile-monthly-daily-detail-heading">
          <h3 id="mobile-monthly-daily-detail-heading" class="mobile-monthly-detail-heading">{{ dailyDetailCustomer.label }}每日明细</h3>
          <article v-for="row in dailyDetailRows" :key="row.id" data-testid="mobile-monthly-detail-row" class="mobile-monthly-detail-row">
            <header><strong>{{ row.date }}</strong><b>¥{{ money(row.amount) }}</b></header>
            <p>{{ getCustomerDisplay(row) }} · {{ row.sampleCount }} 个样品</p>
            <p>{{ formatElementCounts(row.elementCounts) }}</p>
          </article>
        </section>
        <template #footer="{ cancel }"><button class="mobile-touch-target mobile-monthly-detail-close" type="button" @click="cancel">关闭</button></template>
      </MobileFullscreenDialog>
    </template>

    <template v-else>
      <section class="panel">
        <div class="panel__header">
          <div><h2>月结款</h2><p class="muted">费用状态为“月结款”的样品会按日期、客户和月份汇总。</p></div>
          <div class="panel-actions">
            <el-date-picker :model-value="store.monthlySettlementMonth" type="month" value-format="YYYY-MM" @update:model-value="handleMonthChange" />
            <el-button :loading="store.loading" @click="requestMonthlyReport()">刷新</el-button>
          </div>
        </div>
        <div class="panel__body settlement-summary" v-loading="store.loading">
          <div class="summary-card"><span>样品数量</span><strong>{{ report?.totalSamples || 0 }}</strong></div>
          <div class="summary-card"><span>月结金额</span><strong>¥{{ money(report?.totalAmount || 0) }}</strong></div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__header"><div><h2>月结款信息收录</h2><p class="muted">本月同一个客户汇总为一行，可记录结款状态、结款金额和备注。</p></div></div>
        <el-table class="monthly-settlement-table" :data="report?.summaryRows || []" border v-loading="store.loading" empty-text="暂无月结款信息">
          <el-table-column prop="month" label="日期" width="120" />
          <el-table-column label="客户" min-width="240"><template #default="{ row }"><span class="customer-info">{{ getCustomerDisplay(row) }}</span></template></el-table-column>
          <el-table-column align="right" prop="amount" label="金额" width="130" sortable :sort-orders="settlementSortOrders"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
          <el-table-column align="right" prop="sampleCount" label="样品数量" width="110" sortable :sort-orders="settlementSortOrders" />
          <el-table-column prop="settlementStatus" label="结款状态" width="150" sortable :sort-orders="settlementSortOrders" :sort-method="compareMonthlySettlementStatusRows">
            <template #default="{ row }">
              <el-select :model-value="row.settlementStatus" size="small" :loading="store.monthlySavingId === row.id" @update:model-value="(value: MonthlySettlementStatus) => handleStatusChange(row, value)">
                <el-option v-for="status in settlementStatusOptions" :key="status" :label="status" :value="status" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column align="right" label="结款金额" width="160">
            <template #default="{ row }">
              <el-input-number v-if="row.settlementStatus === '部分结款'" :model-value="row.paidAmount || 0" :min="0" :max="row.amount" :precision="2" :step="10" size="small" controls-position="right" @change="(value: number | undefined) => handlePaidAmountChange(row, value)" />
              <span v-else class="muted">{{ row.settlementStatus === '已结款' ? `¥${money(row.amount)}` : '无信息' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="260"><template #default="{ row }"><el-input v-model="row.remark" size="small" placeholder="可填写备注" @blur="() => handleRemarkBlur(row, row.remark || '')" /></template></el-table-column>
        </el-table>
      </section>

      <section class="panel">
        <div class="panel__header">
          <h2>月结款每日客户明细</h2>
          <div class="daily-detail-actions">
            <el-button data-testid="open-monthly-bill-export" @click="billExportVisible = true">导出本月明细</el-button>
            <el-select v-model="selectedDailyCustomers" class="customer-filter" clearable filterable multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="2" placeholder="选择客户" size="small">
              <el-option v-for="customer in dailyCustomerOptions" :key="customer.value" :label="customer.label" :value="customer.value" />
            </el-select>
          </div>
        </div>
        <el-table :data="filteredDailyRows" border v-loading="store.loading" empty-text="暂无月结款样品">
          <el-table-column prop="date" label="日期" width="130" />
          <el-table-column label="客户" min-width="260"><template #default="{ row }"><span class="customer-info">{{ getCustomerDisplay(row) }}</span></template></el-table-column>
          <el-table-column align="right" prop="sampleCount" label="样品数量" width="110" />
          <el-table-column label="检测元素统计" min-width="260"><template #default="{ row }">{{ formatElementCounts(row.elementCounts) }}</template></el-table-column>
          <el-table-column align="right" label="金额" width="140"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        </el-table>
      </section>
    </template>

    <MonthlySettlementBillExportDialog :visible="billExportVisible" :month="report?.month || store.monthlySettlementMonth" :rows="report?.dailyRows || []" :mobile="isMobileLayout" @close="billExportVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import MobileMonthlySettlementList from '@/components/finance/MobileMonthlySettlementList.vue'
import MonthlySettlementBillExportDialog from '@/components/finance/MonthlySettlementBillExportDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { MonthlySettlementDailyRow, MonthlySettlementElementCount, MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { tryUseTenantRealtimeStore } from '@/stores/tenantRealtime'
import { createPaidSettlementRemark, createPartialSettlementRemark, filterMonthlySettlementDailyRows, roundMoney } from '@/utils/financeBills'
import { compareMonthlySettlementStatusRows } from '@/utils/monthlySettlementSorting'

type MobileSortKey = 'amount' | 'sampleCount' | 'settlementStatus'
type MobileSortOrder = 'ascending' | 'descending' | null

const store = useFinanceBillsStore()
const tenantRealtime = tryUseTenantRealtimeStore()
const dirtyRows = ref(new Set<string>())
let unregisterRealtime: (() => void) | undefined
const { isMobileLayout } = useMobileLayout()
const monthlyLoadScope = Symbol('finance-monthly-settlement-page')
const report = computed(() => store.monthlySettlementReport)
const selectedDailyCustomers = ref<string[]>([])
const billExportVisible = ref(false)
const requestedMonth = ref(store.monthlySettlementMonth)
const loadError = ref(false)
const dailyDetailVisible = ref(false)
const dailyDetailCustomer = ref<{ value: string; label: string } | null>(null)
const mobileSort = ref<{ key: MobileSortKey | null; order: MobileSortOrder }>({ key: null, order: null })
const settlementStatusOptions: MonthlySettlementStatus[] = ['已结款', '未结款', '部分结款']
const settlementSortOrders: Array<'ascending' | 'descending' | null> = ['ascending', 'descending', null]
const mobileSortOptions: Array<{ key: MobileSortKey; label: string }> = [
  { key: 'amount', label: '金额' },
  { key: 'sampleCount', label: '样品数量' },
  { key: 'settlementStatus', label: '结款状态' }
]
let requestId = 0
let disposed = false

const dailyCustomerOptions = computed(() => {
  const map = new Map<string, string>()
  ;(report.value?.dailyRows || []).forEach((row) => {
    if (!map.has(row.customer)) map.set(row.customer, getCustomerDisplay(row))
  })
  return Array.from(map.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
})

const filteredDailyRows = computed(() => filterMonthlySettlementDailyRows(report.value?.dailyRows || [], selectedDailyCustomers.value))

const mobileSummaryRows = computed(() => {
  const rows = report.value?.summaryRows || []
  const { key, order } = mobileSort.value
  if (!key || !order) return rows
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    const compared = key === 'settlementStatus' ? compareMonthlySettlementStatusRows(left.row, right.row) : left.row[key] - right.row[key]
    return (order === 'ascending' ? compared : -compared) || left.index - right.index
  }).map(({ row }) => row)
})

const dailyDetailRows = computed(() => dailyDetailCustomer.value
  ? (report.value?.dailyRows || []).filter((row) => row.customer === dailyDetailCustomer.value?.value)
  : [])

watch(isMobileLayout, () => {
  billExportVisible.value = false
  dailyDetailVisible.value = false
})

onMounted(() => {
  requestMonthlyReport()
  unregisterRealtime = tenantRealtime?.registerModule('finance-monthly', {
    isDirty: () => dirtyRows.value.size > 0,
    refresh: () => requestMonthlyReport()
  })
})

onBeforeUnmount(() => {
  disposed = true
  requestId += 1
  store.cancelMonthlySettlementLoads(monthlyLoadScope)
  unregisterRealtime?.()
})

function markDirty(id: string) {
  dirtyRows.value = new Set(dirtyRows.value).add(id)
}

function clearDirty(id: string) {
  const next = new Set(dirtyRows.value)
  next.delete(id)
  dirtyRows.value = next
}

function handleMonthChange(value: string) {
  if (!value) return
  requestedMonth.value = value
  selectedDailyCustomers.value = []
  dailyDetailVisible.value = false
  mobileSort.value = { key: null, order: null }
  requestMonthlyReport(value)
}

function requestMonthlyReport(value = requestedMonth.value) {
  const id = ++requestId
  loadError.value = false
  void store.loadMonthlySettlementReport(value, { scope: monthlyLoadScope }).then((committed: boolean | void) => {
    if (disposed || id !== requestId || committed === false) return
    loadError.value = false
  }).catch(() => {
    if (!disposed && id === requestId) loadError.value = true
  })
}

async function handleStatusChange(row: MonthlySettlementSummaryRow, settlementStatus: MonthlySettlementStatus) {
  markDirty(row.id)
  const next: MonthlySettlementSummaryRow = {
    ...row,
    settlementStatus,
    paidAmount: settlementStatus === '已结款' ? row.amount : settlementStatus === '部分结款' ? row.paidAmount || 0 : null,
    remark: row.remark || ''
  }
  if (settlementStatus === '已结款') next.remark = createPaidSettlementRemark()
  if (settlementStatus === '部分结款') next.remark = createPartialSettlementRemark(row.amount, next.paidAmount || 0)
  Object.assign(row, next)
  try {
    await store.saveMonthlySettlementRow(next)
    clearDirty(row.id)
    ElMessage.success('月结款信息已保存')
  } catch (error) {
    throw error
  }
}

async function handlePaidAmountChange(row: MonthlySettlementSummaryRow, value: number | undefined) {
  markDirty(row.id)
  const paidAmount = roundMoney(Math.min(Math.max(Number(value || 0), 0), row.amount))
  const next = { ...row, paidAmount, remark: createPartialSettlementRemark(row.amount, paidAmount) }
  Object.assign(row, next)
  await store.saveMonthlySettlementRow(next)
  clearDirty(row.id)
  ElMessage.success('结款金额已保存')
}

async function handleRemarkBlur(row: MonthlySettlementSummaryRow, remark = row.remark || '') {
  const next = { ...row, remark }
  Object.assign(row, next)
  await store.saveMonthlySettlementRow(next)
  clearDirty(row.id)
}

function cycleMobileSort(key: MobileSortKey) {
  if (mobileSort.value.key !== key) {
    mobileSort.value = { key, order: 'ascending' }
    return
  }
  mobileSort.value = mobileSort.value.order === 'ascending'
    ? { key, order: 'descending' }
    : mobileSort.value.order === 'descending'
      ? { key: null, order: null }
      : { key, order: 'ascending' }
}

function mobileSortLabel(key: MobileSortKey) {
  if (mobileSort.value.key !== key || !mobileSort.value.order) return ''
  return mobileSort.value.order === 'ascending' ? ' ↑' : ' ↓'
}

function toggleDailyCustomer(customer: string, checked: boolean) {
  const next = new Set(selectedDailyCustomers.value)
  if (checked) next.add(customer)
  else next.delete(customer)
  selectedDailyCustomers.value = dailyCustomerOptions.value.map((item) => item.value).filter((value) => next.has(value))
}

function openDailyDetails(row: MonthlySettlementSummaryRow) {
  dailyDetailCustomer.value = { value: row.customer, label: getCustomerDisplay(row) }
  dailyDetailVisible.value = true
}

function money(value: number) { return Number(value).toFixed(2) }
function formatElementCounts(rows?: MonthlySettlementElementCount[]) {
  return rows?.filter((row) => row.count > 0).map((row) => `${row.label}${row.count}个`).join('、') || '无信息'
}
function getCustomerDisplay(row: MonthlySettlementDailyRow | MonthlySettlementSummaryRow) {
  return row.customerDisplay || row.customer || '无信息'
}
</script>

<style scoped lang="scss">
.panel-actions,
.daily-detail-actions { display: flex; align-items: center; gap: 10px; }
.settlement-summary { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.summary-card { display: grid; gap: 4px; min-height: 82px; padding: 14px; background: var(--ui-surface-subtle); border: 1px solid var(--ui-line-soft); border-radius: 8px; }
.summary-card span { color: var(--ui-text-muted); font-size: 13px; }
.summary-card strong { color: var(--ui-text); font-size: 22px; }
.customer-info { display: inline-block; white-space: normal; word-break: break-word; line-height: 1.5; }
.daily-detail-actions { justify-content: flex-end; flex-wrap: wrap; margin-left: auto; }
.customer-filter { width: min(360px, 100%); }
.mobile-monthly-overview,
.mobile-monthly-summary-panel,
.mobile-monthly-daily-panel { box-sizing: border-box; padding: 14px; }
.mobile-monthly-overview__header,
.mobile-monthly-summary-panel > header,
.mobile-monthly-daily-panel > header,
.mobile-monthly-daily-rows article header,
.mobile-monthly-detail-row header { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; }
.mobile-monthly-overview h2,
.mobile-monthly-overview p,
.mobile-monthly-summary-panel h2,
.mobile-monthly-summary-panel p,
.mobile-monthly-daily-panel h2,
.mobile-monthly-daily-panel p { margin: 0; }
.mobile-monthly-overview__header button,
.mobile-monthly-export-button,
.mobile-monthly-detail-close { flex: none; padding: 8px 12px; color: var(--ui-accent-hover); background: var(--ui-accent-soft); border: 1px solid var(--ui-accent-line); border-radius: 8px; }
.mobile-monthly-overview__month { display: grid; gap: 6px; margin-top: 14px; color: var(--ui-text-secondary); font-size: 13px; }
.mobile-monthly-overview__month input { box-sizing: border-box; width: 100%; min-height: 44px; padding: 8px 10px; background: #fff; border: 1px solid var(--ui-line); border-radius: 8px; font: inherit; }
.mobile-monthly-overview__totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.mobile-monthly-overview__totals > div { display: grid; min-width: 0; gap: 4px; padding: 12px; background: var(--ui-surface-subtle); border-radius: 10px; }
.mobile-monthly-overview__totals span { color: var(--ui-text-muted); font-size: 12px; }
.mobile-monthly-overview__totals strong { overflow-wrap: anywhere; }
.mobile-monthly-load-error { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; padding: 10px; color: #991b1b; background: var(--ui-danger-soft); border-radius: 8px; }
.mobile-monthly-load-error button { flex: none; }
.mobile-monthly-sort { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 14px 0 12px; }
.mobile-monthly-sort button { min-width: 0; padding: 6px; color: var(--ui-text-secondary); background: #fff; border: 1px solid var(--ui-line); border-radius: 8px; }
.mobile-monthly-sort button[aria-pressed='true'] { color: var(--ui-accent-hover); background: var(--ui-accent-soft); border-color: var(--ui-accent); }
.mobile-monthly-customer-filter { display: grid; gap: 4px; margin: 14px 0; padding: 0; border: 0; }
.mobile-monthly-customer-filter label { display: flex; min-width: 0; align-items: center; gap: 10px; overflow-wrap: anywhere; }
.mobile-monthly-customer-filter input { width: 20px; height: 20px; }
.mobile-monthly-daily-rows,
[data-testid='mobile-monthly-daily-dialog'] { display: grid; gap: 10px; }
.mobile-monthly-detail-heading { margin: 0; color: var(--ui-text); font-size: 16px; }
.mobile-monthly-daily-rows article,
.mobile-monthly-detail-row { min-width: 0; padding: 12px; background: var(--ui-surface-subtle); border: 1px solid var(--ui-line); border-radius: 10px; }
.mobile-monthly-daily-rows article p,
.mobile-monthly-detail-row p { margin-top: 6px; color: var(--ui-text-secondary); overflow-wrap: anywhere; }
.mobile-monthly-detail-close { width: 100%; }
.mobile-monthly-page { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
@media (max-width: 760px) {
  .daily-detail-actions { width: 100%; justify-content: flex-start; }
  .customer-filter { width: 100%; }
}
</style>
