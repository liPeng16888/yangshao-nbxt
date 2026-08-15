<template>
  <div class="page-stack" :class="{ 'mobile-page': isMobileLayout, 'mobile-medicine-page': isMobileLayout }">
    <template v-if="isMobileLayout">
      <section class="mobile-medicine-form-section">
        <div v-if="itemsError" class="medicine-load-error mobile-medicine-items-error" data-testid="outbound-items-error" role="alert">
          <span>{{ itemsError }}</span>
          <el-button data-testid="outbound-items-retry" link type="primary" :loading="loading" @click="loadItems">重试</el-button>
        </div>
        <button
          class="mobile-medicine-form-toggle mobile-touch-target"
          data-testid="mobile-outbound-form-toggle"
          type="button"
          :aria-expanded="mobileFormExpanded"
          aria-controls="mobile-outbound-form"
          @click="mobileFormExpanded = !mobileFormExpanded"
        >
          <span><strong>药品出库</strong><small>服务端将在提交时再次核验库存</small></span>
          <span aria-hidden="true">{{ mobileFormExpanded ? '⌃' : '⌄' }}</span>
        </button>
        <div id="mobile-outbound-form" v-show="mobileFormExpanded" data-testid="mobile-outbound-form" class="mobile-medicine-form" v-loading="loading">
          <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
            <div class="medicine-form-grid">
              <el-form-item label="出库日期" prop="occurredOn">
                <el-date-picker v-model="form.occurredOn" type="date" value-format="YYYY-MM-DD" />
              </el-form-item>
              <el-form-item label="药品名称" prop="medicineItemId">
                <el-select v-model="form.medicineItemId" data-testid="outbound-item" filterable clearable placeholder="选择有库存药品">
                  <el-option v-for="item in availableItems" :key="item.id" :label="itemLabel(item)" :value="item.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="当前库存"><div class="medicine-quantity-readout">{{ selectedItem ? `当前库存 ${formatMedicineQuantity(selectedItem.currentQuantity)} ${selectedItem.unitLabel}` : '请选择药品' }}</div></el-form-item>
              <el-form-item label="单位"><div class="medicine-quantity-readout">{{ selectedItem?.unitLabel || '-' }}</div></el-form-item>
              <el-form-item label="出库数量" prop="quantity" required>
                <el-input v-model="form.quantity" data-testid="outbound-quantity" inputmode="decimal" placeholder="输入出库数量" />
              </el-form-item>
              <el-form-item label="出库后剩余">
                <div class="medicine-quantity-readout" :class="{ 'medicine-quantity-readout--error': remainingQuantity !== null && remainingQuantity < 0 }">{{ remainingLabel }}</div>
              </el-form-item>
              <el-form-item class="medicine-form-grid__wide" label="备注">
                <el-input v-model="form.remark" data-testid="outbound-remark" maxlength="120" show-word-limit placeholder="可填写出库备注" />
              </el-form-item>
            </div>
            <MobileActionBar>
              <el-button :disabled="saving" @click="resetForm">重置</el-button>
              <el-button data-testid="outbound-submit" type="primary" :loading="saving" :disabled="!canSubmit" @click="handleSubmit">确认出库</el-button>
            </MobileActionBar>
          </el-form>
        </div>
      </section>

      <MobileMedicineMovementList
        kind="outbound"
        :rows="movements"
        :items="items"
        :loading="historyLoading"
        :error="historyError"
        :selected-medicine-item-ids="historyMedicineItemIds"
        :date-range="historyDateRange"
        :correctable-ids="correctableMovementIds"
        :corrected-movement-ids="Array.from(correctedMovementIds)"
        @filter="applyMobileHistoryFilter"
        @correct="openCorrection"
        @retry="loadHistory"
      />
    </template>
    <template v-else>
    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>药品出库</h2>
          <p class="muted">仅可选择有库存的药品。服务端会在提交时再次核验库存。</p>
        </div>
      </div>
      <div class="panel__body" v-loading="loading">
        <div v-if="itemsError" class="medicine-load-error" data-testid="outbound-items-error" role="alert">
          <span>{{ itemsError }}</span>
          <el-button data-testid="outbound-items-retry" link type="primary" :loading="loading" @click="loadItems">重试</el-button>
        </div>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
          <div class="medicine-form-grid">
            <el-form-item label="出库日期" prop="occurredOn">
              <el-date-picker v-model="form.occurredOn" type="date" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="药品名称" prop="medicineItemId">
              <el-select v-model="form.medicineItemId" data-testid="outbound-item" filterable clearable placeholder="选择有库存药品">
                <el-option v-for="item in availableItems" :key="item.id" :label="itemLabel(item)" :value="item.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="当前库存">
              <div class="medicine-quantity-readout">{{ selectedItem ? `当前库存 ${formatMedicineQuantity(selectedItem.currentQuantity)} ${selectedItem.unitLabel}` : '请选择药品' }}</div>
            </el-form-item>
            <el-form-item label="单位">
              <div class="medicine-quantity-readout">{{ selectedItem?.unitLabel || '-' }}</div>
            </el-form-item>
            <el-form-item label="出库数量" prop="quantity" required>
              <el-input v-model="form.quantity" data-testid="outbound-quantity" inputmode="decimal" placeholder="输入出库数量" />
            </el-form-item>
            <el-form-item label="出库后剩余">
              <div class="medicine-quantity-readout" :class="{ 'medicine-quantity-readout--error': remainingQuantity !== null && remainingQuantity < 0 }">
                {{ remainingLabel }}
              </div>
            </el-form-item>
            <el-form-item class="medicine-form-grid__wide" label="备注">
              <el-input v-model="form.remark" data-testid="outbound-remark" maxlength="120" show-word-limit placeholder="可填写出库备注" />
            </el-form-item>
          </div>
          <div class="form-actions">
            <el-button data-testid="outbound-submit" type="primary" :loading="saving" :disabled="!canSubmit" @click="handleSubmit">确认出库</el-button>
            <el-button :disabled="saving" @click="resetForm">重置</el-button>
          </div>
        </el-form>
      </div>
    </section>

    <section class="panel">
      <div class="panel__header medicine-history-header">
        <div>
          <h2>出库明细</h2>
          <p class="muted">已提交记录不可编辑或删除；如需调整，请使用更正。</p>
        </div>
        <div class="medicine-history-filters">
          <el-select v-model="historyMedicineItemIds" multiple clearable collapse-tags placeholder="筛选药品" @change="loadHistory">
            <el-option v-for="item in items" :key="item.id" :label="itemLabel(item)" :value="item.id" />
          </el-select>
          <el-date-picker :model-value="historyDateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" @update:model-value="handleHistoryDateRangeChange" />
          <el-button :loading="historyLoading" @click="loadHistory">刷新</el-button>
        </div>
      </div>
      <div v-if="historyError" class="medicine-load-error medicine-load-error--table" data-testid="outbound-history-error" role="alert">
        <span>{{ historyError }}</span>
        <el-button data-testid="outbound-history-retry" link type="primary" :loading="historyLoading" @click="loadHistory">重试</el-button>
      </div>
      <el-table :data="movements" border v-loading="historyLoading" empty-text="暂无出库明细">
        <el-table-column prop="occurredOn" label="出库日期" width="120" />
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
    </template>

    <MobileFullscreenDialog v-if="isMobileLayout" v-model="correctionVisible" title="更正出库记录" :saving="correctionSaving" fullscreen @confirm="submitCorrection">
      <p class="muted">将创建一条反向更正流水，原记录不会被修改。</p>
      <el-input v-model="correctionReason" data-testid="correction-reason" type="textarea" :rows="3" maxlength="120" show-word-limit placeholder="填写更正原因" />
      <template #footer="{ cancel }">
        <div class="mobile-fullscreen-dialog__actions">
          <button class="mobile-fullscreen-dialog__cancel mobile-touch-target" type="button" :disabled="correctionSaving" @click="cancel">取消</button>
          <button data-testid="correction-submit" class="mobile-fullscreen-dialog__confirm mobile-touch-target" type="button" :disabled="correctionSaving" @click="submitCorrection">{{ correctionSaving ? '更正中…' : '确认更正' }}</button>
        </div>
      </template>
    </MobileFullscreenDialog>
    <el-dialog v-else v-model="correctionVisible" title="更正出库记录" width="420px" :close-on-click-modal="false" @closed="resetCorrection">
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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { correctMedicineMovement, createMedicineOutbound, getMedicineItems, getMedicineMovements } from '@/api/medicineInventory'
import MobileMedicineMovementList from '@/components/medicine/MobileMedicineMovementList.vue'
import MobileActionBar from '@/components/mobile/MobileActionBar.vue'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { MedicineInventoryItem, MedicineInventoryMovement } from '@/types/medicineInventory'
import { formatDateTime, todayInBeijing } from '@/utils/date'
import { formatMedicineQuantity, validateMedicineQuantity } from '@/utils/medicineInventory'

