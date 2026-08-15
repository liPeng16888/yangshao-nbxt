<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  saving?: boolean
  fullscreen?: boolean
}>(), {
  saving: false,
  fullscreen: false
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const fullscreenStyles = {
  width: '100%',
  height: '100dvh',
  paddingTop: 'max(16px, env(safe-area-inset-top))',
  paddingBottom: 'max(12px, env(safe-area-inset-bottom))'
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    class="mobile-fullscreen-dialog"
    :class="{ 'mobile-fullscreen-dialog--active': fullscreen }"
    :style="fullscreen ? fullscreenStyles : undefined"
    :model-value="props.modelValue"
    :title="title"
    :show-close="!saving"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    role="dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />

    <template #footer>
      <slot name="footer" :cancel="close" :confirm="() => emit('confirm')" :saving="saving">
        <div class="mobile-fullscreen-dialog__actions">
          <button class="mobile-fullscreen-dialog__cancel mobile-touch-target" type="button" :disabled="saving" @click="close">
            取消
          </button>
          <button class="mobile-fullscreen-dialog__confirm mobile-touch-target" type="button" :disabled="saving" @click="emit('confirm')">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </slot>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.mobile-fullscreen-dialog--active {
  display: flex;
  flex-direction: column;
  width: 100% !important;
  max-width: none !important;
  height: 100dvh;
  max-height: none;
  margin: 0 !important;
  padding-top: max(16px, env(safe-area-inset-top));
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-radius: 0 !important;
}

.mobile-fullscreen-dialog--active :deep(.el-dialog__body) {
  flex: 1;
  max-height: none;
  overflow: auto;
}

.mobile-fullscreen-dialog--active :deep(.el-dialog__footer) {
  padding-bottom: 0;
}
</style>
