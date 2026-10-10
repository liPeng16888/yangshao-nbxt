<template>
  <div class="page">
    <section class="panel">
      <div class="panel__header">
        <strong>{{ currentFinanceGroup.label }}</strong>
        <div class="filters">
          <el-select v-model="selectedFrontendIds" multiple filterable collapse-tags placeholder="选择前端账号" style="width: 300px">
            <el-option v-for="item in frontendOptions" :key="item.id" :label="`${item.name}（${item.account}）`" :value="item.id" />
          </el-select>
          <template v-if="!isReportPage">
            <el-date-picker v-model="month" type="month" value-format="YYYY-MM" />
            <el-button type="primary" :loading="loading" @click="loadActive">查询</el-button>
          </template>
        </div>
      </div>
      <div class="panel__body">
        <el-tabs :model-value="active" @tab-change="switchFinancePage">
          <el-tab-pane v-for="item in currentFinanceGroup.children" :key="item.page" :label="item.label" :name="item.page" />
        </el-tabs>
      </div>
    </section>

    <section v-if="isReportPage" class="panel report-range-filter">
      <div class="panel__body report-range-filter__body">
        <el-radio-group v-model="reportMode">
          <el-radio-button value="daily">日报</el-radio-button>
          <el-radio-button value="weekly">周报</el-radio-button>
          <el-radio-button value="monthly">月报</el-radio-button>
          <el-radio-button value="custom">筛选日期</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-if="reportMode !== 'custom'"
          v-model="reportDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
        />
        <template v-else>
          <el-date-picker v-model="customStartDate" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" />
          <span class="report-range-filter__separator">至</span>
          <el-date-picker v-model="customEndDate" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" />
        </template>
        <el-button type="primary" :loading="loading" @click="loadActive">查询</el-button>
      </div>
    </section>

    <section v-if="customerFilterTabs.has(active)" class="panel customer-filter-panel">
      <div class="customer-filter-bar">
        <span>筛选客户</span>
        <el-select
          v-model="selectedCustomers"
          multiple
          filterable
          clearable
          collapse-tags
          collapse-tags-tooltip
          :max-collapse-tags="2"
          :disabled="!customerOptions.length"
          placeholder="选择一个或多个客户"
        >
          <el-option
            v-for="customer in customerOptions"
            :key="customer"
            :label="customer"
            :value="customer"
          />
        </el-select>
      </div>
    </section>

    <section v-if="active === 'income'" class="panel">
      <div class="panel__body stat-grid">
        <div class="stat-card"><span>本日收入</span><strong>¥{{ money(report.totals?.today?.amount) }}</strong></div>
        <div class="stat-card"><span>本周收入</span><strong>¥{{ money(report.totals?.week?.amount) }}</strong></div>
        <div class="stat-card"><span>本月收入</span><strong>¥{{ money(report.totals?.month?.amount) }}</strong></div>
      </div>
      <div class="finance-chart-section">
        <div class="finance-chart-section__header">
          <strong>收入图形分析</strong>
          <div class="finance-chart-switcher" aria-label="收入图形类型">
            <el-button data-testid="income-chart-bar" size="small" :type="incomeChartType === 'bar' ? 'primary' : 'default'" @click="incomeChartType = 'bar'">柱状图</el-button>
            <el-button data-testid="income-chart-pie" size="small" :type="incomeChartType === 'pie' ? 'primary' : 'default'" @click="incomeChartType = 'pie'">饼状图</el-button>
          </div>
        </div>
        <el-empty v-if="!incomeRows.length" description="当前筛选条件暂无收入图形数据" />
        <FinanceChart v-else :option="incomeChartOption" />
      </div>
      <el-table :data="report.rows || []" border>
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column align="right" prop="sampleCount" label="样品数量" width="110" />
        <el-table-column align="right" label="应收金额" width="130"><template #default="{ row }">¥{{ money(row.totalAmount) }}</template></el-table-column>
        <el-table-column label="已结款"><template #default="{ row }">{{ statusText(row, '已结款') }}</template></el-table-column>
        <el-table-column label="未结款"><template #default="{ row }">{{ statusText(row, '未结款') }}</template></el-table-column>
        <el-table-column label="月结款"><template #default="{ row }">{{ statusText(row, '月结款') }}</template></el-table-column>
        <el-table-column label="预存款"><template #default="{ row }">{{ statusText(row, '预存款') }}</template></el-table-column>
      </el-table>
    </section>

    <section v-else-if="active === 'expenses'" class="panel">
      <div class="panel__body stat-grid">
        <div class="stat-card"><span>本日开支</span><strong>¥{{ money(report.totals?.today?.amount) }}</strong></div>
        <div class="stat-card"><span>本周开支</span><strong>¥{{ money(report.totals?.week?.amount) }}</strong></div>
        <div class="stat-card"><span>本月开支</span><strong>¥{{ money(report.totals?.month?.amount) }}</strong></div>
      </div>
      <div class="finance-chart-section">
        <div class="finance-chart-section__header">
          <strong>支出图形分析</strong>
          <div class="finance-chart-switcher" aria-label="支出图形类型">
            <el-button data-testid="expense-chart-bar" size="small" :type="expenseChartType === 'bar' ? 'primary' : 'default'" @click="expenseChartType = 'bar'">柱状图</el-button>
            <el-button data-testid="expense-chart-pie" size="small" :type="expenseChartType === 'pie' ? 'primary' : 'default'" @click="expenseChartType = 'pie'">饼状图</el-button>
          </div>
        </div>
        <el-empty v-if="!expenseRows.length" description="当前筛选条件暂无支出图形数据" />
        <FinanceChart v-else :option="expenseChartOption" />
      </div>
      <el-table :data="report.rows || []" border>
        <el-table-column prop="paymentDate" label="支付日期" width="120" />
        <el-table-column prop="registeredAt" label="登记日期" width="180" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="item" label="开支项目" min-width="180" />
        <el-table-column align="right" label="开支金额" width="130"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column prop="paymentMethod" label="支付方式" width="110" />
        <el-table-column prop="screenshotUrl" label="支付截图" min-width="160" />
        <el-table-column prop="remark" label="备注" min-width="180" />
      </el-table>
    </section>

    <section v-else-if="active === 'unsettled'" class="panel">
      <el-table :data="filteredRows" border>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="sequence" label="编号" width="90" />
        <el-table-column prop="sampleNumber" label="样品编号" min-width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column align="right" label="金额" width="110"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="jumpToData(row)">跳转</el-button>
            <el-button size="small" type="warning" @click="remindUnsettled(row)">催款</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else-if="active === 'monthlyDaily'" class="panel">
      <el-table :data="filteredRows" border>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column align="right" prop="sampleCount" label="样品数量" width="110" />
        <el-table-column align="right" label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
      </el-table>
    </section>

    <section v-else-if="active === 'monthlyBills'" class="panel">
      <el-table :data="filteredRows" border>
        <el-table-column prop="month" label="日期" width="110" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column align="right" label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column align="right" prop="sampleCount" label="样品数量" width="110" />
        <el-table-column prop="settlementStatus" label="结款状态" width="110" />
        <el-table-column align="right" label="结款金额" width="120"><template #default="{ row }">¥{{ money(row.paidAmount) }}</template></el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }"><el-button size="small" type="warning" :disabled="!row.recordId" @click="remindMonthly(row)">催款</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else-if="active === 'monthlyCustomers'" class="panel">
      <el-table :data="filteredRows" border>
        <el-table-column prop="firstDate" label="首次检测日期" width="130" />
        <el-table-column prop="lastDate" label="最后检测日期" width="130" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column align="right" label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column align="right" prop="sampleCount" label="样品数量" width="110" />
        <el-table-column label="备注" min-width="240">
          <template #default="{ row }">
            <el-input v-model="row.remark" size="small" @change="saveMonthlyCustomerRemark(row)" />
          </template>
        </el-table-column>
      </el-table>
    </section>

  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { ElMessageBox, ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { EChartsOption } from 'echarts'
import { buildFrontendIds, getFrontendOptions, request } from '../api'
import type { FrontendOption } from '../types'
import {
  filterFinanceRowsByCustomers,
  financeCustomerOptions,
  retainAvailableFinanceCustomers,
  shouldApplyFinanceResponse
} from '../utils/financeCustomerFilter'
import { financeNavigationGroups, type FinancePageId } from '../config/financeNavigation'
import FinanceChart from '../components/FinanceChart.vue'
import { buildExpenseBarData, buildExpensePieData, buildIncomeBarData, buildIncomePieData } from '../utils/financeChartData'
import { buildFinanceReportRange, type FinanceReportMode } from '../utils/financeReportRange'

const route = useRoute()
const router = useRouter()
const frontendOptions = ref<FrontendOption[]>([])
const selectedFrontendIds = ref<string[]>([])
const month = ref(dayjs().format('YYYY-MM'))
const reportMode = ref<FinanceReportMode>('daily')
const reportDate = ref(dayjs().format('YYYY-MM-DD'))
const customStartDate = ref(dayjs().format('YYYY-MM-DD'))
const customEndDate = ref(dayjs().format('YYYY-MM-DD'))
const active = ref<FinancePageId>('income')
const incomeChartType = ref<'bar' | 'pie'>('bar')
const expenseChartType = ref<'bar' | 'pie'>('bar')
const loading = ref(false)
const report = ref<any>({})
const rows = ref<any[]>([])
let latestLoadRequestId = 0
const currentFinanceGroup = computed(() =>
  financeNavigationGroups.find((group) => group.id === route.meta.financeGroup) || financeNavigationGroups[0]
)
const isReportPage = computed(() => active.value === 'income' || active.value === 'expenses')
const customerFilterTabs = new Set([
  'unsettled',
  'monthlyDaily',
  'monthlyBills',
  'monthlyCustomers'
])
const customerSelections = reactive<Record<string, string[]>>({
  unsettled: [],
  monthlyDaily: [],
  monthlyBills: [],
  monthlyCustomers: []
})
const customerFilterRows = computed<any[]>(() => {
  if (active.value === 'monthlyBills') return report.value.summaryRows || []
  return rows.value
})
const customerOptions = computed(() => financeCustomerOptions(customerFilterRows.value))
const selectedCustomers = computed<string[]>({
  get: () => customerSelections[active.value] || [],
  set: (value) => {
    customerSelections[active.value] = value
  }
})
const filteredRows = computed(() =>
  filterFinanceRowsByCustomers(customerFilterRows.value, selectedCustomers.value)
)
const incomeRows = computed<any[]>(() => Array.isArray(report.value.rows) ? report.value.rows : [])
const expenseRows = computed<any[]>(() => Array.isArray(report.value.rows) ? report.value.rows : [])
const incomeChartOption = computed<EChartsOption>(() => {
  if (incomeChartType.value === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', bottom: 0 },
      series: [{ name: '收入结款状态', type: 'pie', radius: ['38%', '68%'], data: buildIncomePieData(incomeRows.value) }]
    }
  }
  const data = buildIncomeBarData(incomeRows.value)
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 62, right: 28, top: 26, bottom: 48 },
    xAxis: { type: 'category', data: data.labels, axisLabel: { rotate: data.labels.length > 8 ? 30 : 0 } },
    yAxis: { type: 'value', name: '金额（元）' },
    series: [{ name: '收入金额', type: 'bar', data: data.values, barMaxWidth: 44, itemStyle: { color: '#738b9c', borderRadius: [3, 3, 0, 0] } }]
  }
})
const expenseChartOption = computed<EChartsOption>(() => {
  if (expenseChartType.value === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', bottom: 0 },
      series: [{ name: '开支项目', type: 'pie', radius: ['38%', '68%'], data: buildExpensePieData(expenseRows.value) }]
    }
  }
  const data = buildExpenseBarData(expenseRows.value)
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 62, right: 28, top: 26, bottom: 48 },
    xAxis: { type: 'category', data: data.labels, axisLabel: { rotate: data.labels.length > 8 ? 30 : 0 } },
    yAxis: { type: 'value', name: '金额（元）' },
    series: [{ name: '支出金额', type: 'bar', data: data.values, barMaxWidth: 44, itemStyle: { color: '#ac8c7e', borderRadius: [3, 3, 0, 0] } }]
  }
})

