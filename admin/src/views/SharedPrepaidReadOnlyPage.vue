<template>
  <div class="shared-prepaid-admin-page">
    <section class="panel page-heading">
      <div>
        <h3>{{ currentNavigation.label }}</h3>
        <p>后台只读镜像：数据由前台共享预存款账本生成，此处不提供业务变更。</p>
      </div>
      <el-tag type="info" effect="plain">后台只读</el-tag>
    </section>

    <section class="panel filter-panel">
      <div class="filters">
        <el-select v-model="selectedFrontendUserIds" multiple filterable collapse-tags placeholder="选择前端账号">
          <el-option
            v-for="account in accounts"
            :key="account.id"
            :label="accountOptionLabel(account)"
            :value="account.id"
          />
        </el-select>
        <el-input
          v-if="page !== 'settlements'"
          v-model="filters.phone"
          clearable
          placeholder="会员手机号"
        />
        <el-select
          v-if="page === 'recharges'"
          v-model="filters.ownerFrontendUserId"
          clearable
          placeholder="充值归属账号"
        >
          <el-option v-for="account in accounts" :key="account.id" :label="accountOptionLabel(account)" :value="account.id" />
        </el-select>
        <template v-if="page === 'consumptions'">
          <el-select v-model="filters.sourceOwnerId" clearable placeholder="资金来源账号">
            <el-option v-for="account in accounts" :key="account.id" :label="accountOptionLabel(account)" :value="account.id" />
          </el-select>
          <el-select v-model="filters.consumingFrontendUserId" clearable placeholder="消费账号">
            <el-option v-for="account in accounts" :key="account.id" :label="accountOptionLabel(account)" :value="account.id" />
          </el-select>
        </template>
        <el-select
          v-if="page === 'settlements'"
          v-model="filters.counterpartyFrontendUserId"
          clearable
          placeholder="结算参与账号"
        >
          <el-option v-for="account in accounts" :key="account.id" :label="accountOptionLabel(account)" :value="account.id" />
        </el-select>
        <el-select v-if="page !== 'members'" v-model="filters.status" clearable placeholder="全部状态">
          <el-option v-for="option in statusOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-select
          v-if="page === 'consumptions'"
          v-model="filters.payableStatus"
          clearable
          placeholder="结算明细状态"
        >
          <el-option v-for="option in payableStatusOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-select
          v-if="page === 'recharges'"
          v-model="filters.openingBalanceFilter"
          clearable
          placeholder="全部批次"
        >
          <el-option label="期初批次" value="true" />
          <el-option label="普通批次" value="false" />
        </el-select>
        <el-date-picker
          v-if="page !== 'members'"
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
        <el-button type="primary" :loading="loading" @click="loadPage(1)">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
        <el-button data-testid="shared-prepaid-export" @click="exportCurrentPage">导出当前页</el-button>
      </div>
    </section>

    <el-alert
      v-if="error"
      data-testid="shared-prepaid-load-error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    >
      <template #default>
        <el-button data-testid="shared-prepaid-retry" link type="primary" @click="loadPage(currentPage)">重试</el-button>
      </template>
    </el-alert>

    <section v-loading="loading" class="panel data-panel">
      <el-table :data="rows" border empty-text="暂无数据">
        <template v-if="page === 'recharges'">
          <el-table-column prop="phone" label="会员手机号" min-width="140" />
          <el-table-column label="充值本金" width="115"><template #default="{ row }">¥{{ money(row.paidAmount) }}</template></el-table-column>
          <el-table-column label="赠送金额" width="115"><template #default="{ row }">¥{{ money(row.giftAmount) }}</template></el-table-column>
          <el-table-column label="批次余额" width="115"><template #default="{ row }">¥{{ money(row.remainingAmount) }}</template></el-table-column>
          <el-table-column label="归属账号" min-width="180"><template #default="{ row }">{{ namedAccount(row.ownerUsername, row.ownerAccount) }}</template></el-table-column>
          <el-table-column label="操作账号" min-width="180"><template #default="{ row }">{{ namedAccount(row.actorUsername, row.actorAccount) }}</template></el-table-column>
          <el-table-column prop="rechargeDate" label="充值日期" width="120" />
          <el-table-column label="状态" width="105"><template #default="{ row }">{{ row.reversedAt ? '已冲正' : '有效' }}</template></el-table-column>
        </template>

        <template v-else-if="page === 'members'">
          <el-table-column prop="phone" label="会员手机号" min-width="140" />
          <el-table-column label="充值本金" width="115"><template #default="{ row }">¥{{ money(row.paidTotal) }}</template></el-table-column>
          <el-table-column label="赠送总额" width="115"><template #default="{ row }">¥{{ money(row.giftTotal) }}</template></el-table-column>
          <el-table-column label="消费总额" width="115"><template #default="{ row }">¥{{ money(row.consumedTotal) }}</template></el-table-column>
          <el-table-column label="当前余额" width="120"><template #default="{ row }"><strong>¥{{ money(row.balance) }}</strong></template></el-table-column>
          <el-table-column label="资金归属" min-width="260"><template #default="{ row }">{{ compositionLabel(row.ownerComposition) }}</template></el-table-column>
        </template>

        <template v-else-if="page === 'consumptions'">
          <el-table-column prop="phoneSnapshot" label="会员手机号" min-width="140" />
          <el-table-column prop="sampleNumberSnapshot" label="样品编号" min-width="130" />
          <el-table-column prop="sampleCountSnapshot" label="样品数量" width="100" />
          <el-table-column label="检测元素" min-width="180"><template #default="{ row }">{{ formatElements(row.elementsSnapshot) }}</template></el-table-column>
          <el-table-column label="消费金额" width="115"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
          <el-table-column label="消费账号" min-width="180"><template #default="{ row }">{{ accountLabel(row.consumingFrontendUser) }}</template></el-table-column>
          <el-table-column label="资金来源" min-width="220"><template #default="{ row }">{{ sourceOwnerLabels(row.sourceOwners, row.sourceOwnersTruncated) }}</template></el-table-column>
          <el-table-column label="状态" width="105"><template #default="{ row }">{{ consumptionStatus(row) }}</template></el-table-column>
        </template>

        <template v-else>
          <el-table-column prop="id" label="结算单" min-width="220" />
          <el-table-column label="双方账号" min-width="280"><template #default="{ row }">{{ accountLabel(row.accountA) }} ↔ {{ accountLabel(row.accountB) }}</template></el-table-column>
          <el-table-column label="A 应付 B" width="110"><template #default="{ row }">¥{{ money(row.aToBAmount) }}</template></el-table-column>
          <el-table-column label="B 应付 A" width="110"><template #default="{ row }">¥{{ money(row.bToAAmount) }}</template></el-table-column>
          <el-table-column label="双向总额" width="110"><template #default="{ row }">¥{{ money(row.grossAmount) }}</template></el-table-column>
          <el-table-column label="实际净额" width="110"><template #default="{ row }">¥{{ money(row.netAmount) }}</template></el-table-column>
          <el-table-column label="状态" width="120"><template #default="{ row }">{{ statusLabel(row.status) }}</template></el-table-column>
          <el-table-column label="创建时间" width="180"><template #default="{ row }">{{ preciseDateTime(row.createdAt) }}</template></el-table-column>
        </template>

        <el-table-column label="详情" width="90" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :data-testid="`shared-prepaid-detail-${row.id}`"
              @click="openDetail(row.id)"
            >查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="暂无符合条件的数据" />
      <div class="pagination-row">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="currentPage"
          @current-change="loadPage"
        />
      </div>
    </section>

    <el-drawer v-model="detailVisible" :title="`${currentNavigation.label}·审计详情`" size="min(760px, 92vw)">
      <p class="readonly-note">仅用于审计查看，记录及其冲正/结算关系不可在后台更改。</p>
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <el-descriptions v-else-if="detail" :column="1" border>
        <el-descriptions-item v-for="entry in detailEntries" :key="entry.key" :label="entry.label">
          <pre v-if="entry.multiline">{{ entry.value }}</pre>
          <template v-else>{{ entry.value }}</template>
        </el-descriptions-item>
      </el-descriptions>
      <section v-if="proofUrls.length" class="proof-section">
        <h4>转账凭证</h4>
        <div class="proof-grid">
          <a v-for="url in proofUrls" :key="url" :href="url" target="_blank" rel="noopener noreferrer">
            <el-image :src="url" fit="cover" :preview-src-list="proofUrls" />
          </a>
        </div>
      </section>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { getFrontendOptions } from '../api'
