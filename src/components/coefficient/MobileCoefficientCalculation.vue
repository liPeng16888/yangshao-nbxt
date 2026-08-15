<template>
  <div class="mobile-coefficient" data-testid="coefficient-mobile-view">
    <section
      v-for="section in sections"
      :key="section.key"
      class="panel mobile-coefficient__section"
      data-testid="mobile-coefficient-section"
    >
      <button
        class="mobile-coefficient__toggle mobile-touch-target"
        type="button"
        :data-testid="`mobile-coefficient-toggle-${section.key}`"
        :aria-expanded="expanded[section.key]"
        :aria-controls="`mobile-coefficient-content-${section.key}`"
        @click="expanded[section.key] = !expanded[section.key]"
      ><strong>{{ section.label }}</strong><span>{{ expanded[section.key] ? '收起' : '展开' }}</span></button>

      <div
        v-show="expanded[section.key]"
        :id="`mobile-coefficient-content-${section.key}`"
        class="mobile-coefficient__content"
        :data-testid="`mobile-coefficient-content-${section.key}`"
      >
        <template v-if="section.key === 'standard'">
          <article
            v-for="(row, rowIndex) in calculation.standardRows"
            :key="row.id"
            class="mobile-coefficient-card"
            :data-testid="`mobile-standard-card-standard-${rowIndex + 1}`"
          >
            <header class="mobile-coefficient-card__header">
              <strong class="mobile-coefficient-card__current-code">{{ row.code }}</strong>
              <input
                v-if="calculation.standardDeleteMode.value"
                type="checkbox"
                class="mobile-touch-target"
                :checked="calculation.selectedStandardRowIds.value.includes(row.id)"
                :aria-label="`选择标样含量样品 ${row.code}`"
                :data-testid="`mobile-select-standard-row-${row.id}`"
                @change="calculation.toggleStandardRow(row.id, ($event.target as HTMLInputElement).checked)"
              />
              <label>
                <span>编号</span>
                <input
                  class="mobile-touch-target mobile-coefficient-card__code"
                  :value="row.code"
                  maxlength="40"
                  :disabled="disabled"
                  :aria-label="`标样含量样品编号 ${row.code}`"
                  @input="updateCode(row, $event)"
                />
              </label>
            </header>
            <div class="mobile-coefficient-grid">
              <label v-for="element in coefficientContentElements" :key="element.key">
                <span>{{ element.label }}</span>
                <input
                  class="mobile-touch-target"
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  :disabled="disabled"
                  :value="row[element.key] ?? ''"
                  :data-field="element.key"
                  @input="updateNullable(row, element.key, $event, 2)"
                />
              </label>
            </div>
          </article>

          <div class="mobile-coefficient__bottom-actions">
            <label>增加标样
              <input
                class="mobile-touch-target"
                type="number"
                inputmode="numeric"
                min="1"
                max="50"
                :disabled="disabled"
                :value="calculation.standardAddCount.value"
                data-testid="mobile-standard-add-count"
                @input="calculation.standardAddCount.value = inputNumber($event)"
              />
            </label>
            <button class="mobile-touch-target" type="button" :disabled="disabled" data-testid="mobile-add-standard-rows" @click="calculation.addStandardRows">确认增加</button>
            <button class="mobile-touch-target" type="button" :disabled="disabled" data-testid="mobile-delete-standard-rows" @click="calculation.standardDeleteMode.value = true">删除样品</button>
          </div>
        </template>

        <template v-else-if="section.key === 'calculation'">
          <button class="mobile-coefficient__apply mobile-touch-target" type="button" :disabled="disabled || applicationLoading" @click="emit('openApplication')">应用系数</button>
          <article
            v-for="(row, rowIndex) in calculation.calculationRows"
            :key="row.id"
            class="mobile-coefficient-card"
            :data-testid="`mobile-calculation-card-calculation-${rowIndex + 1}`"
          >
            <header class="mobile-coefficient-card__header">
              <strong class="mobile-coefficient-card__current-code">{{ row.code }}</strong>
              <input
                v-if="calculation.calculationDeleteMode.value"
                type="checkbox"
                class="mobile-touch-target"
                :checked="calculation.selectedCalculationRowIds.value.includes(row.id)"
                :aria-label="`选择标样系数计算样品 ${row.code}`"
                :data-testid="`mobile-select-calculation-row-${row.id}`"
                @change="calculation.toggleCalculationRow(row.id, ($event.target as HTMLInputElement).checked)"
              />
              <label>
                <span>元素编号</span>
                <input
                  class="mobile-touch-target mobile-coefficient-card__code"
                  :value="row.code"
                  maxlength="40"
                  :disabled="disabled"
                  :aria-label="`标样系数计算样品编号 ${row.code}`"
                  @input="updateCode(row, $event)"
                />
              </label>
            </header>
            <div class="mobile-coefficient-grid">
              <label v-for="element in coefficientCalculationElements" :key="element.inputField">
                <span>{{ element.label }}</span>
                <input
                  class="mobile-touch-target"
                  type="number"
                  inputmode="decimal"
                  step="0.001"
                  :disabled="disabled"
                  :value="row.inputs[element.inputField] ?? ''"
                  :data-field="element.inputField"
                  @input="updateNullable(row.inputs, element.inputField, $event, 3)"
                />
                <output :data-testid="`mobile-calculation-result-${row.id}-${element.resultField}`">{{ formatCalculated(calculation.getCalculatedResult(row, element.resultField)) }}</output>
              </label>
            </div>
          </article>

          <div class="mobile-coefficient__bottom-actions">
            <label>增加标样
              <input
                class="mobile-touch-target"
                type="number"
                inputmode="numeric"
                min="1"
                max="50"
                :disabled="disabled"
                :value="calculation.calculationAddCount.value"
                data-testid="mobile-calculation-add-count"
                @input="calculation.calculationAddCount.value = inputNumber($event)"
              />
            </label>
            <button class="mobile-touch-target" type="button" :disabled="disabled" data-testid="mobile-add-calculation-rows" @click="calculation.addCalculationRows">确认增加</button>
            <button class="mobile-touch-target" type="button" :disabled="disabled" data-testid="mobile-delete-calculation-rows" @click="calculation.calculationDeleteMode.value = true">删除样品</button>
          </div>
        </template>

        <div v-else class="mobile-coefficient-parameters">
          <label v-for="item in labParameterLabels" :key="item.key">
            <span>{{ item.label }}</span>
            <input
              class="mobile-touch-target"
              type="number"
              inputmode="decimal"
              step="0.001"
              :disabled="disabled"
              :value="calculation.parameters[item.key]"
              :data-field="item.key"
              @input="updateNullable(calculation.parameters, item.key, $event, 3)"
            />
          </label>
        </div>
      </div>
    </section>

    <MobileActionBar v-if="calculation.standardDeleteMode.value || calculation.calculationDeleteMode.value">
      <div v-if="calculation.standardDeleteMode.value" class="mobile-coefficient__selection" aria-label="标样含量批量操作">
        <label><input class="mobile-touch-target" type="checkbox" :checked="calculation.selectedStandardRowIds.value.length === calculation.standardRows.length" data-testid="mobile-select-all-standard-rows" aria-label="全选标样含量样品" @change="calculation.toggleStandardAll(($event.target as HTMLInputElement).checked)" />全选</label>
        <span>已选择 {{ calculation.selectedStandardRowIds.value.length }} 个</span>
        <span v-if="calculation.selectedStandardRowIds.value.length >= calculation.standardRows.length">至少保留一个样品</span>
        <button class="mobile-touch-target" type="button" @click="calculation.cancelStandardDeletion">取消</button>
        <button class="mobile-touch-target" type="button" :disabled="!calculation.selectedStandardRowIds.value.length || calculation.selectedStandardRowIds.value.length >= calculation.standardRows.length" @click="calculation.confirmStandardDeletion">确认删除</button>
      </div>
      <div v-if="calculation.calculationDeleteMode.value" class="mobile-coefficient__selection" aria-label="标样系数计算批量操作">
        <label><input class="mobile-touch-target" type="checkbox" :checked="calculation.selectedCalculationRowIds.value.length === calculation.calculationRows.length" data-testid="mobile-select-all-calculation-rows" aria-label="全选标样系数计算样品" @change="calculation.toggleCalculationAll(($event.target as HTMLInputElement).checked)" />全选</label>
        <span>已选择 {{ calculation.selectedCalculationRowIds.value.length }} 个</span>
        <span v-if="calculation.selectedCalculationRowIds.value.length >= calculation.calculationRows.length">至少保留一个样品</span>
        <button class="mobile-touch-target" type="button" @click="calculation.cancelCalculationDeletion">取消</button>
        <button class="mobile-touch-target" type="button" :disabled="!calculation.selectedCalculationRowIds.value.length || calculation.selectedCalculationRowIds.value.length >= calculation.calculationRows.length" @click="calculation.confirmCalculationDeletion">确认删除</button>
      </div>
    </MobileActionBar>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { labParameterLabels } from '@/constants/labSheetTemplate'
