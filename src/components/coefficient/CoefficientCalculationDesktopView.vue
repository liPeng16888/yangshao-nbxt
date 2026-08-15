<template>
  <div class="page-stack coefficient-page" data-testid="coefficient-desktop-view">
    <section class="panel coefficient-section">
      <div class="coefficient-section__header"><div><h2>标样含量</h2></div></div>
      <div class="coefficient-table-wrap">
        <table class="coefficient-table coefficient-table--content">
          <thead><tr>
            <th v-if="calculation.standardDeleteMode.value" class="coefficient-selection-cell">
              <el-checkbox :model-value="calculation.selectedStandardRowIds.value.length === calculation.standardRows.length" aria-label="全选标样含量样品" data-testid="select-all-standard-rows" @change="calculation.toggleStandardAll(Boolean($event))" />
            </th>
            <th>编号</th><th v-for="element in coefficientContentElements" :key="element.key">{{ element.label }}</th>
          </tr></thead>
          <tbody><tr v-for="row in calculation.standardRows" :key="row.id" :data-code="row.code" data-testid="standard-row">
            <td v-if="calculation.standardDeleteMode.value" class="coefficient-selection-cell">
              <el-checkbox :model-value="calculation.selectedStandardRowIds.value.includes(row.id)" :aria-label="`选择标样含量样品 ${row.code}`" :data-testid="`select-standard-row-${row.id}`" @change="calculation.toggleStandardRow(row.id, Boolean($event))" />
            </td>
            <td><el-input v-model="row.code" :disabled="disabled" placeholder="填写编号" @input="row.autoCode = false" /></td>
            <td v-for="element in coefficientContentElements" :key="element.key"><el-input-number v-model="row[element.key]" :disabled="disabled" :precision="2" :step="0.01" controls-position="right" placeholder="0.00" /></td>
          </tr></tbody>
        </table>
      </div>
      <div v-if="calculation.standardDeleteMode.value" class="coefficient-row-actions">
        <span data-testid="standard-selection-count">已选择 {{ calculation.selectedStandardRowIds.value.length }} 个</span>
        <el-button @click="calculation.cancelStandardDeletion">取消</el-button>
        <el-button type="danger" data-testid="confirm-delete-standard-rows" :disabled="!calculation.selectedStandardRowIds.value.length || calculation.selectedStandardRowIds.value.length >= calculation.standardRows.length" @click="calculation.confirmStandardDeletion">确认删除</el-button>
        <span v-if="calculation.selectedStandardRowIds.value.length >= calculation.standardRows.length">至少保留一个样品</span>
      </div>
      <div class="add-standard-row" data-testid="standard-bottom-actions">
        <span>增加标样</span>
        <el-input-number :model-value="calculation.standardAddCount.value" :disabled="disabled || calculation.standardRemainingCapacity.value === 0" :min="1" :max="Math.max(1, calculation.standardRemainingCapacity.value)" :step="1" :precision="0" value-on-clear="min" controls-position="right" data-testid="standard-add-count" @update:model-value="calculation.standardAddCount.value = $event ?? 1" />
        <span data-testid="standard-capacity">还可增加 {{ calculation.standardRemainingCapacity.value }} 个（最多 50 个）</span>
        <el-button type="primary" :disabled="disabled || calculation.standardRemainingCapacity.value === 0" data-testid="add-standard-rows" @click="calculation.addStandardRows">确认增加</el-button>
        <el-button class="coefficient-delete-entry" type="danger" plain :disabled="disabled" data-testid="delete-standard-rows" @click="calculation.standardDeleteMode.value = true">删除样品</el-button>
      </div>
    </section>

    <section class="panel coefficient-section">
      <div class="coefficient-section__header"><div><h2>标样系数计算</h2></div><el-button type="primary" :loading="applicationLoading" :disabled="disabled" @click="emit('openApplication')">应用系数</el-button></div>
      <div class="parameter-grid">
        <label v-for="item in labParameterLabels" :key="item.key" class="parameter-item"><span>{{ item.label }}</span><el-input-number v-model="calculation.parameters[item.key]" :disabled="disabled" :precision="3" :step="0.01" controls-position="right" class="parameter-input" /></label>
      </div>
      <div class="coefficient-table-wrap">
        <table class="coefficient-table coefficient-table--calculation">
          <thead><tr>
            <th v-if="calculation.calculationDeleteMode.value" class="coefficient-selection-cell"><el-checkbox :model-value="calculation.selectedCalculationRowIds.value.length === calculation.calculationRows.length" aria-label="全选标样系数计算样品" data-testid="select-all-calculation-rows" @change="calculation.toggleCalculationAll(Boolean($event))" /></th>
            <th>元素编号</th><th v-for="element in coefficientCalculationElements" :key="element.inputField">{{ element.label }}</th>
          </tr></thead>
          <tbody><tr v-for="row in calculation.calculationRows" :key="row.id" :data-code="row.code" data-testid="calculation-row">
            <td v-if="calculation.calculationDeleteMode.value" class="coefficient-selection-cell"><el-checkbox :model-value="calculation.selectedCalculationRowIds.value.includes(row.id)" :aria-label="`选择标样系数计算样品 ${row.code}`" :data-testid="`select-calculation-row-${row.id}`" @change="calculation.toggleCalculationRow(row.id, Boolean($event))" /></td>
            <td><el-input v-model="row.code" :disabled="disabled" placeholder="填写编号" @input="row.autoCode = false" /></td>
            <td v-for="element in coefficientCalculationElements" :key="element.inputField" class="calculation-cell"><div class="calculation-cell__stack"><el-input-number v-model="row.inputs[element.inputField]" :disabled="disabled" :precision="3" :step="0.01" controls-position="right" placeholder="0.000" /><div class="calculation-result">{{ formatCalculated(calculation.getCalculatedResult(row, element.resultField)) }}</div></div></td>
          </tr></tbody>
        </table>
      </div>
      <div v-if="calculation.calculationDeleteMode.value" class="coefficient-row-actions">
        <span data-testid="calculation-selection-count">已选择 {{ calculation.selectedCalculationRowIds.value.length }} 个</span>
        <el-button @click="calculation.cancelCalculationDeletion">取消</el-button>
        <el-button type="danger" data-testid="confirm-delete-calculation-rows" :disabled="!calculation.selectedCalculationRowIds.value.length || calculation.selectedCalculationRowIds.value.length >= calculation.calculationRows.length" @click="calculation.confirmCalculationDeletion">确认删除</el-button>
        <span v-if="calculation.selectedCalculationRowIds.value.length >= calculation.calculationRows.length">至少保留一个样品</span>
      </div>
      <div class="add-standard-row" data-testid="calculation-bottom-actions">
        <span>增加标样</span>
        <el-input-number :model-value="calculation.calculationAddCount.value" :disabled="disabled || calculation.calculationRemainingCapacity.value === 0" :min="1" :max="Math.max(1, calculation.calculationRemainingCapacity.value)" :step="1" :precision="0" value-on-clear="min" controls-position="right" data-testid="calculation-add-count" @update:model-value="calculation.calculationAddCount.value = $event ?? 1" />
        <span data-testid="calculation-capacity">还可增加 {{ calculation.calculationRemainingCapacity.value }} 个（最多 50 个）</span>
        <el-button type="primary" :disabled="disabled || calculation.calculationRemainingCapacity.value === 0" data-testid="add-calculation-rows" @click="calculation.addCalculationRows">确认增加</el-button>
        <el-button class="coefficient-delete-entry" type="danger" plain :disabled="disabled" data-testid="delete-calculation-rows" @click="calculation.calculationDeleteMode.value = true">删除样品</el-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { labParameterLabels } from '@/constants/labSheetTemplate'
