<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  summary: string
  modelValue: boolean
  fullscreen?: boolean
}>()

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
