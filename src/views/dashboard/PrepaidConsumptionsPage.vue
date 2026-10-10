<template>
  <div class="page-stack prepaid-page">
    <section class="panel">
      <div class="panel__header consumption-header">
        <div>
          <h2>全局预存款消费明细</h2>
          <p class="muted">根据会员、充值来源和消费账号全局查询，展开一行可核对每个充值批次的本金、赠送和应转分摊。</p>
        </div>
      </div>

      <div v-if="!isMobileLayout" class="panel__body filter-body">
        <div class="consumption-filters">
          <label class="filter-field"><span>会员手机号筛选</span><el-input v-model="filters.phone" data-testid="consumption-filter-phone" aria-label="会员手机号筛选" clearable placeholder="会员手机号" @keyup.enter="applyFilters" /></label>
          <label class="filter-field">
            <span>充值来源账号筛选</span>
            <el-select v-model="filters.sourceOwnerId" data-testid="consumption-filter-source" filterable clearable aria-label="充值来源账号筛选" placeholder="搜索账号或显示名称">
              <el-option v-for="option in store.consumptionFilterOptions.sourceOwners" :key="option.id" :label="option.label" :value="option.id" />
            </el-select>
          </label>
          <label class="filter-field">
            <span>消费账号筛选</span>
            <el-select v-model="filters.consumingFrontendUserId" data-testid="consumption-filter-consumer" filterable clearable aria-label="消费账号筛选" placeholder="搜索账号或显示名称">
              <el-option v-for="option in store.consumptionFilterOptions.consumingOwners" :key="option.id" :label="option.label" :value="option.id" />
            </el-select>
          </label>
          <label class="filter-field"><span>样品日期范围</span><el-date-picker v-model="filters.dateRange" type="daterange" value-format="YYYY-MM-DD" aria-label="样品日期范围" start-placeholder="样品开始日期" end-placeholder="样品结束日期" /></label>
          <label class="filter-field"><span>消费/冲正状态</span><el-select v-model="filters.status" data-testid="consumption-filter-status" clearable aria-label="消费或冲正状态" placeholder="全部状态">
              <el-option label="有效消费" value="ACTIVE" />
              <el-option label="已冲正及冲正流水" value="REVERSED" />
            </el-select></label>
          <label class="filter-field"><span>结算状态</span><el-select v-model="filters.payableStatus" data-testid="consumption-filter-payable" clearable aria-label="结算状态" placeholder="全部结算状态">
              <el-option label="待结算" value="PENDING" />
              <el-option label="已进入结算单 / 待确认" value="HELD" />
              <el-option label="已完成" value="COMPLETED" />
              <el-option label="已冲正" value="REVERSED" />
            </el-select></label>
          <el-button data-testid="consumption-filter-submit" type="primary" :loading="store.loadingByPage.consumptions" @click="applyFilters">查询</el-button>
          <el-button :loading="store.loadingByPage.consumptions" @click="loadPageData(store.consumptionsPage.page)">刷新</el-button>
        </div>
      </div>

      <MobileFilterDrawer
        v-if="isMobileLayout"
        v-model="mobileFilterOpen"
        data-testid="mobile-consumption-filter"
        title="筛选消费明细"
        :summary="consumptionFilterSummary"
        fullscreen
        @apply="applyMobileFilters"
        @reset="resetConsumptionFilters"
      >
        <div class="mobile-consumption-filter-fields">
          <label class="filter-field"><span>会员手机号</span><el-input v-model="filters.phone" data-testid="consumption-filter-phone" inputmode="tel" /></label>
          <label class="filter-field"><span>充值来源账号</span><el-select v-model="filters.sourceOwnerId" data-testid="consumption-filter-source" filterable clearable><el-option v-for="option in store.consumptionFilterOptions.sourceOwners" :key="option.id" :label="option.label" :value="option.id" /></el-select></label>
          <label class="filter-field"><span>消费账号</span><el-select v-model="filters.consumingFrontendUserId" data-testid="consumption-filter-consumer" filterable clearable><el-option v-for="option in store.consumptionFilterOptions.consumingOwners" :key="option.id" :label="option.label" :value="option.id" /></el-select></label>
          <label class="filter-field"><span>样品日期范围</span><el-date-picker v-model="filters.dateRange" type="daterange" value-format="YYYY-MM-DD" /></label>
          <label class="filter-field"><span>消费/冲正状态</span><el-select v-model="filters.status" data-testid="consumption-filter-status" clearable><el-option label="有效消费" value="ACTIVE" /><el-option label="已冲正及冲正流水" value="REVERSED" /></el-select></label>
          <label class="filter-field"><span>结算状态</span><el-select v-model="filters.payableStatus" data-testid="consumption-filter-payable" clearable><el-option label="待结算" value="PENDING" /><el-option label="已进入结算单" value="HELD" /><el-option label="已完成" value="COMPLETED" /><el-option label="已冲正" value="REVERSED" /></el-select></label>
        </div>
      </MobileFilterDrawer>

      <el-alert v-if="realtime.hasPendingRefresh.value" class="consumption-alert" type="warning" :closable="false" show-icon title="共享消费明细已变化">
        <template #default><el-button link type="primary" @click="realtime.retryRefresh">立即刷新</el-button></template>
      </el-alert>
      <el-alert
        v-if="filterError"
        data-testid="consumption-filter-error"
        class="consumption-alert"
        type="error"
        :closable="false"
        show-icon
        :title="filterError"
      />
      <el-alert v-if="mutationError" data-testid="consumption-mutation-error" class="consumption-alert" type="error" :closable="false" show-icon :title="mutationError" />
      <el-alert v-if="store.errorsByPage.consumptions" class="consumption-alert" type="error" :closable="false" show-icon :title="store.errorsByPage.consumptions">
        <template #default><el-button link type="primary" @click="loadPageData(store.consumptionsPage.page)">重试</el-button></template>
      </el-alert>

      <div v-if="isMobileLayout" class="mobile-consumption-list" aria-live="polite">
        <article v-for="row in store.consumptionsPage.items" :key="row.id" data-testid="mobile-consumption-card" class="mobile-consumption-card">
          <header><div><strong>{{ row.phoneSnapshot }}</strong><p>{{ row.sampleNumberSnapshot || '无样品编号' }} · {{ row.sampleCountSnapshot }} 个样品</p></div><el-tag :type="row.kind === 'REVERSAL' ? 'info' : 'success'">{{ row.kind === 'REVERSAL' ? '冲正流水' : '消费' }}</el-tag></header>
          <div class="mobile-consumption-summary"><span>消费金额<strong>¥{{ prepaidMoney(row.amount) }}</strong></span><span>跨账号应转<strong>¥{{ prepaidMoney(payableTotal(row)) }}</strong></span></div>
          <p>充值来源 {{ sourceOwnerLabels(row) }}</p><p>消费账号 {{ prepaidAccountLabel(row.consumingFrontendUser) }}</p><p>{{ row.sheetDate }} · {{ prepaidFormatElements(row.elementsSnapshot) }} · {{ rowStatus(row) }}</p>
          <button data-testid="mobile-consumption-toggle" class="mobile-touch-target mobile-consumption-toggle" type="button" :aria-expanded="expandedConsumptionId === row.id" @click="toggleConsumption(row.id)">{{ expandedConsumptionId === row.id ? '收起审计明细' : '展开审计明细' }}</button>
          <section v-if="expandedConsumptionId === row.id" class="mobile-consumption-detail">
            <div class="audit-identity"><strong>{{ row.kind === 'REVERSAL' ? '冲正流水' : '消费流水' }} {{ row.id }}</strong><span v-if="row.reversalOfId">原消费流水 {{ row.reversalOfId }}</span></div>
            <h3>充值来源与分摊</h3><article v-for="allocation in row.allocations" :key="allocation.id" class="allocation-card"><strong>充值批次 {{ allocation.rechargeId }}</strong><span>分摊价值 ¥{{ prepaidMoney(allocation.allocatedAmount) }}</span><span>分摊本金 ¥{{ prepaidMoney(allocatedPaid(allocation)) }}</span><span>分摊赠送 ¥{{ prepaidMoney(allocatedGift(allocation)) }}</span></article>
            <h3>账号间应转</h3><article v-for="payable in row.payables" :key="payable.id" class="payable-card"><span>{{ prepaidAccountLabel(payable.sourceOwner) }} → {{ prepaidAccountLabel(payable.consumerOwner) }}</span><strong>应转金额 ¥{{ prepaidMoney(payable.amount) }}</strong><span>{{ payableStatusLabel(payable.status) }}</span></article>
            <template v-if="row.originalPayables.length"><h3>原消费应转明细</h3><article v-for="payable in row.originalPayables" :key="payable.id" class="payable-card"><strong>原应转金额 ¥{{ prepaidMoney(payable.amount) }}</strong><span>{{ payableStatusLabel(payable.status) }}</span></article></template>
          </section>
          <el-button v-if="canReverseConsumption(row)" :data-testid="`reverse-consumption-${row.id}`" class="mobile-touch-target" type="warning" plain @click="reverseConsumption(row)">冲正</el-button>
        </article>
        <el-empty v-if="!store.loadingByPage.consumptions && !store.consumptionsPage.items.length" description="暂无符合条件的消费明细" />
      </div>
      <el-table v-else :data="store.consumptionsPage.items" border v-loading="store.loadingByPage.consumptions" empty-text="暂无符合条件的消费明细">
        <el-table-column type="expand" width="46">
          <template #default="{ row }">
            <div class="consumption-detail">
              <div class="audit-identity">
                <strong>{{ row.kind === 'REVERSAL' ? '冲正流水' : '消费流水' }} {{ row.id }}</strong>
                <span v-if="row.reversalOfId">原消费流水 {{ row.reversalOfId }}</span>
                <span>{{ row.allocationOrigin === 'REVERSAL_TARGET' ? '分摊来自原消费' : '本流水直接分摊' }} {{ row.allocationSourceConsumptionId }}</span>
              </div>
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
                  <div>充值来源账号 {{ prepaidAccountLabel(allocation.sourceOwner) }}</div>
                  <div>充值日期 {{ allocation.recharge.rechargeDate }}，批次创建 {{ prepaidPreciseDateTime(allocation.recharge.createdAt) }}</div>
                  <div>批次原始：本金 ¥{{ prepaidMoney(allocation.recharge.paidAmount) }} + 赠送 ¥{{ prepaidMoney(allocation.recharge.giftAmount) }}</div>
                  <div>分摊价值 ¥{{ prepaidMoney(allocation.allocatedAmount) }}</div>
                  <div>分摊本金 ¥{{ prepaidMoney(allocatedPaid(allocation)) }}</div>
                  <div>分摊赠送 ¥{{ prepaidMoney(allocatedGift(allocation)) }}</div>
                  <div>本金比例 {{ percent(allocation.paidRatio) }}</div>
                  <div>未舍入应转值 {{ preciseMoney(allocation.exactTransferAmount) }}</div>
                  <div>分摊创建时间 {{ prepaidPreciseDateTime(allocation.createdAt) }}</div>
                </article>
              </div>
              <el-empty v-else :image-size="48" description="该记录无充值分摊" />

              <h3>账号间应转明细</h3>
              <div v-if="row.payables.length" class="payable-list">
                <article v-for="payable in row.payables" :key="payable.id" class="payable-card">
                  <span>充值来源账号 {{ prepaidAccountLabel(payable.sourceOwner) }}</span>
                  <span>消费账号 {{ prepaidAccountLabel(payable.consumerOwner) }}</span>
                  <span>精确本金值 {{ preciseMoney(payable.exactAmount) }}</span>
                  <strong>应转金额 ¥{{ prepaidMoney(payable.amount) }}</strong>
                  <el-tag :type="payableTagType(payable.status)">{{ payableStatusLabel(payable.status) }}</el-tag>
                  <span>应转创建时间 {{ prepaidPreciseDateTime(payable.createdAt) }}</span>
                </article>
              </div>
              <p v-else class="muted">使用消费账号自有额度，无跨账号应转金额。</p>

              <template v-if="row.originalPayables.length">
                <h3>原消费应转明细（仅审计展示，不计入本冲正流水合计）</h3>
                <div class="payable-list">
                  <article v-for="payable in row.originalPayables" :key="payable.id" class="payable-card">
                    <span>充值来源账号 {{ prepaidAccountLabel(payable.sourceOwner) }}</span>
                    <span>消费账号 {{ prepaidAccountLabel(payable.consumerOwner) }}</span>
                    <span>精确本金值 {{ preciseMoney(payable.exactAmount) }}</span>
                    <strong>原应转金额 ¥{{ prepaidMoney(payable.amount) }}</strong>
                    <el-tag :type="payableTagType(payable.status)">{{ payableStatusLabel(payable.status) }}</el-tag>
                    <span>原应转创建时间 {{ prepaidPreciseDateTime(payable.createdAt) }}</span>
                  </article>
                </div>
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phoneSnapshot" label="会员手机号" width="145" />
        <el-table-column label="类型" width="95"><template #default="{ row }">{{ row.kind === 'REVERSAL' ? '冲正流水' : '消费' }}</template></el-table-column>
        <el-table-column align="right" label="消费金额" width="115"><template #default="{ row }">¥{{ prepaidMoney(row.amount) }}</template></el-table-column>
        <el-table-column label="本流水跨账号应转" width="150"><template #default="{ row }">¥{{ prepaidMoney(payableTotal(row)) }}</template></el-table-column>
        <el-table-column label="充值来源账号" min-width="190"><template #default="{ row }">{{ sourceOwnerLabels(row) }}</template></el-table-column>
        <el-table-column label="消费账号" min-width="180"><template #default="{ row }">{{ prepaidAccountLabel(row.consumingFrontendUser) }}</template></el-table-column>
        <el-table-column label="实际操作账号" min-width="180"><template #default="{ row }">{{ prepaidAccountLabel(row.actorUser) }}</template></el-table-column>
        <el-table-column prop="sampleNumberSnapshot" label="样品编号" width="115" />
        <el-table-column align="right" prop="sampleCountSnapshot" label="样品数量" width="100" />
        <el-table-column label="检测元素" min-width="180"><template #default="{ row }">{{ prepaidFormatElements(row.elementsSnapshot) }}</template></el-table-column>
        <el-table-column prop="sheetDate" label="样品日期" width="120" />
        <el-table-column label="实际消费时间" width="185"><template #default="{ row }">{{ prepaidPreciseDateTime(row.createdAt) }}</template></el-table-column>
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

