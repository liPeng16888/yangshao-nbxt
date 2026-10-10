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
      @click="toggleCollection"
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
          'is-expanded': isRetestExpanded(retest.id),
          'is-highlighted': retest.id === highlightRetestId
        }"
        :data-retest-id="retest.id"
        :aria-label="`复样${retest.sequence}`"
        :aria-busy="isActionPending(retest.id) ? 'true' : undefined"
      >
        <button
          class="mobile-retest-card__toggle"
          type="button"
          :data-testid="`mobile-retest-toggle-${retest.id}`"
          :aria-expanded="isRetestExpanded(retest.id)"
          :aria-controls="retestBodyId(retest.id)"
          @click="toggleRetest(retest.id)"
        >
          <span class="mobile-retest-card__title">
            <strong>复样{{ retest.sequence }}</strong>
            <span class="mobile-retest-card__status" :class="retest.status === 'VOID' ? 'is-void' : 'is-active'">
              {{ retest.status === 'VOID' ? '已作废' : 'ACTIVE' }}
            </span>
          </span>
          <small>{{ isRetestExpanded(retest.id) ? '收起' : '展开' }}</small>
          <i aria-hidden="true">{{ isRetestExpanded(retest.id) ? '⌃' : '⌄' }}</i>
        </button>

        <div
          v-if="isRetestExpanded(retest.id)"
          :id="retestBodyId(retest.id)"
          class="mobile-retest-card__body"
        >
          <div class="mobile-retest-card__summary">
            <div class="mobile-retest-card__meta">
              <span>创建时间 {{ formatTimestamp(retest.createdAt) }}</span>
              <span>参数快照 {{ formatTimestamp(retest.parameterSnapshot?.savedAt || retest.createdAt) }}</span>
              <span v-if="retest.status === 'VOID'">
                作废时间 {{ formatTimestamp(retest.voidedAt || undefined) }}<template v-if="retest.voidReason">：{{ retest.voidReason }}</template>
              </span>
              <span v-else>已保存 {{ formatTimestamp(retest.updatedAt) }}</span>
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
          </div>

          <div v-if="isSensitiveHidden(retest)" class="mobile-retest-card__sensitive-lock">
            <span aria-hidden="true">🔒</span>
            <strong>复样数据已加密</strong>
          </div>

          <div v-else class="mobile-retest-calculation">
            <div class="mobile-retest-calculation__tabs" role="tablist" :aria-label="`复样${retest.sequence}检测数据分类`">
              <button
                v-for="group in mobileCalculationGroups"
                :id="retestTabId(retest.id, group.key)"
                :key="group.key"
                class="mobile-retest-calculation__tab"
                :class="{ 'is-active': activeCalculationTab(retest.id) === group.key }"
                type="button"
                role="tab"
                :aria-controls="retestPanelId(retest.id, group.key)"
                :aria-selected="activeCalculationTab(retest.id) === group.key"
                @click="selectCalculationTab(retest.id, group.key)"
              >{{ group.label }}</button>
            </div>

            <template v-for="group in mobileCalculationGroups" :key="group.key">
              <div
                v-if="activeCalculationTab(retest.id) === group.key"
                :id="retestPanelId(retest.id, group.key)"
                class="mobile-retest-calculation__panel"
                role="tabpanel"
                :aria-labelledby="retestTabId(retest.id, group.key)"
                :data-mobile-retest-panel="group.key"
              >
                <div v-if="visibleFields(group).length" class="mobile-retest-card__fields">
                  <label
                    v-for="field in visibleFields(group)"
                    :key="field.key"
                    class="mobile-retest-field"
                    :data-retest-field-card="field.key"
                  >
                    <span>{{ field.label }}</span>
                    <input
                      type="text"
                      inputmode="decimal"
                      enterkeyhint="next"
                      :value="formatInputValue(retest, field.key)"
                      :disabled="isLocked(retest)"
                      :data-retest-field="field.key"
                      :aria-label="`复样${retest.sequence}${field.label}检测输入`"
                      @focus="handleFocus(retest, field.key, $event)"
                      @input="handleInput(retest, field.key, $event)"
                      @blur="handleBlur(retest, field.key, $event)"
                    />
                  </label>
                </div>
                <div v-if="visibleResults(group).length" class="mobile-retest-results">
                  <div
                    v-for="result in visibleResults(group)"
                    :key="`${result.source}-${result.key}`"
                    class="mobile-retest-result"
                    :data-retest-result-card="result.key"
                  >
                    <span>{{ result.label }}</span>
                    <output :aria-label="`复样${retest.sequence}${result.label}计算结果`">
                      {{ formatCalculationResult(retest, result) }}
                    </output>
                  </div>
                </div>
                <p v-if="!visibleFields(group).length && !visibleResults(group).length" class="mobile-retest-calculation__empty">
                  当前样品未选择此类化验元素
                </p>
              </div>
            </template>
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
  mobileCalculationGroups,
  type MobileCalculationGroup,
  type MobileCalculationResultField,
  type MobileCalculationTabKey
} from '@/utils/mobileLabCalculation'
import {
  enabledRetestFields,
  hasRetestInput,
  isRetestColumnEnabled,
  retestGridColumns
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
  highlightConsumed: [retestId: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const expandedRetestId = ref('')
const activeCalculationTabByRetest = ref(new Map<string, MobileCalculationTabKey>())
const focusedValues = new Map<string, unknown>()
const numericInputDrafts = ref(new Map<string, string>())
const sortedRetests = computed(() => [...props.parent.retests].sort((left, right) => left.sequence - right.sequence))
const enabledInputFields = computed(() => new Set(enabledRetestFields(props.parent.inputs.elementNote || '')))

function toggleCollection() {
  expanded.value = !expanded.value
  if (!expanded.value) {
    expandedRetestId.value = ''
    activeCalculationTabByRetest.value = new Map()
  }
}

function isRetestExpanded(retestId: string) {
  return expandedRetestId.value === retestId
}

function firstAvailableTab() {
  return mobileCalculationGroups.find((group) => visibleFields(group).length)?.key || 'metal'
}

function openRetest(retestId: string) {
  expandedRetestId.value = retestId
  if (!activeCalculationTabByRetest.value.has(retestId)) {
    selectCalculationTab(retestId, firstAvailableTab())
  }
}

function toggleRetest(retestId: string) {
  if (isRetestExpanded(retestId)) {
    expandedRetestId.value = ''
    return
  }
  openRetest(retestId)
}

function activeCalculationTab(retestId: string): MobileCalculationTabKey {
  return activeCalculationTabByRetest.value.get(retestId) || 'metal'
}

function selectCalculationTab(retestId: string, tab: MobileCalculationTabKey) {
  const nextTabs = new Map(activeCalculationTabByRetest.value)
  if (tab === 'metal') nextTabs.delete(retestId)
  else nextTabs.set(retestId, tab)
  activeCalculationTabByRetest.value = nextTabs
}

function retestBodyId(retestId: string) {
  return `mobile-retest-body-${retestId}`
}

function retestTabId(retestId: string, tab: MobileCalculationTabKey) {
  return `mobile-retest-tab-${retestId}-${tab}`
}

function retestPanelId(retestId: string, tab: MobileCalculationTabKey) {
  return `mobile-retest-panel-${retestId}-${tab}`
}

function visibleFields(group: MobileCalculationGroup) {
  return group.fields.filter((field) => enabledInputFields.value.has(field.key))
}

function visibleResults(group: MobileCalculationGroup) {
  return group.results.filter((result) => {
    if (result.source === 'input') return enabledInputFields.value.has(result.key)
    const column = retestGridColumns.find((candidate) => candidate.resultField === result.key)
    return Boolean(column && isRetestColumnEnabled(props.parent.inputs.elementNote || '', column))
  })
}

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

function formatCalculationResult(retest: SampleRetest, result: MobileCalculationResultField) {
  const value = result.source === 'result' ? retest.results[result.key] : retest.inputs[result.key]
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
  () => props.parent.retests.map((retest) => retest.id).join('|'),
  () => {
    if (expandedRetestId.value && !props.parent.retests.some((retest) => retest.id === expandedRetestId.value)) {
      expandedRetestId.value = ''
    }
  }
)

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
    openRetest(highlightRetestId)
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
    emit('highlightConsumed', highlightRetestId)
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
  background: var(--ui-surface-subtle);
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
  color: var(--ui-text);
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
  gap: 8px;
  padding: 8px;
  border-top: 1px solid #d4e1ed;
}

.mobile-retest-card {
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #d6e1ec;
  border-radius: 10px;
  transition: background-color 160ms ease, box-shadow 160ms ease;
}

.mobile-retest-card.is-void,
.mobile-retest-card.is-locked {
  background: var(--ui-surface-subtle);
}

.mobile-retest-card.is-expanded {
  border-color: #b8cbde;
}

.mobile-retest-card.is-highlighted {
  border-color: var(--ui-warning);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
}

.mobile-retest-card__toggle {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  color: var(--ui-text);
  background: transparent;
  border: 0;
  text-align: left;

  small,
  i {
    color: #5f7488;
    font-size: 12px;
    font-style: normal;
  }

  &:focus-visible {
    outline: 3px solid rgba(63, 111, 153, 0.22);
    outline-offset: -3px;
  }
}

.mobile-retest-card__title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;

  strong {
    color: var(--ui-text);
    font-size: 15px;
  }
}