onMounted(async () => {
  active.value = financePageFromRoute()
  frontendOptions.value = await getFrontendOptions()
  selectedFrontendIds.value = frontendOptions.value.map((item) => item.id)
  await loadActive()
})

watch(
  () => route.meta.financePage,
  () => {
    const nextPage = financePageFromRoute()
    if (nextPage === active.value) return
    active.value = nextPage
    if (frontendOptions.value.length) void loadActive()
  }
)

async function loadActive() {
  const requestedTab = active.value
  const requestId = ++latestLoadRequestId
  loading.value = true
  try {
    const params: Record<string, string> = { frontendUserIds: buildFrontendIds(selectedFrontendIds.value) }
    if (requestedTab === 'income' || requestedTab === 'expenses') {
      const range = buildFinanceReportRange(reportMode.value, reportDate.value, customStartDate.value, customEndDate.value)
      params.startDate = range.startDate
      params.endDate = range.endDate
    } else {
      params.month = month.value
    }
    let response: any
    if (requestedTab === 'income') response = await request.get('/admin/finance/income', { params })
    else if (requestedTab === 'expenses') response = await request.get('/admin/finance/expenses', { params })
    else if (requestedTab === 'unsettled') response = await request.get('/admin/finance/unsettled', { params })
    else if (requestedTab === 'monthlyDaily') response = await request.get('/admin/finance/monthly-daily', { params })
    else if (requestedTab === 'monthlyBills') response = await request.get('/admin/finance/monthly-bills', { params })
    else response = await request.get('/admin/finance/monthly-customers', { params })

    if (!shouldApplyFinanceResponse(requestedTab, active.value, requestId, latestLoadRequestId)) return

    if (['income', 'expenses', 'monthlyBills'].includes(requestedTab)) {
      report.value = response
    } else {
      rows.value = response
    }
    if (customerFilterTabs.has(requestedTab)) {
      customerSelections[requestedTab] = retainAvailableFinanceCustomers(
        customerSelections[requestedTab] || [],
        financeCustomerOptions(customerRowsFromResponse(requestedTab, response))
      )
    }
  } finally {
    if (requestId === latestLoadRequestId) loading.value = false
  }
}

