<template>
  <div class="settlements-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">共享预存款</p>
        <h1>转账结算</h1>
        <p>双向毛额明细始终保留展示；净额仅用于确定最终付款方和实际转账金额。</p>
      </div>
      <el-button :loading="store.loadingByPage.settlements" @click="loadPageData()">刷新</el-button>
    </header>

    <el-alert
      v-if="!isMainAccount"
      type="info"
      :closable="false"
      title="子账号仅可查看，结算操作由主账号完成。"
    />
    <el-alert
      v-if="realtime.hasPendingRefresh.value"
      data-testid="settlement-refresh-prompt"
      type="warning"
      :closable="false"
      title="结算数据已有更新，已保留当前勾选和输入；请提交或清空草稿后刷新。"
    >
      <template #default>
        <el-button link type="primary" :disabled="store.dirtyByPage.settlements" @click="realtime.retryRefresh">立即刷新</el-button>
      </template>
    </el-alert>
    <el-alert
      v-if="mutationError"
      data-testid="settlement-mutation-error"
      type="error"
      :closable="false"
      :title="mutationError"
    />
    <el-alert
      v-if="store.errorsByPage.settlements"
      type="error"
      :closable="false"
      :title="store.errorsByPage.settlements"
    />

    <section class="panel">
      <div class="section-heading">
        <div><h2>应转明细</h2><p>仅“待结算”且从未关联结算单的明细可勾选；其他状态保留用于审计。</p></div>
        <el-button v-if="store.settlementSelection.length" @click="clearSelection">清空已选</el-button>
      </div>
      <form class="filters" @submit.prevent="loadPayables(1)">
        <label>会员手机号<input v-model="payableFilters.phone" aria-label="会员手机号筛选" placeholder="支持部分手机号"></label>
        <label>方向
          <select v-model="payableFilters.direction" aria-label="应转方向筛选">
            <option value="">全部方向</option><option value="OUTGOING">我方应付</option><option value="INCOMING">对方应付</option>
          </select>
        </label>
        <label>状态
          <select v-model="payableFilters.status" aria-label="应转状态筛选">
            <option value="">全部状态</option><option value="PENDING">待结算</option><option value="HELD">结算占用中</option>
            <option value="COMPLETED">已完成</option><option value="REVERSED">已冲正</option>
          </select>
        </label>
        <label>开始日期<input v-model="payableFilters.startDate" aria-label="应转开始日期" type="date"></label>
        <label>结束日期<input v-model="payableFilters.endDate" aria-label="应转结束日期" type="date"></label>
        <el-button native-type="submit" type="primary">筛选</el-button>
      </form>

      <p v-if="store.loadingByPage.settlements && !store.settlementPayablesPage.items.length" role="status">正在加载应转明细…</p>
      <el-empty v-else-if="!counterpartyGroups.length" description="暂无符合条件的应转明细" />
      <div v-else class="counterparty-groups">
        <section v-for="group in counterpartyGroups" :key="group.id" class="counterparty-group">
          <h3>与 {{ accountLabel(group.account) }}结算</h3>
          <GrossDirectionTable title="A应付B" :rows="group.outgoing" />
          <GrossDirectionTable title="B应付A" :rows="group.incoming" />
        </section>
      </div>

      <div data-testid="payables-pagination" class="pagination-row">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="store.settlementPayablesPage.total"
          :page-size="payablePageSize"
          :current-page="store.settlementPayablesPage.page"
          @current-change="loadPayables"
        />
      </div>

      <section v-if="store.settlementPreview" data-testid="settlement-preview" class="net-preview" aria-live="polite">
        <div><strong>{{ `A应付B ¥${money1(store.settlementPreview.aToBAmount)}` }}</strong></div>
        <div><strong>{{ `B应付A ¥${money1(store.settlementPreview.bToAAmount)}` }}</strong></div>
        <div><strong>{{ `抵扣金额 ¥${previewOffset}` }}</strong></div>
        <div><strong>{{ `实际转账金额 ¥${money1(store.settlementPreview.netAmount)}` }}</strong></div>
        <p v-if="isZeroPreview">无需转账，需双方主账号核对。</p>
        <p v-else>
          付款方 {{ accountForId(store.settlementPreview.payerFrontendUserId) }}；
          收款方 {{ accountForId(store.settlementPreview.receiverFrontendUserId) }}。
        </p>
        <p v-if="!canCreatePreview && isMainAccount && !isZeroPreview">只有最终付款主账号可以创建该结算单。</p>
        <el-button
          v-if="isMainAccount"
          data-testid="settlement-create"
          type="primary"
          :disabled="!canCreatePreview"
          :loading="store.loadingByPage.settlements"
          @click="createSettlement"
        >{{ isZeroPreview ? '发起核对' : '创建结算单' }}</el-button>
      </section>
    </section>

    <section class="panel">
      <div class="section-heading"><div><h2>结算单历史</h2><p>包含付款、确认、驳回、取消、凭证和操作账号审计。</p></div></div>
      <form class="filters" @submit.prevent="loadSettlements(1)">
        <label>状态
          <select v-model="settlementFilters.status" aria-label="结算单状态筛选">
            <option value="">全部状态</option><option value="AWAITING_PAYMENT">待付款</option>
            <option value="AWAITING_RECEIPT">待确认</option><option value="COMPLETED">已完成</option>
            <option value="REJECTED">已驳回</option><option value="CANCELLED">已取消</option>
          </select>
        </label>
        <label>开始日期<input v-model="settlementFilters.startDate" aria-label="结算单开始日期" type="date"></label>
        <label>结束日期<input v-model="settlementFilters.endDate" aria-label="结算单结束日期" type="date"></label>
        <el-button native-type="submit" type="primary">筛选</el-button>
      </form>
      <el-table v-loading="store.loadingByPage.settlements" :data="store.settlementsPage.items" border empty-text="暂无结算单">
        <el-table-column prop="id" label="结算单" min-width="220" />
        <el-table-column label="双方账号" min-width="260"><template #default="{ row }">{{ accountLabel(row.accountA) }} ↔ {{ accountLabel(row.accountB) }}</template></el-table-column>
        <el-table-column label="A应付B" width="105"><template #default="{ row }">¥{{ money1(row.aToBAmount) }}</template></el-table-column>
        <el-table-column label="B应付A" width="105"><template #default="{ row }">¥{{ money1(row.bToAAmount) }}</template></el-table-column>
        <el-table-column label="净额" width="105"><template #default="{ row }">¥{{ money1(row.netAmount) }}</template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }">{{ settlementStatusLabel(row.status) }}</template></el-table-column>
        <el-table-column label="创建时间" width="180"><template #default="{ row }">{{ preciseDateTime(row.createdAt) }}</template></el-table-column>
        <el-table-column label="详情" width="90"><template #default="{ row }"><el-button link type="primary" :data-testid="`settlement-detail-${row.id}`" @click="openDetail(row.id)">查看</el-button></template></el-table-column>
      </el-table>
      <div data-testid="settlements-pagination" class="pagination-row">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="store.settlementsPage.total"
          :page-size="settlementPageSize"
          :current-page="store.settlementsPage.page"
          @current-change="loadSettlements"
        />
      </div>
    </section>

    <PrepaidSettlementDetailDialog
      v-model="detailOpen"
      :settlement="store.selectedSettlement"
      @changed="handleSettlementChanged"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref } from 'vue'

