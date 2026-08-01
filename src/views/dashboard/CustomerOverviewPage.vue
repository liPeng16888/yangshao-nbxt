<template>
  <div class="page-stack customer-overview-page">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>客户总览</h2>
          <p class="muted">汇总本账号所有已检测样品的客户、数量、金额和检测时间。</p>
        </div>
        <el-button :icon="Refresh" :loading="loading" @click="loadRows">刷新</el-button>
      </div>

      <div class="overview-controls">
        <label class="control-field control-field--customer">
          <span>筛选客户</span>
          <el-select
            v-model="selectedCustomerKeys"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            placeholder="选择一个或多个客户"
          >
            <el-option
              v-for="option in customerOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </label>
        <label class="control-field">
          <span>排序方式</span>
          <el-select v-model="sortField">
            <el-option v-for="option in sortOptions" :key="option.value" :label="option.label" :value="option.value" />
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
        <div data-summary="customers"><span>客户数量</span><strong>{{ summary.customerCount }}</strong></div>
        <div data-summary="samples"><span>样品数量</span><strong>{{ summary.sampleCount }}</strong></div>
        <div data-summary="amount"><span>累计金额</span><strong>¥{{ money(summary.totalAmount) }}</strong></div>
      </div>
    </section>

    <section class="panel" v-loading="loading">
      <el-table
        :data="displayRows"
        border
        empty-text="暂无客户检测数据"
        @sort-change="handleTableSort"
      >
        <el-table-column prop="customerDisplay" label="客户完整信息" min-width="360" sortable="custom">
          <template #default="{ row }">
            <span class="customer-display">{{ row.customerDisplay || row.customer }}</span>
          </template>
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
import { getCustomerOverview } from '@/api/customerOverview'
import type { CustomerOverviewRow, CustomerOverviewSortField, SortDirection } from '@/types/customerOverview'
import { filterAndSortCustomerRows } from '@/utils/customerOverview'

const rows = ref<CustomerOverviewRow[]>([])
const loading = ref(false)
const selectedCustomerKeys = ref<string[]>([])
const sortField = ref<CustomerOverviewSortField>('lastDetectionDate')
const sortDirection = ref<SortDirection>('desc')

const sortOptions: Array<{ label: string; value: CustomerOverviewSortField }> = [
  { label: '最后检测时间', value: 'lastDetectionDate' },
  { label: '首次检测时间', value: 'firstDetectionDate' },
  { label: '样品数量', value: 'sampleCount' },
  { label: '累计金额', value: 'totalAmount' },
  { label: '客户名称', value: 'customerDisplay' }
]

const customerOptions = computed(() =>
  [...rows.value]
    .sort((left, right) => left.customerDisplay.localeCompare(right.customerDisplay, 'zh-CN'))
    .map((row) => ({ value: row.customerKey, label: row.customerDisplay || row.customer }))
)
const displayRows = computed(() =>
  filterAndSortCustomerRows(rows.value, selectedCustomerKeys.value, sortField.value, sortDirection.value)
)
const summary = computed(() => ({
  customerCount: displayRows.value.length,
  sampleCount: displayRows.value.reduce((sum, row) => sum + row.sampleCount, 0),
  totalAmount: displayRows.value.reduce((sum, row) => sum + row.totalAmount, 0)
}))

onMounted(loadRows)

async function loadRows() {
  loading.value = true
  try {
    rows.value = await getCustomerOverview()
    const validKeys = new Set(rows.value.map((row) => row.customerKey))
    selectedCustomerKeys.value = selectedCustomerKeys.value.filter((key) => validKeys.has(key))
  } finally {
    loading.value = false
  }
}

function handleTableSort({ prop, order }: { prop?: CustomerOverviewSortField; order?: 'ascending' | 'descending' | null }) {
  if (!prop || !order) return
  sortField.value = prop
  sortDirection.value = order === 'ascending' ? 'asc' : 'desc'
}

function money(value: number) {
  return Number(value || 0).toFixed(2)
}
</script>

<style scoped lang="scss">
.overview-controls {
  display: grid;
  grid-template-columns: minmax(300px, 1.5fr) minmax(180px, 0.7fr) auto;
  gap: 14px;
  padding: 14px;
  border-top: 1px solid #e2e8f0;
}

.control-field {
  display: grid;
  gap: 6px;

  > span {
    color: #64748b;
    font-size: 13px;
  }
}

.overview-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #e2e8f0;

  > div {
    display: grid;
    gap: 4px;
    min-height: 76px;
    padding: 14px 18px;
    border-right: 1px solid #e2e8f0;

    &:last-child {
      border-right: 0;
    }
  }

  span {
    color: #64748b;
    font-size: 13px;
  }

  strong {
    color: #0f172a;
    font-size: 22px;
  }
}

.customer-display {
  display: block;
  line-height: 1.55;
  overflow-wrap: anywhere;
  white-space: normal;
}

@media (max-width: 860px) {
  .overview-controls {
    grid-template-columns: 1fr;
  }

  .overview-summary {
    grid-template-columns: 1fr;

    > div {
      min-height: 64px;
      border-right: 0;
      border-bottom: 1px solid #e2e8f0;
    }
  }
}
</style>