import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useSharedPrepaidRealtimeRegistration } from '@/composables/useSharedPrepaidRealtime'
import { useAuthStore } from '@/stores/auth'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import type {
  PrepaidConsumptionListAllocationRow,
  PrepaidConsumptionListRow,
  PrepaidConsumptionQuery,
  PrepaidPayableStatus
} from '@/types/sharedPrepaid'
import {
  prepaidAccountLabel,
  prepaidErrorMessage,
  prepaidFormatElements,
  prepaidIsConflict,
  prepaidIsMessageBoxDismissed,
  prepaidMoney,
  prepaidNormalizePhoneSearch,
  prepaidPreciseDateTime
} from '@/utils/sharedPrepaidPresentation'

defineOptions({ name: 'PrepaidConsumptionsPage' })

const pageSize = 20
const store = useSharedPrepaidStore()
const auth = useAuthStore()
const { isMobileLayout } = useMobileLayout()
const mutationError = ref('')
const filterError = ref('')
const mobileFilterOpen = ref(false)
const expandedConsumptionId = ref('')
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
const consumptionFilterSummary = computed(() => {
  const count = [filters.phone, filters.sourceOwnerId, filters.consumingFrontendUserId, filters.dateRange.length ? '日期' : '', filters.status, filters.payableStatus].filter(Boolean).length
  return count ? `已启用 ${count} 项筛选` : '全部消费与冲正'
})
const realtime = useSharedPrepaidRealtimeRegistration('consumptions', {
  isDirty: () => false,
  refresh: () => loadPageData(store.consumptionsPage.page)
})