import PrepaidSettlementDetailDialog from '@/components/prepaid/PrepaidSettlementDetailDialog.vue'
import { useSharedPrepaidRealtimeRegistration } from '@/composables/useSharedPrepaidRealtime'
import { useAuthStore } from '@/stores/auth'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import type {
  PrepaidAccountRow,
  PrepaidPayableStatus,
  PrepaidSettlementPayableDirection,
  PrepaidSettlementPayableListRow,
  PrepaidSettlementQuery,
  PrepaidSettlementStatus
} from '@/types/sharedPrepaid'
import {
  prepaidAccountLabel,
  prepaidErrorMessage,
  prepaidFormatElements,
  prepaidIsConflict,
  prepaidPreciseDateTime
} from '@/utils/sharedPrepaidPresentation'

defineOptions({ name: 'PrepaidSettlementsPage' })

const payablePageSize = 20
const settlementPageSize = 20
const store = useSharedPrepaidStore()
const auth = useAuthStore()
const mutationError = ref('')
const detailOpen = ref(false)
const activeCounterpartyId = ref('')
const payableFilters = reactive<{
  phone: string
  direction: PrepaidSettlementPayableDirection | ''
  status: PrepaidPayableStatus | ''
  startDate: string
  endDate: string
}>({ phone: '', direction: '', status: '', startDate: '', endDate: '' })
const settlementFilters = reactive<{
  status: PrepaidSettlementStatus | ''
  startDate: string
  endDate: string
}>({ status: '', startDate: '', endDate: '' })

