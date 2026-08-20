<template>
  <section class="lab-grid-panel panel">
    <div class="lab-grid-toolbar">
      <div class="lab-grid-zoom-controls" aria-label="样品计算表格缩放">
        <el-tooltip content="缩小表格" placement="top">
          <el-button
            circle
            size="small"
            :disabled="isAtMinZoom"
            :icon="ZoomOut"
            aria-label="缩小表格"
            @click="adjustZoom(-ZOOM_STEP_PERCENT)"
          />
        </el-tooltip>
        <el-slider
          class="lab-grid-zoom-slider"
          :model-value="zoomPercent"
          :min="minZoomPercent"
          :max="MAX_ZOOM_PERCENT"
          :step="ZOOM_STEP_PERCENT"
          :show-tooltip="false"
          @update:model-value="setZoomPercent"
        />
        <span class="lab-grid-zoom-value">{{ zoomPercent }}%</span>
        <el-tooltip content="放大表格" placement="top">
          <el-button
            circle
            size="small"
            :disabled="isAtMaxZoom"
            :icon="ZoomIn"
            aria-label="放大表格"
            @click="adjustZoom(ZOOM_STEP_PERCENT)"
          />
        </el-tooltip>
        <el-tooltip content="恢复原始大小" placement="top">
          <el-button
            circle
            size="small"
            :disabled="zoomPercent === DEFAULT_ZOOM_PERCENT"
            :icon="ScaleToOriginal"
            aria-label="恢复原始大小"
            @click="resetZoom"
          />
        </el-tooltip>
      </div>
    </div>
    <div ref="scrollRef" class="lab-grid-scroll" @focusin="handleFieldFocusIn" @focusout="handleFieldFocusOut" @scroll="emitScrollState">
      <div class="lab-grid-zoom-stage" :style="zoomStageStyle">
        <div ref="gridRef" class="lab-grid" :style="{ gridTemplateColumns: gridColumns, transform: `scale(${zoomScale})` }">
          <template v-for="block in blocks" :key="block.id">
            <div v-for="column in labSheetColumns" :key="`${block.id}-h-${column.key}`" class="cell cell--header">
              {{ column.label }}
            </div>

            <div
              class="cell cell--input cell--green"
              :class="{
                'cell--completed': block.inputs.completed,
                'cell--selection-target': selectionMode,
                'cell--highlight': block.id === highlightBlockId
              }"
              :style="{ gridRow: `span ${getBlockRowSpan(block)}` }"
              :data-block-id="block.id"
              @click="handleSequenceCellClick(block.id, $event)"
            >
              <div class="sequence-editor" :data-block-id="block.id" data-field="sequence">
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
            <div
              class="cell cell--input cell--customer cell--split"
              :style="{ gridRow: `span ${getBlockRowSpan(block)}` }"
            >
              <div class="sample-customer-stack" :style="{ gridTemplateRows: getCustomerGridRows(block) }">
                <div class="sample-number-editor" :data-block-id="block.id" data-field="sampleNumber">
                  <el-input
                    size="small"
                    placeholder="样品名称"
                    :disabled="isDisabled(block)"
                    :model-value="block.inputs.sampleNumber"
                    @update:model-value="(value) => updateText(block.id, 'sampleNumber', value)"
                  />
                </div>
                <div class="customer-role-row" :data-block-id="block.id" data-field="customerText">
                  <div class="customer-editor-wrap">
                    <CustomerCellEditor
                      customer-role="payer"
                      :selection-limit="1"
                      :model-value="block.inputs.customerText"
                      :selected-customers="block.inputs.customers"
                      :disabled="isDisabled(block)"
                      placeholder="付款客户"
                      @update="(patch) => handleCustomerUpdate(block.id, patch)"
                      @blacklist-hit="(records) => emit('blacklistHit', records)"
                    />
                  </div>
                </div>
                <div
                  class="customer-role-row"
                  style="grid-row: -2 / -1"
                  :data-block-id="block.id"
                  data-field="recipientCustomerText"
                >
                  <div class="customer-editor-wrap">
                    <CustomerCellEditor
                      customer-role="recipient"
                      :selection-limit="0"
                      :model-value="block.inputs.recipientCustomerText"
                      :selected-customers="block.inputs.recipientCustomers"
                      :disabled="isDisabled(block)"
                      placeholder="数据发送"
                      @update="(patch) => handleCustomerUpdate(block.id, patch)"
                      @blacklist-hit="(records) => emit('blacklistHit', records)"
                    />
                  </div>
                </div>
              </div>
            </div>
            <template v-if="isCompletedSensitiveHidden(block.id)">
              <div class="completed-data-band" :data-block-id="block.id" data-field="completedSensitiveData" aria-label="已完成样品数据已加密，验证后查看">
                <span class="completed-data-band__lock" aria-hidden="true">🔒</span>
                <span>已完成样品数据已加密</span>
                <span class="completed-data-band__hint">验证后查看</span>
              </div>
            </template>
            <template v-else>
              <NumberInputCell :block-id="block.id" field="ironRaw" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.ironRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'ironRaw', value)" />
              <NumberInputCell :block-id="block.id" field="siliconRaw" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.siliconRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'siliconRaw', value)" />
              <NumberInputCell class="cell--rowspan-2" :block-id="block.id" field="siliconAdjust" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.siliconAdjust" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'siliconAdjust', value)" />
              <NumberInputCell :block-id="block.id" field="aluminumRaw" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.aluminumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'aluminumRaw', value)" />
              <NumberInputCell class="cell--rowspan-2" :block-id="block.id" field="aluminumAdjust" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.aluminumAdjust" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'aluminumAdjust', value)" />
              <FormulaCell class="cell--rowspan-2" :value="block.results.aluminumSiliconRatio" />
              <FormulaCell class="cell--rowspan-2" :value="block.results.total" />
              <NumberInputCell class="cell--rowspan-2" :block-id="block.id" field="sulfur" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.sulfur" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'sulfur', value)" />
              <NumberInputCell :block-id="block.id" field="densityRaw" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.densityRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'densityRaw', value)" />
              <NumberInputCell class="cell--rowspan-2" :block-id="block.id" field="whiteness" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.whiteness" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'whiteness', value)" />
              <NumberInputCell :block-id="block.id" field="calciumRaw" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.calciumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'calciumRaw', value)" />
              <NumberInputCell :block-id="block.id" field="magnesiumRaw" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.magnesiumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'magnesiumRaw', value)" />
              <NumberInputCell class="cell--rowspan-2" :block-id="block.id" field="carbon" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.carbon" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'carbon', value)" />
              <NumberInputCell :block-id="block.id" field="titaniumRaw" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.titaniumRaw" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'titaniumRaw', value)" />
              <NumberInputCell :block-id="block.id" field="waterSample" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.waterSample" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'waterSample', value)" />
              <NumberInputCell :block-id="block.id" field="bottleWater" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.bottleWater" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'bottleWater', value)" />
              <NumberInputCell :block-id="block.id" field="bottleWaterSample" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.bottleWaterSample" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'bottleWaterSample', value)" />
              <NumberInputCell class="cell--rowspan-2" :block-id="block.id" field="moisture" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.moisture" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'moisture', value)" />
              <NumberInputCell :block-id="block.id" field="crucible" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.crucible" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'crucible', value)" />
              <NumberInputCell :block-id="block.id" field="sampleWeight" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.sampleWeight" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'sampleWeight', value)" />
              <NumberInputCell :block-id="block.id" field="burnedCrucibleSample" :blocked="isCalculationBlocked(block)" :blocked-message="getCalculationBlockMessage(block)" :disabled="isDisabled(block)" :value="block.inputs.burnedCrucibleSample" @blocked="warnCalculationPrerequisite" @update="(value) => updateNumber(block.id, 'burnedCrucibleSample', value)" />

              <FormulaCell :value="block.results.iron" />
              <FormulaCell :value="block.results.silicon" />
              <FormulaCell :value="block.results.aluminum" />
              <FormulaCell :value="block.results.density" />
              <FormulaCell :value="block.results.calcium" />
              <FormulaCell :value="block.results.magnesium" />
              <FormulaCell :value="block.results.titanium" />
              <FormulaCell class="cell--span-3" :value="block.results.bottleDensity" />
              <FormulaCell class="cell--span-3" :value="block.results.burnLoss" />
            </template>

            <SampleRetestBand
              v-for="retest in block.retests"
              :key="retest.id"
              :parent="block"
              :retest="retest"
              :readonly="readonly"
              :sensitive-hidden="isCompletedSensitiveHidden(block.id)"
              :highlighted="retest.id === highlightRetestId"
              @update="(retestId, patch) => emit('retestUpdate', block.id, retestId, patch)"
              @field-commit="(retestId, field, oldValue, newValue) => emit('retestFieldCommit', block.id, retestId, field, oldValue, newValue)"
              @delete="(retestId) => emit('retestDelete', block.id, retestId)"
              @void="(retestId) => emit('retestVoid', block.id, retestId)"
            />

            <div class="cell cell--label cell--remark cell--required-label">{{ getAmountLabel(block) }}</div>
            <div v-if="isCompletedSensitiveHidden(block.id)" class="cell cell--input cell--remark completed-data-compact-mask" :data-block-id="block.id" data-field="price" aria-label="样品金额已加密">
              <span aria-hidden="true">🔒</span>
            </div>
            <div
              v-else-if="isPrepaidBlock(block)"
              class="cell cell--input cell--remark cell--prepaid-picker"
              :class="{ 'cell--required': isAmountRequired(block) }"
              :data-block-id="block.id"
              data-field="price"
            >
              <button
                type="button"
                class="prepaid-picker-trigger"
                :data-testid="`prepaid-picker-trigger-${block.id}`"
                :disabled="isDisabled(block)"
                @click="openPrepaidPicker(block)"
              >
                <strong>{{ formatPrepaidAmount(block.inputs.price) }}</strong>
                <span>{{ prepaidMemberCaption(block) }}</span>
              </button>
            </div>
            <NumberInputCell
              v-else
              class="cell--remark"
              :block-id="block.id"
              field="price"
              :disabled="isDisabled(block)"
              :precision="getAmountPrecision(block)"
              :required="isAmountRequired(block)"
              :value="block.inputs.price"
              @update="(value) => updateNumber(block.id, 'price', value)"
            />
            <div
              class="cell cell--input cell--remark cell--payment-status"
              :class="{ 'cell--required': isPaymentStatusRequired(block) }"
              :data-block-id="block.id"
              data-field="paymentStatus"
            >
              <span v-if="isCompletedSensitiveHidden(block.id)" class="completed-data-compact-mask" aria-label="结款状态已加密" title="结款状态已加密" aria-hidden="true">🔒</span>
              <el-select
                v-else
                :class="{ 'payment-status-select--selected': Boolean(block.inputs.paymentStatus) }"
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
            <div
              class="cell cell--label cell--remark"
              :class="{ 'cell--required-label': isElementNoteRequired(block) }"
            >
              化验元素
            </div>
            <div
              class="cell cell--input cell--span-5 cell--remark"
              :class="{ 'cell--required': isElementNoteRequired(block) }"
              :data-block-id="block.id"
              data-field="elementNote"
            >
              <LabElementSelector
                :disabled="isDisabled(block)"
                :model-value="block.inputs.elementNote"
                @update:model-value="(value) => updateText(block.id, 'elementNote', value)"
              />
            </div>
            <div class="cell cell--label cell--remark">备注</div>
            <div class="cell cell--input cell--span-11 cell--remark cell--note-input" :data-block-id="block.id" data-field="note">
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
    </div>
    <PrepaidMemberPickerDialog
      v-if="prepaidPickerVisible"
      :visible="prepaidPickerVisible"
      :initial-phone="activePrepaidInitialPhone"
      :initial-amount="activePrepaidBlock?.inputs.price ?? null"
      @close="closePrepaidPicker"
      @confirm="confirmPrepaidSelection"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue'
