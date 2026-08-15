import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { normalizeCoefficientDraftPayload } from '@/api/calculationDraft'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type {
  CalculationRow,
  CoefficientDraftPayload,
  CoefficientElementKey,
  CoefficientRawKey,
  StandardContentRow
} from '@/types/calculationDraft'
import type { LabFormulaResult } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import {
  deleteCoefficientRows,
  formatCoefficientRowCode,
  inferCoefficientRowAutoCode,
  normalizeCoefficientAddCount,
  normalizeCoefficientRowId
} from '@/utils/coefficientRows'

export type CalculationResultKey = 'iron' | 'silicon' | 'aluminum' | 'calcium' | 'magnesium' | 'titanium'

export const coefficientContentElements: Array<{ key: CoefficientElementKey; label: string }> = [
  { key: 'aluminum', label: '铝' },
  { key: 'silicon', label: '硅' },
  { key: 'iron', label: '铁' },
  { key: 'calcium', label: '钙' },
  { key: 'magnesium', label: '镁' },
  { key: 'titanium', label: '钛' }
]

export const coefficientCalculationElements: Array<{
  label: string
  inputField: CoefficientRawKey
  resultField: CalculationResultKey
}> = [
  { label: '铁', inputField: 'ironRaw', resultField: 'iron' },
  { label: '硅', inputField: 'siliconRaw', resultField: 'silicon' },
  { label: '铝', inputField: 'aluminumRaw', resultField: 'aluminum' },
  { label: '钙', inputField: 'calciumRaw', resultField: 'calcium' },
  { label: '镁', inputField: 'magnesiumRaw', resultField: 'magnesium' },
  { label: '钛', inputField: 'titaniumRaw', resultField: 'titanium' }
]

let rowSequence = 0

export interface CoefficientCalculationState {
  parameters: CoefficientDraftPayload['parameters']
  standardRows: StandardContentRow[]
  calculationRows: CalculationRow[]
  standardAddCount: Ref<number>
  calculationAddCount: Ref<number>
  standardRemainingCapacity: ComputedRef<number>
  calculationRemainingCapacity: ComputedRef<number>
  standardDeleteMode: Ref<boolean>
  calculationDeleteMode: Ref<boolean>
  selectedStandardRowIds: Ref<string[]>
  selectedCalculationRowIds: Ref<string[]>
  snapshot: () => CoefficientDraftPayload
  apply: (payload: CoefficientDraftPayload) => void
  addStandardRows: () => void
  addCalculationRows: () => void
  toggleStandardRow: (id: string, checked: boolean) => void
  toggleCalculationRow: (id: string, checked: boolean) => void
  toggleStandardAll: (checked: boolean) => void
  toggleCalculationAll: (checked: boolean) => void
  cancelStandardDeletion: () => void
  cancelCalculationDeletion: () => void
  confirmStandardDeletion: () => Promise<void>
  confirmCalculationDeletion: () => Promise<void>
  getCalculatedResult: (row: CalculationRow, field: CalculationResultKey) => number | null
}

