<template>
  <div
    class="page-stack"
    :class="{ 'mobile-page': isMobileLayout, 'mobile-unsettled-page--with-action': isMobileLayout && selectedRows.length }"
  >
    <MobileUnsettledList
      v-if="isMobileLayout"
      :rows="filteredRows"
      :selected-ids="selectedIds"
      :customer-options="customerOptions"
      :selected-customers="selectedCustomers"
      :loading="store.loading"
      :busy="actionPending || store.isSettling"
      :settling-id="store.settlingId"
      @selection-change="handleMobileSelectionChange"
      @filter-change="handleMobileFilterChange"
      @refresh="refreshRows"
      @settle="handleSettle"
      @jump="jumpToSample"
    />

    <section v-else class="panel">
      <div class="panel__header">
        <div>
          <h2>未结款</h2>
          <p class="muted">费用状态为“未结款”的样品会显示在这里。</p>
        </div>
        <div class="panel-actions">
          <el-button
            class="batch-settle-button"
            type="primary"
            :disabled="!selectedRows.length || actionPending || store.isSettling"
            :loading="store.settlingBatch"
            @click="handleBatchSettle"
          >
            批量确认已结款<span v-if="selectedRows.length">（{{ selectedRows.length }}）</span>
          </el-button>
          <el-select
            v-model="selectedCustomers"
            class="customer-filter"
            clearable
            filterable
            multiple
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            placeholder="选择客户"
            size="small"
          >
            <el-option v-for="customer in customerOptions" :key="customer" :label="customer" :value="customer" />
          </el-select>
          <el-button :loading="store.loading" @click="refreshRows">刷新</el-button>
        </div>
      </div>
      <el-table
        ref="tableRef"
        :data="filteredRows"
        row-key="blockId"
        border
        v-loading="store.loading"
        empty-text="暂无未结款样品"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="52" />
        <el-table-column prop="date" label="日期" width="130" />
        <el-table-column prop="sequence" label="编号" width="90" />
        <el-table-column prop="sampleNumber" label="样品编号" min-width="150" />
        <el-table-column prop="customer" label="客户" min-width="180" />
        <el-table-column label="金额" width="120">
          <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="已结款" width="120">
          <template #default="{ row }">
            <el-checkbox
              :model-value="false"
              :disabled="store.isSettling"
              @change="(checked: string | number | boolean) => handleSettle(row, checked)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" @click="jumpToSample(row)">跳转</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <MobileActionBar
      v-if="isMobileLayout && selectedRows.length"
      data-testid="mobile-unsettled-action-bar"
      class="mobile-unsettled-action"
    >
      <div class="mobile-unsettled-action__summary">
        <strong>已选 {{ selectedRows.length }} 项</strong>
        <span>{{ money(selectedTotal) }}</span>
      </div>
      <button
        data-testid="batch-settle-mobile"
        class="mobile-touch-target"
        style="min-width: 44px; min-height: 44px"
        type="button"
        :disabled="actionPending || store.isSettling"
        @click="handleBatchSettle"
      >{{ actionPending || store.settlingBatch ? '结款中…' : '批量确认已结款' }}</button>
    </MobileActionBar>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MobileUnsettledList from '@/components/finance/MobileUnsettledList.vue'
import MobileActionBar from '@/components/mobile/MobileActionBar.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { UnsettledSampleRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { filterUnsettledRows } from '@/utils/financeBills'

const router = useRouter()
const store = useFinanceBillsStore()
const { isMobileLayout } = useMobileLayout()
const selectedCustomers = ref<string[]>([])
const selectedRows = ref<UnsettledSampleRow[]>([])
const tableRef = ref<{ clearSelection: () => void }>()
const actionPending = ref(false)
let selectionVersion = 0
let viewVersion = 0
let actionId = 0
let activeActionId = 0
let disposed = false

