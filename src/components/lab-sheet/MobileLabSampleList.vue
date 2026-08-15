<template>
  <section class="mobile-sample-list" aria-label="手机样品录入列表">
    <article
      v-for="block in blocks"
      :key="block.id"
      class="mobile-sample-card"
      :class="{
        'mobile-sample-card--expanded': activeBlockId === block.id,
        'mobile-sample-card--highlight': highlightBlockId === block.id,
        'mobile-sample-card--completed': block.inputs.completed
      }"
      :data-block-id="block.id"
    >
      <header class="mobile-sample-card__header">
        <input
          v-if="selectionMode"
          type="checkbox"
          class="mobile-sample-card__checkbox"
          :data-selection-block="block.id"
          :checked="selectedBlockIds?.includes(block.id)"
          :aria-label="`选择样品 ${block.inputs.sequence || block.index}`"
          @click.stop
          @change="emitSelection(block.id, $event)"
        />
        <button class="mobile-sample-card__toggle" type="button" @click="openBlock(block.id)">
          <span class="mobile-sample-card__sequence">{{ block.inputs.sequence || String(block.index).padStart(3, '0') }}</span>
          <span class="mobile-sample-card__summary">
            <strong>{{ block.inputs.sampleNumber || '未填写样品名称' }}</strong>
            <small>{{ block.inputs.customerText || '未选择付款客户' }}</small>
          </span>
          <span class="mobile-sample-card__badges">
            <i v-if="block.inputs.completed">已完成</i>
            <i v-if="block.inputs.paymentStatus">{{ block.inputs.paymentStatus }}</i>
          </span>
          <span class="mobile-sample-card__chevron" aria-hidden="true">{{ activeBlockId === block.id ? '⌃' : '⌄' }}</span>
        </button>
      </header>

      <div v-if="activeBlockId === block.id" class="mobile-sample-card__body">
        <section class="mobile-form-section mobile-form-section--identity">
          <h3>样品信息</h3>
          <div class="mobile-field-grid mobile-field-grid--identity">
            <label class="mobile-field">
              <span>编号</span>
              <input
                data-mobile-field="sequence"
                :value="block.inputs.sequence || ''"
                :disabled="isDisabled(block)"
                enterkeyhint="next"
                @focus="rememberField(block, 'sequence')"
                @input="updateText(block, 'sequence', $event)"
                @blur="commitText(block, 'sequence', $event)"
                @keydown.enter.prevent="focusNextField"
              />
            </label>
            <label class="mobile-field mobile-field--wide">
              <span>样品名称</span>
              <input
                data-mobile-field="sampleNumber"
                :value="block.inputs.sampleNumber || ''"
                :disabled="isDisabled(block)"
                enterkeyhint="next"
                placeholder="输入样品名称"
                @focus="rememberField(block, 'sampleNumber')"
                @input="updateText(block, 'sampleNumber', $event)"
                @blur="commitText(block, 'sampleNumber', $event)"
                @keydown.enter.prevent="focusNextField"
              />
            </label>
            <div class="mobile-field mobile-field--wide" data-mobile-field="customerText">
              <span>付款客户</span>
              <CustomerCellEditor
                customer-role="payer"
                :selection-limit="1"
                :model-value="block.inputs.customerText"
                :selected-customers="block.inputs.customers"
                :disabled="isDisabled(block)"
                placeholder="选择付款客户"
                @update="(patch) => handleCustomerUpdate(block, patch, 'customerText')"
                @blacklist-hit="(records) => emit('blacklistHit', records)"
              />
            </div>
            <div class="mobile-field mobile-field--wide" data-mobile-field="recipientCustomerText">
              <span>数据接收客户</span>
              <CustomerCellEditor
                customer-role="recipient"
                :selection-limit="0"
                :model-value="block.inputs.recipientCustomerText"
                :selected-customers="block.inputs.recipientCustomers"
                :disabled="isDisabled(block)"
                placeholder="选择数据接收客户"
                @update="(patch) => handleCustomerUpdate(block, patch, 'recipientCustomerText')"
                @blacklist-hit="(records) => emit('blacklistHit', records)"
              />
            </div>

            <template v-if="isSensitiveHidden(block)">
              <div class="mobile-field mobile-field--locked"><span>{{ getSampleAmountLabel(block) }}</span><b>🔒 已隐藏</b></div>
              <div class="mobile-field mobile-field--locked"><span>结款状态</span><b>🔒 已隐藏</b></div>
            </template>
            <template v-else>
              <label class="mobile-field" :class="{ 'mobile-field--required': isSampleAmountRequired(block) }">
                <span>{{ getSampleAmountLabel(block) }}</span>
                <input
                  data-mobile-field="price"
                  type="text"
                  inputmode="decimal"
                  :value="formatInput(block.inputs.price, getSampleAmountPrecision(block))"
                  :disabled="isDisabled(block)"
                  enterkeyhint="next"
                  @focus="rememberField(block, 'price')"
                  @input="updateNumber(block, 'price', $event)"
                  @blur="commitNumber(block, 'price', $event)"
                  @keydown.enter.prevent="focusNextField"
                />
              </label>
              <label class="mobile-field" :class="{ 'mobile-field--required': isSamplePaymentStatusRequired(block) }">
                <span>结款状态</span>
                <select
                  data-mobile-field="paymentStatus"
                  :value="block.inputs.paymentStatus || ''"
                  :disabled="isDisabled(block)"
                  @change="updatePaymentStatus(block, $event)"
                >
                  <option value="">请选择</option>
                  <option v-for="status in samplePaymentStatusOptions" :key="status" :value="status">{{ status }}</option>
                </select>
              </label>
            </template>

            <div class="mobile-field mobile-field--wide" :class="{ 'mobile-field--required': isSampleElementNoteRequired(block) }" data-mobile-field="elementNote">
              <span>化验元素</span>
              <LabElementSelector
                :model-value="block.inputs.elementNote"
                :disabled="isDisabled(block)"
                @update:model-value="(value) => updateElementNote(block, value)"
              />
            </div>
            <label class="mobile-field mobile-field--wide">
              <span>备注</span>
              <textarea
                data-mobile-field="note"
                rows="2"
                :value="block.inputs.note || ''"
                :disabled="isDisabled(block)"
                enterkeyhint="done"
                placeholder="输入备注"
                @focus="rememberField(block, 'note')"
                @input="updateText(block, 'note', $event)"
                @blur="commitText(block, 'note', $event)"
              />
            </label>
          </div>
        </section>

        <div v-if="isSensitiveHidden(block)" class="mobile-sensitive-lock">
          <span aria-hidden="true">🔒</span>
          <div>
            <strong>已完成样品数据已加密</strong>
            <small>请使用现有访问密码验证后查看检测数据、金额和结款状态。</small>
          </div>
        </div>

        <template v-else>
          <div v-if="isSampleCalculationBlocked(block)" class="mobile-prerequisite-warning">
            {{ getSampleCalculationBlockMessage(block) }}后录入检测数据
          </div>

          <section v-for="group in mobileFieldGroups" :key="group.key" class="mobile-form-section">
            <h3>{{ group.label }}</h3>
            <div class="mobile-field-grid">
              <label v-for="field in group.fields" :key="field.key" class="mobile-field">
                <span>{{ field.label }}</span>
                <input
                  :data-mobile-field="field.key"
                  type="text"
                  inputmode="decimal"
                  :value="formatInput(block.inputs[field.key])"
                  :disabled="isDisabled(block) || isSampleCalculationBlocked(block)"
                  enterkeyhint="next"
                  @focus="rememberField(block, field.key)"
                  @input="updateNumber(block, field.key, $event)"
                  @blur="commitNumber(block, field.key, $event)"
                  @keydown.enter.prevent="focusNextField"
                />
              </label>
            </div>
            <div class="mobile-result-grid">
              <div v-for="result in group.results" :key="result.label" class="mobile-result">
                <span>{{ result.label }}</span>
                <strong>{{ formatResult(getResultValue(block, result)) }}</strong>
              </div>
            </div>
          </section>
        </template>

        <button class="mobile-save-next" type="button" @click="saveAndOpenNext(block)">
          {{ isDisabled(block) ? '查看下一项' : '保存并录入下一项' }}
        </button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import CustomerCellEditor from './CustomerCellEditor.vue'
