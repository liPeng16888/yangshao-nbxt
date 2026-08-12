<template>
  <div class="page-stack prepaid-page">
    <section class="panel">
      <div class="panel__header customers-header">
        <div>
          <h2>全局预存款客户</h2>
          <p class="muted">同一标准化手机号全局唯一，余额可跨前端主账号共享查看。</p>
        </div>
        <div class="customer-filters">
          <label class="filter-field"><span>会员手机号筛选</span><el-input v-model="phoneFilter" data-testid="member-filter-phone" aria-label="会员手机号筛选" clearable placeholder="搜索会员手机号" @keyup.enter="applyFilter" /></label>
          <el-button data-testid="member-filter-submit" type="primary" :loading="store.loadingByPage.members" @click="applyFilter">查询</el-button>
          <el-button :loading="store.loadingByPage.members" @click="loadMembers(store.membersPage.page)">刷新</el-button>
        </div>
      </div>

      <el-alert v-if="realtime.hasPendingRefresh.value" class="customer-alert" type="warning" :closable="false" show-icon title="共享客户数据已更新">
        <template #default><el-button link type="primary" @click="realtime.retryRefresh">立即刷新</el-button></template>
      </el-alert>
      <el-alert
        v-if="filterError"
        data-testid="member-filter-error"
        class="customer-alert"
        type="error"
        :closable="false"
        show-icon
        :title="filterError"
      />
      <el-alert v-if="store.errorsByPage.members" class="customer-alert" type="error" :closable="false" show-icon :title="store.errorsByPage.members">
        <template #default><el-button link type="primary" @click="loadMembers(store.membersPage.page)">重试</el-button></template>
      </el-alert>

      <el-table :data="store.membersPage.items" border v-loading="store.loadingByPage.members" empty-text="暂无预存款客户">
        <el-table-column prop="phone" label="会员手机号" width="145" />
        <el-table-column label="充值本金" width="120"><template #default="{ row }">¥{{ prepaidMoney(row.paidTotal) }}</template></el-table-column>
        <el-table-column label="赠送总额" width="120"><template #default="{ row }">¥{{ prepaidMoney(row.giftTotal) }}</template></el-table-column>
        <el-table-column label="充值合计" width="120"><template #default="{ row }">¥{{ prepaidMoney(Number(row.paidTotal) + Number(row.giftTotal)) }}</template></el-table-column>
        <el-table-column label="消费总额" width="120"><template #default="{ row }">¥{{ prepaidMoney(row.consumedTotal) }}</template></el-table-column>
        <el-table-column label="当前余额" width="125"><template #default="{ row }"><strong>¥{{ prepaidMoney(row.balance) }}</strong></template></el-table-column>
        <el-table-column label="余额归属构成" min-width="240">
          <template #default="{ row }">
            <div v-if="row.ownerComposition.length" class="composition-list">
              <el-tag v-for="owner in row.ownerComposition" :key="owner.ownerFrontendUserId" type="info">
                {{ owner.ownerDisplayName }} / {{ owner.ownerAccount }} ¥{{ prepaidMoney(owner.balance) }}
              </el-tag>
            </div>
            <span v-else class="muted">暂无可用余额</span>
          </template>
        </el-table-column>
        <el-table-column label="最近充值时间" width="180"><template #default="{ row }">{{ prepaidPreciseDateTime(row.latestRechargeTime) }}</template></el-table-column>
        <el-table-column label="最近消费时间" width="180"><template #default="{ row }">{{ prepaidPreciseDateTime(row.latestConsumptionTime) }}</template></el-table-column>
        <el-table-column label="不可变历史" width="100" fixed="right">
          <template #default="{ row }"><el-button :data-testid="`member-detail-${row.id}`" link type="primary" @click="openDetail(row.id)">查看详情</el-button></template>
        </el-table-column>
      </el-table>
      <div class="prepaid-pagination">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :total="store.membersPage.total"
          :page-size="pageSize"
          :current-page="store.membersPage.page"
          @current-change="loadMembers"
        />
      </div>
    </section>

    <section v-if="store.selectedMember" class="panel member-detail" data-testid="member-detail">
      <div class="panel__header">
        <div>
          <h2>会员详情：{{ store.selectedMember.phone }}</h2>
          <p class="muted">所有充值、消费、分摊和冲正都是不可变审计历史，此处不提供直接修改或删除。</p>
        </div>
      </div>
      <div class="panel__body detail-stack">
        <div class="member-summary">
          <div><span>充值本金</span><strong>¥{{ prepaidMoney(store.selectedMember.paidTotal) }}</strong></div>
          <div><span>赠送总额</span><strong>¥{{ prepaidMoney(store.selectedMember.giftTotal) }}</strong></div>
          <div><span>充值合计</span><strong>¥{{ prepaidMoney(Number(store.selectedMember.paidTotal) + Number(store.selectedMember.giftTotal)) }}</strong></div>
          <div><span>消费总额</span><strong>¥{{ prepaidMoney(store.selectedMember.consumedTotal) }}</strong></div>
          <div><span>当前余额</span><strong>¥{{ prepaidMoney(store.selectedMember.balance) }}</strong></div>
        </div>

        <div>
          <h3>充值批次与剩余金额</h3>
          <el-table :data="store.selectedMember.recharges" border empty-text="暂无充值批次">
            <el-table-column label="类型" width="100"><template #default="{ row }">{{ row.isOpeningBalance ? '期初余额' : '普通充值' }}</template></el-table-column>
            <el-table-column label="充值本金" width="115"><template #default="{ row }">¥{{ prepaidMoney(row.paidAmount) }}</template></el-table-column>
            <el-table-column label="赠送金额" width="115"><template #default="{ row }">¥{{ prepaidMoney(row.giftAmount) }}</template></el-table-column>
            <el-table-column label="批次总额" width="115"><template #default="{ row }">¥{{ prepaidMoney(row.totalAmount) }}</template></el-table-column>
            <el-table-column label="剩余金额" width="115"><template #default="{ row }">¥{{ prepaidMoney(row.remainingAmount) }}</template></el-table-column>
            <el-table-column label="归属主账号" min-width="170"><template #default="{ row }">{{ prepaidAccountLabel({ username: row.ownerUsername, account: row.ownerAccount }) }}</template></el-table-column>
            <el-table-column label="实际操作账号" min-width="170"><template #default="{ row }">{{ prepaidAccountLabel({ username: row.actorUsername, account: row.actorAccount }) }}</template></el-table-column>
            <el-table-column prop="rechargeDate" label="充值日期" width="120" />
            <el-table-column label="精确录入时间" width="180"><template #default="{ row }">{{ prepaidPreciseDateTime(row.createdAt) }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }">{{ row.reversedAt ? '已冲正' : '有效' }}</template></el-table-column>
            <el-table-column prop="remark" label="备注" min-width="160" />
          </el-table>
          <el-button
            v-if="store.selectedMember.historyPagination.recharges.hasMore"
            data-testid="member-more-recharges"
            :loading="store.loadingByPage.members"
            @click="store.loadMoreMemberHistory('recharges')"
          >加载更多充值历史</el-button>
        </div>

        <div>
          <h3>消费与冲正历史</h3>
          <el-table :data="store.selectedMember.consumptions" border empty-text="暂无消费与冲正历史">
            <el-table-column label="类型" width="100"><template #default="{ row }">{{ row.kind === 'REVERSAL' ? '消费冲正' : '预存款消费' }}</template></el-table-column>
            <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ prepaidMoney(row.amount) }}</template></el-table-column>
            <el-table-column prop="sampleNumberSnapshot" label="样品编号" width="120" />
            <el-table-column prop="sampleCountSnapshot" label="样品数量" width="100" />
            <el-table-column label="检测元素" min-width="170"><template #default="{ row }">{{ prepaidFormatElements(row.elementsSnapshot) }}</template></el-table-column>
            <el-table-column label="消费账号" min-width="170"><template #default="{ row }">{{ prepaidAccountLabel(row.consumingFrontendUser) }}</template></el-table-column>
            <el-table-column label="实际操作账号" min-width="170"><template #default="{ row }">{{ prepaidAccountLabel(row.actorUser) }}</template></el-table-column>
            <el-table-column prop="sheetDate" label="样品日期" width="120" />
            <el-table-column label="精确时间" width="180"><template #default="{ row }">{{ prepaidPreciseDateTime(row.createdAt) }}</template></el-table-column>
            <el-table-column label="状态" width="110"><template #default="{ row }">{{ consumptionStatus(row) }}</template></el-table-column>
          </el-table>
          <el-button
            v-if="store.selectedMember.historyPagination.consumptions.hasMore"
            data-testid="member-more-consumptions"
            :loading="store.loadingByPage.members"
            @click="store.loadMoreMemberHistory('consumptions')"
          >加载更多消费历史</el-button>
        </div>

        <div>
          <h3>账本审计历史</h3>
          <el-table :data="store.selectedMember.ledgerEntries" border empty-text="暂无账本审计记录">
            <el-table-column label="流水类型" width="140"><template #default="{ row }">{{ ledgerKindLabel(row.kind) }}</template></el-table-column>
            <el-table-column label="余额变动" width="120"><template #default="{ row }">{{ signedMoney(row.balanceDelta) }}</template></el-table-column>
            <el-table-column prop="ownerFrontendUserId" label="资金归属主账号" min-width="160" />
            <el-table-column prop="actorUserId" label="实际操作账号" min-width="160" />
            <el-table-column prop="reason" label="原因" min-width="180" />
            <el-table-column label="精确审计时间" width="180"><template #default="{ row }">{{ prepaidPreciseDateTime(row.createdAt) }}</template></el-table-column>
          </el-table>
          <el-button
            v-if="store.selectedMember.historyPagination.ledgerEntries.hasMore"
            data-testid="member-more-ledger"
            :loading="store.loadingByPage.members"
            @click="store.loadMoreMemberHistory('ledgerEntries')"
          >加载更多账本历史</el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useSharedPrepaidRealtimeRegistration } from '@/composables/useSharedPrepaidRealtime'
