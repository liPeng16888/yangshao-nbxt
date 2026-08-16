<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  summary: string
  modelValue: boolean
  fullscreen?: boolean
}>()

const fullscreenStyles = {
  width: '100%',
  height: '100dvh',
  maxHeight: '100dvh',
  margin: '0',
  paddingTop: 'max(16px, env(safe-area-inset-top))',
  paddingBottom: 'max(12px, env(safe-area-inset-bottom))'
}

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: []
  reset: []
}>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})
</script>

<template>
  <div class="mobile-filter-drawer">
    <button
      class="mobile-filter-summary mobile-touch-target"
      type="button"
      :aria-label="`打开筛选：${summary}`"
      @click="open = true"
    >
      <span class="mobile-filter-summary__value">{{ summary }}</span>
      <span class="mobile-filter-summary__action">筛选</span>
    </button>

    <el-drawer
      v-model="open"
      class="mobile-filter-drawer__panel"
      :class="{ 'mobile-filter-drawer__panel--fullscreen': fullscreen }"
      :style="fullscreen ? fullscreenStyles : undefined"
      :title="title"
      direction="btt"
      :size="fullscreen ? '100%' : 'auto'"
    >
      <slot />

      <template #footer>
        <div class="mobile-filter-drawer__actions">
          <button class="mobile-touch-target" type="button" @click="emit('reset')">重置</button>
          <button class="mobile-touch-target" type="button" @click="emit('apply')">应用筛选</button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
:global(.mobile-filter-drawer__panel--fullscreen) {
  width: 100% !important;
  max-width: none !important;
  height: 100dvh !important;
  max-height: none !important;
  margin: 0 !important;
  border-radius: 0 !important;
}

:global(.mobile-filter-drawer__panel--fullscreen .el-drawer__body) {
  min-height: 0;
  overflow: auto;
}

:global(.mobile-filter-drawer__panel .el-drawer__close-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
}
</style>
