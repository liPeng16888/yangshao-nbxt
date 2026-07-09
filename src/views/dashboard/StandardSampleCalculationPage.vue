<template>
  <div class="page-stack standard-page">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>标样计算</h2>
          <p class="muted">录入标样值和读数后自动计算空白、系数和反算标样。绿色为输入项，彩色结果为自动计算项。</p>
        </div>
        <el-button @click="router.push('/data/coefficient')">系数计算</el-button>
      </div>
    </section>

    <div class="standard-grid">
      <section class="panel standard-card standard-card--aluminum">
        <div class="standard-card__header">
          <div>
            <h2>铝标样算法</h2>
            <p>按表格中的高铝标样、低铝标样和固定换算项计算系数。</p>
          </div>
          <el-button size="small" @click="resetAluminum">重置</el-button>
        </div>
        <div class="standard-form">
          <label>
            <span>高铝标样1</span>
            <el-input-number v-model="aluminum.highStandard" :precision="3" controls-position="right" />
          </label>
          <label>
            <span>读数</span>
            <el-input-number v-model="aluminum.highReading" :precision="3" controls-position="right" />
          </label>
          <output>{{ format(aluminumResult.highProduct) }}</output>
          <label>
            <span>低铝标样2</span>
            <el-input-number v-model="aluminum.lowStandard" :precision="3" controls-position="right" />
          </label>
          <label>
            <span>读数</span>
            <el-input-number v-model="aluminum.lowReading" :precision="3" controls-position="right" />
          </label>
          <output>{{ format(aluminumResult.lowProduct) }}</output>
          <label>
            <span>固定值</span>
            <output class="standard-form__fixed">{{ format(aluminum.baseValue) }}</output>
          </label>
          <div class="standard-form__empty"></div>
          <output>{{ format(aluminumResult.difference) }}</output>
        </div>
        <div class="result-grid">
          <span class="result-label result-label--yellow">系数1</span>
          <strong class="result-value result-value--yellow">{{ format(aluminumResult.coefficient1, 3) }}</strong>
          <span class="result-label result-label--blue">系数2</span>
          <strong class="result-value result-value--blue">{{ format(aluminumResult.coefficient2, 3) }}</strong>
          <span class="result-label result-label--gray">反算标样1</span>
          <strong class="result-value result-value--gray">{{ format(aluminumResult.backCalculatedStandard1, 2) }}</strong>
        </div>
      </section>

      <StandardRatioCard
        title="硅标样算法"
        tone="silicon"
        low-label="低硅标样1"
        high-label="高硅标样2"
        :model="silicon"
        :result="siliconResult"
        @reset="resetSilicon"
      />

      <StandardRatioCard
        title="铁标样算法"
        tone="iron"
        low-label="低铁标样1"
        high-label="高铁标样2"
        :model="iron"
        :result="ironResult"
        @reset="resetIron"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElInputNumber } from 'element-plus'
import {
  calculateAluminumStandard,
  calculateRatioStandard,
  formatStandardNumber,
  type AluminumStandardInput,
  type RatioStandardInput,
  type RatioStandardResult
} from '@/utils/standardSampleCalculator'
import type { AuthUser } from '@/types/auth'

const router = useRouter()
const STORAGE_KEY_PREFIX = 'ys_standard_sample_inputs'

type StandardSampleStorage = {
  aluminum?: Partial<AluminumStandardInput>
  silicon?: Partial<RatioStandardInput>
  iron?: Partial<RatioStandardInput>
}

const defaultAluminum: AluminumStandardInput = {
  highStandard: 69.74,
  highReading: 7.7,
  lowStandard: 52,
  lowReading: 12.2,
  baseValue: 214.38
}

const defaultSilicon: RatioStandardInput = {
  lowStandard: 4.88,
  lowReading: 0.405,
  highStandard: 17.05,
  highReading: 1.31
}

const defaultIron: RatioStandardInput = {
  lowStandard: 6.09,
  lowReading: 0.147,
  highStandard: 15.31,
  highReading: 0.461
}

