<template>
  <section class="mobile-sms-template" data-testid="mobile-sms-template">
    <header>
      <div>
        <h2>化验短信生成模板</h2>
        <p>前缀和后缀会自动保存。</p>
      </div>
      <span>自动保存</span>
    </header>

    <div class="mobile-sms-fields">
      <label>
        <span>短信内容前缀</span>
        <el-input
          data-testid="mobile-sms-prefix"
          type="textarea"
          :rows="6"
          resize="vertical"
          :model-value="modelValue.prefix"
          placeholder="可填写任意短信开头内容"
          @update:model-value="updateField('prefix', $event)"
        />
      </label>
      <label>
        <span>短信内容后缀</span>
        <el-input
          data-testid="mobile-sms-suffix"
          type="textarea"
          :rows="6"
          resize="vertical"
          :model-value="modelValue.suffix"
          placeholder="可填写任意短信结尾内容"
          @update:model-value="updateField('suffix', $event)"
        />
      </label>
    </div>

    <section class="mobile-sms-preview" aria-label="短信模板实时预览">
      <div class="mobile-sms-preview__header">
        <strong>实时预览</strong>
        <span>检测结果会在生成短信时插入前缀与后缀之间</span>
      </div>
      <pre data-testid="mobile-sms-preview">{{ previewText }}</pre>
    </section>

    <div class="mobile-sms-actions">
      <el-button data-testid="restore-mobile-sms-defaults" @click="restoreDefaults">恢复默认值</el-button>
      <el-button data-testid="copy-mobile-sms-preview" type="primary" @click="copyPreview">复制预览</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { LabReportSmsTemplate } from '@/types/labReport'
import { createLabReportSmsText, defaultLabReportSmsTemplate } from '@/utils/labReport'

const props = defineProps<{
  modelValue: LabReportSmsTemplate
}>()

const emit = defineEmits<{
  'update:modelValue': [template: LabReportSmsTemplate]
}>()

const previewText = computed(() => createLabReportSmsText([], [], props.modelValue))

function updateField<Key extends keyof LabReportSmsTemplate>(field: Key, value: LabReportSmsTemplate[Key] | string | number) {
  emit('update:modelValue', { ...props.modelValue, [field]: String(value) })
}

async function restoreDefaults() {
  try {
    await ElMessageBox.confirm('确认恢复短信模板默认值吗？当前前缀和后缀将被替换。', '恢复默认值', {
      type: 'warning',
      confirmButtonText: '确认恢复',
      cancelButtonText: '取消'
    })
    emit('update:modelValue', { ...defaultLabReportSmsTemplate })
    ElMessage.success('短信模板已恢复默认值')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error('恢复默认值失败，请重试')
  }
}

async function copyPreview() {
  const text = previewText.value
  if (!text) {
    ElMessage.warning('暂无短信模板内容可复制')
    return
  }
  if (await copyText(text)) {
    ElMessage.success('短信模板内容已复制')
    return
  }
  ElMessage.error('复制失败，请手动复制短信模板内容')
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Some installed/mobile browsers expose Clipboard API but deny it outside HTTPS.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return typeof document.execCommand === 'function' && document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
</script>

<style scoped lang="scss">
.mobile-sms-template {
  display: grid;
  min-width: 0;
  max-width: 100%;
  gap: 10px;
  overflow-x: clip;

  > header,
  > section,
  .mobile-sms-fields {
    min-width: 0;
    padding: 14px;
    background: #ffffff;
    border: 1px solid #dbe5f0;
    border-radius: 10px;
  }

  > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    h2 {
      margin: 0 0 4px;
      color: #10233f;
      font-size: 18px;
    }

    p {
      margin: 0;
      color: #64748b;
      font-size: 13px;
    }

    > span {
      flex: 0 0 auto;
      color: #166534;
      font-size: 12px;
    }
  }
}

.mobile-sms-fields,
.mobile-sms-fields label {
  display: grid;
  gap: 12px;
}

.mobile-sms-fields label {
  gap: 6px;

  > span {
    color: #475569;
    font-size: 13px;
  }
}

.mobile-sms-fields :deep(.el-textarea__inner),
.mobile-sms-actions :deep(.el-button) {
  min-height: 44px;
}

.mobile-sms-preview__header {
  display: grid;
  gap: 4px;

  span {
    color: #64748b;
    font-size: 12px;
  }
}

.mobile-sms-preview pre {
  min-height: 96px;
  margin: 12px 0 0;
  padding: 12px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: #f8fafc;
  border-radius: 8px;
  font: inherit;
}

.mobile-sms-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
</style>
