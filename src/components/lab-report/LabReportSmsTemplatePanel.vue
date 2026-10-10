<template>
  <section class="panel sms-template-panel">
    <div class="panel__header">
      <div>
        <h2>化验短信生成模板</h2>
        <p>短信内容前缀和后缀会自动保存，下次生成短信时继续沿用。</p>
      </div>
      <el-tag type="success" effect="plain">模板自动保存</el-tag>
    </div>

    <div class="panel__body sms-template-body">
      <label class="sms-template-field">
        <span>短信内容前缀</span>
        <el-input
          type="textarea"
          :rows="10"
          resize="vertical"
          :model-value="modelValue.prefix"
          placeholder="可填写任意短信开头内容"
          @update:model-value="updateField('prefix', $event)"
        />
      </label>

      <label class="sms-template-field">
        <span>短信内容后缀</span>
        <el-input
          type="textarea"
          :rows="10"
          resize="vertical"
          :model-value="modelValue.suffix"
          placeholder="可填写任意短信结尾内容"
          @update:model-value="updateField('suffix', $event)"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { LabReportSmsTemplate } from '@/types/labReport'

const props = defineProps<{
  modelValue: LabReportSmsTemplate
}>()

const emit = defineEmits<{
  'update:modelValue': [template: LabReportSmsTemplate]
}>()

function updateField<Key extends keyof LabReportSmsTemplate>(field: Key, value: LabReportSmsTemplate[Key] | string | number) {
  emit('update:modelValue', { ...props.modelValue, [field]: String(value) })
}
</script>

<style scoped lang="scss">
.sms-template-panel {
  min-width: 0;
}

.sms-template-body {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sms-template-field {
  display: grid;
  gap: 8px;
  min-width: 0;

  > span {
    color: var(--ui-text-secondary);
    font-size: 13px;
  }
}

@media (max-width: 1100px) {
  .sms-template-body {
    grid-template-columns: 1fr;
  }
}
</style>
