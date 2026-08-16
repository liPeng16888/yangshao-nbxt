<template>
  <PageShell class="employee-compensation-page" title="提成与奖金" description="维护提成默认单价，按数量计算提成，并支持同一员工多笔奖金记录。" :dirty="commissionVisible || bonusVisible || Boolean(typeEditingId)" @refresh="load">
    <MobileCompensationList v-if="isMobileLayout" :tab="tab" :commissions="store.commissions" :types="store.commissionTypes" :bonuses="store.bonuses" :employees="store.employees" :month="store.month" :employee-id="store.employeeId" :busy="operationBusy" :save-status="saveStatus" :pending-ids="pendingIds" @change-tab="tab=$event" @create-commission="openCommission()" @edit-commission="openCommission" @remove-commission="removeCommission" @create-type="openTypeCreate" @edit-type="editType" @remove-type="removeType" @create-bonus="openBonus()" @edit-bonus="openBonus" @remove-bonus="removeBonus" />
    <template v-else>
      <div class="toolbar"><el-date-picker :model-value="store.startDate" value-format="YYYY-MM-DD" placeholder="开始日期" clearable @update:model-value="changeStartDate"/><span>至</span><el-date-picker :model-value="store.endDate" value-format="YYYY-MM-DD" placeholder="结束日期" clearable @update:model-value="changeEndDate"/></div>
      <el-tabs v-model="tab">
        <el-tab-pane label="提成记录" name="records"><div class="toolbar"><el-button type="primary" @click="openCommission()">新增提成</el-button></div><el-table :data="store.commissions" empty-text="暂无提成记录"><el-table-column prop="date" label="日期"/><el-table-column label="员工"><template #default="{row}">{{nameOf(row.employeeId)}}</template></el-table-column><el-table-column label="类型"><template #default="{row}">{{commissionName(row.commissionTypeId)}}</template></el-table-column><el-table-column prop="quantity" label="数量"/><el-table-column prop="unitPrice" label="单价"/><el-table-column label="金额"><template #default="{row}"><span class="money">¥{{row.amount.toFixed(2)}}</span></template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button link type="primary" :disabled="!!row.lockedAt" @click="openCommission(row)">编辑</el-button><el-button link type="danger" :disabled="!!row.lockedAt" @click="removeCommission(row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="提成类型" name="types"><div class="toolbar"><el-input v-model="typeForm.name" placeholder="类型"/><el-input v-model="typeForm.unitName" placeholder="单位"/><el-input-number v-model="typeForm.unitPrice" :min="0"/><el-switch v-model="typeForm.active" active-text="启用" inactive-text="停用"/><el-button type="primary" :loading="typeSaving" :disabled="operationBusy" @click="saveType">{{typeEditingId?'保存修改':'新增类型'}}</el-button><el-button v-if="typeEditingId" :disabled="operationBusy" @click="resetType">取消编辑</el-button></div><el-table :data="store.commissionTypes"><el-table-column prop="name" label="类型"/><el-table-column prop="unitName" label="单位"/><el-table-column prop="unitPrice" label="默认单价"/><el-table-column label="状态"><template #default="{row}">{{row.active?'启用':'停用'}} <el-tag v-if="row.referenced" size="small" type="warning">已使用，仅可停用</el-tag></template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button link type="primary" :disabled="operationBusy||row.referenced" @click="editType(row)">编辑</el-button><el-button link type="danger" :disabled="operationBusy" @click="removeType(row)">删除/停用</el-button></template></el-table-column></el-table></el-tab-pane>
        <el-tab-pane label="奖金记录" name="bonuses"><div class="toolbar"><el-button type="primary" @click="openBonus()">新增奖金</el-button></div><el-table :data="store.bonuses" empty-text="暂无奖金记录"><el-table-column prop="date" label="日期"/><el-table-column label="员工"><template #default="{row}">{{nameOf(row.employeeId)}}</template></el-table-column><el-table-column label="金额"><template #default="{row}"><span class="money">¥{{row.amount.toFixed(2)}}</span></template></el-table-column><el-table-column prop="reason" label="发放原因"/><el-table-column label="操作"><template #default="{row}"><el-button link type="primary" :disabled="!!row.lockedAt" @click="openBonus(row)">编辑</el-button><el-button link type="danger" :disabled="!!row.lockedAt" @click="removeBonus(row)">删除</el-button></template></el-table-column></el-table></el-tab-pane>
      </el-tabs>
    </template>
  </PageShell>

  <component :is="recordEditorComponent" v-model="commissionVisible" v-bind="commissionEditorProps" data-testid="mobile-commission-editor" class="compensation-editor" :title="commissionEditingId?'编辑提成':'新增提成'">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false"/><el-form label-position="top"><el-form-item label="员工" required><el-select v-model="commissionForm.employeeId" data-testid="commission-employee"><el-option v-for="row in store.activeEmployees" :key="row.id" :label="row.name" :value="row.id"/></el-select></el-form-item><el-form-item label="提成类型" required><el-select v-model="commissionForm.commissionTypeId" data-testid="commission-type"><el-option v-for="row in store.commissionTypes.filter(item=>item.active||item.id===commissionForm.commissionTypeId)" :key="row.id" :label="`${row.name}${row.active?'':'（已停用）'} ¥${row.unitPrice}/${row.unitName}`" :value="row.id"/></el-select></el-form-item><el-form-item label="日期"><el-date-picker v-model="commissionForm.date" data-testid="commission-date" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="数量"><input v-if="isMobileLayout" v-model.number="commissionForm.quantity" data-testid="commission-quantity" class="native-number" type="number" inputmode="decimal" min="0" step="any"/><el-input-number v-else v-model="commissionForm.quantity" :min="0"/></el-form-item><el-form-item label="手工单价（留空使用默认值）"><input v-if="isMobileLayout" v-model.number="commissionForm.unitPrice" data-testid="commission-unit-price" class="native-number" type="number" inputmode="decimal" min="0" step="any"/><el-input-number v-else v-model="commissionForm.unitPrice" :min="0"/></el-form-item><el-form-item label="备注"><el-input v-model="commissionForm.remark" data-testid="commission-remark"/></el-form-item></el-form>
    <template #footer><div class="editor-actions"><el-button :disabled="commissionSaving" @click="commissionVisible=false">取消</el-button><el-button data-testid="commission-save" type="primary" :loading="commissionSaving" :disabled="commissionSaving" @click="saveCommission">保存</el-button></div></template>
  </component>
  <component :is="recordEditorComponent" v-model="bonusVisible" v-bind="bonusEditorProps" data-testid="mobile-bonus-editor" class="compensation-editor" :title="bonusEditingId?'编辑奖金':'新增奖金'">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false"/><el-form label-position="top"><el-form-item label="员工" required><el-select v-model="bonusForm.employeeId" data-testid="bonus-employee"><el-option v-for="row in store.activeEmployees" :key="row.id" :label="row.name" :value="row.id"/></el-select></el-form-item><el-form-item label="日期"><el-date-picker v-model="bonusForm.date" data-testid="bonus-date" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="金额"><input v-if="isMobileLayout" v-model.number="bonusForm.amount" data-testid="bonus-amount" class="native-number" type="number" inputmode="decimal" min="0" step="0.01"/><el-input-number v-else v-model="bonusForm.amount" :min="0"/></el-form-item><el-form-item label="发放原因" required><el-input v-model="bonusForm.reason" data-testid="bonus-reason"/></el-form-item></el-form>
    <template #footer><div class="editor-actions"><el-button :disabled="bonusSaving" @click="bonusVisible=false">取消</el-button><el-button data-testid="bonus-save" type="primary" :loading="bonusSaving" :disabled="bonusSaving" @click="saveBonus">保存</el-button></div></template>
  </component>
  <MobileFullscreenDialog v-if="isMobileLayout" v-model="typeVisible" data-testid="mobile-commission-type-editor" class="compensation-editor" :title="typeEditingId?'编辑提成类型':'新增提成类型'" :saving="typeSaving" fullscreen>
    <el-alert v-if="typeFormError" :title="typeFormError" type="error" :closable="false"/><el-form label-position="top"><el-form-item label="类型" required><el-input v-model="typeForm.name" data-testid="commission-type-name"/></el-form-item><el-form-item label="单位" required><el-input v-model="typeForm.unitName" data-testid="commission-type-unit-name"/></el-form-item><el-form-item label="默认单价"><input v-model.number="typeForm.unitPrice" data-testid="commission-type-unit-price" class="native-number" type="number" inputmode="decimal" min="0" step="0.01"/></el-form-item><el-form-item label="状态"><el-switch v-model="typeForm.active" data-testid="commission-type-active" active-text="启用" inactive-text="停用"/></el-form-item></el-form><template #footer><div class="editor-actions"><el-button :disabled="operationBusy" @click="typeVisible=false">取消</el-button><el-button data-testid="commission-type-save" type="primary" :loading="typeSaving" :disabled="operationBusy" @click="saveType">保存</el-button></div></template>
  </MobileFullscreenDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElDialog, ElMessageBox } from 'element-plus'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import PageShell from './EmployeeAttendancePageShell.vue'
