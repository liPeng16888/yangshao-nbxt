<template>
  <div class="page-stack prepaid-page">
    <section class="panel">
      <div class="panel__header consumption-header">
        <div>
          <h2>全局预存款消费明细</h2>
          <p class="muted">根据会员、充值来源和消费账号全局查询，展开一行可核对每个充值批次的本金、赠送和应转分摊。</p>
        </div>
      </div>

      <div class="panel__body filter-body">
        <div class="consumption-filters">
          <el-input v-model="filters.phone" data-testid="consumption-filter-phone" clearable placeholder="会员手机号" @keyup.enter="applyFilters" />
          <el-input v-model="filters.sourceOwnerId" data-testid="consumption-filter-source" clearable placeholder="充值来源主账号 ID" @keyup.enter="applyFilters" />
          <el-input v-model="filters.consumingFrontendUserId" data-testid="consumption-filter-consumer" clearable placeholder="消费主账号 ID" @keyup.enter="applyFilters" />
          <el-date-picker v-model="filters.dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="样品开始日期" end-placeholder="样品结束日期" />
          <el-select v-model="filters.status" clearable placeholder="消费/冲正状态">
            <el-option label="有效消费" value="ACTIVE" />
            <el-option label="已冲正及冲正流水" value="REVERSED" />
          </el-select>
          <el-select v-model="filters.payableStatus" clearable placeholder="结算状态">
            <el-option label="待结算" value="PENDING" />
            <el-option label="已进入结算单 / 待确认" value="HELD" />
            <el-option label="已完成" value="COMPLETED" />
            <el-option label="已冲正" value="REVERSED" />
          </el-select>
          <el-button data-testid="consumption-filter-submit" type="primary" :loading="store.loadingByPage.consumptions" @click="applyFilters">查询</el-button>
          <el-button :loading="store.loadingByPage.consumptions" @click="loadConsumptions(store.consumptionsPage.page)">刷新</el-button>
        </div>
      </div>

      <el-alert v-if="realtime.hasPendingRefresh.value" class="consumption-alert" type="warning" :closable="false" show-icon title="共享消费明细已变化">
        <template #default><el-button link type="primary" @click="realtime.retryRefresh">立即刷新</el-button></template>
      </el-alert>
      <el-alert v-if="mutationError" data-testid="consumption-mutation-error" class="consumption-alert" type="error" :closable="false" show-icon :title="mutationError" />
      <el-alert v-if="store.errorsByPage.consumptions" class="consumption-alert" type="error" :closable="false" show-icon :title="store.errorsByPage.consumptions">
        <template #default><el-button link type="primary" @click="loadConsumptions(store.consumptionsPage.page)">重试</el-button></template>
      </el-alert>

      <el-table :data="store.consumptionsPage.items" border v-loading="store.loadingByPage.consumptions" empty-text="暂无符合条件的消费明细">
        <el-table-column type="expand" width="46">
          <template #default="{ row }">
            <div class="consumption-detail">
              <div class="sample-detail-grid">
                <span>化验单 {{ row.sheetId }}</span>
                <span>样品块 {{ row.sampleBlockId }}</span>
                <span>样品序号 {{ row.sampleIndex + 1 }}</span>
                <span>会员手机快照 {{ row.phoneSnapshot }}</span>
              </div>

              <h3>充值来源、分摊本金/赠送与精确应转值</h3>
              <div v-if="row.allocations.length" class="allocation-list">
                <article v-for="allocation in row.allocations" :key="allocation.id" class="allocation-card">
                  <div><strong>充值批次 {{ allocation.rechargeId }}</strong><el-tag v-if="allocation.recharge.isOpeningBalance" type="warning">期初余额</el-tag></div>
                  <div>充值来源账号 {{ accountLabel(allocation.sourceOwner) }}</div>
                  <div>充值日期 {{ allocation.recharge.rechargeDate }}，批次创建 {{ formatPreciseDateTime(allocation.recharge.createdAt) }}</div>
                  <div>批次原始：本金 ¥{{ money(allocation.recharge.paidAmount) }} + 赠送 ¥{{ money(allocation.recharge.giftAmount) }}</div>
                  <div>分摊价值 ¥{{ money(allocation.allocatedAmount) }}</div>
                  <div>分摊本金 ¥{{ money(allocatedPaid(allocation)) }}</div>
                  <div>分摊赠送 ¥{{ money(allocatedGift(allocation)) }}</div>
                  <div>本金比例 {{ percent(allocation.paidRatio) }}</div>
                  <div>未舍入应转值 {{ preciseMoney(allocation.exactTransferAmount) }}</div>
                  <div>分摊创建时间 {{ formatPreciseDateTime(allocation.createdAt) }}</div>
                </article>
              </div>
              <el-empty v-else :image-size="48" description="该记录无充值分摊" />

              <h3>账号间应转明细</h3>
              <div v-if="row.payables.length" class="payable-list">
                <article v-for="payable in row.payables" :key="payable.id" class="payable-card">
                  <span>充值来源账号 {{ accountLabel(payable.sourceOwner) }}</span>
                  <span>消费账号 {{ accountLabel(payable.consumerOwner) }}</span>
                  <span>精确本金值 {{ preciseMoney(payable.exactAmount) }}</span>
                  <strong>应转金额 ¥{{ money(payable.amount) }}</strong>
                  <el-tag :type="payableTagType(payable.status)">{{ payableStatusLabel(payable.status) }}</el-tag>
                  <span>应转创建时间 {{ formatPreciseDateTime(payable.createdAt) }}</span>
                </article>
              </div>
              <p v-else class="muted">使用消费账号自有额度，无跨账号应转金额。</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phoneSnapshot" label="会员手机号" width="145" />
        <el-table-column label="类型" width="95"><template #default="{ row }">{{ row.kind === 'REVERSAL' ? '冲正流水' : '消费' }}</template></el-table-column>
        <el-table-column label="消费金额" width="115"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column label="跨账号应转" width="125"><template #default="{ row }">¥{{ money(payableTotal(row)) }}</template></el-table-column>
        <el-table-column label="充值来源账号" min-width="190"><template #default="{ row }">{{ sourceOwnerLabels(row) }}</template></el-table-column>
        <el-table-column label="消费账号" min-width="180"><template #default="{ row }">{{ accountLabel(row.consumingFrontendUser) }}</template></el-table-column>
        <el-table-column label="实际操作账号" min-width="180"><template #default="{ row }">{{ accountLabel(row.actorUser) }}</template></el-table-column>
        <el-table-column prop="sampleNumberSnapshot" label="样品编号" width="115" />
        <el-table-column prop="sampleCountSnapshot" label="样品数量" width="100" />
        <el-table-column label="检测元素" min-width="180"><template #default="{ row }">{{ formatElements(row.elementsSnapshot) }}</template></el-table-column>
        <el-table-column prop="sheetDate" label="样品日期" width="120" />
        <el-table-column label="实际消费时间" width="185"><template #default="{ row }">{{ formatPreciseDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="结算/冲正状态" width="165"><template #default="{ row }">{{ rowStatus(row) }}</template></el-table-column>
        <el-table-column v-if="isMainAccount" label="不可变更正" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canReverseConsumption(row)"
              :data-testid="`reverse-consumption-${row.id}`"
              link
              type="warning"
              @click="reverseConsumption(row)"
            >冲正</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="prepaid-pagination">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="store.consumptionsPage.total"
          :page-size="pageSize"
          :current-page="store.consumptionsPage.page"
          @current-change="loadConsumptions"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useSharedPrepaidRealtimeRegistration } from '@/composables/useSharedPrepaidRealtime'