const formRef = ref<FormInstance>()
const items = ref<MedicineInventoryItem[]>([])
const movements = ref<MedicineInventoryMovement[]>([])
const loading = ref(false)
const historyLoading = ref(false)
const itemsError = ref('')
const historyError = ref('')
const saving = ref(false)
const correctionVisible = ref(false)
const correctionSaving = ref(false)
const correctionMovementId = ref('')
const correctionReason = ref('')
const historyMedicineItemIds = ref<string[]>([])
const historyDateRange = ref<string[] | undefined>()
const mobileFormExpanded = ref(false)
const { isMobileLayout } = useMobileLayout()
let itemsRequestId = 0
let historyRequestId = 0
let submitPending = false
let correctionSubmitPending = false
let pageActive = true

const form = reactive({
  occurredOn: todayInBeijing(),
  medicineItemId: '',
  quantity: '',
  remark: ''
})

const availableItems = computed(() => items.value.filter((item) => item.currentQuantity > 0))
const selectedItem = computed(() => items.value.find((item) => item.id === form.medicineItemId) || null)
const quantityValidation = computed(() => selectedItem.value ? validateMedicineQuantity(selectedItem.value.unit, form.quantity) : null)
const remainingQuantity = computed(() => {
  if (!selectedItem.value || !quantityValidation.value?.ok) return null
  return Number((selectedItem.value.currentQuantity - Number(quantityValidation.value.value)).toFixed(3))
})
const remainingLabel = computed(() => {
  if (!selectedItem.value) return '选择药品后显示'
  if (!form.quantity) return `出库后剩余 ${formatMedicineQuantity(selectedItem.value.currentQuantity)} ${selectedItem.value.unitLabel}`
  if (!quantityValidation.value?.ok) return quantityValidation.value?.message || '请输入数量'
  return `出库后剩余 ${formatMedicineQuantity(remainingQuantity.value || 0)} ${selectedItem.value.unitLabel}`
})
const canSubmit = computed(() => Boolean(selectedItem.value && quantityValidation.value?.ok && remainingQuantity.value !== null && remainingQuantity.value >= 0 && !saving.value))
const correctedMovementIds = computed(() => new Set(movements.value.flatMap((movement) => movement.correctionOfId ? [movement.correctionOfId] : [])))
const correctableMovementIds = computed(() => movements.value.filter(isCorrectable).map((movement) => movement.id))

