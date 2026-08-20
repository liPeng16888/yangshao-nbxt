<template>
  <el-dialog
    :model-value="modelValue"
    title="历史样品修改申请"
    width="860px"
    class="historical-sample-change-dialog"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="updateVisibility"
  >
    <template v-if="block">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="提交后将进入审批流程，历史样品当前数据不会立即修改。"
      />

      <div class="sample-change-summary">
        <span>样品 {{ block.index }}</span>
        <span>当前名称：{{ block.inputs.sampleNumber || '未填写' }}</span>
      </div>

      <section class="sample-change-section">
        <h3>允许申请修改的输入</h3>
        <div class="sample-change-form">
          <label class="sample-change-field sample-change-field--wide">
            <span>样品名称</span>
            <el-input
              data-testid="sample-change-sample-number"
              :model-value="draft.sampleNumber || ''"
              :disabled="submitting"
              @update:model-value="updateText('sampleNumber', $event)"
            />
          </label>

          <div class="sample-change-field sample-change-field--wide">
            <span>付款客户</span>
            <CustomerCellEditor
              customer-role="payer"
              :selection-limit="1"
              :model-value="draft.customerText"
              :selected-customers="draft.customers"
              :disabled="submitting"
              placeholder="选择或输入付款客户"
              @update="updatePayerCustomer"
            />
          </div>

          <label class="sample-change-field">
            <span>结款金额</span>
            <el-input
              data-testid="sample-change-price"
              :model-value="priceText"
              :disabled="submitting"
              inputmode="decimal"
              @update:model-value="updatePrice"
              @blur="formatPrice"
            />
          </label>

          <label class="sample-change-field">
            <span>费用状态</span>
            <el-select
              data-testid="sample-change-payment-status"
              :model-value="draft.paymentStatus || ''"
              :disabled="submitting"
              clearable
              placeholder="选择费用状态"
              @update:model-value="updatePaymentStatus"
            >
              <el-option v-for="status in paymentStatusOptions" :key="status" :label="status" :value="status" />
            </el-select>
          </label>

          <div class="sample-change-field sample-change-field--wide">
            <span>化验元素</span>
            <LabElementSelector
              :model-value="draft.elementNote"
              :disabled="submitting"
              @update:model-value="updateElementNote"
            />
          </div>
        </div>

        <div class="sample-change-raw-fields">
          <label v-for="field in rawFields" :key="field" class="sample-change-field">
            <span>{{ fieldLabels[field] }}</span>
            <el-input
              :data-testid="`sample-change-${field}`"
              :model-value="rawValues[field]"
              :disabled="submitting"
              inputmode="decimal"
              @update:model-value="updateRaw(field, $event)"
              @blur="formatRaw(field)"
            />
          </label>
        </div>
      </section>

      <section class="sample-change-section">
        <h3>实际变更</h3>
        <p v-if="!diffRows.length" class="sample-change-empty">尚未修改允许字段。</p>
        <div v-else class="sample-change-diff-list">
          <div
            v-for="row in diffRows"
            :key="row.field"
            class="sample-change-diff-row"
            :data-testid="`sample-change-diff-${row.field}`"
          >
            <strong>{{ row.label }}</strong>
            <span>{{ formatDiffValue(row.oldValue) }}</span>
            <span aria-hidden="true">→</span>
            <span>{{ formatDiffValue(row.newValue) }}</span>
          </div>
        </div>
      </section>

      <section class="sample-change-section">
        <h3>公式结果预览</h3>
        <p class="sample-change-preview-note">仅预览，以审批后服务端计算为准</p>
        <div class="sample-change-preview-grid">
          <div v-for="result in previewFields" :key="result.field" class="sample-change-preview-item">
            <span>{{ result.label }}</span>
            <strong :data-testid="`sample-change-preview-${result.field}`">预览 {{ formatFormulaValue(previewResults[result.field]) }}</strong>
          </div>
        </div>
      </section>

      <section class="sample-change-section">
        <label class="sample-change-reason">
          <span>修改原因 <em>*</em></span>
          <el-input
            data-testid="sample-change-reason"
            :model-value="reason"
            :disabled="submitting"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="请说明本次修改原因"
            @update:model-value="reason = String($event)"
          />
        </label>
      </section>
    </template>

    <template #footer>
      <el-button :disabled="submitting" @click="updateVisibility(false)">取消</el-button>
      <el-button
        data-testid="submit-sample-change"
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submit"
      >
        提交修改申请
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CustomerCellEditor from './CustomerCellEditor.vue'
import LabElementSelector from './LabElementSelector.vue'
import { LAB_SAMPLE_CHANGE_RAW_FIELDS, labSampleChangeFieldLabels } from '@/constants/labSampleChangeRequest'
import type { LabFormulaResult, LabSampleInput, SampleBlock, SamplePaymentStatus } from '@/types/labSheet'
import type { CreateLabSampleChangeRequestPayload, LabSampleChangePatch, LabSampleChangeRawField } from '@/types/labSampleChangeRequest'
import { buildSampleChangePatch, createSampleChangeDraft, sampleChangeDiffRows } from '@/utils/labSampleChangeRequest'
import { calculateSampleResults, formatFormulaValue, parseNumericInput } from '@/utils/formulaEngine'

