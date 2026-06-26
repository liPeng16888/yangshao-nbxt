<template>
  <div class="page-stack">
    <BlacklistTable
      :records="blacklistStore.records"
      :keyword="blacklistStore.keyword"
      :loading="blacklistStore.loading"
      :highlight-id="highlightId"
      :current-username="authStore.user?.username || ''"
      :deleting-id="blacklistStore.deletingId"
      @search="blacklistStore.loadRecords"
      @delete="handleDelete"
    />
    <BlacklistUploadForm @submit="handleCreate" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import BlacklistTable from '@/components/blacklist/BlacklistTable.vue'
import BlacklistUploadForm from '@/components/blacklist/BlacklistUploadForm.vue'
import { useAuthStore } from '@/stores/auth'
import { useBlacklistStore } from '@/stores/blacklist'
import type { BlacklistPayload } from '@/types/blacklist'

const route = useRoute()
const authStore = useAuthStore()
const blacklistStore = useBlacklistStore()
const highlightId = computed(() => (typeof route.query.hit === 'string' ? route.query.hit : ''))

onMounted(() => {
  blacklistStore.loadRecords()
})

watch(
  () => route.query.hit,
  () => {
    blacklistStore.loadRecords()
  }
)

async function handleCreate(payload: BlacklistPayload) {
  const record = await blacklistStore.addRecord(payload)
  ElMessage.success('黑名单已保存')
  await blacklistStore.loadRecords()
  if (record.id) {
    window.setTimeout(() => {
      document.querySelector('.blacklist-row--highlight')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
  }
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('确认删除这条黑名单记录？删除后不可恢复。', '删除黑名单', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning',
    confirmButtonClass: 'el-button--danger'
  })
  await blacklistStore.deleteRecord(id)
  ElMessage.success('黑名单已删除')
}
</script>
