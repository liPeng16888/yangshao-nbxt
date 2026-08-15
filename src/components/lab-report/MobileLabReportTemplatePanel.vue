<template>
  <section class="mobile-report-template" data-testid="mobile-report-template">
    <header class="mobile-report-template__header">
      <div>
        <h2>化验报告图片模板</h2>
        <p>模板会自动保存，并沿用于下一次报告。</p>
      </div>
      <span>自动保存</span>
    </header>

    <details class="mobile-template-group">
      <summary>固定文本</summary>
      <div class="mobile-template-fields">
        <label>
          <span>报告标题</span>
          <el-input data-testid="mobile-report-title" :model-value="modelValue.title" @update:model-value="updateField('title', $event)" />
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
        <label>
          <span>地址</span>
          <el-input :model-value="modelValue.address" @update:model-value="updateField('address', $event)" />
        </label>
        <label>
          <span>联系电话</span>
          <el-input inputmode="tel" :model-value="modelValue.phone" @update:model-value="updateField('phone', $event)" />
        </label>
      </div>
    </details>

    <details class="mobile-template-group">
      <summary>元素顺序</summary>
      <div class="mobile-element-order">
        <p>生成报告时继续使用现有检测元素顺序。</p>
        <ol aria-label="当前检测元素顺序">
          <li v-for="element in labReportElements" :key="element.key">
            {{ element.label }}<small v-if="element.symbol">{{ element.symbol }}</small>
          </li>
        </ol>
      </div>
    </details>

    <details class="mobile-template-group">
      <summary>显示选项</summary>
      <div class="mobile-template-fields">
        <fieldset class="mobile-statements">
          <legend>声明事项</legend>
          <el-input
            v-for="(_, index) in modelValue.statements"
            :key="index"
            type="textarea"
            :rows="3"
            :aria-label="`声明事项 ${index + 1}`"
            :model-value="modelValue.statements[index]"
            @update:model-value="updateStatement(index, $event)"
          />
        </fieldset>
        <div class="mobile-seal-row">
          <div>
            <span>电子公章</span>
            <div class="mobile-seal-actions">
              <input ref="fileInputRef" type="file" accept="image/*" class="mobile-seal-file" @change="handleSealFile" />
              <el-button @click="fileInputRef?.click()">上传/替换公章</el-button>
              <el-button v-if="modelValue.sealImage" @click="updateField('sealImage', '')">删除公章</el-button>
            </div>
          </div>
          <div class="mobile-seal-preview">
            <img v-if="modelValue.sealImage" :src="modelValue.sealImage" alt="电子公章预览" />
            <span v-else>未上传</span>
          </div>
        </div>
      </div>
    </details>

    <section class="mobile-report-preview" style="max-width: 100%" data-testid="mobile-report-preview" aria-label="化验报告模板预览">
      <strong>{{ modelValue.title }}</strong>
      <dl>
        <div><dt>来样单位</dt><dd>{{ modelValue.sampleUnit || '按样品客户自动填写' }}</dd></div>
        <div><dt>检验员</dt><dd>{{ modelValue.reviewer }}</dd></div>
        <div><dt>地址</dt><dd>{{ modelValue.address }}</dd></div>
        <div><dt>联系电话</dt><dd>{{ modelValue.phone }}</dd></div>
      </dl>
    </section>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { LabReportTemplate } from '@/types/labReport'
import { labReportElements } from '@/utils/labReport'

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
.mobile-report-template {
  display: grid;
  min-width: 0;
  max-width: 100%;
  gap: 10px;
  overflow-x: clip;
}

.mobile-report-template__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  background: #ffffff;
  border: 1px solid #dbe5f0;
  border-radius: 10px;

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

.mobile-template-group {
  min-width: 0;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #dbe5f0;
  border-radius: 10px;

  summary {
    min-height: 44px;
    padding: 12px 14px;
    color: #10233f;
    cursor: pointer;
    font-weight: 700;
  }
}

.mobile-template-fields,
.mobile-element-order {
  display: grid;
  gap: 12px;
  padding: 0 14px 14px;
}

.mobile-template-fields label {
  display: grid;
  min-width: 0;
  gap: 6px;

  > span {
    color: #475569;
    font-size: 13px;
  }
}

.mobile-template-fields :deep(.el-input__wrapper),
.mobile-template-fields :deep(.el-textarea__inner),
.mobile-template-fields :deep(.el-button),
.mobile-seal-actions :deep(.el-button) {
  min-height: 44px;
}

.mobile-element-order p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.mobile-element-order ol {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 24px;
  color: #334155;
}

.mobile-element-order small {
  margin-left: 6px;
  color: #64748b;
}

.mobile-statements {
  display: grid;
  min-width: 0;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;

  legend {
    margin-bottom: 6px;
    color: #475569;
    font-size: 13px;
  }
}

.mobile-seal-row,
.mobile-seal-actions {
  display: flex;
  gap: 8px;
}

.mobile-seal-row {
  align-items: flex-start;
  justify-content: space-between;
}

.mobile-seal-actions {
  flex-wrap: wrap;
  margin-top: 6px;
}

.mobile-seal-file {
  display: none;
}

.mobile-seal-preview {
  display: grid;
  flex: 0 0 96px;
  width: 96px;
  height: 76px;
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

.mobile-report-preview {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  padding: 16px;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #94a3b8;
  border-radius: 10px;

  > strong {
    display: block;
    overflow-wrap: anywhere;
    text-align: center;
  }

  dl {
    display: grid;
    gap: 8px;
    margin: 14px 0 0;
  }

  dl div {
    display: grid;
    min-width: 0;
    grid-template-columns: 74px minmax(0, 1fr);
    gap: 8px;
  }

  dt {
    color: #64748b;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }
}
</style>