function customerRowsFromResponse(tab: string, response: any): any[] {
  if (tab === 'monthlyBills') return response?.summaryRows || []
  return Array.isArray(response) ? response : []
}

function statusText(row: any, status: string) {
  const item = row.statusSummaries?.find((summary: any) => summary.status === status)
  return item ? `${item.count} 个 / ¥${money(item.amount)}` : '0 个 / ¥0.00'
}

function money(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'
}

function jumpToData(row: any) {
  void router.push({ path: '/data', query: { date: row.date, frontendUserIds: row.frontendUserId, blockId: row.blockId } })
}

async function remindUnsettled(row: any) {
  await ElMessageBox.confirm('确认向对应前端账号发送催款提醒？', '催款确认')
  await request.post(`/admin/finance/unsettled/${row.blockId}/remind`)
  ElMessage.success('催款提醒已发送')
}

async function remindMonthly(row: any) {
  await ElMessageBox.confirm('确认向对应前端账号发送月结款催款提醒？', '催款确认')
  await request.post(`/admin/finance/monthly-bills/${row.recordId}/remind`)
  ElMessage.success('催款提醒已发送')
}

async function saveMonthlyCustomerRemark(row: any) {
  await request.patch('/admin/finance/monthly-customers/remark', {
    frontendUserId: row.frontendUserId,
    customer: row.customer,
    remark: row.remark || ''
  })
  ElMessage.success('备注已保存')
}