import LabElementSelector from './LabElementSelector.vue'
import type { BlacklistRecord } from '@/types/blacklist'
import type { LabFormulaResult, LabSampleInput, SampleBlock, SamplePaymentStatus } from '@/types/labSheet'
import { formatFormulaValue, parseNumericInput } from '@/utils/formulaEngine'
import {
  getSampleAmountLabel,
  getSampleAmountPrecision,
  getSampleCalculationBlockMessage,
  isCompletedSampleSensitiveHidden,
  isSampleAmountRequired,
  isSampleCalculationBlocked,
  isSampleElementNoteRequired,
  isSamplePaymentStatusRequired,
  samplePaymentStatusOptions
} from '@/utils/labSampleRules'

type MobileInputField = { key: keyof LabSampleInput; label: string }
type MobileResultField = {
  label: string
  source: 'input' | 'result'
  key: keyof LabSampleInput | keyof LabFormulaResult
}
type MobileFieldGroup = {
  key: string
  label: string
  fields: MobileInputField[]
  results: MobileResultField[]
}

const mobileFieldGroups: MobileFieldGroup[] = [
  {
    key: 'metal',
    label: '金属元素',
    fields: [
      { key: 'ironRaw', label: '铁' }, { key: 'siliconRaw', label: '硅' }, { key: 'siliconAdjust', label: '硅调整数' },
      { key: 'aluminumRaw', label: '铝' }, { key: 'aluminumAdjust', label: '铝调整数' }, { key: 'sulfur', label: '硫' }
    ],
    results: [
      { label: '铁结果', source: 'result', key: 'iron' }, { label: '硅结果', source: 'result', key: 'silicon' },
      { label: '铝结果', source: 'result', key: 'aluminum' }, { label: '铝硅比', source: 'result', key: 'aluminumSiliconRatio' },
      { label: '合量', source: 'result', key: 'total' }, { label: '硫', source: 'input', key: 'sulfur' }
    ]
  },
  {
    key: 'density',
    label: '比重 / 白度',
    fields: [
      { key: 'densityRaw', label: '比重' }, { key: 'whiteness', label: '白度' }, { key: 'calciumRaw', label: '钙' },
      { key: 'magnesiumRaw', label: '镁' }, { key: 'carbon', label: '碳' }, { key: 'titaniumRaw', label: '钛' }
    ],
    results: [
      { label: '比重结果', source: 'result', key: 'density' }, { label: '白度', source: 'input', key: 'whiteness' },
      { label: '钙结果', source: 'result', key: 'calcium' }, { label: '镁结果', source: 'result', key: 'magnesium' },
      { label: '碳', source: 'input', key: 'carbon' }, { label: '钛结果', source: 'result', key: 'titanium' }
    ]
  },
  {
    key: 'water',
    label: '水份',
    fields: [
      { key: 'waterSample', label: '样' }, { key: 'bottleWater', label: '瓶＋水' },
      { key: 'bottleWaterSample', label: '瓶＋水＋样' }, { key: 'moisture', label: '水份' }
    ],
    results: [
      { label: '水份', source: 'result', key: 'moisture' }, { label: '瓶比重', source: 'result', key: 'bottleDensity' }
    ]
  },
  {
    key: 'burn',
    label: '灼烧',
    fields: [
      { key: 'crucible', label: '坩埚' }, { key: 'sampleWeight', label: '样重' },
      { key: 'burnedCrucibleSample', label: '烧坩埚＋样' }
    ],
    results: [{ label: '烧失量', source: 'result', key: 'burnLoss' }]
  }
]