.mobile-retest-card__status {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;

  &.is-active {
    color: var(--ui-success);
    background: var(--ui-success-soft);
  }

  &.is-void {
    color: var(--ui-text-muted);
    background: var(--ui-line-soft);
  }
}

.mobile-retest-card__body {
  display: grid;
  gap: 10px;
  padding: 10px;
  background: #ffffff;
  border-top: 1px solid #e1e9f1;
}

.mobile-retest-card.is-void .mobile-retest-card__body,
.mobile-retest-card.is-locked .mobile-retest-card__body {
  background: var(--ui-surface-subtle);
}

.mobile-retest-card__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
}

.mobile-retest-card__actions button {
  min-width: 64px;
  min-height: 44px;
  padding: 8px 12px;
  color: var(--ui-accent);
  background: #ffffff;
  border: 1px solid var(--ui-accent-line);
  border-radius: 9px;
  font-size: 13px;

  &:disabled {
    color: var(--ui-text-muted);
    background: var(--ui-line-soft);
  }
}

.mobile-retest-card__meta {
  display: grid;
  gap: 2px;
  color: var(--ui-text-muted);
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
    color: var(--ui-text-muted);
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
    border: 1px solid var(--ui-line);
    border-radius: 9px;
    outline: 0;
    font-size: 16px;
    font-weight: 700;

    &:focus {
      border-color: #3f6f99;
      box-shadow: 0 0 0 3px rgba(63, 111, 153, 0.12);
    }

    &:disabled {
      color: var(--ui-text-muted);
      background: var(--ui-line-soft);
      opacity: 1;
      -webkit-text-fill-color: var(--ui-text-muted);
    }
  }

}