onMounted(() => void loadPageData())

function consumptionQuery(page = 1): PrepaidConsumptionQuery {
  const [startDate, endDate] = filters.dateRange
  const phone = prepaidNormalizePhoneSearch(filters.phone)
  return {
    page,
    pageSize,
    ...(phone ? { phone } : {}),
    ...(filters.sourceOwnerId.trim() ? { sourceOwnerId: filters.sourceOwnerId.trim() } : {}),
    ...(filters.consumingFrontendUserId.trim() ? { consumingFrontendUserId: filters.consumingFrontendUserId.trim() } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.payableStatus ? { payableStatus: filters.payableStatus } : {})
  }
}

async function loadConsumptions(page = 1) {
  let query: PrepaidConsumptionQuery
  try {
    query = consumptionQuery(page)
    filterError.value = ''
  } catch (error) {
    filterError.value = prepaidErrorMessage(error, '会员手机号格式错误')
    return
  }
  try {
    await store.loadConsumptions(query)
  } catch {
    // Store exposes the persistent error and retains the exact active filters.
  }
}

async function loadPageData(page = 1) {
  await Promise.allSettled([
    store.loadConsumptionFilterOptions(),
    loadConsumptions(page)
  ])
}

function applyFilters() {
  return loadConsumptions(1)
}