import { useAuthStore } from '@/stores/auth'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import type {
  PrepaidAccountRow,
  PrepaidConsumptionListAllocationRow,
  PrepaidConsumptionListRow,
  PrepaidConsumptionQuery,
  PrepaidPayableStatus
} from '@/types/sharedPrepaid'
import { formatPreciseDateTime } from '@/utils/date'

defineOptions({ name: 'PrepaidConsumptionsPage' })

const pageSize = 20
const store = useSharedPrepaidStore()
const auth = useAuthStore()
const mutationError = ref('')
const filters = reactive<{
  phone: string
  sourceOwnerId: string
  consumingFrontendUserId: string
  dateRange: string[]
  status: PrepaidConsumptionQuery['status'] | ''
  payableStatus: PrepaidPayableStatus | ''
}>({ phone: '', sourceOwnerId: '', consumingFrontendUserId: '', dateRange: [], status: '', payableStatus: '' })

const isMainAccount = computed(() => auth.user?.role === 'FRONTEND_USER' || auth.user?.isFrontendMainAccount === true)
const currentOwnerId = computed(() => auth.user?.dataOwnerId || auth.user?.id || '')
const realtime = useSharedPrepaidRealtimeRegistration('consumptions', {
  isDirty: () => false,
  refresh: () => loadConsumptions(store.consumptionsPage.page)
})

onMounted(() => void loadConsumptions())

function consumptionQuery(page = 1): PrepaidConsumptionQuery {
  const [startDate, endDate] = filters.dateRange
  return {
    page,
    pageSize,
    ...(normalizePhone(filters.phone) ? { phone: normalizePhone(filters.phone) } : {}),
    ...(filters.sourceOwnerId.trim() ? { sourceOwnerId: filters.sourceOwnerId.trim() } : {}),
    ...(filters.consumingFrontendUserId.trim() ? { consumingFrontendUserId: filters.consumingFrontendUserId.trim() } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.payableStatus ? { payableStatus: filters.payableStatus } : {})
  }
}

async function loadConsumptions(page = 1) {
  try {
    await store.loadConsumptions(consumptionQuery(page))
  } catch {
    // Store exposes the persistent error and retains the exact active filters.
  }
}

function applyFilters() {
  return loadConsumptions(1)
}

