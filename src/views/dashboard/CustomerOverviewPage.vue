<template>
  <div class="page-stack customer-overview-page">
    <section v-if="isMobileLayout" class="panel mobile-customer-overview" :aria-busy="loading">
      <div class="panel__header">
        <div>
          <h2>客户总览</h2>
          <p class="muted">汇总本账号所有已检测样品的客户、数量、金额和检测时间。</p>
        </div>
        <button data-testid="mobile-customer-refresh" class="mobile-touch-target mobile-customer-overview__refresh" type="button" :disabled="loading" @click="loadRows">
          刷新
        </button>
      </div>

      <div data-testid="mobile-customer-filter-summary">
        <MobileFilterDrawer
          v-model="filterOpen"
          title="筛选客户总览"
          :summary="mobileFilterSummary"
          fullscreen
          @apply="applyMobileFilter"
          @reset="resetMobileFilter"
        >
          <div class="mobile-customer-overview__filters">
            <label class="control-field">
              <span>筛选客户</span>
              <el-select
                v-model="draftCustomerKeys"
                class="mobile-customer-overview__select"
                multiple
                filterable
                clearable
                collapse-tags
                placeholder="选择一个或多个客户"
              >
                <el-option v-for="option in customerOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </label>
            <label class="control-field">
              <span>排序方式</span>
              <el-select v-model="draftSortField" class="mobile-customer-overview__select">
                <el-option v-for="option in sortOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </label>
            <label class="control-field">
              <span>排序方向</span>
              <el-radio-group v-model="draftSortDirection" class="mobile-customer-overview__direction">
                <el-radio-button value="desc">降序</el-radio-button>
                <el-radio-button value="asc">升序</el-radio-button>
              </el-radio-group>
            </label>
          </div>
        </MobileFilterDrawer>
      </div>

      <div v-if="loadError" class="mobile-customer-overview__error" data-testid="mobile-customer-load-error" role="alert">
        <span>{{ loadError }}</span>
        <button data-testid="mobile-customer-retry" class="mobile-touch-target" type="button" :disabled="loading" @click="loadRows">重试</button>
      </div>
      <MobileCustomerOverviewList :rows="displayRows" :summary="summary" :loading="loading" @show-details="showDetails" />
    </section>

    <section v-else class="panel">
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

    <section v-if="!isMobileLayout" class="panel" v-loading="loading">
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

    <MobileFullscreenDialog v-model="detailsOpen" title="客户检测详情" fullscreen>
      <dl v-if="detailRow" class="mobile-customer-overview__detail-list">
        <div><dt>客户</dt><dd>{{ detailCustomerName }}</dd></div>
        <div><dt>联系方式</dt><dd>{{ detailContact }}</dd></div>
        <div><dt>样品数量</dt><dd>{{ detailSampleCount }} 个样品</dd></div>
        <div><dt>首次检测</dt><dd>{{ detailFirstDate }}</dd></div>
        <div><dt>最后检测</dt><dd>{{ detailLastDate }}</dd></div>
        <div><dt>累计金额</dt><dd>¥{{ money(detailRow.totalAmount) }}</dd></div>
      </dl>
      <template #footer="{ cancel }">
        <button class="mobile-touch-target mobile-customer-overview__close-details" type="button" @click="cancel">关闭</button>
      </template>
    </MobileFullscreenDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import MobileCustomerOverviewList from '@/components/customer-overview/MobileCustomerOverviewList.vue'
import MobileFilterDrawer from '@/components/mobile/MobileFilterDrawer.vue'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { getCustomerOverview } from '@/api/customerOverview'
import type { CustomerOverviewRow, CustomerOverviewSortField, SortDirection } from '@/types/customerOverview'
import { filterAndSortCustomerRows } from '@/utils/customerOverview'

