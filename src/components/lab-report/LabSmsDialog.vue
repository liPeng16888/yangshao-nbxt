<template>
  <el-dialog
    :model-value="visible"
    width="960px"
    class="lab-sms-dialog"
    :fullscreen="mobile"
    :style="mobile ? mobileLabDialogFrameStyle : undefined"
    :body-class="mobile ? mobileLabDialogBodyClass : undefined"
    :footer-class="mobile ? mobileLabDialogFooterClass : undefined"
    :title="dialogTitle"
    @close="emit('close')"
  >
    <div
      v-if="step === 'elements'"
      class="element-step lab-sms-dialog-content"
      :class="{ 'element-step--mobile': mobile, 'lab-sms-dialog-content--mobile': mobile }"
    >
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

    <div
      v-else
      class="sms-preview-step lab-sms-dialog-content"
      :class="{ 'sms-preview-step--mobile': mobile, 'lab-sms-dialog-content--mobile': mobile }"
    >
      <div class="preview-actions">
        <el-button @click="step = 'elements'">返回选择元素</el-button>
        <el-button type="primary" :loading="copying" :disabled="copying" @click="copySmsText">复制短信</el-button>
      </div>
      <el-input v-model="smsText" type="textarea" :rows="16" resize="vertical" />
    </div>

    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
      <el-button v-if="step === 'elements'" type="primary" :loading="generatingPreview" @click="createSmsPreview">生成短信</el-button>
      <el-button v-else type="primary" :loading="copying" :disabled="copying" @click="copySmsText">复制短信</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { LabReportElementKey, LabReportSmsTemplate } from '@/types/labReport'
import type { SampleBlock } from '@/types/labSheet'
import {
  mobileLabDialogBodyClass,
  mobileLabDialogFooterClass,
  mobileLabDialogFrameStyle
} from './mobileLabDialogLayout'
import {
  createLabReportSmsText,
  getBlockCustomerName,
  getBlockDisplayName,
  labReportElements,
  parseLabElementKeys
} from '@/utils/labReport'
import { writeTextToClipboard } from '@/utils/clipboard'

const props = defineProps<{
  visible: boolean
  blocks: SampleBlock[]
  selectedBlockIds: string[]
  template: LabReportSmsTemplate
  mobile?: boolean
  beforeGenerate?: (blocks: SampleBlock[], kind: 'report' | 'sms') => Promise<boolean>
}>()

const emit = defineEmits<{
  close: []
}>()

const step = ref<'elements' | 'preview'>('elements')
const selectionMap = ref<Record<string, LabReportElementKey[]>>({})
const bulkElementKeys = ref<LabReportElementKey[]>([])
const smsText = ref('')
const copying = ref(false)
const generatingPreview = ref(false)

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

async function createSmsPreview() {
  if (generatingPreview.value) return
  const blocks = JSON.parse(JSON.stringify(selectedBlocks.value)) as SampleBlock[]
  const selections = selectedBlocks.value.map((block) => ({
    blockId: block.id,
    elementKeys: selectionMap.value[block.id] || []
  }))
  if (!selections.some((selection) => selection.elementKeys.length > 0)) {
    ElMessage.warning('请至少选择一个检测元素')
    return
  }
  generatingPreview.value = true
  try {
    if (props.beforeGenerate && !await props.beforeGenerate(blocks, 'sms')) return
    if (!props.visible) return
    const text = createLabReportSmsText(blocks, selections, props.template)
    if (!text) {
      ElMessage.warning('没有可生成的短信内容，请检查样品数据和检测元素')
      return
    }
    smsText.value = text
    step.value = 'preview'
  } finally { generatingPreview.value = false }
}

async function copySmsText() {
  if (copying.value) return
  const text = smsText.value.trim()
  if (!text) {
    ElMessage.warning('暂无短信内容可复制')
    return
  }
  copying.value = true
  try {
    await writeTextToClipboard(text)
    ElMessage.success('短信内容已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制短信内容')
  } finally {
    copying.value = false
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
  background: var(--ui-accent-soft);
}

.bulk-element-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong {
    display: block;
    color: var(--ui-text);
    font-size: 17px;
  }

  span {
    display: block;
    margin-top: 4px;
    color: var(--ui-text-muted);
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
  border: 1px solid var(--ui-line);
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
    color: var(--ui-text-muted);
    font-size: 16px;
  }
}

.element-checkboxes {
  display: grid;
  gap: 8px 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.element-checkboxes small {
  color: var(--ui-text-muted);
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

.lab-sms-dialog-content--mobile {
  min-width: 0;
  max-width: 100%;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  overflow-x: clip;
}

.element-step--mobile .sample-element-list {
  max-height: calc(100dvh - 290px);
  overscroll-behavior: contain;
}

.element-step--mobile .element-checkboxes {
  grid-template-columns: 1fr;
}

.element-step--mobile .bulk-element-card__header,
.element-step--mobile .sample-element-card__header {
  align-items: stretch;
  flex-direction: column;
}

.element-step--mobile .bulk-element-card__actions,
.sms-preview-step--mobile .preview-actions {
  display: grid;
  justify-content: stretch;
  width: 100%;
  grid-template-columns: 1fr;
}

.element-step--mobile .bulk-element-card__actions :deep(.el-button),
.sms-preview-step--mobile .preview-actions :deep(.el-button),
.lab-sms-dialog-content--mobile :deep(.el-checkbox),
.lab-sms-dialog-content--mobile :deep(.el-textarea__inner) {
  min-height: 44px;
  margin: 0;
}

.sms-preview-step--mobile :deep(.el-textarea__inner) {
  max-height: calc(100dvh - 220px);
  font-size: 16px;
}

:global(.lab-sms-dialog.is-fullscreen) {
  display: flex;
  flex-direction: column;
  width: 100% !important;
  max-width: none !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  margin: 0 !important;
  border-radius: 0 !important;
  overflow: hidden;
}

:global(.lab-sms-dialog.is-fullscreen .lab-mobile-action-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow: auto;
  overscroll-behavior: contain;
}

:global(.lab-sms-dialog.is-fullscreen .el-dialog__header) {
  padding-top: calc(12px + env(safe-area-inset-top));
}

:global(.lab-sms-dialog.is-fullscreen .lab-mobile-action-dialog__footer) {
  flex: 0 0 auto;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

:global(.lab-sms-dialog.is-fullscreen .el-dialog__footer .el-button),
:global(.lab-sms-dialog.is-fullscreen .el-dialog__headerbtn) {
  min-width: 44px;
  min-height: 44px;
}
</style>
