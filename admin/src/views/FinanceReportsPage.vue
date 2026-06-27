<template>
  <div class="page">
    <section class="panel">
      <div class="panel__header">
        <strong>财务报表</strong>
        <div class="filters">
          <el-select v-model="selectedFrontendIds" multiple filterable collapse-tags placeholder="选择前端账号" style="width: 300px">
            <el-option v-for="item in frontendOptions" :key="item.id" :label="`${item.name}（${item.account}）`" :value="item.id" />
          </el-select>
          <el-date-picker v-model="month" type="month" value-format="YYYY-MM" />
          <el-button type="primary" :loading="loading" @click="loadActive">查询</el-button>
        </div>
      </div>
      <div class="panel__body">
        <el-tabs v-model="active" @tab-change="loadActive">
          <el-tab-pane label="收入账单" name="income" />
          <el-tab-pane label="支出账单" name="expenses" />
          <el-tab-pane label="未结款" name="unsettled" />
          <el-tab-pane label="月结款每日明细" name="monthlyDaily" />
          <el-tab-pane label="月结款账单明细" name="monthlyBills" />
          <el-tab-pane label="月结客户信息收录" name="monthlyCustomers" />
        </el-tabs>
      </div>
    </section>

    <section v-if="active === 'income'" class="panel">
      <div class="panel__body stat-grid">
        <div class="stat-card"><span>本日收入</span><strong>¥{{ money(report.totals?.today?.amount) }}</strong></div>
        <div class="stat-card"><span>本周收入</span><strong>¥{{ money(report.totals?.week?.amount) }}</strong></div>
        <div class="stat-card"><span>本月收入</span><strong>¥{{ money(report.totals?.month?.amount) }}</strong></div>
      </div>
      <el-table :data="report.rows || []" border>
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column prop="sampleCount" label="样品数量" width="110" />
        <el-table-column label="应收金额" width="130"><template #default="{ row }">¥{{ money(row.totalAmount) }}</template></el-table-column>
        <el-table-column label="已结款"><template #default="{ row }">{{ statusText(row, '已结款') }}</template></el-table-column>
        <el-table-column label="未结款"><template #default="{ row }">{{ statusText(row, '未结款') }}</template></el-table-column>
        <el-table-column label="月结款"><template #default="{ row }">{{ statusText(row, '月结款') }}</template></el-table-column>
      </el-table>
    </section>

    <section v-else-if="active === 'expenses'" class="panel">
      <div class="panel__body stat-grid">
        <div class="stat-card"><span>本日开支</span><strong>¥{{ money(report.totals?.today?.amount) }}</strong></div>
        <div class="stat-card"><span>本周开支</span><strong>¥{{ money(report.totals?.week?.amount) }}</strong></div>
        <div class="stat-card"><span>本月开支</span><strong>¥{{ money(report.totals?.month?.amount) }}</strong></div>
      </div>
      <el-table :data="report.rows || []" border>
        <el-table-column prop="paymentDate" label="支付日期" width="120" />
        <el-table-column prop="registeredAt" label="登记日期" width="180" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="item" label="开支项目" min-width="180" />
        <el-table-column label="开支金额" width="130"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column prop="paymentMethod" label="支付方式" width="110" />
        <el-table-column prop="screenshotUrl" label="支付截图" min-width="160" />
        <el-table-column prop="remark" label="备注" min-width="180" />
      </el-table>
    </section>

    <section v-else-if="active === 'unsettled'" class="panel">
      <el-table :data="rows" border>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="sequence" label="编号" width="90" />
        <el-table-column prop="sampleNumber" label="样品编号" min-width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="jumpToData(row)">跳转</el-button>
            <el-button size="small" type="warning" @click="remindUnsettled(row)">催款</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else-if="active === 'monthlyDaily'" class="panel">
      <el-table :data="rows" border>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column prop="sampleCount" label="样品数量" width="110" />
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
      </el-table>
    </section>

    <section v-else-if="active === 'monthlyBills'" class="panel">
      <el-table :data="report.summaryRows || []" border>
        <el-table-column prop="month" label="日期" width="110" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column prop="sampleCount" label="样品数量" width="110" />
        <el-table-column prop="settlementStatus" label="结款状态" width="110" />
        <el-table-column label="结款金额" width="120"><template #default="{ row }">¥{{ money(row.paidAmount) }}</template></el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }"><el-button size="small" type="warning" :disabled="!row.recordId" @click="remindMonthly(row)">催款</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else class="panel">
      <el-table :data="rows" border>
        <el-table-column prop="firstDate" label="首次检测日期" width="130" />
        <el-table-column prop="lastDate" label="最后检测日期" width="130" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
        <el-table-column prop="sampleCount" label="样品数量" width="110" />
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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { buildFrontendIds, getFrontendOptions, request } from '../api'
import type { FrontendOption } from '../types'

const router = useRouter()
const frontendOptions = ref<FrontendOption[]>([])
const selectedFrontendIds = ref<string[]>([])
const month = ref(dayjs().format('YYYY-MM'))
const active = ref('income')
const loading = ref(false)
const report = ref<any>({})
const rows = ref<any[]>([])

onMounted(async () => {
  frontendOptions.value = await getFrontendOptions()
  selectedFrontendIds.value = frontendOptions.value.map((item) => item.id)
  await loadActive()
})

async function loadActive() {
  loading.value = true
  try {
    const params = { month: month.value, frontendUserIds: buildFrontendIds(selectedFrontendIds.value) }
    if (active.value === 'income') report.value = await request.get('/admin/finance/income', { params })
    else if (active.value === 'expenses') report.value = await request.get('/admin/finance/expenses', { params })
    else if (active.value === 'unsettled') rows.value = await request.get('/admin/finance/unsettled', { params })
    else if (active.value === 'monthlyDaily') rows.value = await request.get('/admin/finance/monthly-daily', { params })
    else if (active.value === 'monthlyBills') report.value = await request.get('/admin/finance/monthly-bills', { params })
    else rows.value = await request.get('/admin/finance/monthly-customers', { params })
  } finally {
    loading.value = false
  }
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
</script>
