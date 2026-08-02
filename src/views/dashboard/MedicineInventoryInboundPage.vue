<template>
  <div class="page-stack">
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>药品入库</h2>
          <p class="muted">已存在药品会锁定其单位；同名不同单位作为独立库存项管理。</p>
        </div>
      </div>
      <div class="panel__body" v-loading="loading">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
          <div class="medicine-form-grid">
            <el-form-item label="入库日期" prop="occurredOn">
              <el-date-picker v-model="form.occurredOn" type="date" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="药品名称" prop="name">
              <el-select
                v-model="form.medicineSelection"
                data-testid="inbound-item"
                filterable
                allow-create
                default-first-option
                clearable
                reserve-keyword
                placeholder="选择已有药品或输入新名称"
                @update:model-value="handleMedicineSelection"
              >
                <el-option v-for="item in items" :key="item.id" :label="itemLabel(item)" :value="item.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="单位" prop="unit">
              <el-select v-model="form.unit" data-testid="inbound-unit" :disabled="Boolean(selectedExistingItem)" placeholder="选择单位">
                <el-option v-for="unit in medicineUnitOptions" :key="unit.value" :label="unit.label" :value="unit.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="数量" prop="quantity">
              <el-input v-model="form.quantity" data-testid="inbound-quantity" inputmode="decimal" placeholder="输入入库数量" />
            </el-form-item>
            <el-form-item class="medicine-form-grid__wide" label="备注">
              <el-input v-model="form.remark" maxlength="120" show-word-limit placeholder="可填写入库备注" />
            </el-form-item>
          </div>
          <div class="form-actions">
            <el-button data-testid="inbound-submit" type="primary" :loading="saving" @click="handleSubmit">确认入库</el-button>
            <el-button :disabled="saving" @click="resetForm">重置</el-button>
          </div>
        </el-form>
      </div>
    </section>

    <section class="panel">
      <div class="panel__header medicine-history-header">
        <div>
          <h2>入库明细</h2>
          <p class="muted">已提交记录不可编辑或删除；如需调整，请使用更正。</p>
        </div>
        <div class="medicine-history-filters">
          <el-select v-model="historyMedicineItemIds" multiple clearable collapse-tags placeholder="筛选药品" @change="loadHistory">
            <el-option v-for="item in items" :key="item.id" :label="itemLabel(item)" :value="item.id" />
          </el-select>
          <el-date-picker v-model="historyDateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" @change="loadHistory" />
          <el-button :loading="historyLoading" @click="loadHistory">刷新</el-button>
        </div>
      </div>
      <el-table :data="movements" border v-loading="historyLoading" empty-text="暂无入库明细">
        <el-table-column prop="occurredOn" label="入库日期" width="120" />
        <el-table-column prop="nameSnapshot" label="药品名称" min-width="160" />
        <el-table-column label="数量" width="130">
          <template #default="{ row }">{{ formatMedicineQuantity(row.quantity) }} {{ row.unitLabel }}</template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ movementTypeLabel(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" />
        <el-table-column label="录入时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button v-if="isCorrectable(row)" :data-testid="`correct-${row.id}`" type="warning" link @click="openCorrection(row)">更正</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="correctionVisible" title="更正入库记录" width="420px" :close-on-click-modal="false" @closed="resetCorrection">
      <p class="muted">将创建一条反向更正流水，原记录不会被修改。</p>
      <el-input v-model="correctionReason" data-testid="correction-reason" type="textarea" :rows="3" maxlength="120" show-word-limit placeholder="填写更正原因" />
      <template #footer>
        <el-button @click="correctionVisible = false">取消</el-button>
        <el-button data-testid="correction-submit" type="warning" :loading="correctionSaving" @click="submitCorrection">确认更正</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { correctMedicineMovement, createMedicineInbound, getMedicineItems, getMedicineMovements } from '@/api/medicineInventory'
import type { MedicineInventoryItem, MedicineInventoryMovement, MedicineUnit } from '@/types/medicineInventory'
import { formatMedicineQuantity, medicineUnitOptions, validateMedicineQuantity } from '@/utils/medicineInventory'
import { todayInBeijing } from '@/utils/date'

const formRef = ref<FormInstance>()
const items = ref<MedicineInventoryItem[]>([])
const movements = ref<MedicineInventoryMovement[]>([])
const loading = ref(false)
const historyLoading = ref(false)
const saving = ref(false)
const correctionVisible = ref(false)
const correctionSaving = ref(false)
const correctionMovementId = ref('')
const correctionReason = ref('')
const historyMedicineItemIds = ref<string[]>([])
const historyDateRange = ref<string[]>([])

const form = reactive<{
  occurredOn: string
  medicineSelection: string
  name: string
  unit: MedicineUnit | ''
  quantity: string
  remark: string
}>({
  occurredOn: todayInBeijing(),
  medicineSelection: '',
  name: '',
  unit: '',
  quantity: '',
  remark: ''
})

const selectedExistingItem = computed(() => items.value.find((item) => item.id === form.medicineSelection) || null)
const correctedMovementIds = computed(() => new Set(movements.value.flatMap((movement) => movement.correctionOfId ? [movement.correctionOfId] : [])))

