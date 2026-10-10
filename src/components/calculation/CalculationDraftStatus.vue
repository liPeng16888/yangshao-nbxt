<template>
  <aside
    class="calculation-draft-status"
    :class="`calculation-draft-status--${status}`"
    :data-has-conflict="Boolean(conflict)"
    role="status"
    aria-live="polite"
  >
    <span>{{ statusLabel }}</span>
    <time v-if="status === 'saved' && updatedAt" :datetime="updatedAt">{{ updatedAt }}</time>
    <div v-if="status === 'error' || status === 'conflict'" class="calculation-draft-status__actions">
      <button
        v-if="status === 'error'"
        class="mobile-touch-target"
        type="button"
        @click="emit('retry')"
      >重试保存</button>
      <template v-if="status === 'conflict'">
        <button class="mobile-touch-target" type="button" @click="emit('useServer')">加载服务器版本</button>
        <button class="mobile-touch-target" type="button" @click="emit('overwrite')">覆盖服务器版本</button>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CalculationDraftSyncStatus } from '@/types/calculationDraft'

const props = defineProps<{
  status: CalculationDraftSyncStatus
  updatedAt?: string | null
  conflict?: unknown
}>()

const emit = defineEmits<{
  retry: []
  useServer: []
  overwrite: []
}>()

const labels: Record<CalculationDraftSyncStatus, string> = {
  loading: '正在加载草稿…',
  idle: '草稿已加载',
  saving: '正在保存…',
  retrying: '正在重试保存…',
  saved: '已保存',
  error: '保存失败，请重试。',
  conflict: '检测到其他设备上的更新，请选择保留的版本。'
}

const statusLabel = computed(() => labels[props.status])
</script>

<style scoped lang="scss">
.calculation-draft-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.calculation-draft-status--error,
.calculation-draft-status--conflict {
  color: var(--ui-warning);
}

.calculation-draft-status__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.calculation-draft-status__actions button {
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  padding: 8px 12px;
  background: #fff;
  color: var(--ui-accent-hover);
  cursor: pointer;
}
</style>
