<template>
  <section class="lab-grid-panel panel">
    <div ref="scrollRef" class="lab-grid-scroll" @scroll="emitScrollState">
      <div class="lab-grid" :style="{ gridTemplateColumns: gridColumns }">
        <template v-for="block in blocks" :key="block.id">
          <div v-for="column in labSheetColumns" :key="`${block.id}-h-${column.key}`" class="cell cell--header">
            {{ column.label }}
          </div>

          <div
            class="cell cell--input cell--rowspan-3 cell--green"
            :class="{ 'cell--highlight': block.id === highlightBlockId }"
            :data-block-id="block.id"
          >
            <div class="sequence-editor">
              <el-checkbox
                v-if="selectionMode"
                :model-value="selectedBlockIds.includes(block.id)"
                @change="(checked: string | number | boolean) => handleSelectionChange(block.id, checked)"
              />
              <el-input
                size="small"
                :disabled="isDisabled(block)"
                :model-value="block.inputs.sequence"
                @update:model-value="(value) => updateText(block.id, 'sequence', value)"
              />
            </div>
          </div>
          <div class="cell cell--input cell--rowspan-3 cell--customer cell--split">
            <div class="sample-customer-stack">
              <div class="sample-number-editor">
                <el-input
                  size="small"
                  placeholder="样品编号"
                  :disabled="isDisabled(block)"
                  :model-value="block.inputs.sampleNumber"
                  @update:model-value="(value) => updateText(block.id, 'sampleNumber', value)"
                />
              </div>
              <div class="customer-editor-wrap">
                <CustomerCellEditor
                  :model-value="block.inputs.customerText"
                  :selected-customers="block.inputs.customers"
                  :disabled="isDisabled(block)"
                  placeholder="客户"
                  @update="(patch) => emitUpdate(block.id, patch)"
                  @blacklist-hit="(records) => emit('blacklistHit', records)"
                />
              </div>
            </div>
          </div>
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.ironRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'ironRaw', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.siliconRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'siliconRaw', value)" />
          <NumberInputCell class="cell--rowspan-2" :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.siliconAdjust" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'siliconAdjust', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.aluminumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'aluminumRaw', value)" />
          <NumberInputCell class="cell--rowspan-2" :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.aluminumAdjust" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'aluminumAdjust', value)" />
          <FormulaCell class="cell--rowspan-2" :value="block.results.aluminumSiliconRatio" />
          <FormulaCell class="cell--rowspan-2" :value="block.results.total" />
          <NumberInputCell class="cell--rowspan-2" :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.sulfur" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'sulfur', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.densityRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'densityRaw', value)" />
          <NumberInputCell class="cell--rowspan-2" :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.whiteness" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'whiteness', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.calciumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'calciumRaw', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.magnesiumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'magnesiumRaw', value)" />
          <NumberInputCell class="cell--rowspan-2" :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.carbon" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'carbon', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.titaniumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'titaniumRaw', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.waterSample" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'waterSample', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.bottleWater" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'bottleWater', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.bottleWaterSample" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'bottleWaterSample', value)" />
          <FormulaCell class="cell--rowspan-2 cell--water" :value="block.results.moisture" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.crucible" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'crucible', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.sampleWeight" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'sampleWeight', value)" />
          <NumberInputCell :block-id="block.id" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.burnedCrucibleSample" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'burnedCrucibleSample', value)" />

          <FormulaCell :value="block.results.iron" />
          <FormulaCell :value="block.results.silicon" />
          <FormulaCell :value="block.results.aluminum" />
          <FormulaCell :value="block.results.density" />
          <FormulaCell :value="block.results.calcium" />
          <FormulaCell :value="block.results.magnesium" />
          <FormulaCell :value="block.results.titanium" />
          <FormulaCell class="cell--span-3" :value="block.results.moisture" />
          <FormulaCell class="cell--span-3" :value="block.results.burnLoss" />

          <div class="cell cell--label cell--remark cell--required-label">样品金额</div>
          <NumberInputCell class="cell--remark" :block-id="block.id" :disabled="isDisabled(block)" :precision="2" :required="isAmountRequired(block)" :value="block.inputs.price" @update="(value) => updateNumber(block.id, 'price', value)" />
          <div class="cell cell--input cell--remark cell--payment-status" :class="{ 'cell--required': isPaymentStatusRequired(block) }">
            <el-select
              clearable
              size="small"
              placeholder="费用状态"
              :disabled="isDisabled(block)"
              :model-value="block.inputs.paymentStatus || ''"
              @update:model-value="updatePaymentStatus(block.id, $event)"
            >
              <el-option v-for="status in paymentStatusOptions" :key="status" :label="status" :value="status" />
            </el-select>
          </div>
          <div class="cell cell--label cell--remark">化验元素</div>
          <div class="cell cell--input cell--span-5 cell--remark">
            <LabElementSelector
              :disabled="isDisabled(block)"
              :model-value="block.inputs.elementNote"
              @update:model-value="(value) => updateText(block.id, 'elementNote', value)"
            />
          </div>
          <div class="cell cell--label cell--remark">备注</div>
          <div class="cell cell--input cell--span-11 cell--remark">
            <el-input
              size="small"
              :disabled="isDisabled(block)"
              :model-value="block.inputs.note"
              @update:model-value="(value) => updateText(block.id, 'note', value)"
            />
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import { ElInput, ElMessage, ElTooltip } from 'element-plus'
import CustomerCellEditor from './CustomerCellEditor.vue'
import LabElementSelector from './LabElementSelector.vue'
import type { BlacklistRecord } from '@/types/blacklist'
import type { LabSampleInput, SampleBlock, SamplePaymentStatus } from '@/types/labSheet'
import { labSheetColumns } from '@/constants/labSheetTemplate'
import { formatFormulaValue, parseNumericInput } from '@/utils/formulaEngine'

