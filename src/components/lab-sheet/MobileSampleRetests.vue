<template>
  <section
    v-if="parent.retests.length"
    ref="rootRef"
    class="mobile-sample-retests"
    aria-label="样品复样记录"
  >
    <button
      data-testid="mobile-retests-toggle"
      class="mobile-sample-retests__toggle"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <strong>复样记录（{{ sortedRetests.length }}）</strong>
      <span>{{ expanded ? '收起' : '展开' }}</span>
      <i aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</i>
    </button>

    <div v-if="expanded" class="mobile-sample-retests__content">
      <article
        v-for="retest in sortedRetests"
        :key="retest.id"
        class="mobile-retest-card"
        :class="{
          'is-void': retest.status === 'VOID',
          'is-locked': isLocked(retest),
          'is-highlighted': retest.id === highlightRetestId
        }"
        :data-retest-id="retest.id"
        :aria-label="`复样${retest.sequence}`"
        :aria-busy="isActionPending(retest.id) ? 'true' : undefined"
      >
        <header class="mobile-retest-card__header">
          <div>
            <strong>复样{{ retest.sequence }}</strong>
            <span :class="retest.status === 'VOID' ? 'is-void' : 'is-active'">
              {{ retest.status === 'VOID' ? '已作废' : 'ACTIVE' }}
            </span>
          </div>
          <div v-if="canManage(retest)" class="mobile-retest-card__actions">
            <button
              v-if="isBlank(retest)"
              type="button"
              :disabled="isActionPending(retest.id)"
              :aria-busy="isActionPending(retest.id) ? 'true' : undefined"
              :data-testid="`delete-retest-${retest.id}`"
              :aria-label="`删除空白复样${retest.sequence}`"
              @click="emit('delete', retest.id)"
            >{{ isActionPending(retest.id) ? '处理中…' : '删除' }}</button>
            <button
              v-else
              type="button"
              :disabled="isActionPending(retest.id)"
              :aria-busy="isActionPending(retest.id) ? 'true' : undefined"
              :data-testid="`void-retest-${retest.id}`"
              :aria-label="`作废复样${retest.sequence}`"
              @click="emit('void', retest.id)"
            >{{ isActionPending(retest.id) ? '处理中…' : '作废' }}</button>
          </div>
        </header>

        <div class="mobile-retest-card__meta">
          <span>创建时间 {{ formatTimestamp(retest.createdAt) }}</span>
          <span>参数快照 {{ formatTimestamp(retest.parameterSnapshot.savedAt || retest.createdAt) }}</span>
          <span v-if="retest.status === 'VOID'">
            作废时间 {{ formatTimestamp(retest.voidedAt || undefined) }}<template v-if="retest.voidReason">：{{ retest.voidReason }}</template>
          </span>
          <span v-else>已保存 {{ formatTimestamp(retest.updatedAt) }}</span>
        </div>

        <div v-if="isSensitiveHidden(retest)" class="mobile-retest-card__sensitive-lock">
          <span aria-hidden="true">🔒</span>
          <strong>复样数据已加密</strong>
        </div>

        <div v-else class="mobile-retest-card__fields">
          <label
            v-for="column in enabledColumns"
            :key="column.inputField"
            class="mobile-retest-field"
            :data-retest-field-card="column.inputField"
          >
            <span>{{ column.label }}</span>
            <input
              v-if="column.inputField"
              type="text"
              inputmode="decimal"
              enterkeyhint="next"
              :value="formatInputValue(retest, column.inputField)"
              :disabled="isLocked(retest)"
              :data-retest-field="column.inputField"
              :aria-label="`复样${retest.sequence}${column.label}检测输入`"
              @focus="handleFocus(retest, column.inputField, $event)"
              @input="handleInput(retest, column.inputField, $event)"
              @blur="handleBlur(retest, column.inputField, $event)"
            />
            <output
              v-if="column.resultField"
              :aria-label="`复样${retest.sequence}${column.label}计算结果`"
            >{{ formatResult(retest, column.resultField) }}</output>
          </label>
          <div
            v-for="column in enabledOutputOnlyColumns"
            :key="column.resultField"
            class="mobile-retest-field mobile-retest-field--result-only"
            :data-retest-result-card="column.resultField"
          >
            <span>{{ column.label }}</span>
            <output
              v-if="column.resultField"
              :aria-label="`复样${retest.sequence}${column.label}计算结果`"
            >{{ formatResult(retest, column.resultField) }}</output>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type {
  SampleBlock,
  SampleRetest,
  SampleRetestInput,
  SampleRetestInputField
} from '@/types/labSheet'
import { formatFormulaValue, parseNumericInput } from '@/utils/formulaEngine'
import {
  enabledRetestFields,
  hasRetestInput,
  isRetestColumnEnabled,
  retestGridColumns,
  type RetestGridColumn
} from '@/utils/sampleRetest'