import MobileCompensationList, { type MobileCompensationTab } from './MobileCompensationList.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { BonusPayload, BonusRecord, CommissionPayload, CommissionRecord, CommissionType, CommissionTypePayload } from '@/types/employeeAttendance'

type EditorKind = 'commission' | 'bonus' | 'type'
type PageContext = { session: number; mobile: boolean }
type EditorContext = PageContext & {
  kind: EditorKind
  operation: number
  editorSession: number
  editingId: string
  revision: number
}

const store = useEmployeeAttendanceStore()
const { isMobileLayout } = useMobileLayout()
const tab = ref<MobileCompensationTab>('records')
const commissionVisible = ref(false)
const bonusVisible = ref(false)
const typeVisible = ref(false)
const formError = ref('')
const typeFormError = ref('')
const saveStatus = ref('已保存')
const typeEditingId = ref('')
const commissionEditingId = ref('')
const bonusEditingId = ref('')
const typeEditingUpdatedAt = ref('')
const commissionEditingUpdatedAt = ref('')
const bonusEditingUpdatedAt = ref('')
const commissionSaveOwner = ref<number | null>(null)
const bonusSaveOwner = ref<number | null>(null)
const typeSaveOwner = ref<number | null>(null)
const commissionSaving = computed(() => commissionSaveOwner.value !== null)
const bonusSaving = computed(() => bonusSaveOwner.value !== null)
const typeSaving = computed(() => typeSaveOwner.value !== null)
const pendingTokens = reactive(new Map<string, number>())
const pendingIds = computed(() => [...pendingTokens.keys()])
const operationBusy = computed(() => commissionSaving.value || bonusSaving.value || typeSaving.value || pendingTokens.size > 0)
const typeForm = reactive<CommissionTypePayload>({ name: '', unitName: '', unitPrice: 0, active: true })
const commissionForm = reactive<CommissionPayload>({ employeeId: '', commissionTypeId: '', date: dayjs().format('YYYY-MM-DD'), quantity: 1, unitPrice: undefined, remark: '' })
const bonusForm = reactive<BonusPayload>({ employeeId: '', date: dayjs().format('YYYY-MM-DD'), amount: 0, reason: '' })
const recordEditorComponent = computed(() => isMobileLayout.value ? MobileFullscreenDialog : ElDialog)
const commissionEditorProps = computed(() => isMobileLayout.value ? { saving: commissionSaving.value, fullscreen: true } : { width: '600px', closeOnClickModal: false })
const bonusEditorProps = computed(() => isMobileLayout.value ? { saving: bonusSaving.value, fullscreen: true } : { width: '560px', closeOnClickModal: false })