const props = defineProps<{
  blocks: SampleBlock[]
  readonly?: boolean
  selectionMode?: boolean
  selectedBlockIds?: string[]
  highlightBlockId?: string
}>()

const emit = defineEmits<{
  update: [blockId: string, patch: Partial<LabSampleInput>]
  blacklistHit: [records: BlacklistRecord[]]
  scrollStateChange: [state: LabGridScrollState]
  selectionChange: [blockId: string, checked: boolean]
}>()

export type LabGridScrollState = {
  left: number
  max: number
  width: number
  scrollWidth: number
}

const gridColumns = computed(() => labSheetColumns.map((column) => `${column.width}px`).join(' '))
const selectionMode = computed(() => Boolean(props.selectionMode))
const selectedBlockIds = computed(() => props.selectedBlockIds || [])
const highlightBlockId = computed(() => props.highlightBlockId || '')
const scrollRef = ref<HTMLElement | null>(null)
const paymentStatusOptions: SamplePaymentStatus[] = ['已结款', '未结款', '月结款']
let resizeObserver: ResizeObserver | null = null

function getScrollState(): LabGridScrollState {
  const element = scrollRef.value
  if (!element) return { left: 0, max: 0, width: 0, scrollWidth: 0 }
  const max = Math.max(0, element.scrollWidth - element.clientWidth)
  return {
    left: element.scrollLeft,
    max,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth
  }
}

function emitScrollState() {
  emit('scrollStateChange', getScrollState())
}

function setHorizontalScroll(value: number) {
  const element = scrollRef.value
  if (!element) return
  const max = Math.max(0, element.scrollWidth - element.clientWidth)
  element.scrollLeft = Math.min(Math.max(value, 0), max)
  emitScrollState()
}

function scrollHorizontalBy(delta: number) {
  setHorizontalScroll((scrollRef.value?.scrollLeft || 0) + delta)
}

async function refreshScrollState() {
  await nextTick()
  emitScrollState()
}