import { ElInput, ElMessage, ElTooltip } from 'element-plus'
import { ScaleToOriginal, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import CustomerCellEditor from './CustomerCellEditor.vue'
import LabElementSelector from './LabElementSelector.vue'
import SampleRetestBand from './SampleRetestBand.vue'
import PrepaidMemberPickerDialog from '@/components/prepaid/PrepaidMemberPickerDialog.vue'
import type { BlacklistRecord } from '@/types/blacklist'
import type {
  LabSampleInput,
  PrepaidMemberPickerResult,
  SampleBlock,
  SamplePaymentStatus,
  SampleRetestInput,
  SampleRetestInputField
} from '@/types/labSheet'
import { labSheetColumns } from '@/constants/labSheetTemplate'
import { formatFormulaValue, parseNumericInput } from '@/utils/formulaEngine'
import {
  getSampleAmountLabel as getAmountLabel,
  getSampleAmountPrecision as getAmountPrecision,
  getSampleCalculationBlockMessage as getCalculationBlockMessage,
  isCompletedSampleSensitiveHidden,
  isSampleAmountRequired as isAmountRequired,
  isSampleCalculationBlocked as isCalculationBlocked,
  isSampleElementNoteRequired as isElementNoteRequired,
  isSamplePaymentStatusRequired as isPaymentStatusRequired,
  samplePaymentStatusOptions as sharedPaymentStatusOptions
} from '@/utils/labSampleRules'

const props = defineProps<{
  blocks: SampleBlock[]
  readonly?: boolean
  selectionMode?: boolean
  selectedBlockIds?: string[]
  highlightBlockId?: string
  highlightRetestId?: string
  canViewCompletedSensitiveData?: boolean
}>()

const emit = defineEmits<{
  update: [blockId: string, patch: Partial<LabSampleInput>]
  fieldCommit: [blockId: string, field: keyof LabSampleInput, oldValue: unknown, newValue: unknown]
  blacklistHit: [records: BlacklistRecord[]]
  scrollStateChange: [state: LabGridScrollState]
  selectionChange: [blockId: string, checked: boolean]
  retestUpdate: [sampleBlockId: string, retestId: string, patch: Partial<SampleRetestInput>]
  retestFieldCommit: [sampleBlockId: string, retestId: string, field: SampleRetestInputField, oldValue: unknown, newValue: unknown]
  retestDelete: [sampleBlockId: string, retestId: string]
  retestVoid: [sampleBlockId: string, retestId: string]
}>()

export type LabGridScrollState = {
  left: number
  max: number
  width: number
  scrollWidth: number
}

const gridColumns = computed(() => labSheetColumns.map((column) => `${column.width}px`).join(' '))
const RETEST_BAND_ROW_HEIGHT_PX = 62

function getBlockRowSpan(block: SampleBlock) {
  return 3 + block.retests.length
}

function getCustomerGridRows(block: SampleBlock) {
  return [
    '36px',
    '36px',
    ...block.retests.map(() => `${RETEST_BAND_ROW_HEIGHT_PX}px`),
    '36px'
  ].join(' ')
}

const selectionMode = computed(() => Boolean(props.selectionMode))
const selectedBlockIds = computed(() => props.selectedBlockIds || [])
const highlightBlockId = computed(() => props.highlightBlockId || '')
const highlightRetestId = computed(() => props.highlightRetestId || '')
function isCompletedSensitiveHidden(blockId: string) {
  const block = props.blocks.find((item) => item.id === blockId)
  return block ? isCompletedSampleSensitiveHidden(block, Boolean(props.canViewCompletedSensitiveData)) : false
}
const scrollRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)
const paymentStatusOptions: SamplePaymentStatus[] = sharedPaymentStatusOptions
const prepaidPickerVisible = ref(false)
const activePrepaidBlockId = ref('')
const activePrepaidBlock = computed(() => (
  props.blocks.find((block) => block.id === activePrepaidBlockId.value)
))
const activePrepaidInitialPhone = computed(() => (
  activePrepaidBlock.value?.inputs.paymentStatus === '预存款'
    ? activePrepaidBlock.value.inputs.prepaidMemberPhone || ''
    : ''
))
let resizeObserver: ResizeObserver | null = null
const focusedFieldValues = new Map<string, unknown>()