function financePageFromRoute(): FinancePageId {
  const candidate = route.meta.financePage
  const exists = financeNavigationGroups.some((group) => group.children.some((item) => item.page === candidate))
  return exists ? candidate as FinancePageId : 'income'
}

function switchFinancePage(page: string | number) {
  const target = currentFinanceGroup.value.children.find((item) => item.page === page)
  if (target) void router.push(target.path)
}
</script>

<style scoped>
.customer-filter-panel {
  margin-bottom: 0;
}

.report-range-filter__body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.report-range-filter__separator {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.finance-chart-section {
  margin: 0 14px 14px;
  overflow: hidden;
  border: 1px solid var(--ui-line-soft);
  border-radius: 8px;
}

.finance-chart-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  padding: 0 14px;
  border-bottom: 1px solid var(--ui-line-soft);
}

.finance-chart-section__header strong {
  color: var(--ui-text);
  font-size: 14px;
}

.finance-chart-switcher {
  display: flex;
  gap: 8px;
}

.customer-filter-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 14px;
}

.customer-filter-bar > span {
  flex: none;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.customer-filter-bar .el-select {
  width: min(360px, 100%);
}

@media (max-width: 640px) {
  .customer-filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .customer-filter-bar .el-select {
    width: 100%;
  }
}
</style>
