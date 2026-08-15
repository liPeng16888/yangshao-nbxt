<template>
  <div class="page-stack" :class="{ 'mobile-page': isMobileLayout, 'mobile-medicine-page': isMobileLayout }">
    <template v-if="isMobileLayout">
      <section class="mobile-medicine-form-section">
        <div v-if="itemsError" class="medicine-load-error mobile-medicine-items-error" data-testid="inbound-items-error" role="alert">
          <span>{{ itemsError }}</span>
          <el-button data-testid="inbound-items-retry" link type="primary" :loading="loading" @click="loadItems">重试</el-button>
        </div>
        <button
          class="mobile-medicine-form-toggle mobile-touch-target"
          data-testid="mobile-inbound-form-toggle"
          type="button"
          :aria-expanded="mobileFormExpanded"
          aria-controls="mobile-inbound-form"
          @click="mobileFormExpanded = !mobileFormExpanded"
        >
          <span><strong>药品入库</strong><small>已存在药品会锁定其单位</small></span>
          <span aria-hidden="true">{{ mobileFormExpanded ? '⌃' : '⌄' }}</span>
        </button>
        <div id="mobile-inbound-form" v-show="mobileFormExpanded" data-testid="mobile-inbound-form" class="mobile-medicine-form" v-loading="loading">
          <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
            <div class="medicine-form-grid">
              <el-form-item label="入库日期" prop="occurredOn">
                <el-date-picker v-model="form.occurredOn" type="date" value-format="YYYY-MM-DD" />
              </el-form-item>
              <el-form-item label="药品名称" prop="name">
                <el-autocomplete v-model="form.name" data-testid="inbound-item" clearable :fetch-suggestions="queryMedicineSuggestions" placeholder="输入药品名称或选择常用名称" @input="handleMedicineNameInput" @select="handleMedicineSuggestion">
                  <template #default="{ item }"><span>{{ item.label }}</span></template>
                </el-autocomplete>
              </el-form-item>
              <el-form-item label="单位" prop="unit">
                <el-select v-model="form.unit" data-testid="inbound-unit" :disabled="Boolean(selectedExistingItem)" placeholder="选择单位">
                  <el-option v-for="unit in medicineUnitOptions" :key="unit.value" :label="unit.label" :value="unit.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="数量" prop="quantity" required>
                <el-input v-model="form.quantity" data-testid="inbound-quantity" inputmode="decimal" placeholder="输入入库数量" />
              </el-form-item>
              <el-form-item class="medicine-form-grid__wide" label="备注">
                <el-input v-model="form.remark" maxlength="120" show-word-limit placeholder="可填写入库备注" />
              </el-form-item>
            </div>
            <div class="medicine-common-names">
              <div>
                <h3>常用药品名称</h3>
                <p class="muted">仅供当前登录账号使用；录入后可在药品名称中直接选择。</p>
              </div>
              <div class="medicine-common-names__entry">
                <el-input v-model="commonNameInput" data-testid="common-name-input" maxlength="60" placeholder="录入常用药品名称" @keyup.enter="saveCommonName" />
                <el-button data-testid="common-name-submit" type="primary" :loading="commonNamesSaving" @click="saveCommonName">添加</el-button>
              </div>
              <div v-if="commonNames.length" class="medicine-common-names__tags">
                <el-tag v-for="commonName in commonNames" :key="commonName.id" closable @close="removeCommonName(commonName.id)">{{ commonName.name }}</el-tag>
              </div>
            </div>
            <MobileActionBar>
              <el-button :disabled="saving" @click="resetForm">重置</el-button>
              <el-button data-testid="inbound-submit" type="primary" :loading="saving" @click="handleSubmit">确认入库</el-button>
            </MobileActionBar>
          </el-form>
        </div>
      </section>

      <MobileMedicineMovementList
        kind="inbound"
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
          <h2>药品入库</h2>
          <p class="muted">已存在药品会锁定其单位；同名不同单位作为独立库存项管理。</p>
        </div>
      </div>
      <div class="panel__body" v-loading="loading">
        <div v-if="itemsError" class="medicine-load-error" data-testid="inbound-items-error" role="alert">
          <span>{{ itemsError }}</span>
          <el-button data-testid="inbound-items-retry" link type="primary" :loading="loading" @click="loadItems">重试</el-button>
        </div>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
          <div class="medicine-form-grid">
            <el-form-item label="入库日期" prop="occurredOn">
              <el-date-picker v-model="form.occurredOn" type="date" value-format="YYYY-MM-DD" />
            </el-form-item>
            <el-form-item label="药品名称" prop="name">
              <el-autocomplete
                v-model="form.name"
                data-testid="inbound-item"
                clearable
                :fetch-suggestions="queryMedicineSuggestions"
                placeholder="输入药品名称或选择常用名称"
                @input="handleMedicineNameInput"
                @select="handleMedicineSuggestion"
              >
                <template #default="{ item }">
                  <span>{{ item.label }}</span>
                </template>
              </el-autocomplete>
            </el-form-item>
            <el-form-item label="单位" prop="unit">
              <el-select v-model="form.unit" data-testid="inbound-unit" :disabled="Boolean(selectedExistingItem)" placeholder="选择单位">
                <el-option v-for="unit in medicineUnitOptions" :key="unit.value" :label="unit.label" :value="unit.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="数量" prop="quantity" required>
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
        <div class="medicine-common-names">
          <div>
            <h3>常用药品名称</h3>
            <p class="muted">仅供当前登录账号使用；录入后可在上方药品名称中直接选择。</p>
          </div>
          <div class="medicine-common-names__entry">
            <el-input v-model="commonNameInput" data-testid="common-name-input" maxlength="60" placeholder="录入常用药品名称" @keyup.enter="saveCommonName" />
            <el-button data-testid="common-name-submit" type="primary" :loading="commonNamesSaving" @click="saveCommonName">添加</el-button>
          </div>
          <div v-if="commonNames.length" class="medicine-common-names__tags">
            <el-tag v-for="commonName in commonNames" :key="commonName.id" closable @close="removeCommonName(commonName.id)">
              {{ commonName.name }}
            </el-tag>
          </div>
        </div>
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
          <el-date-picker :model-value="historyDateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" @update:model-value="handleHistoryDateRangeChange" />
          <el-button :loading="historyLoading" @click="loadHistory">刷新</el-button>
        </div>
      </div>
      <div v-if="historyError" class="medicine-load-error medicine-load-error--table" data-testid="inbound-history-error" role="alert">
        <span>{{ historyError }}</span>
        <el-button data-testid="inbound-history-retry" link type="primary" :loading="historyLoading" @click="loadHistory">重试</el-button>
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
    </template>

    <MobileFullscreenDialog v-if="isMobileLayout" v-model="correctionVisible" title="更正入库记录" :saving="correctionSaving" fullscreen @confirm="submitCorrection">
      <p class="muted">将创建一条反向更正流水，原记录不会被修改。</p>
      <el-input v-model="correctionReason" data-testid="correction-reason" type="textarea" :rows="3" maxlength="120" show-word-limit placeholder="填写更正原因" />
      <template #footer="{ cancel }">
        <div class="mobile-fullscreen-dialog__actions">
          <button class="mobile-fullscreen-dialog__cancel mobile-touch-target" type="button" :disabled="correctionSaving" @click="cancel">取消</button>
          <button data-testid="correction-submit" class="mobile-fullscreen-dialog__confirm mobile-touch-target" type="button" :disabled="correctionSaving" @click="submitCorrection">{{ correctionSaving ? '更正中…' : '确认更正' }}</button>
        </div>
      </template>
    </MobileFullscreenDialog>
    <el-dialog v-else v-model="correctionVisible" title="更正入库记录" width="420px" :close-on-click-modal="false" @closed="resetCorrection">
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
import { correctMedicineMovement, createMedicineCommonName, createMedicineInbound, deleteMedicineCommonName, getMedicineCommonNames, getMedicineItems, getMedicineMovements } from '@/api/medicineInventory'
import MobileMedicineMovementList from '@/components/medicine/MobileMedicineMovementList.vue'
import MobileActionBar from '@/components/mobile/MobileActionBar.vue'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import type { MedicineCommonName, MedicineInventoryItem, MedicineInventoryMovement, MedicineUnit } from '@/types/medicineInventory'
import { formatDateTime, todayInBeijing } from '@/utils/date'
import { formatMedicineQuantity, medicineUnitOptions, validateMedicineQuantity } from '@/utils/medicineInventory'

