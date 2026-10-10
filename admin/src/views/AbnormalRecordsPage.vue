<template>
  <div class="page">
    <section class="panel">
      <div class="panel__header">
        <strong>异常记录</strong>
        <div class="filters">
          <el-select v-model="selectedFrontendIds" multiple filterable collapse-tags placeholder="选择前端账号" style="width: 300px">
            <el-option v-for="item in frontendOptions" :key="item.id" :label="`${item.name}（${item.account}）`" :value="item.id" />
          </el-select>
          <el-date-picker v-model="range" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" />
          <el-button type="primary" :loading="loading" @click="loadData">查询</el-button>
        </div>
      </div>
      <el-table :data="rows" border>
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="name" label="名称" width="160" />
        <el-table-column prop="sequence" label="编号" width="90" />
        <el-table-column label="修改字段" width="130">
          <template #default="{ row }">{{ fieldName(row.field) }}</template>
        </el-table-column>
        <el-table-column prop="changeCount" label="修改次数" width="100" />
        <el-table-column label="修改记录" min-width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="openHistory(row)">查看修改记录</el-button>
            <span class="history-summary">已修改 {{ row.changeCount }} 次</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" @click="jump(row)">跳转</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="historyVisible" :title="historyTitle" width="820px">
      <el-table :data="historyRows" border>
        <el-table-column type="index" label="次数" width="70" />
        <el-table-column prop="changedAt" label="修改时间" width="190" />
        <el-table-column label="修改前">
          <template #default="{ row }">{{ displayValue(row.oldValue) }}</template>
        </el-table-column>
        <el-table-column label="修改后">
          <template #default="{ row }">{{ displayValue(row.newValue) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { buildFrontendIds, getFrontendOptions, request } from '../api'
import type { FrontendOption } from '../types'

const router = useRouter()
const frontendOptions = ref<FrontendOption[]>([])
const selectedFrontendIds = ref<string[]>([])
const range = ref<[string, string]>([dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')])
const rows = ref<any[]>([])
const loading = ref(false)
const historyVisible = ref(false)
const historyRows = ref<any[]>([])
const historyTitle = ref('修改记录')

onMounted(async () => {
  frontendOptions.value = await getFrontendOptions()
  selectedFrontendIds.value = frontendOptions.value.map((item) => item.id)
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    rows.value = await request.get('/admin/abnormal-records', {
      params: { frontendUserIds: buildFrontendIds(selectedFrontendIds.value), startDate: range.value?.[0], endDate: range.value?.[1] }
    })
  } finally {
    loading.value = false
  }
}

async function openHistory(row: any) {
  historyTitle.value = `${row.sequence || ''} ${fieldName(row.field)} 修改记录`
  historyRows.value = await request.get('/admin/data-statistics/cell-history', { params: { blockId: row.blockId, field: row.field } })
  historyVisible.value = true
}

function jump(row: any) {
  void router.push({ path: '/data', query: { date: row.date, frontendUserIds: row.frontendUserId, blockId: row.blockId, field: row.field } })
}

function fieldName(field: string) {
  const labels: Record<string, string> = {
    sequence: '编号',
    sampleNumber: '样品编号',
    customerText: '客户',
    price: '样品金额',
    paymentStatus: '费用状态',
    ironRaw: '铁',
    siliconRaw: '硅',
    siliconAdjust: '硅调整数',
    aluminumRaw: '铝',
    aluminumAdjust: '铝调整数',
    sulfur: '硫',
    densityRaw: '比重',
    whiteness: '白度',
    calciumRaw: '钙',
    magnesiumRaw: '镁',
    carbon: '碳',
    titaniumRaw: '钛',
    waterSample: '样',
    bottleWater: '瓶+水',
    bottleWaterSample: '瓶+水+样',
    crucible: '坩埚',
    sampleWeight: '样重',
    burnedCrucibleSample: '烧坩埚+样'
  }
  return labels[field] || field
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '空'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
</script>

<style scoped>
.history-summary {
  margin-left: 8px;
  color: var(--ui-text-muted);
  font-size: 12px;
}
</style>