const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const isCancel = (error: unknown) => error === 'cancel' || error === 'close' || (error instanceof Error && ['cancel', 'close'].includes(error.message))

let pageActive = true
let pageSession = 0
let loadOperation = 0
let mutationOperation = 0
let commissionEditorSession = 0
let bonusEditorSession = 0
let typeEditorSession = 0
let commissionRevision = 0
let bonusRevision = 0
let typeRevision = 0
let commissionSaveOperation = 0
let bonusSaveOperation = 0
let typeSaveOperation = 0

watch(commissionForm, () => { commissionRevision += 1 }, { deep: true, flush: 'sync' })
watch(bonusForm, () => { bonusRevision += 1 }, { deep: true, flush: 'sync' })
watch(typeForm, () => { typeRevision += 1 }, { deep: true, flush: 'sync' })
watch(commissionVisible, (open, previous) => {
  if (previous && !open) {
    commissionEditorSession += 1
    formError.value = ''
  }
})
watch(bonusVisible, (open, previous) => {
  if (previous && !open) {
    bonusEditorSession += 1
    formError.value = ''
  }
})
watch(typeVisible, (open, previous) => {
  if (previous && !open) {
    typeEditorSession += 1
    typeFormError.value = ''
  }
})
watch(isMobileLayout, () => {
  replacePageSession()
  void load()
})