const rules: FormRules<typeof form> = {
  occurredOn: [{ required: true, message: '请选择入库日期', trigger: 'change' }],
  name: [{ required: true, message: '请选择或填写药品名称', trigger: 'change' }],
  unit: [{ required: true, message: '请选择药品单位', trigger: 'change' }],
  quantity: [{ validator: validateQuantity, trigger: 'change' }]
}

onMounted(() => {
  void Promise.all([loadItems(), loadHistory()])
})

async function loadItems() {
  loading.value = true
  try {
    items.value = await getMedicineItems()
  } catch (error) {
    ElMessage.error(errorMessage(error, '药品库存加载失败，请稍后重试'))
  } finally {
    loading.value = false
  }
}

async function loadHistory() {
  historyLoading.value = true
  try {
    movements.value = await getMedicineMovements('inbound', {
      ...(historyMedicineItemIds.value.length ? { medicineItemIds: historyMedicineItemIds.value } : {}),
      ...(historyDateRange.value[0] ? { startDate: historyDateRange.value[0] } : {}),
      ...(historyDateRange.value[1] ? { endDate: historyDateRange.value[1] } : {})
    })
  } catch (error) {
    ElMessage.error(errorMessage(error, '入库明细加载失败，请稍后重试'))
  } finally {
    historyLoading.value = false
  }
}

function handleMedicineSelection(value: string) {
  const item = items.value.find((candidate) => candidate.id === value)
  if (item) {
    form.name = item.name
    form.unit = item.unit
    return
  }
  form.name = value?.trim() || ''
  form.unit = ''
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !form.unit) return

  const quantity = validateMedicineQuantity(form.unit, form.quantity)
  if (!quantity.ok) return

  try {
    await ElMessageBox.confirm(`确认入库 ${quantity.value} ${unitLabel(form.unit)} 的“${form.name}”？`, '确认入库', {
      confirmButtonText: '确认入库',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }

  saving.value = true
  try {
    await createMedicineInbound({
      occurredOn: form.occurredOn,
      name: form.name.trim(),
      unit: form.unit,
      quantity: quantity.value,
      remark: form.remark.trim()
    })
    ElMessage.success('药品已入库')
    resetForm()
    await Promise.all([loadItems(), loadHistory()])
  } catch (error) {
    ElMessage.error(errorMessage(error, '药品入库失败，请稍后重试'))
  } finally {
    saving.value = false
  }
}

function resetForm() {
  form.medicineSelection = ''
  form.name = ''
  form.unit = ''
  form.quantity = ''
  form.remark = ''
  formRef.value?.clearValidate()
}

function isCorrectable(movement: MedicineInventoryMovement) {
  return movement.type === 'INBOUND' && !movement.correctionOfId && !correctedMovementIds.value.has(movement.id)
}

function openCorrection(movement: MedicineInventoryMovement) {
  correctionMovementId.value = movement.id
  correctionReason.value = ''
  correctionVisible.value = true
}

async function submitCorrection() {
  const reason = correctionReason.value.trim()
  if (!reason) {
    ElMessage.warning('请填写更正原因')
    return
  }
  try {
    await ElMessageBox.confirm('确认创建反向更正流水？原入库记录不会被修改。', '二次确认更正', {
      confirmButtonText: '确认更正',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }

  correctionSaving.value = true
  try {
    await correctMedicineMovement(correctionMovementId.value, { reason })
    ElMessage.success('更正流水已创建')
    correctionVisible.value = false
    await Promise.all([loadItems(), loadHistory()])
  } catch (error) {
    ElMessage.error(errorMessage(error, '更正失败，请稍后重试'))
  } finally {
    correctionSaving.value = false
  }
}

function resetCorrection() {
  correctionMovementId.value = ''
  correctionReason.value = ''
}

function validateQuantity(_: unknown, value: string, callback: (error?: Error) => void) {
  if (!form.unit) {
    callback(new Error('请先选择药品单位'))
    return
  }
  const result = validateMedicineQuantity(form.unit, value)
  callback(result.ok ? undefined : new Error(result.message))
}

function itemLabel(item: MedicineInventoryItem) {
  return `${item.name}（${item.unitLabel}）`
}

function unitLabel(unit: MedicineUnit) {
  return medicineUnitOptions.find((option) => option.value === unit)?.label || ''
}

function movementTypeLabel(type: MedicineInventoryMovement['type']) {
  return type === 'CORRECTION_OUT' ? '更正出库' : '入库'
}

function formatDateTime(value: string) {
  return value.replace('T', ' ').slice(0, 16)
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  return Array.isArray(message) ? message.join('；') : message || fallback
}
</script>

<style scoped lang="scss">
.medicine-form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0 12px;
}

.medicine-form-grid__wide {
  grid-column: span 2;
}

.medicine-history-header {
  align-items: flex-start;
  gap: 14px;
}

.medicine-history-filters {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 980px) {
  .medicine-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .medicine-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .medicine-form-grid__wide {
    grid-column: auto;
  }

  .medicine-history-header {
    flex-direction: column;
  }

  .medicine-history-filters {
    justify-content: stretch;
    width: 100%;
  }

  .medicine-history-filters > * {
    width: 100%;
  }
}
</style>