const DEFAULT_ZOOM_PERCENT = 100
const MAX_ZOOM_PERCENT = 130
const MIN_ZOOM_PERCENT_FLOOR = 50
const ZOOM_STEP_PERCENT = 5
const zoomPercent = ref(DEFAULT_ZOOM_PERCENT)
const containerWidth = ref(0)
const naturalGridSize = ref({ width: 0, height: 0 })
const zoomScale = computed(() => zoomPercent.value / 100)
const minZoomPercent = computed(() => {
  if (!containerWidth.value || !naturalGridSize.value.width) return MIN_ZOOM_PERCENT_FLOOR
  const fitPercent = Math.ceil((containerWidth.value / naturalGridSize.value.width) * 100)
  return Math.min(DEFAULT_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT_FLOOR, fitPercent))
})
const isAtMinZoom = computed(() => zoomPercent.value <= minZoomPercent.value)
const isAtMaxZoom = computed(() => zoomPercent.value >= MAX_ZOOM_PERCENT)
const zoomStageStyle = computed(() => {
  const width = naturalGridSize.value.width ? Math.ceil(naturalGridSize.value.width * zoomScale.value) : undefined
  const height = naturalGridSize.value.height ? Math.ceil(naturalGridSize.value.height * zoomScale.value) : undefined
  return {
    width: width ? `${width}px` : undefined,
    height: height ? `${height}px` : undefined
  }
})

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