const props = defineProps<{
  modelValue: boolean
  block: SampleBlock | null
  submitting: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: CreateLabSampleChangeRequestPayload]
}>()

const paymentStatusOptions: SamplePaymentStatus[] = ['已结款', '未结款', '月结款', '预存款']
const rawFields = LAB_SAMPLE_CHANGE_RAW_FIELDS
const fieldLabels = labSampleChangeFieldLabels
const previewFields: Array<{ field: keyof LabFormulaResult; label: string }> = [
  { field: 'iron', label: '铁' },
  { field: 'silicon', label: '硅' },
  { field: 'aluminum', label: '铝' },
  { field: 'aluminumSiliconRatio', label: '铝硅比' },
  { field: 'total', label: '合量' },
  { field: 'density', label: '比重' },
  { field: 'calcium', label: '钙' },
  { field: 'magnesium', label: '镁' },
  { field: 'titanium', label: '钛' },
  { field: 'bottleDensity', label: '瓶水比重' },
  { field: 'moisture', label: '水分' },
  { field: 'burnLoss', label: '灼烧减量' }
]

const activeBlockId = ref<string | null>(null)
const draft = ref<LabSampleInput>({})
const rawValues = ref<Record<LabSampleChangeRawField, string>>(emptyRawValues())
const priceText = ref('')
const reason = ref('')
const localSubmitPending = ref(false)
const parentSubmissionSeen = ref(false)

watch(
  () => [props.modelValue, props.block?.id] as const,
  ([visible, blockId]) => {
    if (!visible || !props.block || blockId === activeBlockId.value) return
    resetDraft(props.block)
  },
  { immediate: true }
)

watch(
  () => props.submitting,
  (submitting) => {
    if (submitting) {
      parentSubmissionSeen.value = true
      return
    }
    if (parentSubmissionSeen.value) {
      localSubmitPending.value = false
      parentSubmissionSeen.value = false
    }
  }
)

const changes = computed<LabSampleChangePatch>(() => {
  if (!props.block) return {}
  try {
    return buildSampleChangePatch(props.block, draft.value)
  } catch {
    return {}
  }
})

const diffRows = computed(() => props.block ? sampleChangeDiffRows(props.block, draft.value) : [])
const previewResults = computed(() => props.block
  ? calculateSampleResults(draft.value, props.block.parameterSnapshot)
  : calculateSampleResults({}, { ironBlank: 0, ironFactor: 0, siliconBlank: 0, siliconFactor: 0, aluminumFactor1: 0, aluminumFactor2: 0, calciumFactor: 0, magnesiumFactor: 0, titaniumFactor: 0 })
)
const canSubmit = computed(() => Boolean(
  props.block?.updatedAt
  && Object.keys(changes.value).length
  && reason.value.trim()
  && !props.submitting
  && !localSubmitPending.value
))

function resetDraft(block: SampleBlock) {
  activeBlockId.value = block.id
  draft.value = createSampleChangeDraft(block)
  rawValues.value = Object.fromEntries(rawFields.map((field) => [field, formatNumber(draft.value[field], 3)])) as Record<LabSampleChangeRawField, string>
  priceText.value = formatNumber(draft.value.price, pricePrecision())
  reason.value = ''
}

