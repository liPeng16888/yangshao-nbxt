<script setup lang="ts">
import MobileBlacklistForm from './MobileBlacklistForm.vue'
import MobileBlacklistList from './MobileBlacklistList.vue'
import type { BlacklistPayload, BlacklistRecord } from '@/types/blacklist'

defineProps<{
  records: BlacklistRecord[]
  keyword: string
  loading: boolean
  highlightId: string
  loadError: string
  deletingId: string
  updatingId: string
  save: (payload: BlacklistPayload) => Promise<void>
}>()

defineEmits<{
  retry: []
  search: [keyword: string]
  supplement: [row: BlacklistRecord]
  delete: [id: string]
}>()
</script>

<template>
  <section class="panel mobile-blacklist-page">
    <div class="panel__header"><div><h2>黑名单</h2><p class="muted">查询、新增和补充黑名单客户信息。</p></div></div>
    <div v-if="loadError" class="mobile-blacklist-page__error" data-testid="mobile-blacklist-load-error" role="alert">
      <span>{{ loadError }}</span>
      <button data-testid="mobile-blacklist-retry" class="mobile-touch-target" type="button" :disabled="loading" @click="$emit('retry')">重试</button>
    </div>
    <MobileBlacklistList
      :records="records" :keyword="keyword" :loading="loading" :highlight-id="highlightId"
      :deleting-id="deletingId" :updating-id="updatingId"
      @search="$emit('search', $event)" @supplement="$emit('supplement', $event)" @delete="$emit('delete', $event)"
    />
    <MobileBlacklistForm :save="save" />
  </section>
</template>

<style scoped lang="scss">
.mobile-blacklist-page { display: grid; min-width: 0; gap: 16px; }
.mobile-blacklist-page__error { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; color: var(--ui-danger); background: var(--ui-danger-soft); border: 1px solid var(--ui-danger-line); border-radius: 10px; }
.mobile-blacklist-page__error button { min-height: 44px; padding: 8px 12px; color: var(--ui-danger); background: #fff; border: 1px solid currentcolor; border-radius: 8px; }
</style>
