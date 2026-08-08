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
        <el-button type="primary" :loading="labStore.saving || labStore.loading" @click="openApplicationDialog">应用系数</el-button>
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

    <CoefficientApplicationDialog
      :visible="applicationDialogVisible"
      :sample-indices="labStore.sampleBlocks.map((block) => block.index).sort((a, b) => a - b)"
      :loading="labStore.saving"
      @cancel="applicationDialogVisible = false"
      @confirm="handleApplyParameters"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { LabFormulaResult, LabParameter } from '@/types/labSheet'
import type { AuthUser } from '@/types/auth'
import { defaultLabParameters, labParameterLabels } from '@/constants/labSheetTemplate'
import { useLabSheetStore } from '@/stores/labSheet'
import { calculateSampleResults, formatFormulaValue } from '@/utils/formulaEngine'
import CoefficientApplicationDialog from '@/components/lab-sheet/CoefficientApplicationDialog.vue'

type ContentElementKey = 'aluminum' | 'silicon' | 'iron' | 'calcium' | 'magnesium' | 'titanium'
type CalculationInputKey = 'ironRaw' | 'siliconRaw' | 'aluminumRaw' | 'calciumRaw' | 'magnesiumRaw' | 'titaniumRaw'
type CalculationResultKey = 'iron' | 'silicon' | 'aluminum' | 'calcium' | 'magnesium' | 'titanium'
type NumericLabParameterKey = Exclude<keyof LabParameter, 'savedAt'>

type StandardContentRow = Record<ContentElementKey, number | null> & {
  id: string
  code: string
}

interface CalculationRow {
  id: string
  code: string
  inputs: Record<CalculationInputKey, number | null>
}

interface CoefficientCalculationStorage {
  parameters?: Partial<LabParameter>
  addCount?: number
  standardRows?: Array<Partial<Record<ContentElementKey, number | null>> & { id?: string; code?: string }>
  calculationRows?: Array<{
    id?: string
    code?: string
    inputs?: Partial<Record<CalculationInputKey, number | null>>
  }>
}
type StoredCalculationRow = NonNullable<CoefficientCalculationStorage['calculationRows']>[number]

const labStore = useLabSheetStore()
const STORAGE_KEY_PREFIX = 'ys_coefficient_calculation_inputs'
const applicationDialogVisible = ref(false)

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

const savedState = readSavedState()
const parameters = reactive<LabParameter>({ ...defaultLabParameters, ...savedState.parameters })
const addCount = ref(savedState.addCount || 1)
const standardRows = reactive<StandardContentRow[]>(normalizeStandardRows(savedState.standardRows))
const calculationRows = reactive<CalculationRow[]>(normalizeCalculationRows(savedState.calculationRows, standardRows.length))

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

function normalizeStandardRows(rows: CoefficientCalculationStorage['standardRows']) {
  const source = rows?.length ? rows : [{}, {}, {}]
  return source.map((row, index) => {
    const next = createStandardRow(index + 1)
    next.id = typeof row.id === 'string' && row.id.trim() ? row.id : next.id
    next.code = typeof row.code === 'string' ? row.code : next.code
    contentElements.forEach((element) => {
      next[element.key] = normalizeNullableNumber(row[element.key])
    })
    return next
  })
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

function normalizeCalculationRows(rows: CoefficientCalculationStorage['calculationRows'], minCount: number) {
  const source: StoredCalculationRow[] = rows?.length ? rows : Array.from({ length: minCount || 3 }, () => ({}))
  const normalized = source.map((row, index) => {
    const next = createCalculationRow(index + 1)
    next.id = typeof row.id === 'string' && row.id.trim() ? row.id : next.id
    next.code = typeof row.code === 'string' ? row.code : next.code
    calculationElements.forEach((element) => {
      next.inputs[element.inputField] = normalizeNullableNumber(row.inputs?.[element.inputField])
    })
    return next
  })
  while (normalized.length < minCount) normalized.push(createCalculationRow(normalized.length + 1))
  return normalized
}

function normalizeNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function addStandards() {
  const count = Number(addCount.value) || 1
  for (let index = 0; index < count; index += 1) {
    const nextIndex = standardRows.length + 1
    standardRows.push(createStandardRow(nextIndex))
    calculationRows.push(createCalculationRow(nextIndex))
  }
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

function readSavedState(): CoefficientCalculationStorage {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(currentStorageKey())
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as CoefficientCalculationStorage
    return {
      parameters: normalizeParameters(parsed.parameters),
      addCount: normalizePositiveInteger(parsed.addCount),
      standardRows: parsed.standardRows,
      calculationRows: parsed.calculationRows
    }
  } catch {
    return {}
  }
}

function normalizeParameters(source: unknown) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  return (Object.keys(defaultLabParameters) as NumericLabParameterKey[]).reduce<Partial<Record<NumericLabParameterKey, number>>>((picked, key) => {
    const value = (source as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      picked[key] = value
    }
    return picked
  }, {})
}

function normalizePositiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function saveState() {
  if (typeof window === 'undefined') return
  const payload: CoefficientCalculationStorage = {
    parameters: { ...parameters },
    addCount: addCount.value,
    standardRows: standardRows.map((row) => ({ ...row })),
    calculationRows: calculationRows.map((row) => ({
      id: row.id,
      code: row.code,
      inputs: { ...row.inputs }
    }))
  }
  window.localStorage.setItem(currentStorageKey(), JSON.stringify(payload))
}

watch([parameters, standardRows, calculationRows, addCount], saveState, { deep: true })

function getCalculatedResult(row: CalculationRow, key: CalculationResultKey) {
  const result: LabFormulaResult = calculateSampleResults(row.inputs, parameters)
  return result[key]
}

async function openApplicationDialog() {
  const loaded = await labStore.loadCurrentSheet()
  if (!loaded) return
  if (!labStore.sampleBlocks.length) {
    ElMessage.warning('当天暂无可应用的样品')
    return
  }
  applicationDialogVisible.value = true
}

async function handleApplyParameters(startIndex: number) {
  try {
    const applied = await labStore.applyParametersFromIndex({ ...parameters }, startIndex)
    if (!applied) {
      ElMessage.error('应用系数前的数据保存失败，请处理后重试')
      return
    }
    applicationDialogVisible.value = false
    ElMessage.success(`已从样品 ${String(startIndex).padStart(3, '0')} 开始应用新参数`)
  } catch {
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