function replacePageSession() {
  pageSession += 1
  loadOperation += 1
  commissionEditorSession += 1
  bonusEditorSession += 1
  typeEditorSession += 1
  commissionSaveOperation += 1
  bonusSaveOperation += 1
  typeSaveOperation += 1
  commissionSaveOwner.value = null
  bonusSaveOwner.value = null
  typeSaveOwner.value = null
  commissionVisible.value = false
  bonusVisible.value = false
  typeVisible.value = false
  pendingTokens.clear()
}

function nameOf(id: string) {
  return store.employees.find((row) => row.id === id)?.name || '-'
}

function commissionName(id: string) {
  return store.commissionTypes.find((row) => row.id === id)?.name || '-'
}

function current(context: PageContext) {
  return pageActive && context.session === pageSession && context.mobile === isMobileLayout.value
}

function editorCurrent(context: EditorContext) {
  const visible = context.kind === 'commission'
    ? commissionVisible.value
    : context.kind === 'bonus'
      ? bonusVisible.value
      : context.mobile ? typeVisible.value : !isMobileLayout.value
  const operation = context.kind === 'commission'
    ? commissionSaveOperation
    : context.kind === 'bonus' ? bonusSaveOperation : typeSaveOperation
  const editorSession = context.kind === 'commission'
    ? commissionEditorSession
    : context.kind === 'bonus' ? bonusEditorSession : typeEditorSession
  const editingId = context.kind === 'commission'
    ? commissionEditingId.value
    : context.kind === 'bonus' ? bonusEditingId.value : typeEditingId.value
  return current(context)
    && visible
    && context.operation === operation
    && context.editorSession === editorSession
    && context.editingId === editingId
}

async function load() {
  const context = { operation: ++loadOperation, session: pageSession, mobile: isMobileLayout.value }
  const query = store.dateQuery()
  try {
    const [types, commissions, bonuses] = await store.runQuiet(() => Promise.all([
      api.getCommissionTypes(), api.getCommissions(query), api.getBonuses(query)
    ]))
    if (!current(context) || context.operation !== loadOperation) return
    store.commissionTypes = types
    store.commissions = commissions
    store.bonuses = bonuses
  } catch (error) {
    if (current(context) && context.operation === loadOperation) {
      store.setError(errorText(error, '提成与奖金加载失败'))
    }
  }
}

async function changeStartDate(value: unknown) {
  store.selectDateRange(typeof value === 'string' ? value : '', store.endDate)
  await load()
}

async function changeEndDate(value: unknown) {
  store.selectDateRange(store.startDate, typeof value === 'string' ? value : '')
  await load()
}

function openCommission(row?: CommissionRecord) {
  if (row?.lockedAt) return
  commissionEditorSession += 1
  commissionEditingId.value = row?.id || ''
  commissionEditingUpdatedAt.value = row?.updatedAt || ''
  Object.assign(commissionForm, row ? {
    employeeId: row.employeeId,
    commissionTypeId: row.commissionTypeId,
    date: row.date,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    remark: row.remark || ''
  } : {
    employeeId: store.employeeId || store.activeEmployees[0]?.id || '',
    commissionTypeId: store.commissionTypes.find((item) => item.active)?.id || '',
    date: dayjs().format('YYYY-MM-DD'),
    quantity: 1,
    unitPrice: undefined,
    remark: ''
  })
  formError.value = ''
  saveStatus.value = '已保存'
  commissionVisible.value = true
}

function openBonus(row?: BonusRecord) {
  if (row?.lockedAt) return
  bonusEditorSession += 1
  bonusEditingId.value = row?.id || ''
  bonusEditingUpdatedAt.value = row?.updatedAt || ''
  Object.assign(bonusForm, row ? {
    employeeId: row.employeeId,
    date: row.date,
    amount: row.amount,
    reason: row.reason
  } : {
    employeeId: store.employeeId || store.activeEmployees[0]?.id || '',
    date: dayjs().format('YYYY-MM-DD'),
    amount: 0,
    reason: ''
  })
  formError.value = ''
  saveStatus.value = '已保存'
  bonusVisible.value = true
}

function resetType() {
  typeEditorSession += 1
  typeEditingId.value = ''
  typeEditingUpdatedAt.value = ''
  typeFormError.value = ''
  Object.assign(typeForm, { name: '', unitName: '', unitPrice: 0, active: true })
  typeVisible.value = false
}