function canReverseConsumption(row: PrepaidConsumptionListRow) {
  return isMainAccount.value && row.kind === 'CONSUMPTION' && row.active && row.consumingFrontendUserId === currentOwnerId.value
}

async function reverseConsumption(row: PrepaidConsumptionListRow) {
  mutationError.value = ''
  try {
    const { value } = await ElMessageBox.prompt(
      `将创建反向冲正流水，不会修改或删除原流水 ${row.id}。请填写冲正原因。`,
      '确认冲正消费',
      { type: 'warning', inputPattern: /\S+/, inputErrorMessage: '请填写冲正原因', confirmButtonText: '创建冲正', cancelButtonText: '取消' }
    )
    await store.reverseConsumption(row.id, value.trim())
    await loadConsumptions(store.consumptionsPage.page)
    ElMessage.success('消费冲正流水已创建')
  } catch (error) {
    if (!isMessageBoxCancel(error)) {
      mutationError.value = isConflict(error)
        ? `${errorMessage(error, '消费或结算状态已变化')}，本次冲正未生效，请刷新后核对再重试。`
        : errorMessage(error, '消费冲正失败')
    }
  }
}

function sourceOwnerLabels(row: PrepaidConsumptionListRow) {
  const labels = new Map(row.allocations.map((allocation) => [allocation.sourceOwnerId, accountLabel(allocation.sourceOwner)]))
  return [...labels.values()].join('、') || '无信息'
}

function payableTotal(row: PrepaidConsumptionListRow) {
  return row.payables.reduce((sum, payable) => sum + Number(payable.amount || 0), 0)
}

function allocatedPaid(allocation: PrepaidConsumptionListAllocationRow) {
  return Number(allocation.exactTransferAmount)
}

function allocatedGift(allocation: PrepaidConsumptionListAllocationRow) {
  return Math.max(0, Number(allocation.allocatedAmount) - allocatedPaid(allocation))
}

function rowStatus(row: PrepaidConsumptionListRow) {
  if (row.kind === 'REVERSAL') return '冲正流水'
  if (!row.active) return '已冲正'
  if (!row.payables.length) return '本账号额度 / 无需结算'
  return [...new Set(row.payables.map((payable) => payableStatusLabel(payable.status)))].join('、')
}

function payableStatusLabel(status: PrepaidPayableStatus) {
  return {
    PENDING: '待结算',
    HELD: '已进入结算单 / 待确认',
    COMPLETED: '已完成',
    REVERSED: '已冲正'
  }[status]
}

function payableTagType(status: PrepaidPayableStatus) {
  return ({ PENDING: 'warning', HELD: 'primary', COMPLETED: 'success', REVERSED: 'info' } as const)[status]
}

function accountLabel(account: PrepaidAccountRow) {
  const display = account.displayRemark || account.username
  return display && display !== account.account ? `${display}（${account.account}）` : account.account || display || '无信息'
}

function formatElements(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const name = record.name ?? record.element ?? record.label
        const amount = record.value ?? record.result
        return [name, amount].filter((part) => part !== undefined && part !== null && part !== '').join(': ')
      }
      return String(item)
    }).filter(Boolean).join('、') || '无信息'
  }
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join('、')
  return typeof value === 'string' && value.trim() ? value : '无信息'
}

function normalizePhone(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function preciseMoney(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') : '0'
}

function percent(value: unknown) {
  const ratio = Number(value)
  return Number.isFinite(ratio) ? `${(ratio * 100).toFixed(4)}%` : '0%'
}

function isConflict(error: unknown) {
  return (error as { response?: { status?: unknown } } | null)?.response?.status === 409
}

function errorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: unknown } }; message?: unknown } | null)?.response
  const message = response?.data?.message ?? (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function isMessageBoxCancel(error: unknown) {
  return error === 'cancel' || error === 'close'
}
</script>

<style scoped>
.consumption-header { align-items: flex-start; }
.filter-body { padding-bottom: 0; }
.consumption-filters { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 10px; }
.consumption-filters :deep(.el-date-editor) { width: 100%; }
.consumption-alert { margin: 14px 16px 0; }
.consumption-detail { display: grid; gap: 12px; padding: 12px 16px 18px 58px; }
.consumption-detail h3 { margin: 4px 0 0; font-size: 14px; }
.sample-detail-grid { display: flex; flex-wrap: wrap; gap: 8px 18px; color: #475569; font-size: 13px; }
.allocation-list, .payable-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.allocation-card, .payable-card { display: grid; gap: 5px; padding: 12px; background: #f8fafc; border: 1px solid #dce5ef; border-radius: 8px; font-size: 13px; }
.allocation-card > div:first-child, .payable-card { align-items: center; }
.allocation-card :deep(.el-tag) { margin-left: 8px; }
.prepaid-pagination { display: flex; justify-content: flex-end; padding: 14px 16px; }
@media (max-width: 1000px) { .consumption-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .allocation-list, .payable-list { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .consumption-filters { grid-template-columns: 1fr; } .consumption-detail { padding-left: 14px; } }
</style>