import { useSharedPrepaidStore } from '@/stores/sharedPrepaid'
import type { PrepaidConsumptionRow, PrepaidLedgerKind } from '@/types/sharedPrepaid'
import {
  prepaidAccountLabel,
  prepaidErrorMessage,
  prepaidFormatElements,
  prepaidMoney,
  prepaidNormalizePhoneSearch,
  prepaidPreciseDateTime
} from '@/utils/sharedPrepaidPresentation'

defineOptions({ name: 'PrepaidCustomersPage' })

const pageSize = 20
const store = useSharedPrepaidStore()
const phoneFilter = ref('')
const filterError = ref('')

const realtime = useSharedPrepaidRealtimeRegistration('members', {
  isDirty: () => false,
  refresh: async () => {
    await loadMembers(store.membersPage.page)
    if (store.selectedMember) await store.loadMemberDetail(store.selectedMember.id)
  }
})

onMounted(() => void loadMembers())

async function loadMembers(page = 1) {
  let phone: string
  try {
    phone = prepaidNormalizePhoneSearch(phoneFilter.value)
    filterError.value = ''
  } catch (error) {
    filterError.value = prepaidErrorMessage(error, '会员手机号格式错误')
    return
  }
  try {
    await store.loadMembers({
      page,
      pageSize,
      ...(phone ? { phone } : {})
    })
  } catch {
    // Store exposes the persistent error and loading state to the page.
  }
}