const props = defineProps<{
  blocks: SampleBlock[]
  readonly?: boolean
  selectionMode?: boolean
  selectedBlockIds?: string[]
  highlightBlockId?: string
  canViewCompletedSensitiveData?: boolean
}>()

const emit = defineEmits<{
  update: [blockId: string, patch: Partial<LabSampleInput>]
  fieldCommit: [blockId: string, field: keyof LabSampleInput, oldValue: unknown, newValue: unknown]
  blacklistHit: [records: BlacklistRecord[]]
  selectionChange: [blockId: string, checked: boolean]
  saveNext: [blockId: string]
}>()

const activeBlockId = ref(props.highlightBlockId || props.blocks[0]?.id || '')
const focusedFieldValues = new Map<string, unknown>()

watch(
  () => props.highlightBlockId,
  (blockId) => {
    if (!blockId || !props.blocks.some((block) => block.id === blockId)) return
    activeBlockId.value = blockId
    void scrollToBlock(blockId)
  }
)

watch(
  () => props.blocks.map((block) => block.id),
  (blockIds) => {
    if (!blockIds.includes(activeBlockId.value)) activeBlockId.value = blockIds[0] || ''
  }
)

function openBlock(blockId: string) {
  activeBlockId.value = blockId
  void scrollToBlock(blockId)
}