const ownerId = computed(() => auth.user?.dataOwnerId || auth.user?.id || '')
const isMainAccount = computed(() => Boolean(
  auth.user?.isFrontendMainAccount && auth.user.id === auth.user.dataOwnerId
))
const counterpartyGroups = computed(() => {
  const groups = new Map<string, { id: string; account: PrepaidAccountRow; outgoing: PrepaidSettlementPayableListRow[]; incoming: PrepaidSettlementPayableListRow[] }>()
  for (const row of store.settlementPayablesPage.items) {
    const account = row.direction === 'OUTGOING' ? row.consumerOwner : row.sourceOwner
    const group = groups.get(row.counterpartyFrontendUserId) ?? {
      id: row.counterpartyFrontendUserId, account, outgoing: [], incoming: []
    }
    group[row.direction === 'OUTGOING' ? 'outgoing' : 'incoming'].push(row)
    groups.set(group.id, group)
  }
  return [...groups.values()].sort((left, right) => accountLabel(left.account).localeCompare(accountLabel(right.account), 'zh-CN'))
})
const isZeroPreview = computed(() => toTenths(store.settlementPreview?.netAmount) === 0)
const previewOffset = computed(() => moneyTenths(Math.min(
  toTenths(store.settlementPreview?.aToBAmount),
  toTenths(store.settlementPreview?.bToAAmount)
)))
const canCreatePreview = computed(() => Boolean(
  store.settlementPreview && store.settlementSelection.length && isMainAccount.value && (
    isZeroPreview.value || store.settlementPreview.payerFrontendUserId === ownerId.value
  )
))

const realtime = useSharedPrepaidRealtimeRegistration('settlements', {
  isDirty: () => store.dirtyByPage.settlements,
  refresh: () => loadPageData(store.settlementPayablesPage.page, store.settlementsPage.page)
})

const GrossDirectionTable = defineComponent({
  name: 'GrossDirectionTable',
  props: {
    title: { type: String, required: true },
    rows: { type: Array as () => PrepaidSettlementPayableListRow[], required: true }
  },
  setup(tableProps) {
    return () => h('section', { class: 'gross-direction' }, [
      h('h4', tableProps.title),
      tableProps.rows.length
        ? h('div', { class: 'gross-lines' }, tableProps.rows.map((row) => h('article', {
            key: row.id,
            class: ['gross-line', { 'gross-line--unavailable': !row.eligible }]
          }, [
            h('label', { class: 'gross-line__select' }, [
              h('input', {
                type: 'checkbox',
                'data-testid': `payable-select-${row.id}`,
                'aria-label': `选择应转明细 ${row.id}`,
                checked: store.settlementSelection.includes(row.id),
                disabled: !isMainAccount.value || !row.eligible || (
                  Boolean(activeCounterpartyId.value) && activeCounterpartyId.value !== row.counterpartyFrontendUserId
                ),
                onChange: (event: Event) => togglePayable(row, (event.target as HTMLInputElement).checked)
              }),
              h('strong', `应转 ¥${money1(row.amount)}`)
            ]),
            h('span', `状态 ${payableStatusLabel(row.status)}`),
            h('span', `会员 ${row.consumption.phoneSnapshot}`),
            h('span', `样品编号 ${row.consumption.sampleNumberSnapshot || '无信息'}`),
            h('span', `样品数量 ${row.consumption.sampleCountSnapshot}`),
            h('span', `检测元素 ${prepaidFormatElements(row.consumption.elementsSnapshot)}`),
            h('span', `充值来源 ${accountLabel(row.sourceOwner)}`),
            h('span', `消费账号 ${accountLabel(row.consumerOwner)}`),
            h('span', `充值批次 ${row.consumption.rechargeBatches.map((batch) => batch.id).join('、') || '无信息'}`),
            h('span', `精确应转值 ${row.exactAmount}`),
            ...row.settlementAssociations.map((association) => h('span', { class: 'association' },
              `结算批次 ${association.settlementId} · ${settlementStatusLabel(association.status)}${association.releasedAt ? ' · 已释放' : ''}`
            ))
          ])))
        : h('p', { class: 'muted' }, '该方向暂无明细')
    ])
  }
})