function emptyRawValues() {
  return Object.fromEntries(rawFields.map((field) => [field, ''])) as Record<LabSampleChangeRawField, string>
}

function updateVisibility(value: boolean) {
  if (props.submitting && !value) return
  emit('update:modelValue', value)
}

function updateText(field: 'sampleNumber', value: unknown) {
  draft.value[field] = String(value)
}

function updateElementNote(value: unknown) {
  draft.value.elementNote = String(value)
}

function updatePayerCustomer(patch: Partial<LabSampleInput>) {
  Object.assign(draft.value, patch)
}

function updatePaymentStatus(value: unknown) {
  draft.value.paymentStatus = String(value || '') as SamplePaymentStatus | ''
  if (typeof draft.value.price === 'number' && Number.isFinite(draft.value.price)) {
    draft.value.price = pricePrecision() === 0
      ? Math.trunc(draft.value.price)
      : Number(draft.value.price.toFixed(2))
  }
  formatPrice()
}

function updatePrice(value: unknown) {
  const nextValue = sanitizeDecimalInput(String(value ?? ''), pricePrecision())
  priceText.value = nextValue
  draft.value.price = parseNumericInput(nextValue)
}

function formatPrice() {
  priceText.value = formatNumber(draft.value.price, pricePrecision())
}

function updateRaw(field: LabSampleChangeRawField, value: unknown) {
  const nextValue = sanitizeDecimalInput(String(value ?? ''), 3)
  rawValues.value[field] = nextValue
  draft.value[field] = parseNumericInput(nextValue)
}

function formatRaw(field: LabSampleChangeRawField) {
  rawValues.value[field] = formatNumber(draft.value[field], 3)
}

function pricePrecision() {
  return draft.value.paymentStatus === '预存款' ? 0 : 2
}

function formatNumber(value: number | null | undefined, precision: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(precision) : ''
}

function sanitizeDecimalInput(value: string, precision: number) {
  const isNegative = value.trim().startsWith('-')
  const cleaned = value.replace(/[^\d.]/g, '')
  const [integerPart = '', ...decimalParts] = cleaned.split('.')
  const prefix = isNegative ? '-' : ''
  if (precision <= 0) return `${prefix}${integerPart}`
  if (!decimalParts.length) return `${prefix}${integerPart}`
  return `${prefix}${integerPart}.${decimalParts.join('').slice(0, precision)}`
}

function formatDiffValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '空'
  if (typeof value === 'object') {
    const payer = value as { customerIds?: string[]; customerText?: string }
    return payer.customerText || payer.customerIds?.join('、') || '空'
  }
  return String(value)
}

function submit() {
  if (!props.block || !canSubmit.value) return
  localSubmitPending.value = true
  emit('submit', {
    blockId: props.block.id,
    baseUpdatedAt: props.block.updatedAt || '',
    changes: changes.value,
    reason: reason.value.trim()
  })
}
</script>

<style scoped lang="scss">
.sample-change-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 14px 0;
  color: #64748b;
  font-size: 14px;
}

.sample-change-section {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.sample-change-section h3 {
  margin: 0 0 12px;
  color: #10233f;
  font-size: 15px;
}

.sample-change-form,
.sample-change-raw-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.sample-change-raw-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 12px;
}

.sample-change-field,
.sample-change-reason {
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 14px;
}

.sample-change-field--wide {
  grid-column: 1 / -1;
}

.sample-change-field > span,
.sample-change-reason > span {
  font-weight: 600;
}

.sample-change-reason em {
  color: #dc2626;
  font-style: normal;
}

.sample-change-empty,
.sample-change-preview-note {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.sample-change-diff-list {
  display: grid;
  gap: 6px;
}

.sample-change-diff-row {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 13px;
}

.sample-change-diff-row span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.sample-change-preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.sample-change-preview-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  color: #475569;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 13px;
}

.sample-change-preview-item strong {
  color: #0f766e;
  white-space: nowrap;
}

:deep(.el-input),
:deep(.el-select),
:deep(.lab-element-selector),
:deep(.customer-editor) {
  width: 100%;
}

@media (max-width: 720px) {
  .sample-change-form,
  .sample-change-raw-fields,
  .sample-change-preview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
