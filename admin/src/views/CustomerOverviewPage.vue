<template>
  <div class="page customer-overview-page">
    <section class="panel">
      <div class="panel__header">
        <div>
          <strong>客户总览</strong>
          <p class="page-description">按前台账号汇总全部历史检测客户，不同账号的数据分别统计。</p>
        </div>
        <el-button :icon="Refresh" :loading="loading" @click="loadRows">刷新</el-button>
      </div>

      <div class="overview-controls">
        <label class="control-field control-field--wide">
          <span>前台账号</span>
          <el-select
            v-model="selectedFrontendIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            placeholder="选择一个或多个前台账号"
            @change="loadRows"
          >
            <el-option
              v-for="item in frontendOptions"
              :key="item.id"
              :label="`${item.name}（${item.account}）`"
              :value="item.id"
            />
          </el-select>
        </label>
        <label class="control-field control-field--wide">
          <span>筛选客户</span>
          <el-select
            v-model="selectedRowKeys"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            placeholder="选择一个或多个客户"
          >
            <el-option v-for="item in customerOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </label>
        <label class="control-field">
          <span>排序方式</span>
          <el-select v-model="sortField">
            <el-option v-for="item in sortOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </label>
        <label class="control-field">
          <span>排序方向</span>
          <el-radio-group v-model="sortDirection">
            <el-radio-button value="desc">降序</el-radio-button>
            <el-radio-button value="asc">升序</el-radio-button>
          </el-radio-group>
        </label>
      </div>

      <div class="overview-summary">
        <div><span>账号数量</span><strong>{{ summary.accountCount }}</strong></div>
        <div><span>客户数量</span><strong>{{ summary.customerCount }}</strong></div>
        <div><span>样品数量</span><strong>{{ summary.sampleCount }}</strong></div>
        <div><span>累计金额</span><strong>¥{{ money(summary.totalAmount) }}</strong></div>
      </div>
    </section>

    <section class="panel" v-loading="loading">
      <el-table :data="displayRows" border empty-text="暂无客户检测数据" @sort-change="handleTableSort">
        <el-table-column prop="frontendUserName" label="前台账号" min-width="180" />
        <el-table-column prop="customerDisplay" label="客户完整信息" min-width="360" sortable="custom">
          <template #default="{ row }"><span class="customer-display">{{ row.customerDisplay || row.customer }}</span></template>
        </el-table-column>
        <el-table-column prop="sampleCount" label="样品数量" width="130" sortable="custom" />
        <el-table-column prop="totalAmount" label="累计金额" width="150" sortable="custom">
          <template #default="{ row }">¥{{ money(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column prop="firstDetectionDate" label="首次检测时间" width="160" sortable="custom" />
        <el-table-column prop="lastDetectionDate" label="最后检测时间" width="160" sortable="custom" />
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { getAdminCustomerOverview, getFrontendOptions } from '../api'
import type { AdminCustomerOverviewRow, FrontendOption } from '../types'

type SortField = 'customerDisplay' | 'sampleCount' | 'totalAmount' | 'firstDetectionDate' | 'lastDetectionDate'
type SortDirection = 'asc' | 'desc'

const frontendOptions = ref<FrontendOption[]>([])
const selectedFrontendIds = ref<string[]>([])
const selectedRowKeys = ref<string[]>([])
const rows = ref<AdminCustomerOverviewRow[]>([])
const loading = ref(false)
const sortField = ref<SortField>('lastDetectionDate')
const sortDirection = ref<SortDirection>('desc')
const sortOptions: Array<{ label: string; value: SortField }> = [
  { label: '最后检测时间', value: 'lastDetectionDate' },
  { label: '首次检测时间', value: 'firstDetectionDate' },
  { label: '样品数量', value: 'sampleCount' },
  { label: '累计金额', value: 'totalAmount' },
  { label: '客户名称', value: 'customerDisplay' }
]

const customerOptions = computed(() => rows.value.map((row) => ({
  value: rowKey(row),
  label: `${row.frontendUserName}｜${row.customerDisplay || row.customer}`
})).sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')))
const displayRows = computed(() => {
  const selected = new Set(selectedRowKeys.value)
  const filtered = selected.size ? rows.value.filter((row) => selected.has(rowKey(row))) : rows.value
  const multiplier = sortDirection.value === 'asc' ? 1 : -1
  return [...filtered].sort((left, right) => {
    const leftValue = left[sortField.value]
    const rightValue = right[sortField.value]
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'zh-CN')
    return comparison * multiplier || left.frontendUserName.localeCompare(right.frontendUserName, 'zh-CN')
  })
})
const summary = computed(() => ({
  accountCount: new Set(displayRows.value.map((row) => row.frontendUserId)).size,
  customerCount: displayRows.value.length,
  sampleCount: displayRows.value.reduce((sum, row) => sum + row.sampleCount, 0),
  totalAmount: displayRows.value.reduce((sum, row) => sum + row.totalAmount, 0)
}))

onMounted(async () => {
  frontendOptions.value = await getFrontendOptions()
  selectedFrontendIds.value = frontendOptions.value.map((item) => item.id)
  await loadRows()
})

async function loadRows() {
  loading.value = true
  try {
    rows.value = await getAdminCustomerOverview(selectedFrontendIds.value)
    const validKeys = new Set(rows.value.map(rowKey))
    selectedRowKeys.value = selectedRowKeys.value.filter((key) => validKeys.has(key))
  } finally {
    loading.value = false
  }
}

function rowKey(row: AdminCustomerOverviewRow) {
  return `${row.frontendUserId}__${row.customerKey}`
}

function handleTableSort({ prop, order }: { prop?: SortField; order?: 'ascending' | 'descending' | null }) {
  if (!prop || !order) return
  sortField.value = prop
  sortDirection.value = order === 'ascending' ? 'asc' : 'desc'
}

function money(value: number) {
  return Number(value || 0).toFixed(2)
}
</script>

<style scoped>
.page-description {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 13px;
}

.overview-controls {
  display: grid;
  grid-template-columns: minmax(250px, 1fr) minmax(280px, 1.25fr) minmax(170px, 0.65fr) auto;
  gap: 12px;
  padding: 14px 16px;
}

.control-field {
  display: grid;
  gap: 6px;
}

.control-field > span,
.overview-summary span {
  color: #64748b;
  font-size: 13px;
}

.overview-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid #e5edf7;
}

.overview-summary > div {
  display: grid;
  gap: 5px;
  min-height: 74px;
  padding: 14px 16px;
  border-right: 1px solid #e5edf7;
}

.overview-summary > div:last-child {
  border-right: 0;
}

.overview-summary strong {
  font-size: 21px;
}

.customer-display {
  display: block;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: normal;
}

@media (max-width: 1100px) {
  .overview-controls {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
