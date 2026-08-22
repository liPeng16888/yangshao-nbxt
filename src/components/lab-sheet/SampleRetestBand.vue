<template>
  <section
    ref="rootRef"
    class="sample-retest-band"
    :class="{
      'is-void': retest.status === 'VOID',
      'is-locked': locked,
      'is-highlighted': highlighted
    }"
    :style="{
      gridTemplateColumns: gridColumns,
      gridColumn: '3 / -1',
      boxSizing: 'border-box',
      height: retestRowHeight,
      minHeight: retestRowHeight
    }"
    :data-retest-id="retest.id"
    :aria-label="`复样${retest.sequence}`"
  >
    <span v-if="sensitiveHidden" class="sample-retest-band__locked-message">数据已加密</span>

    <div
      v-for="column in retestGridColumns"
      :key="column.key"
      class="sample-retest-band__cell"
      :class="{ 'is-enabled': isColumnEnabled(column) }"
      style="box-sizing: border-box; height: 100%; min-height: 0"
      :data-retest-column="column.key"
    >
      <template v-if="isColumnEnabled(column)">
        <input
          v-if="column.inputField"
          class="sample-retest-band__input"
          type="text"
          inputmode="decimal"
          :value="formatInputValue(retest.inputs[column.inputField])"
          :disabled="locked"
          :data-retest-field="column.inputField"
          :aria-label="`复样${retest.sequence}${column.label}检测输入`"
          @focus="handleFocus(column.inputField)"
          @input="handleInput(column.inputField, $event)"
          @blur="handleBlur(column.inputField, $event)"
        />
        <span v-else class="sample-retest-band__input" aria-hidden="true"></span>
        <output class="sample-retest-band__result" :aria-label="`复样${retest.sequence}${column.label}计算结果`">
          {{ formatResult(column.resultField) }}
        </output>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { labSheetColumns } from '@/constants/labSheetTemplate'
import type { SampleBlock, SampleRetest, SampleRetestInput, SampleRetestInputField } from '@/types/labSheet'
import { formatFormulaValue, parseNumericInput } from '@/utils/formulaEngine'
import { isRetestColumnEnabled, retestGridColumns, type RetestGridColumn } from '@/utils/sampleRetest'

defineOptions({ name: 'SampleRetestBand' })

const props = defineProps<{
  parent: SampleBlock
  retest: SampleRetest
  readonly?: boolean
  sensitiveHidden?: boolean
  highlighted?: boolean
}>()

const emit = defineEmits<{
  update: [retestId: string, patch: Partial<SampleRetestInput>]
  fieldCommit: [retestId: string, field: SampleRetestInputField, oldValue: unknown, newValue: unknown]
}>()

const rootRef = ref<HTMLElement | null>(null)
const focusedValues = new Map<SampleRetestInputField, unknown>()
const gridColumns = labSheetColumns.slice(2).map((column) => `${column.width}px`).join(' ')
const retestRowHeight = 'var(--sample-retest-row-height, 62px)'
const sensitiveHidden = computed(() => Boolean(
  props.sensitiveHidden || props.parent.sensitiveFieldsHidden || props.retest.sensitiveFieldsHidden
))
const locked = computed(() => Boolean(
  props.readonly ||
  props.parent.readonly ||
  props.retest.readonly ||
  props.retest.status === 'VOID' ||
  sensitiveHidden.value
))

function isColumnEnabled(column: RetestGridColumn) {
  return isRetestColumnEnabled(props.parent.inputs.elementNote || '', column)
}

function formatInputValue(value: number | null | undefined) {
  if (sensitiveHidden.value) return ''
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function formatResult(field?: RetestGridColumn['resultField']) {
  if (!field || sensitiveHidden.value) return ''
  const value = props.retest.results[field]
  return typeof value === 'number' && Number.isFinite(value) ? formatFormulaValue(value) : ''
}

function handleFocus(field: SampleRetestInputField) {
  focusedValues.set(field, props.retest.inputs[field] ?? null)
}

function eventValue(event: Event) {
  return event.target instanceof HTMLInputElement ? parseNumericInput(event.target.value) : null
}

function handleInput(field: SampleRetestInputField, event: Event) {
  emit('update', props.retest.id, { [field]: eventValue(event) })
}

function handleBlur(field: SampleRetestInputField, event: Event) {
  const oldValue = focusedValues.has(field)
    ? focusedValues.get(field)
    : props.retest.inputs[field] ?? null
  const newValue = eventValue(event)
  focusedValues.delete(field)
  if (JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null)) {
    emit('fieldCommit', props.retest.id, field, oldValue, newValue)
  }
}

let highlightGeneration = 0

watch(
  () => props.highlighted,
  async (highlighted) => {
    const generation = ++highlightGeneration
    if (!highlighted) return
    await nextTick()
    await nextTick()
    const root = rootRef.value
    if (generation !== highlightGeneration || !props.highlighted || !root?.isConnected) return
    root.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    root.querySelector<HTMLInputElement>('input[data-retest-field]:not(:disabled)')?.focus()
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.sample-retest-band {
  position: relative;
  display: grid;
  box-sizing: border-box;
  height: var(--sample-retest-row-height, 62px);
  min-width: 0;
  min-height: var(--sample-retest-row-height, 62px);
  overflow: visible;
  color: #172033;
  background: #f8fbff;
  border-top: 1px solid #111827;
  border-bottom: 1px solid #111827;
  transition: background-color 160ms ease, box-shadow 160ms ease;
}

.sample-retest-band__cell {
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid #111827;
}

.sample-retest-band__cell:last-child {
  border-right: 1px solid #111827;
}

.sample-retest-band__locked-message {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  background: rgba(241, 245, 249, 0.9);
  font-weight: 600;
}

.sample-retest-band__cell {
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  background: #f4f7fb;
}

.sample-retest-band__cell.is-enabled {
  background: #ffffff;
}

.sample-retest-band__input,
.sample-retest-band__result {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 2px 4px;
  text-align: center;
  border: 0;
}

input.sample-retest-band__input {
  color: #c00000;
  background: transparent;
  border-bottom: 1px solid #cbd5e1;
  outline: 0;
  font-size: 13px;
  font-weight: 700;

  &:focus {
    box-shadow: inset 0 0 0 2px #60a5fa;
  }

  &:disabled {
    color: #64748b;
    cursor: not-allowed;
    -webkit-text-fill-color: #64748b;
  }
}

.sample-retest-band__result {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #111827;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sample-retest-band.is-highlighted {
  position: relative;
  z-index: 2;
  background: #fffbeb;
  box-shadow: inset 0 0 0 3px #f59e0b;
}

.sample-retest-band.is-void,
.sample-retest-band.is-locked {
  background: #f1f5f9;

  .sample-retest-band__cell,
  .sample-retest-band__cell.is-enabled {
    color: #64748b;
    background: #eef2f6;
  }
}
</style>