function openTypeCreate() {
  typeEditorSession += 1
  typeEditingId.value = ''
  typeEditingUpdatedAt.value = ''
  Object.assign(typeForm, { name: '', unitName: '', unitPrice: 0, active: true })
  typeFormError.value = ''
  typeVisible.value = true
}

function editType(row: CommissionType) {
  if (row.referenced) return
  typeEditorSession += 1
  typeEditingId.value = row.id
  typeEditingUpdatedAt.value = row.updatedAt || ''
  Object.assign(typeForm, { name: row.name, unitName: row.unitName, unitPrice: row.unitPrice, active: row.active })
  typeFormError.value = ''
  if (isMobileLayout.value) typeVisible.value = true
}

function commissionContext(): EditorContext {
  const operation = ++commissionSaveOperation
  commissionSaveOwner.value = operation
  return {
    kind: 'commission', operation, session: pageSession, editorSession: commissionEditorSession,
    editingId: commissionEditingId.value, revision: commissionRevision, mobile: isMobileLayout.value
  }
}

function bonusContext(): EditorContext {
  const operation = ++bonusSaveOperation
  bonusSaveOwner.value = operation
  return {
    kind: 'bonus', operation, session: pageSession, editorSession: bonusEditorSession,
    editingId: bonusEditingId.value, revision: bonusRevision, mobile: isMobileLayout.value
  }
}

function typeContext(): EditorContext {
  const operation = ++typeSaveOperation
  typeSaveOwner.value = operation
  return {
    kind: 'type', operation, session: pageSession, editorSession: typeEditorSession,
    editingId: typeEditingId.value, revision: typeRevision, mobile: isMobileLayout.value
  }
}

async function saveCommission() {
  if (commissionSaving.value) return
  const invalid = !commissionForm.employeeId || !commissionForm.commissionTypeId || !commissionForm.date
    || !Number.isFinite(commissionForm.quantity) || commissionForm.quantity <= 0
    || (commissionForm.unitPrice !== undefined && (!Number.isFinite(commissionForm.unitPrice) || commissionForm.unitPrice < 0))
  if (invalid) {
    formError.value = '请填写有效的提成信息'
    saveStatus.value = '保存失败'
    return
  }

  const context = commissionContext()
  const payload = { ...commissionForm }
  formError.value = ''
  saveStatus.value = '保存中…'
  store.clearError()
  try {
    const saved = await store.runQuiet(() => commissionEditingUpdatedAt.value
      ? api.saveCommission(payload, context.editingId || undefined, commissionEditingUpdatedAt.value)
      : api.saveCommission(payload, context.editingId || undefined), true)
    if (!editorCurrent(context)) return
    if (!context.editingId) commissionEditingId.value = saved.id
    if (context.revision !== commissionRevision) {
      saveStatus.value = '有较新输入待保存'
      return
    }
    commissionVisible.value = false
    saveStatus.value = '保存成功'
    await load()
  } catch (error) {
    if (editorCurrent(context)) {
      formError.value = errorText(error, '提成保存失败')
      saveStatus.value = '保存失败'
    }
  } finally {
    if (commissionSaveOwner.value === context.operation) commissionSaveOwner.value = null
  }
}

async function saveBonus() {
  if (bonusSaving.value) return
  const invalid = !bonusForm.employeeId || !bonusForm.date || !Number.isFinite(bonusForm.amount)
    || bonusForm.amount <= 0 || !bonusForm.reason.trim()
  if (invalid) {
    formError.value = '请填写有效的奖金信息'
    saveStatus.value = '保存失败'
    return
  }

  const context = bonusContext()
  const payload = { ...bonusForm }
  formError.value = ''
  saveStatus.value = '保存中…'
  store.clearError()
  try {
    const saved = await store.runQuiet(() => bonusEditingUpdatedAt.value
      ? api.saveBonus(payload, context.editingId || undefined, bonusEditingUpdatedAt.value)
      : api.saveBonus(payload, context.editingId || undefined), true)
    if (!editorCurrent(context)) return
    if (!context.editingId) bonusEditingId.value = saved.id
    if (context.revision !== bonusRevision) {
      saveStatus.value = '有较新输入待保存'
      return
    }
    bonusVisible.value = false
    saveStatus.value = '保存成功'
    await load()
  } catch (error) {
    if (editorCurrent(context)) {
      formError.value = errorText(error, '奖金保存失败')
      saveStatus.value = '保存失败'
    }
  } finally {
    if (bonusSaveOwner.value === context.operation) bonusSaveOwner.value = null
  }
}

