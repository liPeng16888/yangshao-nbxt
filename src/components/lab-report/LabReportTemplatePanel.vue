<template>
  <section class="panel report-template-panel">
    <div class="panel__header">
      <div>
        <h2>化验报告图片模板</h2>
        <p>固定模板会自动保存，下次生成报告时继续沿用。</p>
      </div>
      <el-tag type="success" effect="plain">模板自动保存</el-tag>
    </div>

    <div class="panel__body template-body">
      <div class="template-grid">
        <label>
          <span>报告标题</span>
          <el-input :model-value="modelValue.title" @update:model-value="updateField('title', $event)" />
        </label>
        <label>
          <span>来样单位默认值</span>
          <el-input :model-value="modelValue.sampleUnit" placeholder="留空时自动取样品客户" @update:model-value="updateField('sampleUnit', $event)" />
        </label>
        <label>
          <span>检验员</span>
          <el-input :model-value="modelValue.inspector" @update:model-value="updateField('inspector', $event)" />
        </label>
        <label>
          <span>审核/签名</span>
          <el-input :model-value="modelValue.reviewer" @update:model-value="updateField('reviewer', $event)" />
        </label>
        <label class="template-wide">
          <span>地址</span>
          <el-input :model-value="modelValue.address" @update:model-value="updateField('address', $event)" />
        </label>
        <label class="template-wide">
          <span>联系电话</span>
          <el-input :model-value="modelValue.phone" @update:model-value="updateField('phone', $event)" />
        </label>
      </div>

      <div class="statement-list">
        <span>声明事项</span>
        <el-input
          v-for="(_, index) in modelValue.statements"
          :key="index"
          :model-value="modelValue.statements[index]"
          @update:model-value="updateStatement(index, $event)"
        />
      </div>

      <div class="seal-row">
        <div>
          <span>电子公章</span>
          <div class="seal-actions">
            <input ref="fileInputRef" type="file" accept="image/*" class="seal-file" @change="handleSealFile" />
            <el-button @click="fileInputRef?.click()">上传/替换公章</el-button>
            <el-button v-if="modelValue.sealImage" @click="updateField('sealImage', '')">删除公章</el-button>
          </div>
        </div>
        <div class="seal-preview">
          <img v-if="modelValue.sealImage" :src="modelValue.sealImage" alt="电子公章预览" />
          <span v-else>未上传</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { LabReportTemplate } from '@/types/labReport'

const props = defineProps<{
  modelValue: LabReportTemplate
}>()

const emit = defineEmits<{
  'update:modelValue': [template: LabReportTemplate]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

function updateField<Key extends keyof LabReportTemplate>(field: Key, value: LabReportTemplate[Key] | string | number) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

function updateStatement(index: number, value: string | number) {
  const statements = [...props.modelValue.statements]
  statements[index] = String(value)
  emit('update:modelValue', { ...props.modelValue, statements })
}

function handleSealFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.error('只能上传图片格式的电子公章')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    updateField('sealImage', String(reader.result || ''))
    input.value = ''
  }
  reader.readAsDataURL(file)
}
</script>

<style scoped lang="scss">
.report-template-panel {
  min-width: 0;
}

.template-body {
  display: grid;
  gap: 14px;
}

.template-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));

  label {
    display: grid;
    gap: 6px;
  }

  span {
    color: #475569;
    font-size: 13px;
  }
}

.template-wide {
  grid-column: span 2;
}

.statement-list {
  display: grid;
  gap: 8px;

  > span {
    color: #475569;
    font-size: 13px;
  }
}

.seal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.seal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.seal-file {
  display: none;
}

.seal-preview {
  display: grid;
  width: 118px;
  height: 88px;
  place-items: center;
  overflow: hidden;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;

  img {
    max-width: 100%;
    max-height: 100%;
  }
}

@media (max-width: 1100px) {
  .template-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