function measureGridLayout() {
  if (scrollRef.value) containerWidth.value = scrollRef.value.clientWidth
  if (!gridRef.value) return
  const width = gridRef.value.offsetWidth
  const height = gridRef.value.offsetHeight
  if (width && height) {
    naturalGridSize.value = { width, height }
  }
  clampCurrentZoom()
}

function clampZoomPercent(value: number) {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(minZoomPercent.value, Math.round(value / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT))
}

function clampCurrentZoom() {
  const nextZoom = clampZoomPercent(zoomPercent.value)
  if (nextZoom !== zoomPercent.value) zoomPercent.value = nextZoom
}

function setZoomPercent(value: number | number[]) {
  const nextValue = Array.isArray(value) ? Number(value[0]) : Number(value)
  if (!Number.isFinite(nextValue)) return
  zoomPercent.value = clampZoomPercent(nextValue)
  void refreshScrollState()
}

function adjustZoom(delta: number) {
  setZoomPercent(zoomPercent.value + delta)
}

function resetZoom() {
  setZoomPercent(DEFAULT_ZOOM_PERCENT)
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
  measureGridLayout()
  emitScrollState()
}

onMounted(() => {
  void refreshScrollState()
  if (typeof ResizeObserver === 'undefined' || !scrollRef.value) return
  resizeObserver = new ResizeObserver(() => {
    void refreshScrollState()
  })
  resizeObserver.observe(scrollRef.value)
  if (gridRef.value) resizeObserver.observe(gridRef.value)
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

watch(
  () => props.blocks.map((block) => block.retests.length).join(','),
  () => {
    void refreshScrollState()
  }
)

watch(minZoomPercent, () => {
  clampCurrentZoom()
})

defineExpose({
  refreshScrollState,
  scrollHorizontalBy,
  setHorizontalScroll,
  setZoomPercent
})

function isDisabled(block: SampleBlock) {
  return Boolean(props.readonly || block.readonly)
}

function isPrepaidBlock(block: SampleBlock) {
  return block.inputs.paymentStatus === '预存款'
}

function warnCalculationPrerequisite(message: string) {
  ElMessage.warning(message)
}

function emitUpdate(blockId: string, patch: Partial<LabSampleInput>) {
  emit('update', blockId, patch)
}

function handleCustomerUpdate(blockId: string, patch: Partial<LabSampleInput>) {
  emitUpdate(blockId, patch)
  void refreshScrollState()
}

function handleSelectionChange(blockId: string, checked: string | number | boolean) {
  emit('selectionChange', blockId, Boolean(checked))
}

function handleSequenceCellClick(blockId: string, event: MouseEvent) {
  if (!selectionMode.value) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.el-checkbox')) return
  emit('selectionChange', blockId, !selectedBlockIds.value.includes(blockId))
}

function updateNumber(blockId: string, field: keyof LabSampleInput, value: string) {
  emitUpdate(blockId, { [field]: parseNumericInput(value) } as Partial<LabSampleInput>)
}

function updateText(blockId: string, field: keyof LabSampleInput, value: string | number) {
  emitUpdate(blockId, { [field]: String(value) } as Partial<LabSampleInput>)
}

function updatePaymentStatus(blockId: string, value: string | number | boolean | undefined) {
  const block = props.blocks.find((item) => item.id === blockId)
  if (!block) return
  const paymentStatus = String(value || '') as SamplePaymentStatus | ''
  if (paymentStatus === '预存款') {
    openPrepaidPicker(block)
    return
  }

  const patch: Partial<LabSampleInput> = { paymentStatus }
  if (isPrepaidBlock(block) || block.inputs.prepaidMemberId || block.inputs.prepaidMemberPhone) {
    patch.prepaidMemberId = undefined
    patch.prepaidMemberPhone = undefined
  }
  emitUpdate(blockId, patch)
}

function openPrepaidPicker(block: SampleBlock) {
  if (isDisabled(block)) return
  activePrepaidBlockId.value = block.id
  prepaidPickerVisible.value = true
}

function closePrepaidPicker() {
  prepaidPickerVisible.value = false
  activePrepaidBlockId.value = ''
}

function confirmPrepaidSelection(result: PrepaidMemberPickerResult) {
  if (!activePrepaidBlockId.value) return
  emitUpdate(activePrepaidBlockId.value, {
    paymentStatus: '预存款',
    price: result.amount,
    prepaidMemberId: result.memberId,
    prepaidMemberPhone: result.phone
  })
  closePrepaidPicker()
}

function formatPrepaidAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} 元` : '选择会员并填写金额'
}

function prepaidMemberCaption(block: SampleBlock) {
  if (block.inputs.prepaidMemberId && block.inputs.prepaidMemberPhone) return block.inputs.prepaidMemberPhone
  return '历史预存款记录（未关联新台账）'
}

function handleFieldFocusIn(event: FocusEvent) {
  const target = event.target instanceof Element ? event.target : null
  const fieldElement = target?.closest<HTMLElement>('[data-block-id][data-field]')
  if (!fieldElement) return
  const blockId = fieldElement.dataset.blockId || ''
  const field = fieldElement.dataset.field as keyof LabSampleInput | undefined
  if (!blockId || !field) return
  focusedFieldValues.set(fieldFocusKey(blockId, field), getBlockFieldValue(blockId, field))
}

function handleFieldFocusOut(event: FocusEvent) {
  const target = event.target instanceof Element ? event.target : null
  const fieldElement = target?.closest<HTMLElement>('[data-block-id][data-field]')
  if (!fieldElement) return
  const blockId = fieldElement.dataset.blockId || ''
  const field = fieldElement.dataset.field as keyof LabSampleInput | undefined
  if (!blockId || !field) return
  const key = fieldFocusKey(blockId, field)
  const oldValue = focusedFieldValues.get(key)
  focusedFieldValues.delete(key)
  void nextTick(() => {
    const newValue = getBlockFieldValue(blockId, field)
    if (JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null)) {
      emit('fieldCommit', blockId, field, oldValue ?? null, newValue ?? null)
    }
  })
}

function getBlockFieldValue(blockId: string, field: keyof LabSampleInput) {
  const block = props.blocks.find((item) => item.id === blockId)
  return block?.inputs[field] ?? null
}

function fieldFocusKey(blockId: string, field: keyof LabSampleInput) {
  return `${blockId}__${String(field)}`
}

const DEFAULT_SAMPLE_INPUT_PRECISION = 3

const NumberInputCell = defineComponent({
  name: 'NumberInputCell',
  props: {
    value: { type: Number as PropType<number | null | undefined>, default: null },
    disabled: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
    blockedMessage: { type: String, default: '请先输入样品金额' },
    hidden: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    precision: { type: Number as PropType<number>, default: DEFAULT_SAMPLE_INPUT_PRECISION },
    blockId: { type: String, required: true },
    field: { type: String as PropType<keyof LabSampleInput>, required: true }
  },
  emits: ['update', 'blocked'],
  setup(cellProps, { emit: cellEmit, attrs }) {
    const localValue = ref(formatInputValue(cellProps.value, cellProps.precision))
    const focused = ref(false)
    const sensitiveHidden = computed(() => cellProps.hidden || isCompletedSensitiveHidden(cellProps.blockId))

    watch(
      () => [cellProps.value, cellProps.precision] as const,
      ([value, precision]) => {
        if (!focused.value) localValue.value = formatInputValue(value, precision)
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
          ],
          'data-block-id': cellProps.blockId,
          'data-field': cellProps.field
        },
        [
          sensitiveHidden.value ? h('span', { class: 'sensitive-hidden' }, '已隐藏') : h(ElInput, {
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
          cellProps.blocked && !sensitiveHidden.value
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
  if (precision <= 0) return `${prefix}${integer}`
  if (!decimalParts.length) return `${prefix}${integer}`
  return `${prefix}${integer}.${decimalParts.join('').slice(0, precision)}`
}

const FormulaCell = defineComponent({
  name: 'FormulaCell',
  props: {
    value: { type: Number, required: true },
    hidden: { type: Boolean, default: false }
  },
  setup(cellProps, { attrs }) {
    return () => h('div', { class: ['cell', 'cell--formula', attrs.class] }, cellProps.hidden ? '已隐藏' : formatFormulaValue(cellProps.value))
  }
})
</script>

<style scoped lang="scss">
.lab-grid-panel {
  min-width: 0;
  overflow: hidden;
}

.lab-grid-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px 0;
  background: #ffffff;
}

.lab-grid-zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 280px;
}

.lab-grid-zoom-slider {
  width: 150px;
}

.lab-grid-zoom-value {
  width: 42px;
  color: #475569;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.lab-grid-scroll {
  width: 100%;
  max-width: 100%;
  overflow: auto;
  max-height: clamp(420px, calc(100vh - 310px), 720px);
  scrollbar-gutter: stable;
}

.lab-grid-zoom-stage {
  min-width: 100%;
  overflow: hidden;
}

.lab-grid {
  display: grid;
  width: max-content;
  min-width: max-content;
  padding: 12px;
  background: #ffffff;
  transform-origin: top left;
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

.prepaid-picker-trigger {
  display: grid;
  width: 100%;
  min-height: 32px;
  place-content: center;
  gap: 1px;
  padding: 2px 6px;
  color: #0f172a;
  background: transparent;
  border: 0;
  cursor: pointer;

  strong {
    font-variant-numeric: tabular-nums;
  }

  span {
    color: #64748b;
    font-size: 11px;
  }

  &:disabled {
    cursor: not-allowed;
  }
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
}

.sample-number-editor,
.customer-role-row,
.customer-editor-wrap {
  min-width: 0;
}

.sample-number-editor {
  display: flex;
  align-items: center;
  padding: 2px;
  border-bottom: 1px solid #111827;

  :deep(.el-input__inner) {
    color: #111827;
    font-size: 15px;
    font-weight: 500;
    -webkit-text-fill-color: #111827;
  }

  :deep(.el-input__inner::placeholder) {
    color: rgba(31, 41, 55, 0.3);
    font-size: 15px;
    font-weight: 400;
    -webkit-text-fill-color: rgba(31, 41, 55, 0.3);
  }
}

.customer-role-row {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 2px;
  border-bottom: 1px solid #111827;

  &:last-child {
    border-bottom: 0;
  }
}

.customer-editor-wrap {
  width: 100%;
  overflow: visible;
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

.cell--green.cell--completed {
  background: #fff3eb;
}

.cell--selection-target {
  cursor: pointer;
}

.cell--selection-target:hover {
  box-shadow: inset 0 0 0 2px #409eff;
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

.cell--remark {
  background: #fef9ff;
}

.cell--payment-status {
  min-width: 0;

  :deep(.el-select) {
    width: 100%;
  }

  :deep(.el-select__placeholder),
  :deep(.el-select__input::placeholder) {
    color: rgba(31, 41, 55, 0.3);
    -webkit-text-fill-color: rgba(31, 41, 55, 0.3);
  }

  :deep(.payment-status-select--selected .el-select__placeholder) {
    color: #1f2937;
    font-weight: 500;
    -webkit-text-fill-color: #1f2937;
  }
}

.cell--note-input {
  justify-content: flex-start;

  :deep(.el-input__inner) {
    text-align: left;
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

.completed-data-band {
  display: flex;
  grid-column: span 21;
  grid-row: span 2;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 72px;
  color: #64748b;
  background:
    linear-gradient(90deg, rgba(226, 232, 240, 0.2), rgba(219, 234, 254, 0.68) 18%, rgba(219, 234, 254, 0.68) 82%, rgba(226, 232, 240, 0.2)),
    repeating-linear-gradient(-45deg, rgba(148, 163, 184, 0.07) 0 6px, transparent 6px 12px);
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.completed-data-band__lock {
  font-size: 15px;
}

.completed-data-band__hint {
  padding-left: 8px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
}

.completed-data-compact-mask {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 26px;
  color: #94a3b8;
  background: linear-gradient(90deg, rgba(219, 234, 254, 0.24), rgba(219, 234, 254, 0.62), rgba(219, 234, 254, 0.24));
  border-radius: 3px;
  font-size: 12px;
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
  color: rgba(31, 41, 55, 0.3);
  font-size: 15px;
  font-weight: 400;
  -webkit-text-fill-color: rgba(31, 41, 55, 0.3);
}
</style>