async function applyMobileFilters() {
  await applyFilters()
  if (!filterError.value) mobileFilterOpen.value = false
}

function resetConsumptionFilters() {
  Object.assign(filters, { phone: '', sourceOwnerId: '', consumingFrontendUserId: '', dateRange: [], status: '', payableStatus: '' })
  return applyMobileFilters()
}

function toggleConsumption(id: string) {
  expandedConsumptionId.value = expandedConsumptionId.value === id ? '' : id
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
    await loadPageData(store.consumptionsPage.page)
    ElMessage.success('消费冲正流水已创建')
  } catch (error) {
    if (!prepaidIsMessageBoxDismissed(error)) {
      mutationError.value = prepaidIsConflict(error)
        ? `${prepaidErrorMessage(error, '消费或结算状态已变化')}，本次冲正未生效，请刷新后核对再重试。`
        : prepaidErrorMessage(error, '消费冲正失败')
    }
  }
}

function sourceOwnerLabels(row: PrepaidConsumptionListRow) {
  const labels = new Map(row.allocations.map((allocation) => [allocation.sourceOwnerId, prepaidAccountLabel(allocation.sourceOwner)]))
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

function preciseMoney(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') : '0'
}

function percent(value: unknown) {
  const ratio = Number(value)
  return Number.isFinite(ratio) ? `${(ratio * 100).toFixed(4)}%` : '0%'
}

</script>

<style scoped>
.consumption-header { align-items: flex-start; }
.filter-body { padding-bottom: 0; }
.consumption-filters { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 10px; }
.filter-field { display: grid; gap: 4px; color: var(--ui-text-secondary); font-size: 12px; }
.filter-field :deep(.el-input), .filter-field :deep(.el-select) { width: 100%; }
.consumption-filters :deep(.el-date-editor) { width: 100%; }
.consumption-alert { margin: 14px 16px 0; }
.consumption-detail { display: grid; gap: 12px; padding: 12px 16px 18px 58px; }
.audit-identity { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 10px 12px; background: var(--ui-warning-soft); border: 1px solid var(--ui-warning-line); border-radius: 8px; color: var(--ui-warning); }
.consumption-detail h3 { margin: 4px 0 0; font-size: 14px; }
.sample-detail-grid { display: flex; flex-wrap: wrap; gap: 8px 18px; color: var(--ui-text-secondary); font-size: 13px; }
.allocation-list, .payable-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.allocation-card, .payable-card { display: grid; gap: 5px; padding: 12px; background: var(--ui-surface-subtle); border: 1px solid var(--ui-line); border-radius: 8px; font-size: 13px; }
.allocation-card > div:first-child, .payable-card { align-items: center; }
.allocation-card :deep(.el-tag) { margin-left: 8px; }
.prepaid-pagination { display: flex; justify-content: flex-end; padding: 14px 16px; }
.mobile-consumption-filter-fields, .mobile-consumption-list, .mobile-consumption-detail { display: grid; gap: 12px; }
.mobile-consumption-filter-fields :deep(.el-input), .mobile-consumption-filter-fields :deep(.el-select), .mobile-consumption-filter-fields :deep(.el-date-editor) { width: 100%; min-height: 44px; }
.mobile-consumption-list { padding: 12px; }
.mobile-consumption-card { display: grid; gap: 9px; padding: 14px; border: 1px solid var(--ui-line); border-radius: 12px; background: #fff; }
.mobile-consumption-card > header { display: flex; justify-content: space-between; gap: 8px; }
.mobile-consumption-card p { margin: 0; color: var(--ui-text-muted); font-size: 13px; overflow-wrap: anywhere; }
.mobile-consumption-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.mobile-consumption-summary span { display: grid; gap: 3px; padding: 9px; border-radius: 8px; background: var(--ui-surface-subtle); color: var(--ui-text-muted); font-size: 12px; }
.mobile-consumption-summary strong { color: var(--ui-text); font-size: 15px; }
.mobile-consumption-toggle { width: 100%; border: 1px solid var(--ui-accent-line); border-radius: 8px; background: var(--ui-accent-soft); color: var(--ui-accent-hover); }
.mobile-consumption-detail { padding-top: 4px; }
@media (max-width: 1000px) { .consumption-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } .allocation-list, .payable-list { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .consumption-filters { grid-template-columns: 1fr; } .consumption-detail { padding-left: 14px; } }
</style>