onMounted(() => {
  void refreshScrollState()
  if (typeof ResizeObserver === 'undefined' || !scrollRef.value) return
  resizeObserver = new ResizeObserver(() => {
    void refreshScrollState()
  })
  resizeObserver.observe(scrollRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(
  () => props.blocks.length,
  () => {
    void refreshScrollState()
  }
)

defineExpose({
  refreshScrollState,
  scrollHorizontalBy,
  setHorizontalScroll
})

function isDisabled(block: SampleBlock) {
  return Boolean(props.readonly || block.readonly)
}

function isAmountRequired(block: SampleBlock) {
  return Boolean(
    block.inputs.sampleNumber?.trim() ||
      block.inputs.customerText?.trim() ||
      block.inputs.customerIds?.length ||
      block.inputs.customers?.length
  )
}

function hasSampleAmount(block: SampleBlock) {
  return typeof block.inputs.price === 'number' && Number.isFinite(block.inputs.price)
}

function hasPaymentStatus(block: SampleBlock) {
  return Boolean(block.inputs.paymentStatus)
}

function isPaymentStatusRequired(block: SampleBlock) {
  return isAmountRequired(block)
}

function isCalculationBlocked(block: SampleBlock) {
  return isAmountRequired(block) && (!hasSampleAmount(block) || !hasPaymentStatus(block))
}

function getCalculationBlockMessage(block: SampleBlock) {
  const amountMissing = !hasSampleAmount(block)
  const statusMissing = !hasPaymentStatus(block)
  if (amountMissing && statusMissing) return '请先输入样品金额并选择费用状态'
  if (amountMissing) return '请先输入样品金额'
  if (statusMissing) return '请先选择费用状态'
  return '请先完善样品金额和费用状态'
}

function warnCalculationPrerequisite(message: string) {
  ElMessage.warning(message)
}

function emitUpdate(blockId: string, patch: Partial<LabSampleInput>) {
  emit('update', blockId, patch)
}

function handleSelectionChange(blockId: string, checked: string | number | boolean) {
  emit('selectionChange', blockId, Boolean(checked))
}

function updateNumber(blockId: string, field: keyof LabSampleInput, value: string) {
  emitUpdate(blockId, { [field]: parseNumericInput(value) } as Partial<LabSampleInput>)
}

function updateText(blockId: string, field: keyof LabSampleInput, value: string | number) {
  emitUpdate(blockId, { [field]: String(value) } as Partial<LabSampleInput>)
}

function updatePaymentStatus(blockId: string, value: string | number | boolean | undefined) {
  emitUpdate(blockId, { paymentStatus: String(value || '') as SamplePaymentStatus | '' })
}

const DEFAULT_SAMPLE_INPUT_PRECISION = 3

const NumberInputCell = defineComponent({
  name: 'NumberInputCell',
  props: {
    value: { type: Number as PropType<number | null | undefined>, default: null },
    disabled: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
    blockedMessage: { type: String, default: '请先输入样品金额' },
    required: { type: Boolean, default: false },
    precision: { type: Number as PropType<number>, default: DEFAULT_SAMPLE_INPUT_PRECISION },
    blockId: { type: String, required: true }
  },
  emits: ['update', 'blocked'],
  setup(cellProps, { emit: cellEmit, attrs }) {
    const localValue = ref(formatInputValue(cellProps.value, cellProps.precision))
    const focused = ref(false)

    watch(
      () => cellProps.value,
      (value) => {
        if (!focused.value) localValue.value = formatInputValue(value, cellProps.precision)
      }
    )

    function handleBlockedClick() {
      if (cellProps.blocked) cellEmit('blocked', cellProps.blockedMessage)
    }

    function handleUpdate(value: string) {
      const nextValue = cellProps.precision === undefined ? value : sanitizeDecimalInput(value, cellProps.precision)
      localValue.value = nextValue
      cellEmit('update', nextValue)
    }

    function handleBlur() {
      focused.value = false
      if (cellProps.precision === undefined) return
      if (localValue.value.trim() === '') {
        localValue.value = ''
        cellEmit('update', '')
        return
      }
      if (localValue.value === '-' || localValue.value === '-.') {
        localValue.value = ''
        cellEmit('update', '')
        return
      }
      const numeric = Number(localValue.value)
      if (!Number.isFinite(numeric)) return
      const fixedValue = numeric.toFixed(cellProps.precision)
      localValue.value = fixedValue
      cellEmit('update', fixedValue)
    }

    return () =>
      h(
        'div',
        {
          class: [
            'cell',
            'cell--input',
            'cell--number-input',
            cellProps.blocked && 'cell--blocked',
            cellProps.required && 'cell--required',
            attrs.class
          ]
        },
        [
          h(ElInput, {
            size: 'small',
            disabled: cellProps.disabled || cellProps.blocked,
            modelValue: localValue.value,
            inputmode: 'decimal',
            onFocus: () => {
              focused.value = true
            },
            onBlur: handleBlur,
            'onUpdate:modelValue': handleUpdate
          }),
          cellProps.blocked
            ? h(
                ElTooltip,
                { content: cellProps.blockedMessage, placement: 'top' },
                {
                  default: () =>
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'blocked-click-layer',
                        'aria-label': cellProps.blockedMessage,
                        onClick: (event: MouseEvent) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleBlockedClick()
                        }
                      },
                      h('span', { class: 'blocked-warning-indicator', 'aria-hidden': 'true' }, '!')
                    )
                }
              )
            : null
        ]
      )
  }
})

function formatInputValue(value: number | null | undefined, precision?: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return precision === undefined ? String(value) : value.toFixed(precision)
}

function sanitizeDecimalInput(value: string, precision: number) {
  const isNegative = value.trim().startsWith('-')
  const cleaned = value.replace(/[^\d.]/g, '')
  const [integerPart = '', ...decimalParts] = cleaned.split('.')
  const integer = integerPart || ''
  const prefix = isNegative ? '-' : ''
  if (!decimalParts.length) return `${prefix}${integer}`
  return `${prefix}${integer}.${decimalParts.join('').slice(0, precision)}`
}

