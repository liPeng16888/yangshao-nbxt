<template>
  <div class="page-stack">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>未结款</h2>
          <p class="muted">费用状态为“未结款”的样品会显示在这里。</p>
        </div>
        <div class="panel-actions">
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
      <el-table :data="filteredRows" border v-loading="store.loading" empty-text="暂无未结款样品">
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
              :disabled="Boolean(store.settlingId)"
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
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UnsettledSampleRow } from '@/types/financeBills'
import { useFinanceBillsStore } from '@/stores/financeBills'
import { filterUnsettledRows } from '@/utils/financeBills'

const router = useRouter()
const store = useFinanceBillsStore()
const selectedCustomers = ref<string[]>([])

const customerOptions = computed(() => {
  return Array.from(new Set(store.unsettledRows.map((row) => row.customer))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})

const filteredRows = computed(() => filterUnsettledRows(store.unsettledRows, selectedCustomers.value))

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

function jumpToSample(row: UnsettledSampleRow) {
  router.push({ path: '/data', query: { date: row.date, block: row.blockId } })
}
</script>

<style scoped lang="scss">
.panel-actions {
  display: flex;
  align-items: center;
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
