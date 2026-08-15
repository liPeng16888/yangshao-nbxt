<template>
  <div class="page-stack" :class="{ 'mobile-page': isMobileLayout }">
    <MobileFinanceEntryForm v-if="isMobileLayout" :save="handleCreate" />
    <FinanceEntryForm v-else @submit="handleCreate" />
    <MobileFinanceEntryList
      v-if="isMobileLayout"
      :month="financeStore.month"
      :entries="financeStore.entries"
      :loading="financeStore.loading"
      :load-error="financeStore.loadError"
      :deleting-id="financeStore.deletingId"
      @month-change="financeStore.loadEntries"
      @retry="financeStore.retryEntries"
      @delete-request="handleDeleteRequest"
    />
    <FinanceMonthTable
      v-else
      :month="financeStore.month"
      :entries="financeStore.entries"
      :loading="financeStore.loading"
      :deleting-id="financeStore.deletingId"
      @month-change="financeStore.loadEntries"
      @delete-request="handleDeleteRequest"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FinanceEntryForm from '@/components/finance/FinanceEntryForm.vue'
import FinanceMonthTable from '@/components/finance/FinanceMonthTable.vue'
import MobileFinanceEntryForm from '@/components/finance/MobileFinanceEntryForm.vue'
import MobileFinanceEntryList from '@/components/finance/MobileFinanceEntryList.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { useFinanceStore } from '@/stores/finance'
import type { FinanceEntry, FinancePayload } from '@/types/finance'

const financeStore = useFinanceStore()
const { isMobileLayout } = useMobileLayout()

onMounted(() => {
  financeStore.loadEntries()
})

onBeforeUnmount(() => {
  financeStore.cancelEntryLoads()
})

async function handleCreate(payloads: FinancePayload[]) {
  await financeStore.addEntries(payloads)
  ElMessage.success(`已提交 ${payloads.length} 条支出账单`)
}

async function handleDeleteRequest(row: FinanceEntry) {
  const result = await ElMessageBox.prompt(`确认申请删除「${row.paymentDate} ${row.item}」？请填写删除理由。`, '删除申请', {
    confirmButtonText: '提交申请',
    cancelButtonText: '取消',
    inputType: 'textarea',
    inputPlaceholder: '请填写删除理由',
    inputValidator: (value) => Boolean(String(value || '').trim()) || '请填写删除理由',
    type: 'warning'
  })
  await financeStore.requestEntryDeletion(row, String(result.value || '').trim())
  ElMessage.success('删除申请已提交，等待后端审核')
}
</script>
