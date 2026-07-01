<template>
  <div class="page-stack coefficient-page">
    <section class="panel coefficient-section">
      <div class="coefficient-section__header">
        <div>
          <h2>标样含量</h2>
        </div>
      </div>

      <div class="coefficient-table-wrap">
        <table class="coefficient-table coefficient-table--content">
          <thead>
            <tr>
              <th>编号</th>
              <th v-for="element in contentElements" :key="element.key">{{ element.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in standardRows" :key="row.id">
              <td>
                <el-input v-model="row.code" placeholder="填写编号" />
              </td>
              <td v-for="element in contentElements" :key="element.key">
                <el-input-number
                  v-model="row[element.key]"
                  :precision="2"
                  :step="0.01"
                  controls-position="right"
                  placeholder="0.00"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="add-standard-row">
        <span>增加标样</span>
        <el-input-number v-model="addCount" :min="1" :max="50" :step="1" :precision="0" controls-position="right" />
        <el-button type="primary" @click="addStandards">确认增加</el-button>
      </div>
    </section>

    <section class="panel coefficient-section">
      <div class="coefficient-section__header">
        <div>
          <h2>标样系数计算</h2>
        </div>
        <el-button type="primary" :loading="labStore.saving || labStore.loading" @click="handleApplyParameters">应用系数</el-button>
      </div>

      <div class="parameter-grid">
        <label v-for="item in labParameterLabels" :key="item.key" class="parameter-item">
          <span>{{ item.label }}</span>
          <el-input-number
            v-model="parameters[item.key]"
            :precision="3"
            :step="0.01"
            controls-position="right"
            class="parameter-input"
          />
        </label>
      </div>

      <div class="coefficient-table-wrap">
        <table class="coefficient-table coefficient-table--calculation">
          <thead>
            <tr>
              <th>元素编号</th>
              <th v-for="element in calculationElements" :key="element.inputField">{{ element.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in calculationRows" :key="row.id">
              <td>
                <el-input v-model="row.code" placeholder="填写编号" />
              </td>
              <td v-for="element in calculationElements" :key="element.inputField" class="calculation-cell">
                <div class="calculation-cell__stack">
                  <el-input-number
                    v-model="row.inputs[element.inputField]"
                    :precision="3"
                    :step="0.01"
                    controls-position="right"
                    placeholder="0.000"
                  />
                  <div class="calculation-result">{{ formatFormulaValue(getCalculatedResult(row, element.resultField)) }}</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { LabFormulaResult, LabParameter } from '@/types/labSheet'
import { defaultLabParameters, labParameterLabels } from '@/constants/labSheetTemplate'
import { useLabSheetStore } from '@/stores/labSheet'
import { calculateSampleResults, formatFormulaValue } from '@/utils/formulaEngine'

type ContentElementKey = 'aluminum' | 'silicon' | 'iron' | 'calcium' | 'magnesium' | 'titanium'
type CalculationInputKey = 'ironRaw' | 'siliconRaw' | 'aluminumRaw' | 'calciumRaw' | 'magnesiumRaw' | 'titaniumRaw'
type CalculationResultKey = 'iron' | 'silicon' | 'aluminum' | 'calcium' | 'magnesium' | 'titanium'

type StandardContentRow = Record<ContentElementKey, number | null> & {
  id: string
  code: string
}

interface CalculationRow {
  id: string
  code: string
  inputs: Record<CalculationInputKey, number | null>
}

const labStore = useLabSheetStore()

const contentElements: Array<{ key: ContentElementKey; label: string }> = [
  { key: 'aluminum', label: '铝' },
  { key: 'silicon', label: '硅' },
  { key: 'iron', label: '铁' },
  { key: 'calcium', label: '钙' },
  { key: 'magnesium', label: '镁' },
  { key: 'titanium', label: '钛' }
]

const calculationElements: Array<{
  label: string
  inputField: CalculationInputKey
  resultField: CalculationResultKey
}> = [
  { label: '铁', inputField: 'ironRaw', resultField: 'iron' },
  { label: '硅', inputField: 'siliconRaw', resultField: 'silicon' },
  { label: '铝', inputField: 'aluminumRaw', resultField: 'aluminum' },
  { label: '钙', inputField: 'calciumRaw', resultField: 'calcium' },
  { label: '镁', inputField: 'magnesiumRaw', resultField: 'magnesium' },
  { label: '钛', inputField: 'titaniumRaw', resultField: 'titanium' }
]

const parameters = reactive<LabParameter>({ ...defaultLabParameters })
const addCount = ref(1)
const standardRows = reactive<StandardContentRow[]>([createStandardRow(1), createStandardRow(2), createStandardRow(3)])
const calculationRows = reactive<CalculationRow[]>([createCalculationRow(1), createCalculationRow(2), createCalculationRow(3)])

function createStandardRow(index: number): StandardContentRow {
  return {
    id: `standard-${Date.now()}-${index}`,
    code: String(index).padStart(3, '0'),
    aluminum: null,
    silicon: null,
    iron: null,
    calcium: null,
    magnesium: null,
    titanium: null
  }
}

function createCalculationRow(index: number): CalculationRow {
  return {
    id: `calculation-${Date.now()}-${index}`,
    code: String(index).padStart(3, '0'),
    inputs: {
      ironRaw: null,
      siliconRaw: null,
      aluminumRaw: null,
      calciumRaw: null,
      magnesiumRaw: null,
      titaniumRaw: null
    }
  }
}

function addStandards() {
  const count = Number(addCount.value) || 1
  for (let index = 0; index < count; index += 1) {
    const nextIndex = standardRows.length + 1
    standardRows.push(createStandardRow(nextIndex))
    calculationRows.push(createCalculationRow(nextIndex))
  }
}

function getCalculatedResult(row: CalculationRow, key: CalculationResultKey) {
  const result: LabFormulaResult = calculateSampleResults(row.inputs, parameters)
  return result[key]
}

async function handleApplyParameters() {
  try {
    await ElMessageBox.confirm('确认把当前空白和系数应用到数据计算页面吗？确认后会更新数据计算页面顶部对应的空白和系数。', '应用系数确认', {
      confirmButtonText: '确认应用',
      cancelButtonText: '取消',
      type: 'warning'
    })
    if (!labStore.sheet) await labStore.loadCurrentSheet()
    await labStore.saveParameters({ ...parameters })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error('应用系数失败，请稍后重试')
  }
}
</script>

<style scoped lang="scss">
.coefficient-page {
  gap: 14px;
}

.coefficient-section {
  overflow: hidden;
}

.coefficient-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 54px;
  padding: 12px 18px;
  border-bottom: 1px solid #d9e4ef;

  h2 {
    margin: 0;
    color: #10233f;
    font-size: 18px;
    line-height: 1.25;
  }
}

.coefficient-table-wrap {
  overflow-x: auto;
  padding: 14px;
}

.coefficient-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  table-layout: fixed;
  background: #fff;

  th,
  td {
    padding: 8px;
    border: 1px solid #cbd5e1;
    text-align: center;
    vertical-align: middle;
  }

  th {
    color: #10233f;
    background: #eaf2ff;
    font-weight: 700;
  }

  :deep(.el-input),
  :deep(.el-input-number) {
    width: 100%;
  }

  :deep(.el-input__wrapper) {
    min-height: 34px;
    box-shadow: none;
  }
}

.coefficient-table--content {
  th {
    background: #edf7ed;
  }

  :deep(.el-input-number .el-input__wrapper) {
    background: #e6f4ea;
    border: 1px solid #9acb8c;
  }
}

.coefficient-table--calculation {
  th {
    background: #eef6ff;
  }

  :deep(.el-input-number .el-input__wrapper) {
    background: #fff7ed;
    border: 1px solid #f5c48b;
  }
}

.calculation-cell {
  padding: 8px;
  vertical-align: top;
}

.calculation-cell__stack {
  display: grid;
  gap: 6px;
}

.calculation-result {
  min-height: 32px;
  padding: 6px 8px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 700;
  line-height: 20px;
}

.add-standard-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px 16px;
  color: #10233f;
  font-weight: 700;

  :deep(.el-input-number) {
    width: 150px;
  }
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(116px, 1fr));
  gap: 0;
  overflow-x: auto;
  padding: 14px;
}

.parameter-item {
  min-width: 116px;
  padding: 8px;
  color: #c00000;
  background: #fff;
  border: 1px solid #111827;
  border-left: 0;

  &:first-child {
    border-left: 1px solid #111827;
  }

  span {
    display: block;
    margin-bottom: 6px;
    text-align: center;
    font-size: 16px;
    font-weight: 700;
  }
}

.parameter-input {
  width: 100%;
}

:deep(.parameter-input .el-input__inner) {
  color: #c00000;
  font-size: 16px;
  font-weight: 700;
  -webkit-text-fill-color: #c00000;
}

@media (max-width: 720px) {
  .add-standard-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