async function saveType() {
  if (typeSaving.value || pendingTokens.size > 0) return
  const invalid = !typeForm.name.trim() || !typeForm.unitName.trim()
    || !Number.isFinite(typeForm.unitPrice) || typeForm.unitPrice < 0
  if (invalid) {
    const message = '请填写有效的类型、单位和单价'
    if (isMobileLayout.value) typeFormError.value = message
    else store.setError(message)
    return
  }

  const context = typeContext()
  const payload = { ...typeForm }
  typeFormError.value = ''
  saveStatus.value = '保存中…'
  store.clearError()
  try {
    const saved = await store.runQuiet(() => typeEditingUpdatedAt.value
      ? api.saveCommissionType(payload, context.editingId || undefined, typeEditingUpdatedAt.value)
      : api.saveCommissionType(payload, context.editingId || undefined), true)
    if (!editorCurrent(context)) return
    if (!context.editingId) typeEditingId.value = saved.id
    if (context.revision !== typeRevision) {
      saveStatus.value = '有较新输入待保存'
      return
    }
    resetType()
    saveStatus.value = '保存成功'
    await load()
  } catch (error) {
    if (editorCurrent(context)) {
      const message = errorText(error, '提成类型保存失败')
      typeFormError.value = message
      if (!isMobileLayout.value) store.setError(message)
      saveStatus.value = '保存失败'
    }
  } finally {
    if (typeSaveOwner.value === context.operation) typeSaveOwner.value = null
  }
}

async function removeCommission(row: CommissionRecord) {
  if (row.lockedAt || pendingTokens.has(row.id)) return
  await removeRecord(row.id, '提成记录', () => api.deleteCommission(row.updatedAt ? row : row.id))
}

async function removeBonus(row: BonusRecord) {
  if (row.lockedAt || pendingTokens.has(row.id)) return
  await removeRecord(row.id, '奖金记录', () => api.deleteBonus(row.updatedAt ? row : row.id))
}

async function removeType(row: CommissionType) {
  if (pendingTokens.has(row.id) || operationBusy.value) return
  await removeRecord(row.id, '提成类型', () => api.deleteCommissionType(row.updatedAt ? row : row.id))
}

async function removeRecord(id: string, label: string, action: () => Promise<unknown>) {
  const token = ++mutationOperation
  const context = { session: pageSession, mobile: isMobileLayout.value }
  pendingTokens.set(id, token)
  try {
    if (context.mobile) {
      await ElMessageBox.confirm(
        `${label}删除或停用后需重新录入才能恢复，是否继续？`,
        `确认${label}操作`,
        { type: 'warning' }
      )
    }
    if (!current(context) || pendingTokens.get(id) !== token) return
    await store.runQuiet(action, true)
    if (!current(context) || pendingTokens.get(id) !== token) return
    saveStatus.value = '保存成功'
    await load()
  } catch (error) {
    if (current(context) && pendingTokens.get(id) === token && !isCancel(error)) {
      store.setError(errorText(error, `${label}操作失败`))
      saveStatus.value = '保存失败'
    }
  } finally {
    if (pendingTokens.get(id) === token) pendingTokens.delete(id)
  }
}

onMounted(load)
onBeforeUnmount(() => {
  pageActive = false
  replacePageSession()
})
</script>

<style scoped>
.native-number{box-sizing:border-box;width:100%;min-height:44px;padding:8px 11px;color:#1f2937;background:#fff;border:1px solid #dcdfe6;border-radius:4px;font:inherit}.editor-actions{display:flex;justify-content:flex-end;gap:10px}.compensation-editor.mobile-fullscreen-dialog--active :deep(.el-input__wrapper),.compensation-editor.mobile-fullscreen-dialog--active :deep(.el-select__wrapper),.compensation-editor.mobile-fullscreen-dialog--active :deep(.el-date-editor),.compensation-editor.mobile-fullscreen-dialog--active :deep(.el-switch){min-height:44px}@media(max-width:767px){.editor-actions{padding-bottom:max(4px,env(safe-area-inset-bottom))}.editor-actions .el-button{min-height:44px;flex:1;margin-left:0}}
</style>