const savedInputs = readSavedInputs()
const aluminum = reactive<AluminumStandardInput>({ ...defaultAluminum, ...savedInputs.aluminum })
const silicon = reactive<RatioStandardInput>({ ...defaultSilicon, ...savedInputs.silicon })
const iron = reactive<RatioStandardInput>({ ...defaultIron, ...savedInputs.iron })

const aluminumResult = computed(() => calculateAluminumStandard(aluminum))
const siliconResult = computed(() => calculateRatioStandard(silicon))
const ironResult = computed(() => calculateRatioStandard(iron))

function resetAluminum() {
  Object.assign(aluminum, defaultAluminum)
}

function resetSilicon() {
  Object.assign(silicon, defaultSilicon)
}

function resetIron() {
  Object.assign(iron, defaultIron)
}

function format(value: number | null | undefined, precision = 3) {
  return formatStandardNumber(typeof value === 'number' ? value : Number.NaN, precision)
}

function currentStorageKey() {
  if (typeof window === 'undefined') return STORAGE_KEY_PREFIX
  const rawUser = window.localStorage.getItem('ys_user')
  if (!rawUser) return `${STORAGE_KEY_PREFIX}:guest`
  try {
    const user = JSON.parse(rawUser) as Partial<AuthUser>
    return `${STORAGE_KEY_PREFIX}:${user.id || user.account || 'guest'}`
  } catch {
    return `${STORAGE_KEY_PREFIX}:guest`
  }
}

function readSavedInputs(): StandardSampleStorage {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(currentStorageKey())
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as StandardSampleStorage
    return {
      aluminum: pickNumberFields(parsed.aluminum, defaultAluminum),
      silicon: pickNumberFields(parsed.silicon, defaultSilicon),
      iron: pickNumberFields(parsed.iron, defaultIron)
    }
  } catch {
    return {}
  }
}

function pickNumberFields<T extends object>(source: unknown, defaults: T) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  return Object.keys(defaults).reduce<Partial<T>>((picked, key) => {
    const value = (source as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      picked[key as keyof T] = value as T[keyof T]
    } else if (value === null) {
      picked[key as keyof T] = null as T[keyof T]
    }
    return picked
  }, {})
}

function saveInputs() {
  if (typeof window === 'undefined') return
  const payload: StandardSampleStorage = {
    aluminum: { ...aluminum },
    silicon: { ...silicon },
    iron: { ...iron }
  }
  window.localStorage.setItem(currentStorageKey(), JSON.stringify(payload))
}

watch([aluminum, silicon, iron], saveInputs, { deep: true })

const StandardRatioCard = defineComponent({
  name: 'StandardRatioCard',
  props: {
    title: { type: String, required: true },
    tone: { type: String as () => 'silicon' | 'iron', required: true },
    lowLabel: { type: String, required: true },
    highLabel: { type: String, required: true },
    model: { type: Object as () => RatioStandardInput, required: true },
    result: { type: Object as () => RatioStandardResult, required: true }
  },
  emits: ['reset'],
  setup(props, { emit }) {
    const input = (key: keyof RatioStandardInput) =>
      h(ElInputNumber, {
        modelValue: props.model[key],
        'onUpdate:modelValue': (value: number | undefined) => {
          props.model[key] = value ?? null
        },
        precision: 3,
        controlsPosition: 'right'
      })

    const inputField = (label: string, key: keyof RatioStandardInput) =>
      h('label', [h('span', label), input(key)])

    return () =>
      h('section', { class: ['panel standard-card standard-card--ratio', `standard-card--${props.tone}`] }, [
        h('div', { class: 'standard-card__header' }, [
          h('div', [h('h2', props.title), h('p', '按低标样和高标样读数自动计算空白、系数和反算标样。')]),
          h(ElButton, { size: 'small', onClick: () => emit('reset') }, () => '重置')
        ]),
        h('div', { class: 'standard-form' }, [
          inputField(props.lowLabel, 'lowStandard'),
          inputField('读数', 'lowReading'),
          h('output', format(props.result.lowProduct)),
          inputField(props.highLabel, 'highStandard'),
          inputField('读数', 'highReading'),
          h('output', format(props.result.highProduct)),
          h('label', [h('span', '标样差'), h('output', { class: 'standard-form__fixed' }, format(props.result.standardDelta))]),
          h('div', { class: 'standard-form__empty' }),
          h('output', format(props.result.lowProduct - props.result.highProduct))
        ]),
        h('div', { class: 'result-grid' }, [
          h('span', { class: 'result-label result-label--yellow' }, '空白'),
          h('strong', { class: 'result-value result-value--yellow' }, format(props.result.blank, 3)),
          h('span', { class: 'result-label result-label--blue' }, '系数'),
          h('strong', { class: 'result-value result-value--blue' }, format(props.result.factor, 3)),
          h('span', { class: 'result-label result-label--gray' }, '反算标样1'),
          h('strong', { class: 'result-value result-value--gray' }, format(props.result.backCalculatedStandard1, 2))
        ])
      ])
  }
})
</script>