.mobile-retest-calculation {
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #dce6ef;
  border-radius: 9px;
}

.mobile-retest-calculation__tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  padding: 0 4px;
}

.mobile-retest-calculation__tab {
  position: relative;
  min-width: 0;
  min-height: 44px;
  padding: 8px 2px;
  overflow: hidden;
  color: var(--ui-text-secondary);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;

  &.is-active {
    color: var(--ui-accent);
    border-bottom-color: var(--ui-accent);
  }

  &:focus-visible {
    z-index: 1;
    outline: 3px solid rgba(63, 111, 153, 0.2);
    outline-offset: -3px;
  }
}

.mobile-retest-calculation__panel {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid #e5ebf1;
}

.mobile-retest-results {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.mobile-retest-result {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 8px;
  background: #edf5fb;
  border-radius: 8px;

  span {
    overflow: hidden;
    color: var(--ui-text-muted);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  output {
    color: #b1261c;
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.mobile-retest-calculation__empty {
  margin: 0;
  padding: 8px;
  color: #8293a6;
  background: var(--ui-surface-subtle);
  border-radius: 8px;
  font-size: 12px;
  text-align: center;
}

.mobile-retest-card__sensitive-lock {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 9px 10px;
  color: #7c2d12;
  background: var(--ui-warning-soft);
  border: 1px dashed #fdba74;
  border-radius: 9px;
  font-size: 13px;
}

@media (orientation: landscape) and (max-height: 520px) {
  .mobile-retest-card__fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