defineOptions({ name: 'MobileSampleRetests' })

const props = defineProps<{
  parent: SampleBlock
  readonly?: boolean
  sensitiveHidden?: boolean
  highlightRetestId?: string
  pendingRetestActionIds?: string[]
}>()

const emit = defineEmits<{
  update: [retestId: string, patch: Partial<SampleRetestInput>]
  fieldCommit: [retestId: string, field: SampleRetestInputField, oldValue: unknown, newValue: unknown]
  delete: [retestId: string]
  void: [retestId: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const focusedValues = new Map<string, unknown>()
const numericInputDrafts = ref(new Map<string, string>())
const sortedRetests = computed(() => [...props.parent.retests].sort((left, right) => left.sequence - right.sequence))
const enabledColumns = computed<RetestGridColumn[]>(() => {
  const enabledFields = new Set(enabledRetestFields(props.parent.inputs.elementNote || ''))
  return retestGridColumns.filter((column) => column.inputField && enabledFields.has(column.inputField))
})
const enabledOutputOnlyColumns = computed<RetestGridColumn[]>(() => retestGridColumns.filter((column) => (
  !column.inputField &&
  Boolean(column.resultField) &&
  isRetestColumnEnabled(props.parent.inputs.elementNote || '', column)
)))

function isSensitiveHidden(retest: SampleRetest) {
  return Boolean(props.sensitiveHidden || props.parent.sensitiveFieldsHidden || retest.sensitiveFieldsHidden)
}

function isBaseLocked(retest: SampleRetest) {
  return Boolean(
    props.readonly ||
    props.parent.readonly ||
    retest.readonly ||
    retest.status === 'VOID' ||
    isSensitiveHidden(retest)
  )
}

function isLocked(retest: SampleRetest) {
  return isBaseLocked(retest) || isActionPending(retest.id)
}

function canManage(retest: SampleRetest) {
  return retest.status === 'ACTIVE' && !isBaseLocked(retest)
}

function isBlank(retest: SampleRetest) {
  return !retest.everFilled && !hasRetestInput(retest.inputs)
}

function isActionPending(retestId: string) {
  return Boolean(props.pendingRetestActionIds?.includes(retestId))
}

function inputKey(retestId: string, field: SampleRetestInputField) {
  return `${retestId}__${field}`
}

function formatInputValue(retest: SampleRetest, field: SampleRetestInputField) {
  const draft = numericInputDrafts.value.get(inputKey(retest.id, field))
  if (draft !== undefined) return draft
  const value = retest.inputs[field]
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function formatResult(retest: SampleRetest, field: NonNullable<RetestGridColumn['resultField']>) {
  const value = retest.results[field]
  return typeof value === 'number' && Number.isFinite(value) ? formatFormulaValue(value) : '—'
}

function handleFocus(retest: SampleRetest, field: SampleRetestInputField, event: Event) {
  if (isLocked(retest)) return
  const key = inputKey(retest.id, field)
  focusedValues.set(key, retest.inputs[field] ?? null)
  numericInputDrafts.value.set(key, (event.target as HTMLInputElement).value)
}

function handleInput(retest: SampleRetest, field: SampleRetestInputField, event: Event) {
  if (isLocked(retest)) return
  const rawValue = (event.target as HTMLInputElement).value
  numericInputDrafts.value.set(inputKey(retest.id, field), rawValue)
  emit('update', retest.id, { [field]: parseNumericInput(rawValue) })
}

function handleBlur(retest: SampleRetest, field: SampleRetestInputField, event: Event) {
  const key = inputKey(retest.id, field)
  if (isLocked(retest)) {
    focusedValues.delete(key)
    numericInputDrafts.value.delete(key)
    return
  }
  const oldValue = focusedValues.has(key) ? focusedValues.get(key) : retest.inputs[field] ?? null
  const newValue = parseNumericInput((event.target as HTMLInputElement).value)
  focusedValues.delete(key)
  numericInputDrafts.value.delete(key)
  if (JSON.stringify(oldValue ?? null) !== JSON.stringify(newValue ?? null)) {
    emit('fieldCommit', retest.id, field, oldValue ?? null, newValue ?? null)
  }
}

function formatTimestamp(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

let highlightGeneration = 0
let consumedHighlightRetestId = ''

watch(
  [
    () => props.highlightRetestId || '',
    () => props.parent.retests.map((retest) => retest.id).join('|')
  ],
  async ([highlightRetestId], [previousHighlightRetestId]) => {
    const generation = ++highlightGeneration
    if (highlightRetestId !== previousHighlightRetestId) consumedHighlightRetestId = ''
    if (!highlightRetestId) return
    if (consumedHighlightRetestId === highlightRetestId) return
    if (!props.parent.retests.some((retest) => retest.id === highlightRetestId)) return
    expanded.value = true
    await nextTick()
    await nextTick()
    if (generation !== highlightGeneration || props.highlightRetestId !== highlightRetestId) return
    const root = rootRef.value
    if (!root?.isConnected) return
    const card = Array.from(root.querySelectorAll<HTMLElement>('[data-retest-id]'))
      .find((element) => element.dataset.retestId === highlightRetestId)
    if (!card) return
    card.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    card.querySelector<HTMLInputElement>('input[data-retest-field]:not(:disabled)')?.focus()
    consumedHighlightRetestId = highlightRetestId
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  highlightGeneration += 1
})
</script>

<style scoped lang="scss">
.mobile-sample-retests {
  overflow: hidden;
  background: #f8fbff;
  border: 1px solid #bfd2e4;
  border-radius: 11px;
}

.mobile-sample-retests__toggle {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 9px 11px;
  color: #183657;
  background: #edf5fb;
  border: 0;
  text-align: left;

  strong {
    font-size: 15px;
  }

  span,
  i {
    color: #5f7488;
    font-size: 12px;
    font-style: normal;
  }

  &:focus-visible {
    outline: 3px solid rgba(63, 111, 153, 0.25);
    outline-offset: -3px;
  }
}

.mobile-sample-retests__content {
  display: grid;
  gap: 9px;
  padding: 9px;
  border-top: 1px solid #d4e1ed;
}

.mobile-retest-card {
  display: grid;
  gap: 9px;
  padding: 10px;
  background: #ffffff;
  border: 1px solid #d6e1ec;
  border-radius: 10px;
  transition: background-color 160ms ease, box-shadow 160ms ease;
}

.mobile-retest-card.is-void,
.mobile-retest-card.is-locked {
  background: #f1f5f9;
}

.mobile-retest-card.is-highlighted {
  border-color: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
}

.mobile-retest-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  > div:first-child {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  strong {
    color: #183657;
    font-size: 15px;
  }

  span {
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
  }

  span.is-active {
    color: #166534;
    background: #dcfce7;
  }

  span.is-void {
    color: #64748b;
    background: #e2e8f0;
  }
}

.mobile-retest-card__actions button {
  min-width: 64px;
  min-height: 44px;
  padding: 8px 12px;
  color: #2563eb;
  background: #ffffff;
  border: 1px solid #bfdbfe;
  border-radius: 9px;
  font-size: 13px;

  &:disabled {
    color: #64748b;
    background: #e2e8f0;
  }
}

.mobile-retest-card__meta {
  display: grid;
  gap: 2px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.45;
}

.mobile-retest-card__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.mobile-retest-field {
  display: grid;
  gap: 4px;
  min-width: 0;

  > span {
    color: #64748b;
    font-size: 12px;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 9px 10px;
    color: #b1261c;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    outline: 0;
    font-size: 16px;
    font-weight: 700;

    &:focus {
      border-color: #3f6f99;
      box-shadow: 0 0 0 3px rgba(63, 111, 153, 0.12);
    }

    &:disabled {
      color: #64748b;
      background: #e2e8f0;
      opacity: 1;
      -webkit-text-fill-color: #64748b;
    }
  }

  output {
    display: flex;
    align-items: center;
    min-height: 38px;
    padding: 6px 9px;
    color: #172033;
    background: #edf5fb;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.mobile-retest-field--result-only {
  align-content: end;
}

.mobile-retest-card__sensitive-lock {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 9px 10px;
  color: #7c2d12;
  background: #fff7ed;
  border: 1px dashed #fdba74;
  border-radius: 9px;
  font-size: 13px;
}

@media (max-width: 374px) {
  .mobile-retest-card__fields {
    grid-template-columns: 1fr;
  }
}

@media (orientation: landscape) and (max-height: 520px) {
  .mobile-retest-card__fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
