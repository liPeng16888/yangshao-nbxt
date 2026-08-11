<template>
  <div class="page-stack">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>月结款</h2>
          <p class="muted">费用状态为“月结款”的样品会按日期、客户和月份汇总。</p>
        </div>
        <div class="panel-actions">
          <el-date-picker
            :model-value="store.monthlySettlementMonth"
            type="month"
            value-format="YYYY-MM"
            @update:model-value="handleMonthChange"
          />
          <el-button :loading="store.loading" @click="store.loadMonthlySettlementReport()">刷新</el-button>
        </div>
      </div>
      <div class="panel__body settlement-summary" v-loading="store.loading">
        <div class="summary-card">
          <span>样品数量</span>
          <strong>{{ report?.totalSamples || 0 }}</strong>
        </div>
        <div class="summary-card">
          <span>月结金额</span>
          <strong>¥{{ money(report?.totalAmount || 0) }}</strong>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>月结款信息收录</h2>
          <p class="muted">本月同一个客户汇总为一行，可记录结款状态、结款金额和备注。</p>
        </div>
      </div>
      <el-table :data="report?.summaryRows || []" border v-loading="store.loading" empty-text="暂无月结款信息">
        <el-table-column prop="month" label="日期" width="120" />
        <el-table-column label="客户" min-width="240">
          <template #default="{ row }">
            <span class="customer-info">{{ getCustomerDisplay(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="amount"
          label="金额"
          width="130"
          sortable
          :sort-orders="settlementSortOrders"
        >
          <template #default="{ row }">¥{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column
          prop="sampleCount"
          label="样品数量"
          width="110"
          sortable
          :sort-orders="settlementSortOrders"
        />
        <el-table-column
          prop="settlementStatus"
          label="结款状态"
          width="150"
          sortable
          :sort-orders="settlementSortOrders"
          :sort-method="compareMonthlySettlementStatusRows"
        >
          <template #default="{ row }">
            <el-select
              :model-value="row.settlementStatus"
              size="small"
              :loading="store.monthlySavingId === row.id"
              @update:model-value="(value: MonthlySettlementStatus) => handleStatusChange(row, value)"
            >
              <el-option v-for="status in settlementStatusOptions" :key="status" :label="status" :value="status" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="结款金额" width="160">
          <template #default="{ row }">
            <el-input-number
              v-if="row.settlementStatus === '部分结款'"
              :model-value="row.paidAmount || 0"
              :min="0"
              :max="row.amount"
              :precision="2"
              :step="10"
              size="small"
              controls-position="right"
              @change="(value: number | undefined) => handlePaidAmountChange(row, value)"
            />
            <span v-else class="muted">{{ row.settlementStatus === '已结款' ? `¥${money(row.amount)}` : '无信息' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="260">
          <template #default="{ row }">
            <el-input v-model="row.remark" size="small" placeholder="可填写备注" @input="() => markDirty(row.id)" @blur="() => handleRemarkBlur(row)" />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel__header">
        <h2>月结款每日客户明细</h2>
        <div class="daily-detail-actions">
          <el-button data-testid="open-monthly-bill-export" @click="billExportVisible = true">导出本月明细</el-button>
          <el-select
            v-model="selectedDailyCustomers"
            class="customer-filter"
            clearable
            filterable
            multiple
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            placeholder="选择客户"
            size="small"
          >
            <el-option
              v-for="customer in dailyCustomerOptions"
              :key="customer.value"
              :label="customer.label"
              :value="customer.value"
            />
          </el-select>
        </div>
      </div>
      <el-table :data="filteredDailyRows" border v-loading="store.loading" empty-text="暂无月结款样品">
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column label="客户" min-width="260">
          <template #default="{ row }">
            <span class="customer-info">{{ getCustomerDisplay(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sampleCount" label="样品数量" width="110" />
        <el-table-column label="检测元素统计" min-width="260">
          <template #default="{ row }">{{ formatElementCounts(row.elementCounts) }}</template>
        </el-table-column>
        <el-table-column label="金额" width="140">
          <template #default="{ row }">¥{{ money(row.amount) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <MonthlySettlementBillExportDialog
      :visible="billExportVisible"
      :month="report?.month || store.monthlySettlementMonth"
      :rows="report?.dailyRows || []"
      @close="billExportVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import MonthlySettlementBillExportDialog from '@/components/finance/MonthlySettlementBillExportDialog.vue'
import type { MonthlySettlementDailyRow, MonthlySettlementElementCount, MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { tryUseTenantRealtimeStore } from '@/stores/tenantRealtime'
import { createPaidSettlementRemark, createPartialSettlementRemark, filterMonthlySettlementDailyRows, roundMoney } from '@/utils/financeBills'
import { compareMonthlySettlementStatusRows } from '@/utils/monthlySettlementSorting'

const store = useFinanceBillsStore()
const tenantRealtime = tryUseTenantRealtimeStore()
const dirtyRows = ref(new Set<string>())
let unregisterRealtime: (() => void) | undefined
const report = computed(() => store.monthlySettlementReport)
const selectedDailyCustomers = ref<string[]>([])
const billExportVisible = ref(false)
const settlementStatusOptions: MonthlySettlementStatus[] = ['已结款', '未结款', '部分结款']
const settlementSortOrders: Array<'ascending' | 'descending' | null> = ['ascending', 'descending', null]

const dailyCustomerOptions = computed(() => {
  const map = new Map<string, string>()
  ;(report.value?.dailyRows || []).forEach((row) => {
    if (!map.has(row.customer)) map.set(row.customer, getCustomerDisplay(row))
  })
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
})

const filteredDailyRows = computed(() => {
  return filterMonthlySettlementDailyRows(report.value?.dailyRows || [], selectedDailyCustomers.value)
})

onMounted(() => {
  store.loadMonthlySettlementReport()
  unregisterRealtime = tenantRealtime?.registerModule('finance-monthly', {
    isDirty: () => dirtyRows.value.size > 0,
    refresh: () => store.loadMonthlySettlementReport()
  })
})

onBeforeUnmount(() => unregisterRealtime?.())

function markDirty(id: string) {
  dirtyRows.value = new Set(dirtyRows.value).add(id)
}

function clearDirty(id: string) {
  const next = new Set(dirtyRows.value)
  next.delete(id)
  dirtyRows.value = next
}

function handleMonthChange(value: string) {
  selectedDailyCustomers.value = []
  store.loadMonthlySettlementReport(value)
}

async function handleStatusChange(row: MonthlySettlementSummaryRow, settlementStatus: MonthlySettlementStatus) {
  markDirty(row.id)
  const next: MonthlySettlementSummaryRow = {
    ...row,
    settlementStatus,
    paidAmount: settlementStatus === '已结款' ? row.amount : settlementStatus === '部分结款' ? row.paidAmount || 0 : null,
    remark: row.remark || ''
  }
  if (settlementStatus === '已结款') {
    next.remark = createPaidSettlementRemark()
  }
  if (settlementStatus === '部分结款') {
    next.remark = createPartialSettlementRemark(row.amount, next.paidAmount || 0)
  }
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
  const next = {
    ...row,
    paidAmount,
    remark: createPartialSettlementRemark(row.amount, paidAmount)
  }
  Object.assign(row, next)
  await store.saveMonthlySettlementRow(next)
  clearDirty(row.id)
  ElMessage.success('结款金额已保存')
}

async function handleRemarkBlur(row: MonthlySettlementSummaryRow) {
  await store.saveMonthlySettlementRow({ ...row, remark: row.remark || '' })
  clearDirty(row.id)
}

function money(value: number) {
  return value.toFixed(2)
}

function formatElementCounts(rows?: MonthlySettlementElementCount[]) {
  const text = rows?.filter((row) => row.count > 0).map((row) => `${row.label}${row.count}个`).join('、')
  return text || '无信息'
}

function getCustomerDisplay(row: MonthlySettlementDailyRow | MonthlySettlementSummaryRow) {
  return row.customerDisplay || row.customer || '无信息'
}
</script>

<style scoped lang="scss">
.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settlement-summary {
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
}

.customer-info {
  display: inline-block;
  white-space: normal;
  word-break: break-word;
  line-height: 1.5;
}

.daily-detail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-left: auto;
}

.customer-filter {
  width: min(360px, 100%);
}

@media (max-width: 760px) {
  .daily-detail-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .customer-filter {
    width: 100%;
  }
}
</style>