const formRef = ref<FormInstance>()
const items = ref<MedicineInventoryItem[]>([])
const commonNames = ref<MedicineCommonName[]>([])
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
const commonNameInput = ref('')
const commonNamesSaving = ref(false)
const selectedExistingItemId = ref('')
const historyMedicineItemIds = ref<string[]>([])
const historyDateRange = ref<string[] | undefined>()
const mobileFormExpanded = ref(false)
const { isMobileLayout } = useMobileLayout()
let itemsRequestId = 0
let historyRequestId = 0
let submitPending = false
let correctionSubmitPending = false

const form = reactive<{
  occurredOn: string
  name: string
  unit: MedicineUnit | ''
  quantity: string
  remark: string
}>({
  occurredOn: todayInBeijing(),
  name: '',
  unit: '',
  quantity: '',
  remark: ''
})

const selectedExistingItem = computed(() => items.value.find((item) => item.id === selectedExistingItemId.value) || null)
const medicineSuggestions = computed(() => {
  const existing = items.value.map((item) => ({ value: item.name, label: itemLabel(item), item }))
  const existingNames = new Set(items.value.map((item) => item.name.trim().toLocaleLowerCase()))
  const common = commonNames.value
    .filter((commonName) => !existingNames.has(commonName.name.trim().toLocaleLowerCase()))
    .map((commonName) => ({ value: commonName.name, label: commonName.name }))
  return [...existing, ...common]
})
const correctedMovementIds = computed(() => new Set(movements.value.flatMap((movement) => movement.correctionOfId ? [movement.correctionOfId] : [])))
const correctableMovementIds = computed(() => movements.value.filter(isCorrectable).map((movement) => movement.id))