<style scoped lang="scss">
.standard-page {
  gap: 14px;
}

.standard-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.standard-card {
  padding: 0;
  overflow: hidden;
}

.standard-card__header,
.standard-card :deep(.standard-card__header) {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #d9e4ef;
}

.standard-card__header h2,
.standard-card :deep(.standard-card__header h2) {
  margin: 0;
  color: #10233f;
  font-size: 20px;
}

.standard-card__header p,
.standard-card :deep(.standard-card__header p) {
  margin: 6px 0 0;
  color: #667085;
  font-size: 13px;
}

.standard-card--aluminum .standard-card__header {
  background: #fff7ed;
}

.standard-card--silicon :deep(.standard-card__header) {
  background: #eff6ff;
}

.standard-card--iron :deep(.standard-card__header) {
  background: #fff1f2;
}

.standard-form,
.standard-card :deep(.standard-form) {
  display: grid;
  gap: 8px;
  padding: 16px 18px 12px;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr) minmax(88px, 0.8fr);
}

.standard-form label,
.standard-card :deep(.standard-form label) {
  display: grid;
  gap: 5px;
  color: #344054;
  font-size: 13px;
  font-weight: 600;
}

.standard-form :deep(.el-input-number),
.standard-card :deep(.standard-form .el-input-number) {
  width: 100%;
}

.standard-form :deep(.el-input__wrapper),
.standard-card :deep(.standard-form .el-input__wrapper) {
  background: #e6f4ea;
  border: 1px solid #9acb8c;
  box-shadow: none;
}

.standard-form output,
.standard-form__fixed,
.standard-card :deep(.standard-form output),
.standard-card :deep(.standard-form__fixed) {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 10px;
  color: #10233f;
  font-weight: 700;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}

.standard-form__empty,
.standard-card :deep(.standard-form__empty) {
  min-height: 1px;
}

.result-grid,
.standard-card :deep(.result-grid) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin: 0 18px 14px;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #cbd5e1;
}

.result-label,
.result-value,
.standard-card :deep(.result-label),
.standard-card :deep(.result-value) {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
}

.result-label,
.standard-card :deep(.result-label) {
  justify-content: flex-end;
  color: #344054;
  font-weight: 700;
}

.result-value,
.standard-card :deep(.result-value) {
  color: #0f172a;
  font-size: 17px;
}

.result-label--yellow,
.result-value--yellow,
.standard-card :deep(.result-label--yellow),
.standard-card :deep(.result-value--yellow) {
  background: #fdeca6;
}

.result-label--blue,
.result-value--blue,
.standard-card :deep(.result-label--blue),
.standard-card :deep(.result-value--blue) {
  background: #bfdbfe;
}

.result-label--gray,
.result-value--gray,
.standard-card :deep(.result-label--gray),
.standard-card :deep(.result-value--gray) {
  background: #e5e7eb;
}

@media (max-width: 720px) {
  .standard-form,
  .standard-card :deep(.standard-form) {
    grid-template-columns: 1fr;
  }
}
</style>