import { formatFormulaValue } from '@/utils/formulaEngine'
import { coefficientCalculationElements, coefficientContentElements, type CoefficientCalculationState } from '@/composables/useCoefficientCalculation'

withDefaults(defineProps<{ calculation: CoefficientCalculationState; disabled?: boolean; applicationLoading?: boolean }>(), { disabled: false, applicationLoading: false })
const emit = defineEmits<{ openApplication: [] }>()
function formatCalculated(value: number | null) { return formatFormulaValue(value ?? 0) }
</script>

<style scoped lang="scss">
.coefficient-page { gap: 14px; }
.coefficient-section { overflow: hidden; }
.coefficient-section__header { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 54px; padding: 12px 18px; border-bottom: 1px solid #d9e4ef; h2 { margin: 0; color: #10233f; font-size: 18px; line-height: 1.25; } }
.coefficient-table-wrap { overflow-x: auto; padding: 14px; }
.coefficient-table { width: 100%; min-width: 980px; border-collapse: collapse; table-layout: fixed; background: #fff; th, td { padding: 8px; border: 1px solid #cbd5e1; text-align: center; vertical-align: middle; } th { color: #10233f; background: #eaf2ff; font-weight: 700; } :deep(.el-input), :deep(.el-input-number) { width: 100%; } :deep(.el-input__wrapper) { min-height: 34px; box-shadow: none; } }
.coefficient-selection-cell { width: 48px; min-width: 48px; }
.coefficient-table--content { th { background: #edf7ed; } :deep(.el-input-number .el-input__wrapper) { background: #e6f4ea; border: 1px solid #9acb8c; } }
.coefficient-table--calculation { th { background: #eef6ff; } :deep(.el-input-number .el-input__wrapper) { background: #fff7ed; border: 1px solid #f5c48b; } }
.calculation-cell { padding: 8px; vertical-align: top; }
.calculation-cell__stack { display: grid; gap: 6px; }
.calculation-result { min-height: 32px; padding: 6px 8px; color: #0f172a; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 16px; font-weight: 700; line-height: 20px; }
.add-standard-row, .coefficient-row-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 0 14px 16px; color: #10233f; font-weight: 700; :deep(.el-input-number) { width: 150px; } }
.coefficient-row-actions { padding-bottom: 12px; }
.coefficient-delete-entry { margin-left: auto; }
.parameter-grid { display: grid; grid-template-columns: repeat(9, minmax(116px, 1fr)); gap: 0; overflow-x: auto; padding: 14px; }
.parameter-item { min-width: 116px; padding: 8px; color: #c00000; background: #fff; border: 1px solid #111827; border-left: 0; &:first-child { border-left: 1px solid #111827; } span { display: block; margin-bottom: 6px; text-align: center; font-size: 16px; font-weight: 700; } }
.parameter-input { width: 100%; }
:deep(.parameter-input .el-input__inner) { color: #c00000; font-size: 16px; font-weight: 700; -webkit-text-fill-color: #c00000; }
</style>