const customerOptions = computed(() => {
  return Array.from(new Set(store.unsettledRows.map((row) => row.customer))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})

const filteredRows = computed(() => filterUnsettledRows(store.unsettledRows, selectedCustomers.value))
const selectedIds = computed(() => selectedRows.value.map((row) => row.blockId))
const selectedTotal = computed(() => selectedRows.value.reduce((sum, row) => sum + row.amount, 0))

watch(selectedCustomers, async () => {
  await clearSelection()
})

watch(isMobileLayout, async () => {
  viewVersion += 1
  await clearSelection()
})

onMounted(() => {
  requestUnsettledRows()
})

onBeforeUnmount(() => {
  disposed = true
  viewVersion += 1
  store.cancelUnsettledLoads()
})

async function handleSettle(row: UnsettledSampleRow, checked: string | number | boolean = true) {
  if (!checked) return
  const action = beginAction()
  if (!action) return
  try {
    await ElMessageBox.confirm(`确认将 ${row.date} 的样品 ${row.sampleNumber} 标记为已结款？`, '确认结款', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    })
    if (!isActionCurrent(action)) return
    await store.settleRow(row)
    if (!isActionCurrent(action)) return
    if (action.mobile) {
      await store.loadUnsettledRows()
      if (!isActionCurrent(action)) return
    }
    ElMessage.success('已同步为已结款')
  } catch {
    // The shared request layer reports API errors; cancellation and failure keep UI state unchanged.
  } finally {
    finishAction(action.id)
  }
}

function handleSelectionChange(rows: UnsettledSampleRow[]) {
  selectedRows.value = rows
  selectionVersion += 1
}

function handleMobileSelectionChange(ids: string[]) {
  const idSet = new Set(ids)
  selectedRows.value = store.unsettledRows.filter((row) => idSet.has(row.blockId))
  selectionVersion += 1
}

function handleMobileFilterChange(customers: string[]) {
  selectedCustomers.value = [...customers]
}

async function handleBatchSettle() {
  if (!selectedRows.value.length) return
  const action = beginAction()
  if (!action) return
  const rows = [...selectedRows.value]
  const selectedVersionAtStart = selectionVersion
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  try {
    await ElMessageBox.confirm(
      `确认将选中的 ${rows.length} 个样品标记为已结款？合计金额 ¥${total.toFixed(2)}。`,
      '批量确认结款',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    if (!isActionCurrent(action)) return
    await store.settleRows(rows)
    if (!isActionCurrent(action)) return
    if (action.mobile) {
      await store.loadUnsettledRows()
      if (!isActionCurrent(action)) return
    }
    if (selectionVersion === selectedVersionAtStart && hasSameSelection(rows, selectedRows.value)) {
      await clearSelection()
    }
    ElMessage.success(`已将 ${rows.length} 个样品同步为已结款`)
  } catch {
    // Preserve the exact selection after cancellation, conflict, mutation failure, or refresh failure.
  } finally {
    finishAction(action.id)
  }
}

function jumpToSample(row: UnsettledSampleRow) {
  router.push({ path: '/data', query: { date: row.date, block: row.blockId } })
}

function refreshRows() {
  if (actionPending.value) return
  requestUnsettledRows()
}

function requestUnsettledRows() {
  void store.loadUnsettledRows().catch(() => undefined)
}

async function clearSelection() {
  selectedRows.value = []
  selectionVersion += 1
  await nextTick()
  tableRef.value?.clearSelection()
}

function hasSameSelection(expected: UnsettledSampleRow[], current: UnsettledSampleRow[]) {
  if (expected.length !== current.length) return false
  const currentIds = new Set(current.map((row) => row.blockId))
  return expected.every((row) => currentIds.has(row.blockId))
}

function beginAction() {
  if (actionPending.value || store.isSettling) return null
  const id = ++actionId
  activeActionId = id
  actionPending.value = true
  return { id, viewVersion, mobile: isMobileLayout.value }
}

function isActionCurrent(action: { viewVersion: number; mobile: boolean }) {
  return !disposed && action.viewVersion === viewVersion && action.mobile === isMobileLayout.value
}

function finishAction(id: number) {
  if (activeActionId === id) actionPending.value = false
}

function money(value: number) {
  return `¥${Number(value).toFixed(2)}`
}
</script>

<style scoped lang="scss">
.panel-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.customer-filter {
  width: min(360px, 42vw);
}

.mobile-unsettled-page--with-action {
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.mobile-unsettled-action {
  align-items: center;
}

.mobile-unsettled-action__summary {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.mobile-unsettled-action__summary strong,
.mobile-unsettled-action__summary span {
  overflow-wrap: anywhere;
}

.mobile-unsettled-action__summary span {
  color: #2563eb;
  font-weight: 700;
}

.mobile-unsettled-action > button {
  padding: 8px 14px;
  color: #fff;
  background: #2563eb;
  border: 0;
  border-radius: 8px;
}

.mobile-unsettled-action > button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 760px) {
  .panel__header,
  .panel-actions {
    align-items: stretch;
  }

  .panel-actions {
    width: 100%;
  }

  .customer-filter {
    width: 100%;
  }
}
</style>