onMounted(() => void loadPageData())

function payableQuery(page = 1) {
  return {
    page,
    pageSize: payablePageSize,
    ...(payableFilters.phone.trim() ? { phone: payableFilters.phone.trim() } : {}),
    ...(payableFilters.direction ? { direction: payableFilters.direction } : {}),
    ...(payableFilters.status ? { status: payableFilters.status } : {}),
    ...(payableFilters.startDate ? { startDate: payableFilters.startDate } : {}),
    ...(payableFilters.endDate ? { endDate: payableFilters.endDate } : {})
  }
}

function settlementQuery(page = 1): PrepaidSettlementQuery {
  return {
    page,
    pageSize: settlementPageSize,
    ...(settlementFilters.status ? { status: settlementFilters.status } : {}),
    ...(settlementFilters.startDate ? { startDate: settlementFilters.startDate } : {}),
    ...(settlementFilters.endDate ? { endDate: settlementFilters.endDate } : {})
  }
}

async function loadPayables(page = 1) {
  try { await store.loadSettlementPayables(payableQuery(page)) } catch { /* persistent store error */ }
}

async function loadSettlements(page = 1) {
  try { await store.loadSettlements(settlementQuery(page)) } catch { /* persistent store error */ }
}

async function loadPageData(payablePage = 1, settlementPage = 1) {
  await Promise.allSettled([loadPayables(payablePage), loadSettlements(settlementPage)])
}

async function togglePayable(row: PrepaidSettlementPayableListRow, checked: boolean) {
  mutationError.value = ''
  let ids = [...store.settlementSelection]
  if (checked) {
    if (activeCounterpartyId.value && activeCounterpartyId.value !== row.counterpartyFrontendUserId) ids = []
    activeCounterpartyId.value = row.counterpartyFrontendUserId
    if (!ids.includes(row.id)) ids.push(row.id)
  } else {
    ids = ids.filter((id) => id !== row.id)
    if (!ids.length) activeCounterpartyId.value = ''
  }
  store.setSettlementSelection(ids)
  if (!ids.length) return
  try {
    await store.previewSettlement(ids)
  } catch (error) {
    mutationError.value = prepaidErrorMessage(error, '无法预览所选结算明细')
  }
}

function clearSelection() {
  store.setSettlementSelection([])
  activeCounterpartyId.value = ''
  mutationError.value = ''
}

async function createSettlement() {
  if (!canCreatePreview.value) return
  mutationError.value = ''
  const selectedIds = [...store.settlementSelection]
  try {
    const row = await store.createSettlement(selectedIds)
    activeCounterpartyId.value = ''
    await loadPageData(1, 1)
    try {
      await store.loadSettlementDetail(row.id)
      detailOpen.value = true
    } catch {
      // The list remains usable when the detail refresh fails.
    }
  } catch (error) {
    if (prepaidIsConflict(error)) {
      mutationError.value = `${prepaidErrorMessage(error, '部分应转明细已变化')}，已保留了已选明细、预览和重试编号。`
      try { await store.refreshSelectedSettlementPayables(selectedIds) } catch { /* persistent store error */ }
    } else {
      mutationError.value = prepaidErrorMessage(error, '创建结算单失败')
    }
  }
}