import type { CalculationRow, StandardContentRow } from '@/types/calculationDraft'
import { formatFormulaValue } from '@/utils/formulaEngine'
import MobileActionBar from '@/components/mobile/MobileActionBar.vue'
import {
  coefficientCalculationElements,
  coefficientContentElements,
  type CoefficientCalculationState
} from '@/composables/useCoefficientCalculation'

withDefaults(defineProps<{
  calculation: CoefficientCalculationState
  disabled?: boolean
  applicationLoading?: boolean
}>(), { disabled: false, applicationLoading: false })

const emit = defineEmits<{ openApplication: [] }>()
const sections = [
  { key: 'standard' as const, label: '标样含量' },
  { key: 'calculation' as const, label: '标样系数计算' },
  { key: 'parameters' as const, label: '九项参数' }
]
const expanded = reactive<Record<(typeof sections)[number]['key'], boolean>>({ standard: false, calculation: false, parameters: false })

function updateCode(row: StandardContentRow | CalculationRow, event: Event) {
  row.code = (event.target as HTMLInputElement).value
  row.autoCode = false
}

function updateNullable(target: object, key: string, event: Event, precision: number) {
  const raw = (event.target as HTMLInputElement).value
  ;(target as Record<string, number | null>)[key] = raw === '' ? null : Number(Number(raw).toFixed(precision))
}