export function useCoefficientCalculation(): CoefficientCalculationState {
  const parameters = reactive<CoefficientDraftPayload['parameters']>({ ...defaultLabParameters })
  const standardAddCount = ref(1)
  const calculationAddCount = ref(1)
  const standardRows = reactive<StandardContentRow[]>([1, 2, 3].map(createStandardRow))
  const calculationRows = reactive<CalculationRow[]>([1, 2, 3].map(createCalculationRow))
  const standardDeleteMode = ref(false)
  const calculationDeleteMode = ref(false)
  const selectedStandardRowIds = ref<string[]>([])
  const selectedCalculationRowIds = ref<string[]>([])
  const standardRemainingCapacity = computed(() => Math.max(0, 50 - standardRows.length))
  const calculationRemainingCapacity = computed(() => Math.max(0, 50 - calculationRows.length))

  function snapshot(): CoefficientDraftPayload {
    return normalizeCoefficientDraft({
      parameters: { ...parameters },
      standardAddCount: normalizeCoefficientAddCount(standardAddCount.value),
      calculationAddCount: normalizeCoefficientAddCount(calculationAddCount.value),
      standardRows: standardRows.map((row) => ({ ...row })),
      calculationRows: calculationRows.map((row) => ({ ...row, inputs: { ...row.inputs } }))
    })
  }

  function apply(payload: CoefficientDraftPayload) {
    const normalized = normalizeCoefficientDraft(payload)
    Object.assign(parameters, normalized.parameters)
    standardAddCount.value = normalized.standardAddCount
    calculationAddCount.value = normalized.calculationAddCount
    standardRows.splice(0, standardRows.length, ...normalized.standardRows.map((row) => ({ ...row })))
    calculationRows.splice(0, calculationRows.length, ...normalized.calculationRows.map((row) => ({ ...row, inputs: { ...row.inputs } })))
    cancelStandardDeletion()
    cancelCalculationDeletion()
  }

  function addStandardRows() {
    const count = normalizeCoefficientAddCount(standardAddCount.value)
    standardAddCount.value = count
    const actualCount = Math.min(count, standardRemainingCapacity.value)
    for (let offset = 0; offset < actualCount; offset += 1) standardRows.push(createStandardRow(standardRows.length + 1))
  }

  function addCalculationRows() {
    const count = normalizeCoefficientAddCount(calculationAddCount.value)
    calculationAddCount.value = count
    const actualCount = Math.min(count, calculationRemainingCapacity.value)
    for (let offset = 0; offset < actualCount; offset += 1) calculationRows.push(createCalculationRow(calculationRows.length + 1))
  }

  function toggleStandardRow(id: string, checked: boolean) {
    selectedStandardRowIds.value = toggleSelection(selectedStandardRowIds.value, id, checked)
  }

  function toggleCalculationRow(id: string, checked: boolean) {
    selectedCalculationRowIds.value = toggleSelection(selectedCalculationRowIds.value, id, checked)
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
    await confirmDeletion('standard')
  }

  async function confirmCalculationDeletion() {
    await confirmDeletion('calculation')
  }

  async function confirmDeletion(kind: 'standard' | 'calculation') {
    const rows = kind === 'standard' ? standardRows : calculationRows
    const selectedIds = kind === 'standard' ? selectedStandardRowIds : selectedCalculationRowIds
    if (!selectedIds.value.length) return
    const name = kind === 'standard' ? '标样含量' : '标样系数计算'
    if (selectedIds.value.length >= rows.length) {
      ElMessage.warning(`${name}至少保留一个样品`)
      return
    }
    const selected = new Set(selectedIds.value)
    const codes = rows.filter((row) => selected.has(row.id)).map((row) => row.code)
    try {
      await ElMessageBox.confirm(
        `将删除 ${codes.join('、')}，共 ${codes.length} 个样品。删除后无法撤销，是否继续？`,
        `确认删除${name}`,
        { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
      )
    } catch {
      return
    }
    if (kind === 'standard') {
      const remaining = deleteCoefficientRows(standardRows, selected)
      standardRows.splice(0, standardRows.length, ...remaining)
      cancelStandardDeletion()
    } else {
      const remaining = deleteCoefficientRows(calculationRows, selected)
      calculationRows.splice(0, calculationRows.length, ...remaining)
      cancelCalculationDeletion()
    }
    ElMessage.success(`已删除 ${codes.length} 个${name}样品`)
  }

  function getCalculatedResult(row: CalculationRow, key: CalculationResultKey) {
    const result: LabFormulaResult = calculateSampleResults(row.inputs, parameters)
    return result[key]
  }

  return {
    parameters,
    standardRows,
    calculationRows,
    standardAddCount,
    calculationAddCount,
    standardRemainingCapacity,
    calculationRemainingCapacity,
    standardDeleteMode,
    calculationDeleteMode,
    selectedStandardRowIds,
    selectedCalculationRowIds,
    snapshot,
    apply,
    addStandardRows,
    addCalculationRows,
    toggleStandardRow,
    toggleCalculationRow,
    toggleStandardAll,
    toggleCalculationAll,
    cancelStandardDeletion,
    cancelCalculationDeletion,
    confirmStandardDeletion,
    confirmCalculationDeletion,
    getCalculatedResult
  }
}

function createStandardRow(index: number): StandardContentRow {
  return {
    id: `standard-${Date.now()}-${++rowSequence}`,
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

function createCalculationRow(index: number): CalculationRow {
  return {
    id: `calculation-${Date.now()}-${++rowSequence}`,
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

function toggleSelection(selected: string[], id: string, checked: boolean) {
  return checked ? [...new Set([...selected, id])] : selected.filter((selectedId) => selectedId !== id)
}

export function normalizeCoefficientDraft(value: unknown): CoefficientDraftPayload {
  return normalizeCoefficientDraftPayload(value)
}

export function migrateLegacyCoefficientDraft(value: unknown): CoefficientDraftPayload {
  const source = requireCompatibleObject(value, ['parameters', 'addCount', 'standardAddCount', 'calculationAddCount', 'standardRows', 'calculationRows'])
  const parameterKeys = Object.keys(defaultLabParameters) as Array<keyof CoefficientDraftPayload['parameters']>
  const parameterSource = source.parameters === undefined ? {} : requireCompatibleObject(source.parameters, parameterKeys)
  const parameters = Object.fromEntries(parameterKeys.map((key) => [
    key,
    parameterSource[key] === undefined ? defaultLabParameters[key] : requireFiniteNumber(parameterSource[key])
  ])) as CoefficientDraftPayload['parameters']
  const legacyAddCount = normalizeCoefficientAddCount(source.addCount)
  return {
    parameters,
    standardAddCount: source.standardAddCount === undefined ? legacyAddCount : normalizeCoefficientAddCount(source.standardAddCount),
    calculationAddCount: source.calculationAddCount === undefined ? legacyAddCount : normalizeCoefficientAddCount(source.calculationAddCount),
    standardRows: normalizeStandardRows(source.standardRows),
    calculationRows: normalizeCalculationRows(source.calculationRows)
  }
}

function normalizeStandardRows(value: unknown) {
  return normalizeRows(value, createStandardRow, (item, index, ids) => {
    const source = requireCompatibleObject(item, ['id', 'code', 'autoCode', ...coefficientContentElements.map(({ key }) => key)])
    const next = createStandardRow(index + 1)
    next.id = normalizeCoefficientRowId(source.id, ids, () => next.id)
    next.code = source.code === undefined ? next.code : requireCode(source.code)
    next.autoCode = inferCoefficientRowAutoCode(next.code, index + 1, source.autoCode)
    coefficientContentElements.forEach(({ key }) => { next[key] = source[key] === undefined ? null : requireNullableNumber(source[key]) })
    return next
  })
}

function normalizeCalculationRows(value: unknown) {
  return normalizeRows(value, createCalculationRow, (item, index, ids) => {
    const source = requireCompatibleObject(item, ['id', 'code', 'autoCode', 'inputs'])
    const inputKeys = coefficientCalculationElements.map(({ inputField }) => inputField)
    const inputs = source.inputs === undefined ? {} : requireCompatibleObject(source.inputs, inputKeys)
    const next = createCalculationRow(index + 1)
    next.id = normalizeCoefficientRowId(source.id, ids, () => next.id)
    next.code = source.code === undefined ? next.code : requireCode(source.code)
    next.autoCode = inferCoefficientRowAutoCode(next.code, index + 1, source.autoCode)
    inputKeys.forEach((key) => { next.inputs[key] = inputs[key] === undefined ? null : requireNullableNumber(inputs[key]) })
    return next
  })
}

function normalizeRows<T>(value: unknown, create: (index: number) => T, normalize: (item: unknown, index: number, ids: Set<string>) => T): T[] {
  if (Array.isArray(value) && value.length > 50) throw new TypeError('系数旧草稿行数超过 50')
  const source = Array.isArray(value) && value.length >= 1
    ? value.filter(isPlainRecord)
    : []
  if (!source.length) return [create(1), create(2), create(3)]
  const ids = new Set<string>()
  return source.map((item, index) => normalize(item, index, ids))
}

function isPlainRecord(value: unknown) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requireCompatibleObject(value: unknown, allowedKeys: readonly PropertyKey[]) {
  if (!isPlainRecord(value)) throw new TypeError('系数草稿格式无效')
  const source = value as Record<PropertyKey, unknown>
  if (Reflect.ownKeys(source).some((key) => !allowedKeys.includes(key))) throw new TypeError('系数草稿字段无效')
  return source
}

function requireFiniteNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('系数草稿数值无效')
  return value
}

function requireNullableNumber(value: unknown) {
  if (value === null) return null
  return requireFiniteNumber(value)
}

function requireCode(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) throw new TypeError('系数草稿编号无效')
  return value
}
