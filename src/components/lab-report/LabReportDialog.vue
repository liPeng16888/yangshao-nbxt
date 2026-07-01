<template>
  <el-dialog :model-value="visible" width="1120px" class="lab-report-dialog" :title="dialogTitle" @close="emit('close')">
    <div v-if="step === 'elements'" class="element-step">
      <el-alert
        title="每个样品默认不勾选检测元素，请手动选择需要出现在化验报告里的项目。"
        type="info"
        show-icon
        :closable="false"
      />

      <div class="sample-element-list">
        <section v-for="block in selectedBlocks" :key="block.id" class="sample-element-card">
          <div class="sample-element-card__header">
            <strong>{{ getBlockDisplayName(block) }}</strong>
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

    <div v-else-if="draft" class="preview-step">
      <div class="preview-actions">
        <el-button @click="step = 'elements'">返回选择元素</el-button>
        <el-button type="primary" :loading="exportingReport" @click="downloadCurrentReport">保存为图片</el-button>
      </div>

      <div class="report-preview">
        <input v-model="draft.title" class="report-title-input" />
        <div class="meta-grid">
          <div class="report-cell report-cell--label">来样日期</div>
          <div class="report-cell"><input v-model="draft.sampleDate" /></div>
          <div class="report-cell report-cell--label">报告日期</div>
          <div class="report-cell"><input v-model="draft.reportDate" /></div>
          <div class="report-cell report-cell--label">来样单位</div>
          <div class="report-cell"><input v-model="draft.sampleUnit" /></div>
          <div class="report-cell report-cell--label">来样数量</div>
          <div class="report-cell"><input v-model="draft.sampleCount" /></div>
        </div>

        <div class="result-grid" :style="{ gridTemplateColumns: resultGridColumns }">
          <div class="report-cell report-cell--sample-header">检验项目/样品编号</div>
          <div v-for="element in displayElements" :key="`${element.id}-label`" class="report-cell">
            <input :value="element.label" :disabled="element.blank" @input="updateDisplayElement(element, 'label', $event)" />
          </div>
          <div v-for="element in displayElements" :key="`${element.id}-symbol`" class="report-cell">
            <input :value="element.symbol" :disabled="element.blank" @input="updateDisplayElement(element, 'symbol', $event)" />
          </div>
          <template v-for="row in paddedRows" :key="row.blockId">
            <div class="report-cell"><input v-model="row.sampleName" /></div>
            <div v-for="element in displayElements" :key="`${row.blockId}-${element.id}`" class="report-cell">
              <input :value="getRowDisplayValue(row, element)" :disabled="element.blank" @input="updateRowDisplayValue(row, element, $event)" />
            </div>
          </template>
        </div>

        <div class="inspector-row">
          <div class="report-cell report-cell--label">检验员</div>
          <div class="report-cell"><input v-model="draft.reviewer" /></div>
        </div>

        <div class="report-bottom">
          <div class="report-bottom__left">
            <div class="statement-title">声明事项</div>
            <textarea
              v-for="(_, index) in draft.statements"
              :key="index"
              v-model="draft.statements[index]"
              class="statement-input"
              :style="{ minHeight: statementInputHeight(draft.statements[index]) }"
            />
            <div class="address-line">
              <div class="contact-line__content">
                <span>地址：</span>
                <input v-model="draft.address" :style="{ width: contactInputWidth(draft.address, 12) }" />
              </div>
            </div>
            <div class="phone-line">
              <div class="contact-line__content">
                <span>联系电话：</span>
                <input v-model="draft.phone" :style="{ width: contactInputWidth(draft.phone, 14) }" />
              </div>
            </div>
          </div>
          <div class="report-bottom__seal">
            <img v-if="draft.sealImage" :src="draft.sealImage" alt="电子公章" />
            <span v-else>电子公章</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
      <el-button v-if="step === 'elements'" type="primary" @click="createPreview">生成预览</el-button>
      <el-button v-else type="primary" :loading="exportingReport" @click="downloadCurrentReport">保存为图片</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { LabReportDraft, LabReportDraftRow, LabReportElementKey, LabReportTemplate } from '@/types/labReport'
import type { SampleBlock } from '@/types/labSheet'
import {
  createReportDraft,
  downloadLabReportAsPng,
  getBlockCustomerName,
  getBlockDisplayName,
  labReportElements
} from '@/utils/labReport'

const MIN_REPORT_ELEMENT_COLUMNS = 5

type DisplayElement = {
  id: string
  key?: LabReportElementKey
  label: string
  symbol: string
  draftIndex?: number
  blank: boolean
}

const props = defineProps<{
  visible: boolean
  blocks: SampleBlock[]
  selectedBlockIds: string[]
  template: LabReportTemplate
  date: string
}>()

const emit = defineEmits<{
  close: []
}>()

const step = ref<'elements' | 'preview'>('elements')
const selectionMap = ref<Record<string, LabReportElementKey[]>>({})
const draft = ref<LabReportDraft | null>(null)
const exportingReport = ref(false)