import { getAdminSharedPrepaidDetail, getAdminSharedPrepaidPage } from '../api/sharedPrepaid'
import {
  prepaidNavigation,
  resolvePrepaidPage,
  type SharedPrepaidAdminPage
} from '../config/prepaidNavigation'
import type { FrontendOption } from '../types'
import type {
  AdminSharedPrepaidAccount,
  AdminSharedPrepaidDetail,
  AdminSharedPrepaidListRow,
  AdminSharedPrepaidQuery,
  AdminSharedPrepaidStatus
} from '../types/sharedPrepaid'

defineOptions({ name: 'SharedPrepaidReadOnlyPage' })

const route = useRoute()
const pageSize = 20
const page = computed<SharedPrepaidAdminPage>(() => (
  route.meta.sharedPrepaidPage as SharedPrepaidAdminPage | undefined
) || resolvePrepaidPage(route.path))
const currentNavigation = computed(() => (
  prepaidNavigation.find((item) => item.page === page.value) || prepaidNavigation[0]
))
const accounts = ref<FrontendOption[]>([])
const selectedFrontendUserIds = ref<string[]>([])
const rows = ref<AdminSharedPrepaidListRow[]>([])
const total = ref(0)
const currentPage = ref(1)
const loading = ref(false)
const error = ref('')
const dateRange = ref<string[]>([])
const detailVisible = ref(false)
const detail = ref<AdminSharedPrepaidDetail | null>(null)
const detailError = ref('')
const filters = reactive({
  phone: '',
  ownerFrontendUserId: '',
  sourceOwnerId: '',
  consumingFrontendUserId: '',
  counterpartyFrontendUserId: '',
  status: '' as AdminSharedPrepaidStatus | '',
  payableStatus: '' as AdminSharedPrepaidStatus | '',
  openingBalanceFilter: '' as '' | 'true' | 'false'
})