const rules: FormRules<typeof form> = {
  occurredOn: [{ required: true, message: '请选择出库日期', trigger: 'change' }],
  medicineItemId: [{ required: true, message: '请选择出库药品', trigger: 'change' }],
  quantity: [
    { required: true, message: '请输入数量', trigger: 'change' },
    { validator: validateQuantity, trigger: 'change' }
  ]
}

onMounted(() => {
  void Promise.all([loadItems(), loadHistory()])
})

onUnmounted(() => {
  pageActive = false
  itemsRequestId += 1
  historyRequestId += 1
})

async function loadItems() {
  const requestId = ++itemsRequestId
  loading.value = true
  itemsError.value = ''
  try {
    const result = await getMedicineItems()
    if (requestId !== itemsRequestId) return
    items.value = result
  } catch (error) {
    if (requestId !== itemsRequestId) return
    items.value = []
    itemsError.value = errorMessage(error, '药品库存加载失败，请稍后重试')
    ElMessage.error(itemsError.value)
  } finally {
    if (requestId === itemsRequestId) loading.value = false
  }
}

async function loadHistory() {
  const requestId = ++historyRequestId
  const [startDate, endDate] = historyDateRange.value || []
  historyLoading.value = true
  historyError.value = ''
  movements.value = []
  try {
    const result = await getMedicineMovements('outbound', {
      ...(historyMedicineItemIds.value.length ? { medicineItemIds: historyMedicineItemIds.value } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {})
    })
    if (requestId !== historyRequestId) return
    movements.value = result
  } catch (error) {
    if (requestId !== historyRequestId) return
    movements.value = []
    historyError.value = errorMessage(error, '出库明细加载失败，请稍后重试')
    ElMessage.error(historyError.value)
  } finally {
    if (requestId === historyRequestId) historyLoading.value = false
  }
}