const FormulaCell = defineComponent({
  name: 'FormulaCell',
  props: {
    value: { type: Number, required: true }
  },
  setup(cellProps, { attrs }) {
    return () => h('div', { class: ['cell', 'cell--formula', attrs.class] }, formatFormulaValue(cellProps.value))
  }
})
</script>

<style scoped lang="scss">
.lab-grid-panel {
  min-width: 0;
  overflow: hidden;
}

.lab-grid-scroll {
  width: 100%;
  max-width: 100%;
  overflow: auto;
  max-height: clamp(420px, calc(100vh - 310px), 720px);
  scrollbar-gutter: stable;
}

.lab-grid {
  display: grid;
  width: max-content;
  min-width: max-content;
  padding: 12px;
  background: #ffffff;
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 36px;
  padding: 2px;
  font-size: 15px;
  text-align: center;
  border: 1px solid #111827;
  border-right: 0;
  border-bottom: 0;

  &:nth-child(23n) {
    border-right: 1px solid #111827;
  }
}

.cell--header {
  min-height: 34px;
  background: #ebf3ff;
  font-weight: 600;
}

.cell--input {
  position: relative;
  background: #ffffff;
}

.cell--blocked {
  background: #f8fafc;
  cursor: not-allowed;
}

.blocked-click-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  padding: 0;
  background: transparent;
  border: 0;
  cursor: not-allowed;
}

.blocked-warning-indicator {
  position: absolute;
  top: 2px;
  right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: #ffffff;
  background: #dc2626;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.cell--required {
  background: #fff7ed;
}

.cell--required-label {
  color: #c00000;
}

.cell--split {
  align-items: stretch;
  padding: 0;
}

.sample-customer-stack {
  display: grid;
  width: 100%;
  min-height: 100%;
  grid-template-rows: 36px minmax(88px, 1fr);
}

.sample-number-editor,
.customer-editor-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 2px;
}

.sample-number-editor {
  border-bottom: 1px solid #111827;

  :deep(.el-input__inner) {
    color: #111827;
    font-size: 15px;
    font-weight: 500;
    -webkit-text-fill-color: #111827;
  }

  :deep(.el-input__inner::placeholder) {
    color: rgba(31, 41, 55, 0.42);
    font-size: 15px;
    font-weight: 400;
    -webkit-text-fill-color: rgba(31, 41, 55, 0.42);
  }
}

.customer-editor-wrap {
  align-items: flex-start;
  min-height: 88px;
  padding-top: 4px;
}

.cell--formula {
  color: #111827;
  background: #fff;
  font-size: 16px;
  font-weight: 700;
}

.cell--green {
  background: #effbf4;
}

.cell--highlight {
  position: relative;
  z-index: 1;
  box-shadow: inset 0 0 0 3px #f59e0b;
}

.sequence-editor {
  display: grid;
  width: 100%;
  align-items: center;
  justify-items: center;
  gap: 4px;
  padding: 2px;
}

.sequence-editor :deep(.el-checkbox) {
  height: 16px;
}

.cell--water {
  background: #e5efff;
}

.cell--remark {
  background: #fef9ff;
}

.cell--payment-status {
  min-width: 0;

  :deep(.el-select) {
    width: 100%;
  }
}

.cell--label {
  color: #111827;
  font-weight: 600;
}

.cell--rowspan-2 {
  grid-row: span 2;
}

.cell--rowspan-3 {
  grid-row: span 3;
}

.cell--span-3 {
  grid-column: span 3;
}

.cell--span-6 {
  grid-column: span 6;
}

.cell--span-5 {
  grid-column: span 5;
}

.cell--span-12 {
  grid-column: span 12;
}

.cell--span-11 {
  grid-column: span 11;
}

.cell--span-13 {
  grid-column: span 13;
}

:deep(.el-input__wrapper) {
  min-height: 26px;
  padding: 0 5px;
  box-shadow: none;
}

:deep(.el-input__inner) {
  color: #c00000;
  font-size: 15px;
  text-align: center;
  -webkit-text-fill-color: #c00000;
}

.cell--number-input :deep(.el-input__inner),
.sequence-editor :deep(.el-input__inner) {
  font-weight: 700;
}

.cell--green :deep(.el-input__inner),
.cell--customer :deep(.el-input__inner),
.cell--customer :deep(.el-select__input) {
  color: #1f2937;
  font-size: 15px;
  font-weight: 500;
  -webkit-text-fill-color: #1f2937;
}

.cell--customer :deep(.el-input__inner::placeholder),
.cell--customer :deep(.el-select__placeholder),
.cell--customer :deep(.el-select__input::placeholder) {
  color: rgba(31, 41, 55, 0.42);
  font-size: 15px;
  font-weight: 400;
  -webkit-text-fill-color: rgba(31, 41, 55, 0.42);
}
</style>