const payableStatusOptions = [
  { label: '待结算', value: 'PENDING' },
  { label: '结算占用中', value: 'HELD' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '已冲正', value: 'REVERSED' }
] as const
const statusOptions = computed(() => {
  if (page.value === 'recharges') return [
    { label: '有效', value: 'ACTIVE' },
    { label: '已冲正', value: 'REVERSED' }
  ]
  if (page.value === 'consumptions') return [
    { label: '有效', value: 'ACTIVE' },
    { label: '已冲正', value: 'REVERSED' }
  ]
  return [
    { label: '待付款', value: 'AWAITING_PAYMENT' },
    { label: '待确认', value: 'AWAITING_RECEIPT' },
    { label: '已完成', value: 'COMPLETED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '已取消', value: 'CANCELLED' }
  ]
})
const proofUrls = computed(() => Array.isArray(detail.value?.proofUrls) ? detail.value.proofUrls : [])
const detailEntries = computed(() => {
  if (!detail.value) return []
  return Object.entries(detail.value)
    .filter(([key]) => key !== 'proofUrls')
    .map(([key, value]) => ({
      key,
      label: detailLabel(key),
      value: detailValue(key, value),
      multiline: Boolean(value && typeof value === 'object')
    }))
})

onMounted(async () => {
  try {
    accounts.value = await getFrontendOptions()
    selectedFrontendUserIds.value = accounts.value.map((account) => account.id)
    await loadPage(1)
  } catch (caught) {
    error.value = errorMessage(caught, '读取预存款数据失败')
  }
})

watch(
  () => route.meta.sharedPrepaidPage,
  () => {
    clearFilters()
    detailVisible.value = false
    void loadPage(1)
  }
)

function query(pageNumber: number): AdminSharedPrepaidQuery {
  const accountScope = selectedFrontendUserIds.value.length
    ? selectedFrontendUserIds.value
    : accounts.value.map((account) => account.id)
  const common = {
    frontendUserIds: accountScope,
    page: pageNumber,
    pageSize,
    ...(filters.phone.replace(/\D/g, '') ? { phone: filters.phone.replace(/\D/g, '') } : {}),
    ...(dateRange.value[0] ? { startDate: dateRange.value[0] } : {}),
    ...(dateRange.value[1] ? { endDate: dateRange.value[1] } : {})
  }
  if (page.value === 'recharges') return {
    ...common,
    ...(filters.ownerFrontendUserId ? { ownerFrontendUserId: filters.ownerFrontendUserId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.openingBalanceFilter ? { isOpeningBalance: filters.openingBalanceFilter === 'true' } : {})
  }
  if (page.value === 'consumptions') return {
    ...common,
    ...(filters.sourceOwnerId ? { sourceOwnerId: filters.sourceOwnerId } : {}),
    ...(filters.consumingFrontendUserId ? { consumingFrontendUserId: filters.consumingFrontendUserId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.payableStatus ? { payableStatus: filters.payableStatus } : {})
  }
  if (page.value === 'settlements') return {
    ...common,
    ...(filters.counterpartyFrontendUserId ? { counterpartyFrontendUserId: filters.counterpartyFrontendUserId } : {}),
    ...(filters.status ? { status: filters.status } : {})
  }
  return common
}

async function loadPage(pageNumber = 1) {
  loading.value = true
  error.value = ''
  try {
    const result = await getAdminSharedPrepaidPage(page.value, query(pageNumber))
    rows.value = result.items
    total.value = result.total
    currentPage.value = result.page
  } catch (caught) {
    rows.value = []
    total.value = 0
    error.value = errorMessage(caught, '读取预存款数据失败')
  } finally {
    loading.value = false
  }
}

function clearFilters() {
  filters.phone = ''
  filters.ownerFrontendUserId = ''
  filters.sourceOwnerId = ''
  filters.consumingFrontendUserId = ''
  filters.counterpartyFrontendUserId = ''
  filters.status = ''
  filters.payableStatus = ''
  filters.openingBalanceFilter = ''
  dateRange.value = []
}

function resetFilters() {
  clearFilters()
  selectedFrontendUserIds.value = accounts.value.map((account) => account.id)
  void loadPage(1)
}

async function openDetail(id: string) {
  detailVisible.value = true
  detail.value = null
  detailError.value = ''
  try {
    detail.value = await getAdminSharedPrepaidDetail(page.value, id, query(currentPage.value).frontendUserIds)
  } catch (caught) {
    detailError.value = errorMessage(caught, '读取审计详情失败')
  }
}

function exportCurrentPage() {
  const records = rows.value.map((row) => ({
    '类型': currentNavigation.value.label,
    '记录编号': row.id,
    '数据': JSON.stringify(row)
  }))
  const header = ['类型', '记录编号', '数据']
  const csv = [header, ...records.map((row) => header.map((key) => row[key as keyof typeof row]))]
    .map((line) => line.map(csvCell).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `shared-prepaid-${page.value}-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function accountOptionLabel(account: FrontendOption) {
  return namedAccount(account.name, account.account)
}

function namedAccount(name?: unknown, account?: unknown) {
  const display = String(name || '').trim()
  const accountName = String(account || '').trim()
  return display && accountName && display !== accountName ? `${display}（${accountName}）` : display || accountName || '无信息'
}

function accountLabel(account?: AdminSharedPrepaidAccount | null) {
  return namedAccount(account?.displayRemark || account?.username, account?.account)
}

function money(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00'
}

function preciseDateTime(value: unknown) {
  if (!value) return '无信息'
  const timestamp = new Date(String(value)).getTime()
  if (!Number.isFinite(timestamp)) return String(value)
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

function formatElements(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('、') || '无信息'
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join('、')
  return String(value || '无信息')
}

function compositionLabel(value: unknown) {
  if (!Array.isArray(value) || !value.length) return '无余额归属'
  return value.map((item) => {
    const row = item as { ownerDisplayName?: string; ownerAccount?: string; balance?: number }
    return `${namedAccount(row.ownerDisplayName, row.ownerAccount)} ¥${money(row.balance)}`
  }).join('；')
}

function sourceOwnerLabels(value: unknown, truncated: unknown) {
  if (!Array.isArray(value) || !value.length) return '无信息'
  const labels = [...new Set(value.map((item) => accountLabel(item as AdminSharedPrepaidAccount)))].join('、')
  return truncated ? `${labels}（仅显示前100个来源账号）` : labels
}

function consumptionStatus(row: Record<string, unknown>) {
  if (row.kind === 'REVERSAL') return '冲正流水'
  return row.active ? '有效' : '已冲正'
}

function statusLabel(value: unknown) {
  return ({
    ACTIVE: '有效', REVERSED: '已冲正', PENDING: '待结算', HELD: '结算占用中',
    COMPLETED: '已完成', AWAITING_PAYMENT: '待付款', AWAITING_RECEIPT: '待确认',
    REJECTED: '已驳回', CANCELLED: '已取消'
  } as Record<string, string>)[String(value)] || String(value || '无信息')
}

function detailLabel(key: string) {
  return ({
    id: '记录编号', phone: '会员手机号', phoneSnapshot: '会员手机号', paidAmount: '充值本金',
    giftAmount: '赠送金额', totalAmount: '批次总额', remainingAmount: '批次余额', balance: '当前余额',
    amount: '金额', sampleNumberSnapshot: '样品编号', sampleCountSnapshot: '样品数量', elementsSnapshot: '检测元素',
    status: '状态', aToBAmount: 'A 应付 B', bToAAmount: 'B 应付 A', grossAmount: '双向总额', netAmount: '实际净额',
    rejectionReason: '驳回原因', remark: '备注', reversalReason: '冲正原因', reversal: '冲正关系',
    allocations: '扣款批次与来源', payables: '应转明细', originalPayables: '原应转关系',
    lines: '结算明细', actions: '操作审计', recharges: '充值历史', consumptions: '消费与冲正历史',
    ledgerEntries: '账本审计历史', createdAt: '创建时间', updatedAt: '更新时间'
  } as Record<string, string>)[key] || key
}

function detailValue(key: string, value: unknown) {
  if (/Amount$|^amount$|^balance$|Total$/.test(key)) return `¥${money(value)}`
  if (key === 'status') return statusLabel(value)
  if (key.endsWith('At') || key === 'createdAt' || key === 'updatedAt') return preciseDateTime(value)
  if (key === 'elementsSnapshot') return formatElements(value)
  if (value === null || value === undefined || value === '') return '无信息'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function errorMessage(errorValue: unknown, fallback: string) {
  const responseMessage = (errorValue as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message
  const directMessage = (errorValue as { message?: unknown } | null)?.message
  return typeof responseMessage === 'string' ? responseMessage : typeof directMessage === 'string' ? directMessage : fallback
}
</script>

<style scoped>
.shared-prepaid-admin-page { display: grid; gap: 16px; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 20px; }
.page-heading h3 { margin: 0 0 8px; color: #1e293b; }
.page-heading p, .readonly-note { margin: 0; color: #64748b; }
.filter-panel { padding: 14px 16px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.filters :deep(.el-select), .filters :deep(.el-input) { width: 210px; }
.filters :deep(.el-date-editor) { width: 260px; }
.data-panel { overflow: hidden; }
.pagination-row { display: flex; justify-content: flex-end; padding: 14px 16px; }
.readonly-note { margin-bottom: 14px; }
.proof-section { margin-top: 20px; }
.proof-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.proof-grid :deep(.el-image) { width: 100%; height: 120px; border: 1px solid #e2e8f0; border-radius: 8px; }
pre { max-width: 100%; margin: 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
@media (max-width: 760px) {
  .page-heading { flex-direction: column; gap: 12px; }
  .filters :deep(.el-select), .filters :deep(.el-input), .filters :deep(.el-date-editor) { width: 100%; }
}
</style>