function applyFilter() {
  return loadMembers(1)
}

async function openDetail(id: string) {
  try {
    await store.loadMemberDetail(id)
  } catch {
    // Detail failure is surfaced through the member page error state.
  }
}

function signedMoney(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '¥0.00'
  return `${amount > 0 ? '+' : ''}¥${amount.toFixed(2)}`
}

function consumptionStatus(row: PrepaidConsumptionRow) {
  if (row.kind === 'REVERSAL') return '冲正流水'
  return row.active ? '有效' : '已冲正'
}

function ledgerKindLabel(kind: PrepaidLedgerKind) {
  return {
    RECHARGE: '充值',
    CONSUMPTION: '消费',
    CONSUMPTION_REVERSAL: '消费冲正',
    RECHARGE_REVERSAL: '充值冲正'
  }[kind]
}
</script>

<style scoped>
.customers-header { align-items: flex-start; }
.customer-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filter-field { display: grid; gap: 4px; color: #475569; font-size: 12px; }
.customer-filters :deep(.el-input) { width: 230px; }
.customer-alert { margin: 14px 16px 0; }
.composition-list { display: flex; flex-wrap: wrap; gap: 6px; }
.prepaid-pagination { display: flex; justify-content: flex-end; padding: 14px 16px; }
.detail-stack { display: grid; gap: 20px; }
.detail-stack h3 { margin: 0 0 10px; font-size: 15px; }
.member-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.member-summary > div { display: grid; gap: 6px; padding: 12px 14px; background: #f8fafc; border: 1px solid #dce5ef; border-radius: 8px; }
.member-summary span { color: #64748b; font-size: 13px; }
.member-summary strong { font-size: 18px; }
@media (max-width: 900px) { .customers-header { flex-direction: column; } .customer-filters { width: 100%; } .member-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .customer-filters :deep(.el-input) { width: 100%; } .member-summary { grid-template-columns: 1fr; } }
</style>
