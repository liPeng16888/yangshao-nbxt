<template>
  <div class="page-stack" :class="{ 'mobile-page mobile-prepaid-page': isMobileLayout }">
    <template v-if="isMobileLayout">
      <section class="panel mobile-prepaid-customers">
        <header class="mobile-prepaid-header">
          <div><h2>预存款客户</h2><p class="muted">查看累计充值、使用次数和剩余次数。</p></div>
          <div class="mobile-prepaid-header__actions"><button data-testid="mobile-prepaid-add-link" class="mobile-touch-target" type="button" @click="router.push('/finance/prepaid/add')">添加预存款</button><button data-testid="mobile-prepaid-report-refresh" class="mobile-touch-target" type="button" :disabled="store.loading" @click="requestPrepaidReport">{{ store.loading ? '刷新中…' : '刷新' }}</button></div>
        </header>
        <div v-if="loadError" data-testid="mobile-prepaid-report-error" class="mobile-prepaid-error" role="alert"><span>{{ loadError }}</span><button data-testid="mobile-prepaid-report-retry" class="mobile-touch-target" type="button" @click="retryPrepaidReport">重试</button></div>
        <MobilePrepaidList v-else kind="customer" :rows="report?.customerRows || []" :loading="store.loading" :saving-id="store.prepaidRemarkSavingId" :saving-ids="remarkSavingIds" @remark-commit="handleCustomerRemarkCommit" @open-usage="openUsage" />
      </section>

      <MobileFullscreenDialog v-model="usageVisible" :title="`${selectedCustomer || '客户'}使用明细`" fullscreen>
        <section data-testid="mobile-prepaid-usage-dialog" class="mobile-prepaid-usage-dialog" role="region" aria-labelledby="mobile-prepaid-usage-heading">
          <h3 id="mobile-prepaid-usage-heading">{{ selectedCustomer || '客户' }}使用明细</h3>
          <p class="muted">费用状态为“预存款”的样品按日期汇总。</p>
          <MobilePrepaidList kind="usage" :rows="selectedUsageRows" :saving-id="store.prepaidRemarkSavingId" :saving-ids="remarkSavingIds" @remark-commit="handleUsageRemarkCommit" />
        </section>
        <template #footer="{ cancel }"><button class="mobile-touch-target mobile-prepaid-dialog-close" type="button" @click="cancel">关闭</button></template>
      </MobileFullscreenDialog>
    </template>

    <template v-else>
      <section class="panel">
        <div class="panel__header">
          <div><h2>预存款客户</h2><p class="muted">汇总同一客户的累计充值金额、总可用次数和样品消耗后的剩余次数。</p></div>
          <div class="panel-actions"><el-button @click="router.push('/finance/prepaid/add')">添加预存款客户</el-button><el-button :loading="store.loading" @click="requestPrepaidReport">刷新</el-button></div>
        </div>
        <el-table :data="report?.customerRows || []" border v-loading="store.loading" empty-text="暂无预存款客户">
          <el-table-column prop="customer" label="客户名称" min-width="180" />
          <el-table-column label="累计充值金额" width="150"><template #default="{ row }">¥{{ money(row.totalAmount) }}</template></el-table-column>
          <el-table-column prop="availableTimes" label="可使用次数" width="120" /><el-table-column prop="usedTimes" label="已使用次数" width="120" />
          <el-table-column label="备注" min-width="260"><template #default="{ row }"><el-input v-model="row.remark" size="small" placeholder="可填写备注" :disabled="store.prepaidRemarkSavingId === `customer__${row.customer}`" @blur="() => handleCustomerRemarkBlur(row.customer, row.remark || '')" /></template></el-table-column>
        </el-table>
      </section>
      <section class="panel">
        <div class="panel__header"><div><h2>预存款客户每日明细</h2><p class="muted">数据计算中费用状态选择为“预存款”的样品，会按日期和客户自动汇总到这里。</p></div></div>
        <el-table :data="report?.dailyRows || []" border v-loading="store.loading" empty-text="暂无预存款样品消耗">
          <el-table-column prop="date" label="日期" width="130" /><el-table-column prop="customer" label="客户名称" min-width="180" /><el-table-column prop="sampleCount" label="样品数量" width="120" />
          <el-table-column label="备注" min-width="280"><template #default="{ row }"><el-input v-model="row.remark" size="small" placeholder="可填写备注" :disabled="store.prepaidRemarkSavingId === row.id" @blur="() => handleUsageRemarkBlur(row.id, row.remark || '')" /></template></el-table-column>
        </el-table>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MobilePrepaidList from '@/components/finance/MobilePrepaidList.vue'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { PrepaidCustomerRow, PrepaidDailyUsageRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'

const router = useRouter()
const store = useFinanceBillsStore()
const { isMobileLayout } = useMobileLayout()
const report = computed(() => store.prepaidReport)
const loadError = ref('')
const usageVisible = ref(false)
const selectedCustomer = ref('')
const remarkSavingIds = ref<string[]>([])
const selectedUsageRows = computed(() => (report.value?.dailyRows || []).filter((row) => row.customer === selectedCustomer.value))
const reportLoadScope = Symbol('finance-prepaid-customers-page')
let pageActive = true
let lifecycleEpoch = 0
let reportLoadVersion = 0

onMounted(() => { void requestPrepaidReport() })
onBeforeUnmount(() => { pageActive = false; lifecycleEpoch += 1; reportLoadVersion += 1; store.cancelPrepaidReportLoads(reportLoadScope) })

async function requestPrepaidReport() {
  const requestVersion = ++reportLoadVersion
  loadError.value = ''
  try { await store.loadPrepaidReport({ scope: reportLoadScope }) }
  catch { if (pageActive && requestVersion === reportLoadVersion) loadError.value = '预存款客户数据加载失败，请重试。' }
}

async function retryPrepaidReport() {
  const requestVersion = ++reportLoadVersion
  loadError.value = ''
  try { await store.retryPrepaidReport({ scope: reportLoadScope }) }
  catch { if (pageActive && requestVersion === reportLoadVersion) loadError.value = '预存款客户数据加载失败，请重试。' }
}

function openUsage(row: PrepaidCustomerRow) { selectedCustomer.value = row.customer; usageVisible.value = true }
type RemarkCompletion = (result: 'success' | 'failure') => void

function handleCustomerRemarkCommit(row: PrepaidCustomerRow | PrepaidDailyUsageRow, remark: string, complete: RemarkCompletion) { if ('totalAmount' in row) void saveRemark(`customer__${row.customer}`, () => store.savePrepaidCustomerRemark(row.customer, remark), complete) }
function handleUsageRemarkCommit(row: PrepaidCustomerRow | PrepaidDailyUsageRow, remark: string, complete: RemarkCompletion) { if (!('totalAmount' in row)) void saveRemark(row.id, () => store.savePrepaidUsageRemark(row.id, remark), complete) }

async function saveRemark(key: string, save: () => Promise<unknown>, complete: RemarkCompletion) {
  if (remarkSavingIds.value.includes(key)) { complete('failure'); return }
  const lifecycleToken = lifecycleEpoch
  remarkSavingIds.value = [...remarkSavingIds.value, key]
  try { await save(); if (pageActive && lifecycleToken === lifecycleEpoch) complete('success') }
  catch { if (pageActive && lifecycleToken === lifecycleEpoch) complete('failure') }
  finally { if (pageActive && lifecycleToken === lifecycleEpoch) remarkSavingIds.value = remarkSavingIds.value.filter((item) => item !== key) }
}

async function handleCustomerRemarkBlur(customer: string, remark: string) { await store.savePrepaidCustomerRemark(customer, remark) }
async function handleUsageRemarkBlur(id: string, remark: string) { await store.savePrepaidUsageRemark(id, remark) }
function money(value: number) { return Number(value || 0).toFixed(2) }
</script>

<style scoped lang="scss">
.panel-actions { display: flex; align-items: center; gap: 10px; }
.mobile-prepaid-page { min-width: 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
.mobile-prepaid-customers, .mobile-prepaid-usage-dialog { display: grid; min-width: 0; gap: 14px; }
.mobile-prepaid-header { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: 10px; }
.mobile-prepaid-header h2, .mobile-prepaid-header p, .mobile-prepaid-usage-dialog h3, .mobile-prepaid-usage-dialog p { margin: 0; overflow-wrap: anywhere; }
.mobile-prepaid-header p, .mobile-prepaid-usage-dialog p { margin-top: 4px; }
.mobile-prepaid-header__actions { display: grid; flex: none; grid-template-columns: repeat(2, auto); gap: 8px; }
.mobile-prepaid-header__actions button, .mobile-prepaid-error button, .mobile-prepaid-dialog-close { min-height: 44px; color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; }
.mobile-prepaid-error { display: grid; gap: 10px; padding: 12px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; overflow-wrap: anywhere; }
.mobile-prepaid-usage-dialog { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
.mobile-prepaid-dialog-close { width: 100%; }
@media (max-width: 520px) { .mobile-prepaid-header { display: grid; } .mobile-prepaid-header__actions { width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
