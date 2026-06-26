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
        <el-table-column prop="customer" label="客户" min-width="200" />
        <el-table-column label="金额" width="130">
          <template #default="{ row }">¥{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="sampleCount" label="样品数量" width="110" />
        <el-table-column label="结款状态" width="150">
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
            <el-input v-model="row.remark" size="small" placeholder="可填写备注" @blur="() => handleRemarkBlur(row)" />
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel__header">
        <h2>月结款每日客户明细</h2>
      </div>
      <el-table :data="report?.dailyRows || []" border v-loading="store.loading" empty-text="暂无月结款样品">
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column prop="customer" label="客户" min-width="220" />
        <el-table-column prop="sampleCount" label="样品数量" width="110" />
        <el-table-column label="金额" width="140">
          <template #default="{ row }">¥{{ money(row.amount) }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { MonthlySettlementStatus, MonthlySettlementSummaryRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { createPartialSettlementRemark, roundMoney } from '@/utils/financeBills'

const store = useFinanceBillsStore()
const report = computed(() => store.monthlySettlementReport)
const settlementStatusOptions: MonthlySettlementStatus[] = ['已结款', '未结款', '部分结款']

onMounted(() => {
  store.loadMonthlySettlementReport()
})

function handleMonthChange(value: string) {
  store.loadMonthlySettlementReport(value)
}

async function handleStatusChange(row: MonthlySettlementSummaryRow, settlementStatus: MonthlySettlementStatus) {
  const next: MonthlySettlementSummaryRow = {
    ...row,
    settlementStatus,
    paidAmount: settlementStatus === '已结款' ? row.amount : settlementStatus === '部分结款' ? row.paidAmount || 0 : null,
    remark: row.remark || ''
  }
  if (settlementStatus === '部分结款') {
    next.remark = createPartialSettlementRemark(row.amount, next.paidAmount || 0)
  }
  Object.assign(row, next)
  await store.saveMonthlySettlementRow(next)
  ElMessage.success('月结款信息已保存')
}

async function handlePaidAmountChange(row: MonthlySettlementSummaryRow, value: number | undefined) {
  const paidAmount = roundMoney(Math.min(Math.max(Number(value || 0), 0), row.amount))
  const next = {
    ...row,
    paidAmount,
    remark: createPartialSettlementRemark(row.amount, paidAmount)
  }
  Object.assign(row, next)
  await store.saveMonthlySettlementRow(next)
  ElMessage.success('结款金额已保存')
}

async function handleRemarkBlur(row: MonthlySettlementSummaryRow) {
  await store.saveMonthlySettlementRow({ ...row, remark: row.remark || '' })
}

function money(value: number) {
  return value.toFixed(2)
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
</style>
