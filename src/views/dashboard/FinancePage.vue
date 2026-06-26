<template>
  <div class="page-stack">
    <FinanceEntryForm @submit="handleCreate" />
    <FinanceMonthTable
      :month="financeStore.month"
      :entries="financeStore.entries"
      :loading="financeStore.loading"
      @month-change="financeStore.loadEntries"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import FinanceEntryForm from '@/components/finance/FinanceEntryForm.vue'
import FinanceMonthTable from '@/components/finance/FinanceMonthTable.vue'
import { useFinanceStore } from '@/stores/finance'
import type { FinancePayload } from '@/types/finance'

const financeStore = useFinanceStore()

onMounted(() => {
  financeStore.loadEntries()
})

async function handleCreate(payload: FinancePayload) {
  await financeStore.addEntry(payload)
  ElMessage.success('支出账单已提交')
}
</script>
