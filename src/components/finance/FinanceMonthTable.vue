<template>
  <section class="panel">
    <div class="panel__header">
      <h2>月度支出明细</h2>
      <el-date-picker :model-value="month" type="month" value-format="YYYY-MM" @update:model-value="emit('monthChange', String($event))" />
    </div>
    <el-table :data="entries" border v-loading="loading">
      <el-table-column prop="paymentDate" label="支付日期" width="130" />
      <el-table-column prop="item" label="开支项目" min-width="160" />
      <el-table-column prop="amount" label="开支金额" width="120">
        <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="paymentMethod" label="支付方式" width="120">
        <template #default="{ row }">{{ row.paymentMethod === 'cash' ? '现金支付' : '线上支付' }}</template>
      </el-table-column>
      <el-table-column label="支付截图" width="120">
        <template #default="{ row }">
          <el-image v-if="row.screenshotUrl" :src="row.screenshotUrl" fit="cover" :preview-src-list="[row.screenshotUrl]" class="thumb" />
          <span v-else class="empty-text">无信息</span>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="180">
        <template #default="{ row }">{{ row.remark || '无信息' }}</template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import type { FinanceEntry } from '@/types/finance'

defineProps<{
  month: string
  entries: FinanceEntry[]
  loading?: boolean
}>()

const emit = defineEmits<{
  monthChange: [month: string]
}>()
</script>

<style scoped lang="scss">
.thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
}
</style>
