<template>
  <el-dialog :model-value="visible" width="960px" class="lab-sms-dialog" :title="dialogTitle" @close="emit('close')">
    <div v-if="step === 'elements'" class="element-step">
      <el-alert
        title="优先使用数据计算中已选择的化验元素；未填写的样品保持空白，可在这里手动选择。"
        type="info"
        show-icon
        :closable="false"
      />

      <section class="bulk-element-card">
        <div class="bulk-element-card__header">
          <div>
            <strong>批量选择检测元素</strong>
            <span>勾选后可一次应用到下方所有样品。</span>
          </div>
          <div class="bulk-element-card__actions">
            <el-button size="small" @click="clearBulkElements">清空批量</el-button>
            <el-button size="small" type="primary" @click="applyBulkElements">应用到下方样品</el-button>
            <el-button size="small" @click="clearAllSelections">清空下方选择</el-button>
          </div>
        </div>
        <el-checkbox-group v-model="bulkElementKeys" class="element-checkboxes bulk-element-card__checkboxes">
          <el-checkbox v-for="element in labReportElements" :key="element.key" :label="element.key">
            {{ element.label }} <small v-if="element.symbol">{{ element.symbol }}</small>
          </el-checkbox>
        </el-checkbox-group>
      </section>

      <div class="sample-element-list">
        <section v-for="block in selectedBlocks" :key="block.id" class="sample-element-card">
          <div class="sample-element-card__header">
            <strong>{{ block.inputs.sampleNumber?.trim() || getBlockDisplayName(block) }}</strong>
            <span>{{ getBlockCustomerName(block) || '无客户信息' }}</span>
          </div>
          <el-checkbox-group v-model="selectionMap[block.id]" class="element-checkboxes">
            <el-checkbox v-for="element in labReportElements" :key="element.key" :label="element.key">
              {{ element.label }} <small v-if="element.symbol">{{ element.symbol }}</small>
            </el-checkbox>
          </el-checkbox-group>
        </section>
      </div>
    </div>

    <div v-else class="sms-preview-step">
      <div class="preview-actions">
        <el-button @click="step = 'elements'">返回选择元素</el-button>
        <el-button type="primary" @click="copySmsText">复制短信</el-button>
      </div>
      <el-input v-model="smsText" type="textarea" :rows="16" resize="vertical" />
    </div>

    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
      <el-button v-if="step === 'elements'" type="primary" @click="createSmsPreview">生成短信</el-button>
      <el-button v-else type="primary" @click="copySmsText">复制短信</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { LabReportElementKey, LabReportSmsTemplate } from '@/types/labReport'
import type { SampleBlock } from '@/types/labSheet'
import {
  createLabReportSmsText,
  getBlockCustomerName,
  getBlockDisplayName,
  labReportElements,
  parseLabElementKeys
} from '@/utils/labReport'

const props = defineProps<{
  visible: boolean
  blocks: SampleBlock[]
  selectedBlockIds: string[]
  template: LabReportSmsTemplate
}>()

const emit = defineEmits<{
  close: []
}>()

const step = ref<'elements' | 'preview'>('elements')
const selectionMap = ref<Record<string, LabReportElementKey[]>>({})
const bulkElementKeys = ref<LabReportElementKey[]>([])
const smsText = ref('')

const selectedBlocks = computed(() => props.blocks.filter((block) => props.selectedBlockIds.includes(block.id)))
const dialogTitle = computed(() => (step.value === 'elements' ? '选择化验短信检测元素' : '化验短信预览'))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    step.value = 'elements'
    smsText.value = ''
    bulkElementKeys.value = []
    const nextSelections: Record<string, LabReportElementKey[]> = {}
    selectedBlocks.value.forEach((block) => {
      nextSelections[block.id] = parseLabElementKeys(block.inputs.elementNote || '')
    })
    selectionMap.value = nextSelections
  },
  { immediate: true }
)

function applyBulkElements() {
  if (!selectedBlocks.value.length) {
    ElMessage.warning('请先选择需要生成短信的样品')
    return
  }
  if (!bulkElementKeys.value.length) {
    ElMessage.warning('请先选择需要批量应用的检测元素')
    return
  }
  const elementKeys = [...bulkElementKeys.value]
  const nextSelections = { ...selectionMap.value }
  selectedBlocks.value.forEach((block) => {
    nextSelections[block.id] = [...elementKeys]
  })
  selectionMap.value = nextSelections
  ElMessage.success('已应用到下方所有样品')
}

function clearBulkElements() {
  bulkElementKeys.value = []
}

function clearAllSelections() {
  const nextSelections = { ...selectionMap.value }
  selectedBlocks.value.forEach((block) => {
    nextSelections[block.id] = []
  })
  selectionMap.value = nextSelections
}

function createSmsPreview() {
  const selections = selectedBlocks.value.map((block) => ({
    blockId: block.id,
    elementKeys: selectionMap.value[block.id] || []
  }))
  if (!selections.some((selection) => selection.elementKeys.length > 0)) {
    ElMessage.warning('请至少选择一个检测元素')
    return
  }
  const text = createLabReportSmsText(selectedBlocks.value, selections, props.template)
  if (!text) {
    ElMessage.warning('没有可生成的短信内容，请检查样品数据和检测元素')
    return
  }
  smsText.value = text
  step.value = 'preview'
}

async function copySmsText() {
  const text = smsText.value.trim()
  if (!text) {
    ElMessage.warning('暂无短信内容可复制')
    return
  }
  if (await copyText(text)) {
    ElMessage.success('短信内容已复制')
    return
  }
  ElMessage.error('复制失败，请手动复制短信内容')
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through for browsers that expose Clipboard API but reject the call.
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
.element-step,
.sms-preview-step {
  display: grid;
  gap: 14px;
}

.sample-element-list {
  display: grid;
  gap: 12px;
  max-height: 520px;
  overflow: auto;
}

.bulk-element-card {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #b6d4fe;
  border-radius: 8px;
  background: #eff6ff;
}

.bulk-element-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong {
    display: block;
    color: #10233f;
    font-size: 17px;
  }

  span {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 14px;
  }
}

.bulk-element-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.bulk-element-card__checkboxes {
  padding-top: 2px;
}

.sample-element-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dce5ef;
  border-radius: 8px;
}

.sample-element-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  strong {
    font-size: 17px;
  }

  span {
    color: #64748b;
    font-size: 16px;
  }
}

.element-checkboxes {
  display: grid;
  gap: 8px 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.element-checkboxes small {
  color: #64748b;
  font-size: 15px;
}

.element-checkboxes :deep(.el-checkbox__label) {
  font-size: 17px;
  line-height: 1.5;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 960px) {
  .element-checkboxes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bulk-element-card__header {
    align-items: stretch;
    flex-direction: column;
  }

  .bulk-element-card__actions {
    justify-content: flex-start;
  }
}
</style>