const selectedBlocks = computed(() => props.blocks.filter((block) => props.selectedBlockIds.includes(block.id)))
const dialogTitle = computed(() => (step.value === 'elements' ? '选择化验报告检测元素' : '化验报告预览'))
const displayElements = computed<DisplayElement[]>(() => {
  if (!draft.value) return []
  const elements: DisplayElement[] = draft.value.elements.map((element, index) => ({
    id: element.key,
    key: element.key,
    label: element.label,
    symbol: element.symbol,
    draftIndex: index,
    blank: false
  }))
  while (elements.length < MIN_REPORT_ELEMENT_COLUMNS) {
    elements.push({ id: `blank-${elements.length}`, label: '', symbol: '', blank: true })
  }
  return elements
})
const resultGridColumns = computed(() => `142px repeat(${Math.max(MIN_REPORT_ELEMENT_COLUMNS, draft.value?.elements.length || 0)}, minmax(0, 1fr))`)
const paddedRows = computed(() => {
  if (!draft.value) return []
  const rows = draft.value.rows
  while (rows.length < 5) {
    rows.push({
      blockId: `empty-${rows.length}`,
      sampleName: '',
      values: Object.fromEntries(labReportElements.map((element) => [element.key, ''])) as Record<LabReportElementKey, string>
    })
  }
  return rows
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    step.value = 'elements'
    draft.value = null
    const nextSelections: Record<string, LabReportElementKey[]> = {}
    selectedBlocks.value.forEach((block) => {
      nextSelections[block.id] = []
    })
    selectionMap.value = nextSelections
  },
  { immediate: true }
)

function createPreview() {
  const selections = selectedBlocks.value.map((block) => ({
    blockId: block.id,
    elementKeys: selectionMap.value[block.id] || []
  }))
  if (!selections.some((selection) => selection.elementKeys.length > 0)) {
    ElMessage.warning('请至少选择一个检测元素')
    return
  }
  draft.value = createReportDraft(selectedBlocks.value, selections, props.template, props.date)
  step.value = 'preview'
}

async function downloadCurrentReport() {
  if (!draft.value || exportingReport.value) return
  exportingReport.value = true
  ElMessage.info('正在生成化验报告图片')
  try {
    const filename = `${sanitizeFilename(draft.value.title)}-${props.date}.png`
    const downloaded = await downloadLabReportAsPng(draft.value, filename)
    if (downloaded) {
      ElMessage.success('化验报告图片已开始下载')
      return
    }
    ElMessage.error('图片生成失败，请刷新页面后重试')
  } catch {
    ElMessage.error('图片生成失败，请刷新页面后重试')
  } finally {
    exportingReport.value = false
  }
}

function updateDisplayElement(element: DisplayElement, field: 'label' | 'symbol', event: Event) {
  if (element.blank || element.draftIndex === undefined || !draft.value) return
  draft.value.elements[element.draftIndex][field] = (event.target as HTMLInputElement).value
}

function getRowDisplayValue(row: LabReportDraftRow, element: DisplayElement) {
  if (element.blank || !element.key) return ''
  return row.values[element.key] || ''
}

function updateRowDisplayValue(row: LabReportDraftRow, element: DisplayElement, event: Event) {
  if (element.blank || !element.key) return
  row.values[element.key] = (event.target as HTMLInputElement).value
}

function statementInputHeight(statement: string) {
  const lineCount = Math.max(1, Math.ceil(statement.length / 64))
  return `${Math.max(28, 10 + lineCount * 18)}px`
}

function contactInputWidth(value: string, minChars: number) {
  const length = Math.max(minChars, Array.from(value || '').length)
  return `${length + 1}em`
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').trim() || '化验报告'
}
</script>

<style scoped lang="scss">
.element-step,
.preview-step {
  display: grid;
  gap: 14px;
}

.sample-element-list {
  display: grid;
  gap: 12px;
  max-height: 520px;
  overflow: auto;
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

.report-preview {
  width: 1008px;
  margin: 0 auto;
  color: #111827;
  background: #ffffff;
  border: 1px solid #111827;
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.report-title-input {
  width: 100%;
  height: 68px;
  font-size: 28px;
  text-align: center;
  border: 0;
  border-bottom: 1px solid #111827;
}

.meta-grid {
  display: grid;
  grid-template-columns: 170px 1fr 170px 1fr;
}

.result-grid {
  display: grid;
  align-items: stretch;
}

.inspector-row {
  display: grid;
  grid-template-columns: 222px 1fr;
}

.report-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 35px;
  border-right: 1px solid #111827;
  border-bottom: 1px solid #111827;
  text-align: center;

  input {
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: 0 4px;
    background: transparent;
    border: 0;
    outline: none;
    text-align: center;
  }

  input:disabled {
    color: transparent;
    cursor: default;
  }
}

.meta-grid .report-cell:nth-child(4n),
.inspector-row .report-cell:last-child {
  border-right: 0;
}

.result-grid .report-cell {
  min-height: 35px;
}

.report-cell--sample-header {
  grid-row: span 2;
  padding: 0 6px;
}

.report-cell--label {
  font-weight: 400;
}

.report-bottom {
  display: grid;
  grid-template-columns: 1fr 230px;
  min-height: 256px;
}

.report-bottom__left {
  border-right: 1px solid #111827;
}

.statement-title {
  height: 34px;
  text-align: center;
  line-height: 34px;
  border-bottom: 1px solid #111827;
}

.statement-input {
  display: block;
  width: 100%;
  padding: 5px 4px;
  resize: none;
  border: 0;
  border-bottom: 1px solid #111827;
  outline: none;
  font-size: 12px;
  line-height: 17px;
  overflow: hidden;
}

.address-line,
.phone-line {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 51px;
  font-size: 24px;
  text-align: center;
  border-bottom: 1px solid #111827;

  input {
    flex: 0 0 auto;
    max-width: 520px;
    border: 0;
    outline: none;
    font-size: inherit;
    text-align: left;
  }
}

.contact-line__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: calc(100% - 24px);
}

.phone-line {
  border-bottom: 0;
}

.report-bottom__seal {
  display: grid;
  place-items: center;
  color: #dc2626;

  img {
    max-width: 190px;
    max-height: 160px;
  }
}
</style>
