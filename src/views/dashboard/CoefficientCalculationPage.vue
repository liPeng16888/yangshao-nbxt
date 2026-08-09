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
              <th v-if="standardDeleteMode" class="coefficient-selection-cell">
                <el-checkbox
                  :model-value="selectedStandardRowIds.length === standardRows.length"
                  aria-label="全选标样含量样品"
                  data-testid="select-all-standard-rows"
                  @change="toggleStandardAll(Boolean($event))"
                />
              </th>
              <th>编号</th>
              <th v-for="element in contentElements" :key="element.key">{{ element.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in standardRows" :key="row.id" :data-code="row.code" data-testid="standard-row">
              <td v-if="standardDeleteMode" class="coefficient-selection-cell">
                <el-checkbox
                  :model-value="selectedStandardRowIds.includes(row.id)"
                  :aria-label="`选择标样含量样品 ${row.code}`"
                  :data-testid="`select-standard-row-${row.id}`"
                  @change="toggleStandardRow(row.id, Boolean($event))"
                />
              </td>
              <td>
                <el-input v-model="row.code" placeholder="填写编号" @input="row.autoCode = false" />
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

      <div v-if="standardDeleteMode" class="coefficient-row-actions">
        <span data-testid="standard-selection-count">已选择 {{ selectedStandardRowIds.length }} 个</span>
        <el-button @click="cancelStandardDeletion">取消</el-button>
        <el-button
          type="danger"
          data-testid="confirm-delete-standard-rows"
          :disabled="!selectedStandardRowIds.length || selectedStandardRowIds.length >= standardRows.length"
          @click="confirmStandardDeletion"
        >确认删除</el-button>
        <span v-if="selectedStandardRowIds.length >= standardRows.length">至少保留一个样品</span>
      </div>
      <div class="add-standard-row" data-testid="standard-bottom-actions">
        <span>增加标样</span>
        <el-input-number
          v-model="standardAddCount"
          :min="1"
          :max="50"
          :step="1"
          :precision="0"
          value-on-clear="min"
          controls-position="right"
          data-testid="standard-add-count"
        />
        <el-button type="primary" data-testid="add-standard-rows" @click="addStandardRows">确认增加</el-button>
        <el-button class="coefficient-delete-entry" type="danger" plain data-testid="delete-standard-rows" @click="standardDeleteMode = true">删除样品</el-button>
      </div>
    </section>

    <section class="panel coefficient-section">
      <div class="coefficient-section__header">
        <div>
          <h2>标样系数计算</h2>
        </div>
        <el-button type="primary" :loading="labStore.applyingParameters || labStore.loading" @click="openApplicationDialog">应用系数</el-button>
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
              <th v-if="calculationDeleteMode" class="coefficient-selection-cell">
                <el-checkbox
                  :model-value="selectedCalculationRowIds.length === calculationRows.length"
                  aria-label="全选标样系数计算样品"
                  data-testid="select-all-calculation-rows"
                  @change="toggleCalculationAll(Boolean($event))"
                />
              </th>
              <th>元素编号</th>
              <th v-for="element in calculationElements" :key="element.inputField">{{ element.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in calculationRows" :key="row.id" :data-code="row.code" data-testid="calculation-row">
              <td v-if="calculationDeleteMode" class="coefficient-selection-cell">
                <el-checkbox
                  :model-value="selectedCalculationRowIds.includes(row.id)"
                  :aria-label="`选择标样系数计算样品 ${row.code}`"
                  :data-testid="`select-calculation-row-${row.id}`"
                  @change="toggleCalculationRow(row.id, Boolean($event))"
                />
              </td>
              <td>
                <el-input v-model="row.code" placeholder="填写编号" @input="row.autoCode = false" />
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
      <div v-if="calculationDeleteMode" class="coefficient-row-actions">
        <span data-testid="calculation-selection-count">已选择 {{ selectedCalculationRowIds.length }} 个</span>
        <el-button @click="cancelCalculationDeletion">取消</el-button>
        <el-button
          type="danger"
          data-testid="confirm-delete-calculation-rows"
          :disabled="!selectedCalculationRowIds.length || selectedCalculationRowIds.length >= calculationRows.length"
          @click="confirmCalculationDeletion"
        >确认删除</el-button>
        <span v-if="selectedCalculationRowIds.length >= calculationRows.length">至少保留一个样品</span>
      </div>
      <div class="add-standard-row" data-testid="calculation-bottom-actions">
        <span>增加标样</span>
        <el-input-number
          v-model="calculationAddCount"
          :min="1"
          :max="50"
          :step="1"
          :precision="0"
          value-on-clear="min"
          controls-position="right"
          data-testid="calculation-add-count"
        />
        <el-button type="primary" data-testid="add-calculation-rows" @click="addCalculationRows">确认增加</el-button>
        <el-button class="coefficient-delete-entry" type="danger" plain data-testid="delete-calculation-rows" @click="calculationDeleteMode = true">删除样品</el-button>
      </div>
    </section>

    <CoefficientApplicationDialog
      :key="applicationDialogKey"
      :visible="applicationDialogVisible"
      :sample-indices="labStore.sampleBlocks.map((block) => block.index).sort((a, b) => a - b)"
      :loading="labStore.applyingParameters"
      @cancel="closeApplicationDialog"
      @confirm="handleApplyParameters"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { LabFormulaResult, LabParameter } from '@/types/labSheet'
import type { AuthUser } from '@/types/auth'
import { defaultLabParameters, labParameterLabels } from '@/constants/labSheetTemplate'
import { useLabSheetStore } from '@/stores/labSheet'
import { calculateSampleResults, formatFormulaValue } from '@/utils/formulaEngine'
import {
  deleteCoefficientRows,
  formatCoefficientRowCode,
  inferCoefficientRowAutoCode,
  normalizeCoefficientAddCount,
  normalizeCoefficientRowId
} from '@/utils/coefficientRows'
import CoefficientApplicationDialog from '@/components/lab-sheet/CoefficientApplicationDialog.vue'

type ContentElementKey = 'aluminum' | 'silicon' | 'iron' | 'calcium' | 'magnesium' | 'titanium'
type CalculationInputKey = 'ironRaw' | 'siliconRaw' | 'aluminumRaw' | 'calciumRaw' | 'magnesiumRaw' | 'titaniumRaw'
type CalculationResultKey = 'iron' | 'silicon' | 'aluminum' | 'calcium' | 'magnesium' | 'titanium'
type NumericLabParameterKey = Exclude<keyof LabParameter, 'savedAt'>

type StandardContentRow = Record<ContentElementKey, number | null> & {
  id: string
  code: string
  autoCode: boolean
}

interface CalculationRow {
  id: string
  code: string
  autoCode: boolean
  inputs: Record<CalculationInputKey, number | null>
}

interface CoefficientCalculationSavedState {
  parameters?: Partial<LabParameter>
  addCount?: unknown // 只兼容读取旧数据
  standardAddCount?: unknown
  calculationAddCount?: unknown
  standardRows?: unknown
  calculationRows?: unknown
}

interface CoefficientCalculationStoragePayload {
  parameters: LabParameter
  standardAddCount: number
  calculationAddCount: number
  standardRows: StandardContentRow[]
  calculationRows: CalculationRow[]
}

const labStore = useLabSheetStore()
const STORAGE_KEY_PREFIX = 'ys_coefficient_calculation_inputs'
const applicationDialogVisible = ref(false)
const applicationDialogKey = ref(0)

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
const legacyAddCount = normalizeCoefficientAddCount(savedState.addCount)
const standardAddCount = ref(savedState.standardAddCount === undefined
  ? legacyAddCount
  : normalizeCoefficientAddCount(savedState.standardAddCount))
const calculationAddCount = ref(savedState.calculationAddCount === undefined
  ? legacyAddCount
  : normalizeCoefficientAddCount(savedState.calculationAddCount))
const standardRows = reactive<StandardContentRow[]>(normalizeStandardRows(savedState.standardRows))
const calculationRows = reactive<CalculationRow[]>(normalizeCalculationRows(savedState.calculationRows))
const standardDeleteMode = ref(false)
const calculationDeleteMode = ref(false)
const selectedStandardRowIds = ref<string[]>([])
const selectedCalculationRowIds = ref<string[]>([])

function createStandardRow(index: number): StandardContentRow {
  return {
    id: `standard-${Date.now()}-${index}`,
    code: formatCoefficientRowCode(index),
    autoCode: true,
    aluminum: null,
    silicon: null,
    iron: null,
    calcium: null,
    magnesium: null,
    titanium: null
  }
}

function normalizeStandardRows(rows: unknown) {
  const source = normalizeStoredRowCollection(rows)
  const usedIds = new Set<string>()
  return source.map((row, index) => {
    const next = createStandardRow(index + 1)
    next.id = normalizeCoefficientRowId(row.id, usedIds, () => next.id)
    next.code = typeof row.code === 'string' ? row.code : next.code
    next.autoCode = inferCoefficientRowAutoCode(next.code, index + 1, row.autoCode)
    contentElements.forEach((element) => {
      next[element.key] = normalizeNullableNumber(row[element.key])
    })
    return next
  })
}

function createCalculationRow(index: number): CalculationRow {
  return {
    id: `calculation-${Date.now()}-${index}`,
    code: formatCoefficientRowCode(index),
    autoCode: true,
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

function normalizeCalculationRows(rows: unknown) {
  const source = normalizeStoredRowCollection(rows)
  const usedIds = new Set<string>()
  return source.map((row, index) => {
    const next = createCalculationRow(index + 1)
    next.id = normalizeCoefficientRowId(row.id, usedIds, () => next.id)
    next.code = typeof row.code === 'string' ? row.code : next.code
    next.autoCode = inferCoefficientRowAutoCode(next.code, index + 1, row.autoCode)
    const inputs = isNonArrayObject(row.inputs) ? row.inputs : {}
    calculationElements.forEach((element) => {
      next.inputs[element.inputField] = normalizeNullableNumber(inputs[element.inputField])
    })
    return next
  })
}

function normalizeStoredRowCollection(rows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rows) || !rows.length || !rows.every(isNonArrayObject)) return [{}, {}, {}]
  return rows
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function addStandardRows() {
  const count = normalizeCoefficientAddCount(standardAddCount.value)
  standardAddCount.value = count
  for (let offset = 0; offset < count; offset += 1) {
    standardRows.push(createStandardRow(standardRows.length + 1))
  }
}

function addCalculationRows() {
  const count = normalizeCoefficientAddCount(calculationAddCount.value)
  calculationAddCount.value = count
  for (let offset = 0; offset < count; offset += 1) {
    calculationRows.push(createCalculationRow(calculationRows.length + 1))
  }
}

function toggleStandardRow(id: string, checked: boolean) {
  selectedStandardRowIds.value = checked
    ? [...new Set([...selectedStandardRowIds.value, id])]
    : selectedStandardRowIds.value.filter((selectedId) => selectedId !== id)
}

function toggleCalculationRow(id: string, checked: boolean) {
  selectedCalculationRowIds.value = checked
    ? [...new Set([...selectedCalculationRowIds.value, id])]
    : selectedCalculationRowIds.value.filter((selectedId) => selectedId !== id)
}

function toggleStandardAll(checked: boolean) {
  selectedStandardRowIds.value = checked ? standardRows.map((row) => row.id) : []
}

function toggleCalculationAll(checked: boolean) {
  selectedCalculationRowIds.value = checked ? calculationRows.map((row) => row.id) : []
}

function cancelStandardDeletion() {
  standardDeleteMode.value = false
  selectedStandardRowIds.value = []
}

function cancelCalculationDeletion() {
  calculationDeleteMode.value = false
  selectedCalculationRowIds.value = []
}

async function confirmStandardDeletion() {
  if (!selectedStandardRowIds.value.length) return
  if (selectedStandardRowIds.value.length >= standardRows.length) {
    ElMessage.warning('标样含量至少保留一个样品')
    return
  }
  const selected = new Set(selectedStandardRowIds.value)
  const codes = standardRows.filter((row) => selected.has(row.id)).map((row) => row.code)
  try {
    await ElMessageBox.confirm(
      `将删除 ${codes.join('、')}，共 ${codes.length} 个样品。删除后无法撤销，是否继续？`,
      '确认删除标样含量',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const remaining = deleteCoefficientRows(standardRows, selected)
  standardRows.splice(0, standardRows.length, ...remaining)
  cancelStandardDeletion()
  ElMessage.success(`已删除 ${codes.length} 个标样含量样品`)
}

async function confirmCalculationDeletion() {
  if (!selectedCalculationRowIds.value.length) return
  if (selectedCalculationRowIds.value.length >= calculationRows.length) {
    ElMessage.warning('标样系数计算至少保留一个样品')
    return
  }
  const selected = new Set(selectedCalculationRowIds.value)
  const codes = calculationRows.filter((row) => selected.has(row.id)).map((row) => row.code)
  try {
    await ElMessageBox.confirm(
      `将删除 ${codes.join('、')}，共 ${codes.length} 个样品。删除后无法撤销，是否继续？`,
      '确认删除标样系数计算',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const remaining = deleteCoefficientRows(calculationRows, selected)
  calculationRows.splice(0, calculationRows.length, ...remaining)
  cancelCalculationDeletion()
  ElMessage.success(`已删除 ${codes.length} 个标样系数计算样品`)
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

function readSavedState(): CoefficientCalculationSavedState {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(currentStorageKey())
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isNonArrayObject(parsed)) return {}
    return {
      parameters: normalizeParameters(parsed.parameters),
      addCount: parsed.addCount,
      standardAddCount: parsed.standardAddCount,
      calculationAddCount: parsed.calculationAddCount,
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

function saveState() {
  if (typeof window === 'undefined') return
  const payload: CoefficientCalculationStoragePayload = {
    parameters: { ...parameters },
    standardAddCount: normalizeCoefficientAddCount(standardAddCount.value),
    calculationAddCount: normalizeCoefficientAddCount(calculationAddCount.value),
    standardRows: standardRows.map((row) => ({ ...row })),
    calculationRows: calculationRows.map((row) => ({
      id: row.id,
      code: row.code,
      autoCode: row.autoCode,
      inputs: { ...row.inputs }
    }))
  }
  window.localStorage.setItem(currentStorageKey(), JSON.stringify(payload))
}

watch([parameters, standardRows, calculationRows, standardAddCount, calculationAddCount], saveState, { deep: true })

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
  } catch (error) {
    if (isMissingStartBoundaryError(error)) {
      const loaded = await labStore.loadCurrentSheet()
      applicationDialogKey.value += 1
      if (loaded === false) {
        ElMessage.error('起始样品已不存在，但当天数据刷新失败，请稍后重试')
        return
      }
      if (!labStore.sampleBlocks.length) {
        applicationDialogVisible.value = false
        ElMessage.warning('当天暂无可应用的样品')
        return
      }
      applicationDialogVisible.value = true
      ElMessage.error('起始样品已不存在，已刷新当天数据，请重新选择')
      return
    }
    ElMessage.error('应用系数失败，请稍后重试')
  }
}

function closeApplicationDialog() {
  if (!labStore.applyingParameters) applicationDialogVisible.value = false
}

function isMissingStartBoundaryError(error: unknown) {
  const data = (error as { response?: { data?: { message?: unknown } } })?.response?.data
  const raw = data?.message
  const message = typeof raw === 'string'
    ? raw
    : raw && typeof raw === 'object' && typeof (raw as { message?: unknown }).message === 'string'
      ? (raw as { message: string }).message
      : ''
  return message.includes('起始样品不存在')
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

.coefficient-selection-cell {
  width: 48px;
  min-width: 48px;
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

.coefficient-delete-entry {
  margin-left: auto;
}

.coefficient-row-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 14px 12px;
  color: #10233f;
  font-weight: 700;
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
  .add-standard-row,
  .coefficient-row-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .coefficient-delete-entry {
    margin-left: 0;
  }
}
</style>