function handleHistoryDateRangeChange(value: string[] | undefined) {
  historyDateRange.value = value
  void loadHistory()
}

function applyMobileHistoryFilter(value: { medicineItemIds: string[]; dateRange?: string[] }) {
  historyMedicineItemIds.value = value.medicineItemIds
  historyDateRange.value = value.dateRange
  void loadHistory()
}

async function handleSubmit() {
  if (!canSubmit.value || submitPending) return
  const item = selectedItem.value
  const validatedQuantity = quantityValidation.value
  const remaining = remainingQuantity.value
  if (!item || !validatedQuantity?.ok || remaining === null || remaining < 0) return
  const submission = {
    occurredOn: form.occurredOn,
    medicineItemId: item.id,
    medicineName: item.name,
    unit: item.unit,
    unitLabel: item.unitLabel,
    quantity: validatedQuantity.value,
    remark: form.remark.trim()
  }
  submitPending = true
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    submitPending = false
    return
  }

  try {
    await ElMessageBox.confirm(`确认出库 ${submission.quantity} ${submission.unitLabel} 的“${submission.medicineName}”？`, '确认出库', {
      confirmButtonText: '确认出库',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    submitPending = false
    return
  }
  if (!pageActive) {
    submitPending = false
    return
  }

  saving.value = true
  try {
    await createMedicineOutbound({
      occurredOn: submission.occurredOn,
      medicineItemId: submission.medicineItemId,
      quantity: submission.quantity,
      remark: submission.remark
    })
    if (!pageActive) return
    ElMessage.success('药品已出库')
    resetForm()
    await Promise.all([loadItems(), loadHistory()])
  } catch (error) {
    if (!pageActive) return
    if (isConflict(error)) {
      if (applyConflictQuantity(submission.medicineItemId, submission.unit, error)) {
        ElMessage.error(errorMessage(error, '库存已发生变化，请核对当前库存后重新提交'))
      } else {
        ElMessage.error('库存数据无效，已刷新库存，请核对后重试')
        await loadItems()
      }
      return
    }
    ElMessage.error(errorMessage(error, '药品出库失败，请稍后重试'))
  } finally {
    if (pageActive) saving.value = false
    submitPending = false
  }
}

function resetForm() {
  form.medicineItemId = ''
  form.quantity = ''
  form.remark = ''
  formRef.value?.clearValidate()
}

function applyConflictQuantity(medicineItemId: string, unit: MedicineInventoryItem['unit'], error: unknown) {
  const item = items.value.find((candidate) => candidate.id === medicineItemId)
  const latestQuantity = conflictQuantity(error, unit)
  if (!item || latestQuantity === null) return false
  item.currentQuantity = latestQuantity
  return true
}

function isCorrectable(movement: MedicineInventoryMovement) {
  return movement.type === 'OUTBOUND' && !movement.correctionOfId && !correctedMovementIds.value.has(movement.id)
}

function openCorrection(movement: MedicineInventoryMovement) {
  correctionMovementId.value = movement.id
  correctionReason.value = ''
  correctionVisible.value = true
}

async function submitCorrection() {
  if (correctionSubmitPending) return
  const reason = correctionReason.value.trim()
  if (!reason) {
    ElMessage.warning('请填写更正原因')
    return
  }
  correctionSubmitPending = true
  try {
    await ElMessageBox.confirm('确认创建反向更正流水？原出库记录不会被修改。', '二次确认更正', {
      confirmButtonText: '确认更正',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    correctionSubmitPending = false
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
    correctionSubmitPending = false
  }
}

function resetCorrection() {
  correctionMovementId.value = ''
  correctionReason.value = ''
}

function validateQuantity(_: unknown, value: string, callback: (error?: Error) => void) {
  if (!selectedItem.value) {
    callback(new Error('请先选择出库药品'))
    return
  }
  const result = validateMedicineQuantity(selectedItem.value.unit, value)
  if (!result.ok) {
    callback(new Error(result.message))
    return
  }
  if (Number(result.value) > selectedItem.value.currentQuantity) {
    callback(new Error('出库数量不能超过当前库存'))
    return
  }
  callback()
}

function itemLabel(item: MedicineInventoryItem) {
  return `${item.name}（${item.unitLabel}）`
}

function movementTypeLabel(type: MedicineInventoryMovement['type']) {
  return type === 'CORRECTION_IN' ? '更正入库' : '出库'
}

function isConflict(error: unknown) {
  return (error as { response?: { status?: number } })?.response?.status === 409
}

function conflictQuantity(error: unknown, unit: MedicineInventoryItem['unit']) {
  const data = (error as { response?: { data?: { currentQuantity?: unknown; item?: { currentQuantity?: unknown }; message?: string | string[] } } })?.response?.data
  const explicitQuantity = data?.item?.currentQuantity ?? data?.currentQuantity
  if (typeof explicitQuantity !== 'number' || !Number.isFinite(explicitQuantity) || explicitQuantity < 0) return null
  if (explicitQuantity === 0) return 0
  const validated = validateMedicineQuantity(unit, explicitQuantity)
  return validated.ok ? Number(validated.value) : null
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

.medicine-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 12px;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fecdca;
  border-radius: 6px;
}

.medicine-load-error--table {
  margin: 0 16px 12px;
}

.medicine-quantity-readout {
  display: flex;
  align-items: center;
  min-height: 32px;
  color: #334155;
}

.medicine-quantity-readout--error {
  color: #b42318;
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

.mobile-medicine-page {
  padding-bottom: calc(76px + var(--mobile-page-action-bottom));
}

.mobile-medicine-form-section {
  min-width: 0;
  overflow: hidden;
  background: #ffffff;
  border: 1px solid #d8e1eb;
  border-radius: 12px;
}

.mobile-medicine-items-error {
  margin: 10px 10px 0;
}

.mobile-medicine-form-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  color: #1f2937;
  text-align: left;
  background: transparent;
  border: 0;
}

.mobile-medicine-form-toggle > span:first-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.mobile-medicine-form-toggle small {
  color: #64748b;
  font-weight: 400;
}

.mobile-medicine-form {
  padding: 12px;
  border-top: 1px solid #e4ebf3;
}

.mobile-medicine-form :deep(.el-input),
.mobile-medicine-form :deep(.el-select),
.mobile-medicine-form :deep(.el-date-editor) {
  width: 100%;
}

.mobile-medicine-form :deep(.el-input__wrapper),
.mobile-medicine-form :deep(.el-select__wrapper),
.mobile-medicine-form :deep(.el-date-editor) {
  min-height: 44px;
}

.mobile-medicine-form :deep(.mobile-action-bar .el-button) {
  flex: 1;
  min-height: 44px;
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

  .medicine-load-error {
    align-items: flex-start;
  }
}
</style>