async function openDetail(id: string) {
  mutationError.value = ''
  try {
    await store.loadSettlementDetail(id)
    detailOpen.value = true
  } catch (error) {
    mutationError.value = prepaidErrorMessage(error, '读取结算单失败')
  }
}

async function handleSettlementChanged(id: string) {
  await Promise.allSettled([
    store.loadSettlementDetail(id),
    loadPayables(store.settlementPayablesPage.page),
    loadSettlements(store.settlementsPage.page)
  ])
}

function accountForId(id: string | null) {
  if (!id) return '无'
  for (const row of store.settlementPayablesPage.items) {
    if (row.sourceOwner.id === id) return accountLabel(row.sourceOwner)
    if (row.consumerOwner.id === id) return accountLabel(row.consumerOwner)
  }
  return id
}

function accountLabel(account: PrepaidAccountRow | null) {
  return prepaidAccountLabel(account)
}

function preciseDateTime(value: string | null) {
  return prepaidPreciseDateTime(value)
}

function toTenths(value: unknown) {
  const normalized = String(value ?? 0).trim()
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return 0
  const [whole, fraction = ''] = normalized.split('.')
  return Number(whole) * 10 + Number((fraction + '0')[0])
}

function moneyTenths(value: number) {
  return (value / 10).toFixed(1)
}

function money1(value: unknown) {
  return moneyTenths(toTenths(value))
}

function payableStatusLabel(status: PrepaidPayableStatus) {
  return ({ PENDING: '待结算', HELD: '结算占用中', COMPLETED: '已完成', REVERSED: '已冲正' } as const)[status]
}

function settlementStatusLabel(status: PrepaidSettlementStatus) {
  return ({
    AWAITING_PAYMENT: '待付款', AWAITING_RECEIPT: '待确认', COMPLETED: '已完成（不可修改）',
    REJECTED: '已驳回', CANCELLED: '已取消'
  } as const)[status]
}
</script>

<style scoped>
.settlements-page { display: grid; gap: 18px; padding: 24px; }
.page-header, .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.page-header h1, .section-heading h2 { margin: 0; }
.page-header p, .section-heading p { margin: 6px 0 0; color: #64748b; }
.eyebrow { color: #c2410c !important; font-weight: 700; }
.panel { padding: 20px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; box-shadow: 0 8px 30px rgb(15 23 42 / 5%); }
.filters { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
.filters label { display: grid; gap: 5px; font-size: 13px; color: #475569; }
.filters input, .filters select { min-height: 36px; padding: 0 9px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; }
.counterparty-groups { display: grid; gap: 16px; }
.counterparty-group { padding: 16px; border: 1px solid #fed7aa; border-radius: 12px; background: #fffaf5; }
.counterparty-group > h3 { margin: 0 0 12px; }
.gross-direction { margin-top: 12px; }
.gross-direction h4 { margin: 0 0 8px; color: #9a3412; }
.gross-lines { display: grid; gap: 8px; }
.gross-line { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 14px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; }
.gross-line--unavailable { background: #f8fafc; color: #64748b; }
.gross-line__select { display: flex; gap: 8px; align-items: center; }
.association { grid-column: 1 / -1; color: #7c3aed; }
.muted { color: #64748b; }
.pagination-row { display: flex; justify-content: flex-end; margin-top: 14px; }
.net-preview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 18px; padding: 16px; border: 1px solid #fdba74; border-radius: 12px; background: #fff7ed; }
.net-preview > div { display: grid; gap: 4px; }
.net-preview p, .net-preview button { grid-column: 1 / -1; }
@media (max-width: 800px) {
  .settlements-page { padding: 14px; }
  .gross-line { grid-template-columns: 1fr; }
  .net-preview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
