<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  saving?: boolean
}>(), {
  saving: false
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    class="mobile-fullscreen-dialog"
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
