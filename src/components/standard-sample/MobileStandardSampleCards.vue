<template>
  <div class="page-stack mobile-standard-page" data-testid="standard-mobile-view">
    <section class="panel mobile-standard-page__intro">
      <div>
        <h2>标样计算</h2>
        <p class="muted">录入标样值和读数后自动计算空白、系数和反算标样。绿色为输入项，彩色结果为自动计算项。</p>
      </div>
      <button class="mobile-standard-page__coefficient mobile-touch-target" data-testid="open-coefficient-calculation" type="button" @click="router.push('/data/coefficient')">系数计算</button>
    </section>

    <section
      v-for="card in cards"
      :key="card.element"
      class="panel mobile-standard-card"
      :class="`mobile-standard-card--${card.element}`"
      :data-testid="`mobile-standard-card-${card.element}`"
      :aria-labelledby="`mobile-standard-title-${card.element}`"
    >
      <header class="mobile-standard-card__header">
        <div class="mobile-standard-card__heading">
          <h2 :id="`mobile-standard-title-${card.element}`" class="mobile-standard-card__title">{{ card.title }}</h2>
          <span class="mobile-standard-card__summary">
            <span>{{ card.summary[0].label }} <strong>{{ card.summary[0].value }}</strong></span>
            <span>{{ card.summary[1].label }} <strong>{{ card.summary[1].value }}</strong></span>
          </span>
        </div>
        <button
          class="mobile-standard-card__toggle mobile-touch-target"
          type="button"
          :data-testid="`mobile-standard-toggle-${card.element}`"
          :aria-label="`${expanded[card.element] ? '收起' : '展开'}${card.title}`"
          :aria-expanded="expanded[card.element]"
          :aria-controls="`mobile-standard-content-${card.element}`"
          @click="expanded[card.element] = !expanded[card.element]"
        >{{ expanded[card.element] ? '收起' : '展开' }}</button>
      </header>

      <div
        v-show="expanded[card.element]"
        :id="`mobile-standard-content-${card.element}`"
        class="mobile-standard-card__content"
        :data-testid="`mobile-standard-content-${card.element}`"
        role="region"
        :aria-labelledby="`mobile-standard-title-${card.element}`"
      >
        <div
          class="mobile-standard-card__fields mobile-standard-card__fields--two-column"
          :data-testid="`mobile-standard-fields-${card.element}`"
        >
          <label v-for="field in card.fields" :key="field.key" class="mobile-standard-field" :for="`mobile-${card.element}-${field.key}`">
            <span>{{ field.label }}</span>
            <output
              v-if="field.readonly"
              class="mobile-standard-field__fixed"
              :data-testid="`mobile-standard-fixed-${field.key}`"
            >{{ formatModelValue(card.model[field.key]) }}</output>
            <input
              v-else
              :id="`mobile-${card.element}-${field.key}`"
              class="mobile-standard-field__input mobile-touch-target"
              :data-field="field.key"
              type="number"
              inputmode="decimal"
              step="0.001"
              :disabled="disabled"
              :value="card.model[field.key] ?? ''"
              @input="updateValue(card.model, field.key, $event)"
            />
          </label>
        </div>

        <dl class="mobile-standard-results">
          <div v-for="result in card.results" :key="result.label" class="mobile-standard-results__row" :class="`mobile-standard-results__row--${result.tone}`">
            <dt>{{ result.label }}</dt>
            <dd>{{ result.value }}</dd>
          </div>
        </dl>

        <button
          class="mobile-standard-card__reset mobile-touch-target"
          type="button"
          :disabled="disabled"
          :data-testid="`mobile-standard-reset-${card.element}`"
          @click="reset(card.element)"
        >重置{{ card.shortName }}标样</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import {
  formatStandardNumber,
  type AluminumStandardInput,
  type AluminumStandardResult,
  type RatioStandardInput,
  type RatioStandardResult
} from '@/utils/standardSampleCalculator'

type ElementKey = 'aluminum' | 'silicon' | 'iron'
type NumericModel = Record<string, number | null>

interface CardDefinition {
  element: ElementKey
  shortName: string
  title: string
  model: NumericModel
  fields: Array<{ key: string; label: string; readonly?: boolean }>
  summary: Array<{ label: string; value: string }>
  results: Array<{ label: string; value: string; tone: 'yellow' | 'blue' | 'gray' }>
}

