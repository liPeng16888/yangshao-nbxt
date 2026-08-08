<template>
  <div class="page-stack">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>未结款</h2>
          <p class="muted">费用状态为“未结款”的样品会显示在这里。</p>
        </div>
        <div class="panel-actions">
          <el-button
            class="batch-settle-button"
            type="primary"
            :disabled="!selectedRows.length || store.isSettling"
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
          <el-button :loading="store.loading" @click="store.loadUnsettledRows()">刷新</el-button>
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UnsettledSampleRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { filterUnsettledRows } from '@/utils/financeBills'

const router = useRouter()
const store = useFinanceBillsStore()
const selectedCustomers = ref<string[]>([])
const selectedRows = ref<UnsettledSampleRow[]>([])
const tableRef = ref<{ clearSelection: () => void }>()

const customerOptions = computed(() => {
  return Array.from(new Set(store.unsettledRows.map((row) => row.customer))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})

const filteredRows = computed(() => filterUnsettledRows(store.unsettledRows, selectedCustomers.value))

watch(selectedCustomers, async () => {
  selectedRows.value = []
  await nextTick()
  tableRef.value?.clearSelection()
})

onMounted(() => {
  store.loadUnsettledRows()
})

async function handleSettle(row: UnsettledSampleRow, checked: string | number | boolean) {
  if (!checked) return
  await ElMessageBox.confirm(`确认将 ${row.date} 的样品 ${row.sampleNumber} 标记为已结款？`, '确认结款', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await store.settleRow(row)
  ElMessage.success('已同步为已结款')
}

function handleSelectionChange(rows: UnsettledSampleRow[]) {
  selectedRows.value = rows
}

async function handleBatchSettle() {
  if (!selectedRows.value.length) return
  const rows = [...selectedRows.value]
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  await ElMessageBox.confirm(
    `确认将选中的 ${rows.length} 个样品标记为已结款？合计金额 ¥${total.toFixed(2)}。`,
    '批量确认结款',
    {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
  await store.settleRows(rows)
  selectedRows.value = []
  tableRef.value?.clearSelection()
  ElMessage.success(`已将 ${rows.length} 个样品同步为已结款`)
}

function jumpToSample(row: UnsettledSampleRow) {
  router.push({ path: '/data', query: { date: row.date, block: row.blockId } })
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