const rows = ref<CustomerOverviewRow[]>([])
const loading = ref(false)
const loadError = ref('')
const selectedCustomerKeys = ref<string[]>([])
const sortField = ref<CustomerOverviewSortField>('lastDetectionDate')
const sortDirection = ref<SortDirection>('desc')
const filterOpen = ref(false)
const draftCustomerKeys = ref<string[]>([])
const draftSortField = ref<CustomerOverviewSortField>('lastDetectionDate')
const draftSortDirection = ref<SortDirection>('desc')
const detailRow = ref<CustomerOverviewRow | null>(null)
const detailsOpen = ref(false)
const { isMobileLayout } = useMobileLayout()
let requestVersion = 0

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
const sortLabel = computed(() => sortOptions.find((option) => option.value === sortField.value)?.label || '最后检测时间')
const mobileFilterSummary = computed(() => {
  const selected = selectedCustomerKeys.value.length ? `已选 ${selectedCustomerKeys.value.length} 位客户` : '全部客户'
  return `${selected} · ${sortLabel.value} · ${sortDirection.value === 'desc' ? '降序' : '升序'}`
})
const detailCustomerName = computed(() => detailRow.value?.customer?.trim() || detailRow.value?.customerDisplay?.trim() || '未提供客户信息')
const detailContact = computed(() => contact(detailRow.value))
const detailSampleCount = computed(() => Number.isFinite(Number(detailRow.value?.sampleCount)) ? Number(detailRow.value?.sampleCount) : 0)
const detailFirstDate = computed(() => detailRow.value?.firstDetectionDate || '暂无')
const detailLastDate = computed(() => detailRow.value?.lastDetectionDate || '暂无')

onMounted(loadRows)
onBeforeUnmount(() => { requestVersion += 1 })

watch(filterOpen, (open) => {
  if (!open) return
  draftCustomerKeys.value = [...selectedCustomerKeys.value]
  draftSortField.value = sortField.value
  draftSortDirection.value = sortDirection.value
})

async function loadRows() {
  const currentRequest = ++requestVersion
  loading.value = true
  loadError.value = ''
  try {
    const nextRows = await getCustomerOverview()
    if (currentRequest !== requestVersion) return
    rows.value = nextRows
    const validKeys = new Set(rows.value.map((row) => row.customerKey))
    selectedCustomerKeys.value = selectedCustomerKeys.value.filter((key) => validKeys.has(key))
  } catch {
    if (currentRequest === requestVersion) loadError.value = '加载失败，请重试'
  } finally {
    if (currentRequest === requestVersion) loading.value = false
  }
}

function applyMobileFilter() {
  selectedCustomerKeys.value = [...draftCustomerKeys.value]
  sortField.value = draftSortField.value
  sortDirection.value = draftSortDirection.value
  filterOpen.value = false
}

function resetMobileFilter() {
  draftCustomerKeys.value = []
  selectedCustomerKeys.value = []
  filterOpen.value = false
}

function showDetails(row: CustomerOverviewRow) {
  detailRow.value = row
  detailsOpen.value = true
}

function handleTableSort({ prop, order }: { prop?: CustomerOverviewSortField; order?: 'ascending' | 'descending' | null }) {
  if (!prop || !order) return
  sortField.value = prop
  sortDirection.value = order === 'ascending' ? 'asc' : 'desc'
}

function money(value: number | null | undefined) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'
}

function contact(row: CustomerOverviewRow | null) {
  const display = row?.customerDisplay?.trim()
  const name = row?.customer?.trim()
  if (!display) return '暂无联系方式'
  const detail = name && display.startsWith(name) ? display.slice(name.length).trim() : display
  return detail || '暂无联系方式'
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

.mobile-customer-overview {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-customer-overview__refresh,
.mobile-customer-overview__error button,
.mobile-customer-overview__close-details {
  min-height: 44px;
  padding: 8px 12px;
  color: #2563eb;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}

.mobile-customer-overview__filters {
  display: grid;
  gap: 14px;
}

.mobile-customer-overview__select {
  width: 100%;
  min-width: 0;
}

.mobile-customer-overview__select :deep(.el-select__wrapper),
.mobile-customer-overview__select :deep(.el-select__input),
.mobile-customer-overview__direction :deep(.el-radio-button__inner) {
  min-height: 44px;
}

.mobile-customer-overview__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fecdca;
  border-radius: 10px;
}

.mobile-customer-overview__detail-list {
  display: grid;
  gap: 12px;
  margin: 0;
}

.mobile-customer-overview__detail-list div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.mobile-customer-overview__detail-list dt {
  flex: 0 0 auto;
  color: #64748b;
}

.mobile-customer-overview__detail-list dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
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