function isDisabled(block: SampleBlock) {
  return Boolean(props.readonly || block.readonly)
}

function isSensitiveHidden(block: SampleBlock) {
  return isCompletedSampleSensitiveHidden(block, Boolean(props.canViewCompletedSensitiveData))
}

function updateNumber(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  const value = parseNumericInput((event.target as HTMLInputElement).value)
  emit('update', block.id, { [field]: value } as Partial<LabSampleInput>)
}

function updateText(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  emit('update', block.id, { [field]: (event.target as HTMLInputElement).value } as Partial<LabSampleInput>)
}

function rememberField(block: SampleBlock, field: keyof LabSampleInput) {
  focusedFieldValues.set(fieldKey(block.id, field), block.inputs[field] ?? null)
}

function commitNumber(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  commitField(block, field, parseNumericInput((event.target as HTMLInputElement).value))
}

function commitText(block: SampleBlock, field: keyof LabSampleInput, event: Event) {
  commitField(block, field, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function commitField(block: SampleBlock, field: keyof LabSampleInput, newValue: unknown) {
  const key = fieldKey(block.id, field)
  const oldValue = focusedFieldValues.has(key) ? focusedFieldValues.get(key) : block.inputs[field] ?? null
  focusedFieldValues.delete(key)
  if (JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null)) {
    emit('fieldCommit', block.id, field, oldValue ?? null, newValue ?? null)
  }
}

function updatePaymentStatus(block: SampleBlock, event: Event) {
  const value = (event.target as HTMLSelectElement).value as SamplePaymentStatus | ''
  emit('update', block.id, { paymentStatus: value })
  commitField(block, 'paymentStatus', value)
}

function updateElementNote(block: SampleBlock, value: string) {
  emit('update', block.id, { elementNote: value })
  commitField(block, 'elementNote', value)
}

function handleCustomerUpdate(block: SampleBlock, patch: Partial<LabSampleInput>, field: 'customerText' | 'recipientCustomerText') {
  emit('update', block.id, patch)
  if (Object.prototype.hasOwnProperty.call(patch, field)) commitField(block, field, patch[field] ?? null)
}

function emitSelection(blockId: string, event: Event) {
  emit('selectionChange', blockId, (event.target as HTMLInputElement).checked)
}

function saveAndOpenNext(block: SampleBlock) {
  if (!isDisabled(block)) emit('saveNext', block.id)
  const index = props.blocks.findIndex((item) => item.id === block.id)
  const nextBlock = props.blocks[index + 1]
  if (nextBlock) openBlock(nextBlock.id)
}

function focusNextField(event: KeyboardEvent) {
  const current = event.currentTarget as HTMLElement | null
  const card = current?.closest('.mobile-sample-card')
  if (!current || !card) return
  const fields = Array.from(card.querySelectorAll<HTMLElement>('[data-mobile-field]:not([disabled])')).filter((element) => {
    if (element.matches('input, select, textarea, button')) return true
    return Boolean(element.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'))
  })
  const currentContainer = current.closest<HTMLElement>('[data-mobile-field]') || current
  const currentIndex = fields.indexOf(currentContainer)
  const next = fields[currentIndex + 1]
  const focusTarget = next?.matches('input, select, textarea, button')
    ? next
    : next?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
  current.blur()
  focusTarget?.focus()
}

function getResultValue(block: SampleBlock, result: MobileResultField) {
  return result.source === 'result'
    ? block.results[result.key as keyof LabFormulaResult]
    : block.inputs[result.key as keyof LabSampleInput]
}

function formatInput(value: unknown, precision?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return ''
  return precision === undefined ? String(value) : value.toFixed(precision)
}

function formatResult(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? formatFormulaValue(value) : '—'
}

function fieldKey(blockId: string, field: keyof LabSampleInput) {
  return `${blockId}__${String(field)}`
}

async function scrollToBlock(blockId: string) {
  await nextTick()
  const element = document.querySelector(`[data-block-id="${blockId}"]`)
  if (element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}
</script>

<style scoped lang="scss">
.mobile-sample-list {
  display: grid;
  gap: 10px;
}

.mobile-sample-card {
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #dce5ef;
  border-radius: 13px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
}

.mobile-sample-card--expanded {
  border-color: #aac3dc;
  box-shadow: 0 8px 24px rgba(15, 35, 63, 0.1);
}

.mobile-sample-card--highlight {
  outline: 3px solid rgba(207, 63, 44, 0.18);
}

.mobile-sample-card__header {
  display: flex;
  align-items: stretch;
  min-height: 64px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
}

.mobile-sample-card__checkbox {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin: 21px 0 0 12px;
  accent-color: #b32c20;
}

.mobile-sample-card__toggle {
  display: grid;
  flex: 1;
  grid-template-columns: auto minmax(0, 1fr) auto 20px;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 64px;
  padding: 8px 12px;
  color: #1f2937;
  background: transparent;
  border: 0;
  text-align: left;
}

.mobile-sample-card__sequence {
  display: grid;
  min-width: 42px;
  height: 34px;
  place-items: center;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  background: #193958;
  border-radius: 9px;
}

.mobile-sample-card__summary {
  display: grid;
  gap: 3px;
  min-width: 0;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 15px;
  }

  small {
    color: #64748b;
    font-size: 12px;
  }
}

.mobile-sample-card__badges {
  display: grid;
  justify-items: end;
  gap: 3px;

  i {
    padding: 2px 6px;
    color: #47627c;
    background: #edf4fa;
    border-radius: 999px;
    font-size: 10px;
    font-style: normal;
    white-space: nowrap;
  }
}

.mobile-sample-card--completed .mobile-sample-card__sequence {
  background: #47705d;
}

.mobile-sample-card__chevron {
  color: #64748b;
}

.mobile-sample-card__body {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-top: 1px solid #e2e8f0;
}

.mobile-form-section {
  display: grid;
  gap: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 11px;

  h3 {
    margin: 0;
    color: #183657;
    font-size: 15px;
  }
}

.mobile-form-section--identity {
  background: #ffffff;
}

.mobile-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.mobile-field-grid--identity {
  grid-template-columns: minmax(90px, 0.7fr) minmax(0, 1.3fr);
}

.mobile-field {
  display: grid;
  align-content: start;
  gap: 5px;
  min-width: 0;

  > span {
    color: #64748b;
    font-size: 12px;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 9px 10px;
    color: #172033;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    font-size: 16px;
    outline: none;

    &:focus {
      border-color: #3f6f99;
      box-shadow: 0 0 0 3px rgba(63, 111, 153, 0.12);
    }

    &:disabled {
      color: #64748b;
      background: #eef2f6;
      opacity: 1;
      -webkit-text-fill-color: #64748b;
    }
  }

  textarea {
    resize: vertical;
  }
}

.mobile-field--wide {
  grid-column: 1 / -1;
}

.mobile-field--required > span::after {
  margin-left: 3px;
  color: #c92d20;
  content: '*';
}

.mobile-field--locked b {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 9px 10px;
  color: #7c2d12;
  background: #fff7ed;
  border: 1px dashed #fdba74;
  border-radius: 9px;
  font-size: 13px;
}

.mobile-result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.mobile-result {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px;
  background: #edf5fb;
  border-radius: 8px;

  span {
    overflow: hidden;
    color: #64748b;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #b1261c;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
}

.mobile-sensitive-lock,
.mobile-prerequisite-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
}

.mobile-sensitive-lock {
  color: #7c2d12;
  background: #fff7ed;
  border: 1px solid #fed7aa;

  div {
    display: grid;
    gap: 3px;
  }

  small {
    line-height: 1.45;
  }
}

.mobile-prerequisite-warning {
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  font-size: 13px;
  line-height: 1.5;
}

.mobile-save-next {
  width: 100%;
  min-height: 48px;
  color: #ffffff;
  background: linear-gradient(135deg, #b93125, #922319);
  border: 0;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
}

:deep(.customer-editor),
:deep(.lab-element-selector) {
  min-height: 44px;
}

:deep(.customer-editor .el-select),
:deep(.lab-element-selector__trigger) {
  min-height: 44px;
}

@media (max-width: 374px) {
  .mobile-result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (orientation: landscape) and (max-height: 520px) {
  .mobile-field-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .mobile-field--wide {
    grid-column: span 2;
  }
}
</style>
