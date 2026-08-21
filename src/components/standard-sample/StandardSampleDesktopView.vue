<template>
  <div class="page-stack standard-page" data-testid="standard-desktop-view">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>标样计算</h2>
          <p class="muted">录入标样值和读数后自动计算空白、系数和反算标样。绿色为输入项，彩色结果为自动计算项。</p>
        </div>
        <el-button data-testid="open-coefficient-calculation" @click="router.push('/data/coefficient')">系数计算</el-button>
      </div>
    </section>

    <div class="standard-grid">
      <section class="panel standard-card standard-card--aluminum">
        <div class="standard-card__header">
          <div>
            <h2>铝标样算法</h2>
            <p>按表格中的高铝标样、低铝标样和固定换算项计算系数。</p>
          </div>
          <el-button size="small" :disabled="disabled" @click="emit('resetAluminum')">重置</el-button>
        </div>
        <div class="standard-form">
          <label>
            <span>高铝标样1</span>
            <el-input-number :model-value="aluminum.highStandard" :precision="3" controls-position="right" :disabled="disabled" @update:model-value="updateAluminum('highStandard', $event)" />
          </label>
          <label>
            <span>读数</span>
            <el-input-number :model-value="aluminum.highReading" :precision="3" controls-position="right" :disabled="disabled" @update:model-value="updateAluminum('highReading', $event)" />
          </label>
          <output>{{ format(aluminumResult.highProduct) }}</output>
          <label>
            <span>低铝标样2</span>
            <el-input-number :model-value="aluminum.lowStandard" :precision="3" controls-position="right" :disabled="disabled" @update:model-value="updateAluminum('lowStandard', $event)" />
          </label>
          <label>
            <span>读数</span>
            <el-input-number :model-value="aluminum.lowReading" :precision="3" controls-position="right" :disabled="disabled" @update:model-value="updateAluminum('lowReading', $event)" />
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
        :disabled="disabled"
        @reset="emit('resetSilicon')"
      />

      <StandardRatioCard
        title="铁标样算法"
        tone="iron"
        low-label="低铁标样1"
        high-label="高铁标样2"
        :model="iron"
        :result="ironResult"
        :disabled="disabled"
        @reset="emit('resetIron')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElInputNumber } from 'element-plus'
import {
  formatStandardNumber,
  type AluminumStandardInput,
  type AluminumStandardResult,
  type RatioStandardInput,
  type RatioStandardResult
} from '@/utils/standardSampleCalculator'

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

function nullableNumber(value: number | undefined) {
  return value ?? null
}

function updateAluminum(key: keyof AluminumStandardInput, value: number | undefined) {
  props.aluminum[key] = nullableNumber(value)
}

function format(value: number | null | undefined, precision = 3) {
  return formatStandardNumber(typeof value === 'number' ? value : Number.NaN, precision)
}

const StandardRatioCard = defineComponent({
  name: 'StandardRatioCard',
  props: {
    title: { type: String, required: true },
    tone: { type: String as () => 'silicon' | 'iron', required: true },
    lowLabel: { type: String, required: true },
    highLabel: { type: String, required: true },
    model: { type: Object as () => RatioStandardInput, required: true },
    result: { type: Object as () => RatioStandardResult, required: true },
    disabled: { type: Boolean, default: false }
  },
  emits: ['reset'],
  setup(cardProps, { emit: emitCard }) {
    const input = (key: keyof RatioStandardInput) =>
      h(ElInputNumber, {
        modelValue: cardProps.model[key],
        'onUpdate:modelValue': (value: number | undefined) => {
          cardProps.model[key] = nullableNumber(value)
        },
        precision: 3,
        controlsPosition: 'right',
        disabled: cardProps.disabled
      })

    const inputField = (label: string, key: keyof RatioStandardInput) =>
      h('label', [h('span', label), input(key)])

    return () =>
      h('section', { class: ['panel standard-card standard-card--ratio', `standard-card--${cardProps.tone}`] }, [
        h('div', { class: 'standard-card__header' }, [
          h('div', [h('h2', cardProps.title), h('p', '按低标样和高标样读数自动计算空白、系数和反算标样。')]),
          h(ElButton, { size: 'small', disabled: cardProps.disabled, onClick: () => emitCard('reset') }, () => '重置')
        ]),
        h('div', { class: 'standard-form' }, [
          inputField(cardProps.lowLabel, 'lowStandard'),
          inputField('读数', 'lowReading'),
          h('output', format(cardProps.result.lowProduct)),
          inputField(cardProps.highLabel, 'highStandard'),
          inputField('读数', 'highReading'),
          h('output', format(cardProps.result.highProduct)),
          h('label', [h('span', '标样差'), h('output', { class: 'standard-form__fixed' }, format(cardProps.result.standardDelta))]),
          h('div', { class: 'standard-form__empty' }),
          h('output', format(cardProps.result.lowProduct - cardProps.result.highProduct))
        ]),
        h('div', { class: 'result-grid' }, [
          h('span', { class: 'result-label result-label--yellow' }, '空白'),
          h('strong', { class: 'result-value result-value--yellow' }, format(cardProps.result.blank, 3)),
          h('span', { class: 'result-label result-label--blue' }, '系数'),
          h('strong', { class: 'result-value result-value--blue' }, format(cardProps.result.factor, 3)),
          h('span', { class: 'result-label result-label--gray' }, '反算标样1'),
          h('strong', { class: 'result-value result-value--gray' }, format(cardProps.result.backCalculatedStandard1, 2))
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