const props = withDefaults(defineProps<{
  aluminum: AluminumStandardInput
  silicon: RatioStandardInput
  iron: RatioStandardInput
  aluminumResult: AluminumStandardResult
  siliconResult: RatioStandardResult
  ironResult: RatioStandardResult
  disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  resetAluminum: []
  resetSilicon: []
  resetIron: []
}>()

const router = useRouter()
const expanded = reactive<Record<ElementKey, boolean>>({ aluminum: false, silicon: false, iron: false })

function format(value: number, precision = 3) {
  return formatStandardNumber(value, precision)
}

const cards = computed<CardDefinition[]>(() => [
  {
    element: 'aluminum' as const,
    shortName: '铝',
    title: '铝标样算法',
    model: numericRecord(props.aluminum),
    fields: [
      { key: 'highStandard', label: '高铝标样1' },
      { key: 'highReading', label: '读数' },
      { key: 'lowStandard', label: '低铝标样2' },
      { key: 'lowReading', label: '读数' },
      { key: 'baseValue', label: '固定值', readonly: true }
    ],
    summary: [
      { label: '系数1', value: format(props.aluminumResult.coefficient1) },
      { label: '反算标样1', value: format(props.aluminumResult.backCalculatedStandard1, 2) }
    ],
    results: [
      { label: '系数1', value: format(props.aluminumResult.coefficient1), tone: 'yellow' },
      { label: '系数2', value: format(props.aluminumResult.coefficient2), tone: 'blue' },
      { label: '反算标样1', value: format(props.aluminumResult.backCalculatedStandard1, 2), tone: 'gray' }
    ]
  },
  ratioCard('silicon', '硅', '硅标样算法', numericRecord(props.silicon), props.siliconResult, '低硅标样1', '高硅标样2'),
  ratioCard('iron', '铁', '铁标样算法', numericRecord(props.iron), props.ironResult, '低铁标样1', '高铁标样2')
])

function numericRecord(model: AluminumStandardInput | RatioStandardInput) {
  return model as unknown as NumericModel
}

function formatModelValue(value: number | null) {
  return value === null ? '-' : format(value)
}

function ratioCard(
  element: 'silicon' | 'iron',
  shortName: string,
  title: string,
  model: NumericModel,
  result: RatioStandardResult,
  lowLabel: string,
  highLabel: string
): CardDefinition {
  return {
    element,
    shortName,
    title,
    model,
    fields: [
      { key: 'lowStandard', label: lowLabel },
      { key: 'lowReading', label: '读数' },
      { key: 'highStandard', label: highLabel },
      { key: 'highReading', label: '读数' }
    ],
    summary: [
      { label: '系数', value: format(result.factor) },
      { label: '反算标样1', value: format(result.backCalculatedStandard1, 2) }
    ],
    results: [
      { label: '空白', value: format(result.blank), tone: 'yellow' },
      { label: '系数', value: format(result.factor), tone: 'blue' },
      { label: '反算标样1', value: format(result.backCalculatedStandard1, 2), tone: 'gray' }
    ]
  }
}

function updateValue(model: NumericModel, key: string, event: Event) {
  const rawValue = (event.target as HTMLInputElement).value
  model[key] = rawValue === '' ? null : Number(Number(rawValue).toFixed(3))
}

function reset(element: ElementKey) {
  if (element === 'aluminum') emit('resetAluminum')
  if (element === 'silicon') emit('resetSilicon')
  if (element === 'iron') emit('resetIron')
}
</script>

<style scoped lang="scss">
.mobile-standard-page {
  min-width: 0;
  gap: 12px;
  overflow-x: clip;
}

.mobile-standard-page__intro {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.mobile-standard-page__intro h2,
.mobile-standard-card h2 {
  margin: 0;
  color: var(--ui-text);
  font-size: 18px;
}

.mobile-standard-page__intro p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.55;
}

.mobile-standard-page__coefficient,
.mobile-standard-card__reset {
  border: 1px solid var(--ui-line);
  border-radius: 10px;
  background: #fff;
  color: var(--ui-accent-hover);
  font-weight: 700;
}

.mobile-standard-card {
  min-width: 0;
  padding: 0;
  overflow: hidden;
}

.mobile-standard-card__header {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
}

.mobile-standard-card--aluminum .mobile-standard-card__header {
  background: var(--ui-warning-soft);
}

.mobile-standard-card--silicon .mobile-standard-card__header {
  background: var(--ui-accent-soft);
}

.mobile-standard-card--iron .mobile-standard-card__header {
  background: var(--ui-danger-soft);
}

.mobile-standard-card__toggle {
  flex: none;
  padding: 0 10px;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  background: rgb(255 255 255 / 72%);
  color: var(--ui-accent);
  font-weight: 700;
}

.mobile-standard-card__heading {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.mobile-standard-card__title {
  min-width: 0;
}

.mobile-standard-card__summary {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--ui-text-secondary);
  font-size: 12px;
}

.mobile-standard-card__summary strong {
  color: var(--ui-text);
}

.mobile-standard-card__content {
  min-width: 0;
  padding: 14px;
  border-top: 1px solid var(--ui-line-soft);
}

.mobile-standard-card__fields {
  display: grid;
  min-width: 0;
  gap: 10px;
}

.mobile-standard-card__fields--two-column {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mobile-standard-field {
  display: grid;
  min-width: 0;
  gap: 5px;
  color: var(--ui-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.mobile-standard-field__input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--ui-success-line);
  border-radius: 8px;
  outline: none;
  background: var(--ui-success-soft);
  color: var(--ui-text);
  font: inherit;
}

.mobile-standard-field__fixed {
  display: flex;
  min-height: 44px;
  align-items: center;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
  font-weight: 700;
}

.mobile-standard-field__input:focus-visible {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 2px rgb(37 99 235 / 20%);
}

.mobile-standard-field__input:disabled,
.mobile-standard-card__reset:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.mobile-standard-results {
  display: grid;
  gap: 1px;
  margin: 14px 0;
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  background: var(--ui-line);
}

.mobile-standard-results__row {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.mobile-standard-results__row dt,
.mobile-standard-results__row dd {
  display: flex;
  min-width: 0;
  min-height: 40px;
  align-items: center;
  margin: 0;
  padding: 0 12px;
}

.mobile-standard-results__row dt {
  justify-content: flex-end;
  color: var(--ui-text-secondary);
  font-weight: 700;
}

.mobile-standard-results__row dd {
  color: var(--ui-text);
  font-size: 16px;
  font-weight: 700;
}

.mobile-standard-results__row--yellow dt,
.mobile-standard-results__row--yellow dd {
  background: var(--ui-warning-soft);
}

.mobile-standard-results__row--blue dt,
.mobile-standard-results__row--blue dd {
  background: var(--ui-accent-line);
}

.mobile-standard-results__row--gray dt,
.mobile-standard-results__row--gray dd {
  background: var(--ui-line-soft);
}

.mobile-standard-card__reset {
  width: 100%;
}

</style>
