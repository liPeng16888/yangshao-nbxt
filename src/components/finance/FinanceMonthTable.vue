<template>
  <section class="panel">
    <div class="panel__header">
      <h2>月度支出明细</h2>
      <el-date-picker :model-value="month" type="month" value-format="YYYY-MM" @update:model-value="emit('monthChange', String($event))" />
    </div>
    <el-table :data="sortedEntries" border v-loading="loading">
      <el-table-column prop="paymentDate" label="支付日期" width="130" sortable />
      <el-table-column prop="item" label="开支项目" min-width="160" />
      <el-table-column prop="amount" label="开支金额" width="120">
        <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="paymentMethod" label="支付方式" width="120">
        <template #default="{ row }">{{ row.paymentMethod === 'cash' ? '现金支付' : '线上支付' }}</template>
      </el-table-column>
      <el-table-column label="支付截图" min-width="150">
        <template #default="{ row }">
          <div v-if="getFinanceScreenshotUrls(row).length" class="thumb-list">
            <el-image
              v-for="url in getFinanceScreenshotUrls(row)"
              :key="url"
              :src="url"
              fit="cover"
              :preview-src-list="getFinanceScreenshotUrls(row)"
              class="thumb"
            />
          </div>
          <span v-else class="empty-text">无信息</span>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="180">
        <template #default="{ row }">{{ row.remark || '无信息' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-tag v-if="row.deleteRequestStatus === 'PENDING'" type="warning" effect="plain">删除待审核</el-tag>
          <el-button v-else type="danger" link :loading="deletingId === row.id" @click="emit('deleteRequest', row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FinanceEntry } from '@/types/finance'
import { getFinanceScreenshotUrls } from './useFinanceEntryDraft'

const props = defineProps<{
  month: string
  entries: FinanceEntry[]
  loading?: boolean
  deletingId?: string
}>()

const emit = defineEmits<{
  monthChange: [month: string]
  deleteRequest: [row: FinanceEntry]
}>()

const sortedEntries = computed(() => [...props.entries].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)))

</script>

<style scoped lang="scss">
.thumb-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.thumb {
  width: 42px;
  height: 42px;
  border-radius: 6px;
}
</style>