const rules: FormRules<typeof form> = {
  occurredOn: [{ required: true, message: '请选择入库日期', trigger: 'change' }],
  name: [{ required: true, message: '请选择或填写药品名称', trigger: 'change' }],
  unit: [{ required: true, message: '请选择药品单位', trigger: 'change' }],
  quantity: [
    { required: true, message: '请输入数量', trigger: 'change' },
    { validator: validateQuantity, trigger: 'change' }
  ]
}

onMounted(() => {
  void Promise.all([loadItems(), loadCommonNames(), loadHistory()])
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

async function loadCommonNames() {
  try {
    commonNames.value = await getMedicineCommonNames()
  } catch (error) {
    commonNames.value = []
    ElMessage.error(errorMessage(error, '常用药品名称加载失败，请稍后重试'))
  }
}

async function loadHistory() {
  const requestId = ++historyRequestId
  const [startDate, endDate] = historyDateRange.value || []
  historyLoading.value = true
  historyError.value = ''
  movements.value = []
  try {
    const result = await getMedicineMovements('inbound', {
      ...(historyMedicineItemIds.value.length ? { medicineItemIds: historyMedicineItemIds.value } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {})
    })
    if (requestId !== historyRequestId) return
    movements.value = result
  } catch (error) {
    if (requestId !== historyRequestId) return
    movements.value = []
    historyError.value = errorMessage(error, '入库明细加载失败，请稍后重试')
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

function queryMedicineSuggestions(query: string, callback: (suggestions: Array<{ value: string; label: string; item?: MedicineInventoryItem }>) => void) {
  const keyword = query.trim().toLocaleLowerCase()
  callback(keyword ? medicineSuggestions.value.filter((suggestion) => suggestion.label.toLocaleLowerCase().includes(keyword)) : medicineSuggestions.value)
}

function handleMedicineNameInput() {
  if (!selectedExistingItemId.value) return
  selectedExistingItemId.value = ''
  form.unit = ''
}

function handleMedicineSuggestion(suggestion: { value: string; item?: MedicineInventoryItem }) {
  form.name = suggestion.value
  selectedExistingItemId.value = suggestion.item?.id || ''
  form.unit = suggestion.item?.unit || ''
}

async function saveCommonName() {
  const name = commonNameInput.value.trim()
  if (!name) {
    ElMessage.warning('请填写常用药品名称')
    return
  }
  commonNamesSaving.value = true
  try {
    await createMedicineCommonName({ name })
    commonNameInput.value = ''
    await loadCommonNames()
    ElMessage.success('常用药品名称已添加')
  } catch (error) {
    ElMessage.error(errorMessage(error, '常用药品名称添加失败，请稍后重试'))
  } finally {
    commonNamesSaving.value = false
  }
}

async function removeCommonName(commonNameId: string) {
  try {
    await deleteMedicineCommonName(commonNameId)
    commonNames.value = commonNames.value.filter((commonName) => commonName.id !== commonNameId)
    ElMessage.success('常用药品名称已移除')
  } catch (error) {
    ElMessage.error(errorMessage(error, '常用药品名称移除失败，请稍后重试'))
  }
}

async function handleSubmit() {
  if (submitPending) return
  submitPending = true
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !form.unit) {
    submitPending = false
    return
  }

  const quantity = validateMedicineQuantity(form.unit, form.quantity)
  if (!quantity.ok) {
    submitPending = false
    return
  }

  try {
    await ElMessageBox.confirm(`确认入库 ${quantity.value} ${unitLabel(form.unit)} 的“${form.name}”？`, '确认入库', {
      confirmButtonText: '确认入库',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    submitPending = false
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
    submitPending = false
  }
}

function resetForm() {
  selectedExistingItemId.value = ''
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
  if (correctionSubmitPending) return
  const reason = correctionReason.value.trim()
  if (!reason) {
    ElMessage.warning('请填写更正原因')
    return
  }
  correctionSubmitPending = true
  try {
    await ElMessageBox.confirm('确认创建反向更正流水？原入库记录不会被修改。', '二次确认更正', {
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

.medicine-common-names {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #e4ebf3;

  h3 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  p {
    margin: 0;
  }
}

.medicine-common-names__entry {
  display: flex;
  max-width: 520px;
  gap: 8px;
}

.medicine-common-names__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