function formatCalculated(value: number | null) {
  return formatFormulaValue(value ?? 0)
}

function inputNumber(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(value) ? value : 1
}
</script>

<style scoped lang="scss">
.mobile-coefficient { display: grid; min-width: 0; max-width: 100%; gap: 10px; padding-bottom: 92px; overflow-x: clip; }
.mobile-coefficient__section { min-width: 0; overflow: hidden; padding: 0; }
.mobile-coefficient__toggle { display: flex; width: 100%; align-items: center; justify-content: space-between; border: 0; padding: 10px 14px; background: #fff; color: #10233f; font-size: 16px; }
.mobile-coefficient__content { display: grid; min-width: 0; gap: 10px; padding: 10px; border-top: 1px solid #d9e4ef; }
.mobile-coefficient-card { min-width: 0; padding: 10px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; }
.mobile-coefficient-card__header { display: flex; align-items: end; gap: 8px; margin-bottom: 10px; }
.mobile-coefficient-card__header label { flex: 1; min-width: 0; }
.mobile-coefficient-card__header span, .mobile-coefficient-grid span, .mobile-coefficient-parameters span { display: block; margin-bottom: 4px; color: #475569; font-size: 13px; }
.mobile-coefficient-card__code, .mobile-coefficient-grid input, .mobile-coefficient-parameters input { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid #9fb1c5; border-radius: 8px; padding-inline: 10px; background: #fff; }
.mobile-coefficient-grid, .mobile-coefficient-parameters { display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.mobile-coefficient-grid output { display: block; min-height: 28px; margin-top: 4px; padding: 4px 8px; border-radius: 6px; background: #f1f5f9; color: #0f172a; font-weight: 700; }
.mobile-coefficient__bottom-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: end; }
.mobile-coefficient__bottom-actions label { grid-column: 1 / -1; }
.mobile-coefficient__bottom-actions input { box-sizing: border-box; width: 100%; border: 1px solid #9fb1c5; border-radius: 8px; }
.mobile-coefficient__bottom-actions button, .mobile-coefficient__apply { border: 1px solid #2563eb; border-radius: 8px; background: #fff; color: #1d4ed8; }
.mobile-coefficient__selection { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.mobile-coefficient__selection button { border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; }
.mobile-touch-target { min-height: 44px; min-width: 44px; }
</style>
