<template>
  <PageShell class="employee-payroll-page" title="工资统计" description="生成月度工资草稿，查看计算快照，增加正负调整，确认后锁定源记录。" :show-employee="false" :dirty="adjustmentVisible" @refresh="load">
    <template #actions>
      <el-button
        data-testid="payroll-generate"
        type="primary"
        :class="{ 'mobile-touch-target': isMobileLayout }"
        :loading="payrollBusy"
        :disabled="payrollBusy"
        @click="generate"
      >
        生成/刷新草稿
      </el-button>
    </template>
    <el-empty v-if="!store.payroll" description="当月尚未生成工资草稿" />
    <MobilePayrollList v-else-if="isMobileLayout" :run="store.payroll" :busy="payrollBusy" :pending-ids="pendingIds" @adjust="openAdjustment" @remove-adjustment="removeAdjustment" @confirm="confirm" @reopen="reopen" @export-summary="openSummaryExport" @export-employee="openEmployeeExport" />
    <template v-else>
      <div class="payroll-summary"><div><span>工资状态</span><el-tag :type="store.payroll.status==='CONFIRMED'?'success':'warning'">{{store.payroll.status==='CONFIRMED'?'已确认':'草稿'}}</el-tag></div><div><span>应发合计</span><strong>¥{{store.payroll.totalAmount.toFixed(2)}}</strong></div><div><span>阻断问题</span><strong>{{store.payroll.issueCount}}</strong></div><div class="summary-actions"><el-button v-if="store.payroll.status==='DRAFT'" type="success" :disabled="store.payroll.issueCount>0" @click="confirm">确认工资并锁定</el-button><el-button v-else type="warning" @click="reopen">撤销确认</el-button><el-button data-testid="export-payroll-summary" @click="openSummaryExport">导出全员汇总 PNG</el-button></div></div>
      <el-alert v-for="issue in store.payroll.issues" :key="issue" :title="issue" type="warning" :closable="false" show-icon class="issue"/>
      <el-table :data="store.payroll.items" empty-text="暂无工资明细"><el-table-column label="员工" width="110"><template #default="{row}">{{row.employee.name}}</template></el-table-column><el-table-column label="基本工资"><template #default="{row}">¥{{row.calculationSnapshot.input.baseSalary.toFixed(2)}}</template></el-table-column><el-table-column label="加班费"><template #default="{row}">¥{{row.calculationSnapshot.result.overtimePay.toFixed(2)}}</template></el-table-column><el-table-column label="提成+奖金"><template #default="{row}">¥{{(row.calculationSnapshot.result.commissionAmount+row.calculationSnapshot.result.bonusAmount).toFixed(2)}}</template></el-table-column><el-table-column label="人工调整"><template #default="{row}"><div v-for="adjustmentRow in row.adjustments" :key="adjustmentRow.id">{{adjustmentRow.amount>0?'+':''}}{{adjustmentRow.amount.toFixed(2)}} · {{adjustmentRow.reason}} <template v-if="store.payroll?.status==='DRAFT'"><el-button link type="primary" @click="openAdjustment(row.id,adjustmentRow)">编辑</el-button><el-button link type="danger" @click="removeAdjustment(adjustmentRow)">删除</el-button></template></div><el-button v-if="store.payroll?.status==='DRAFT'" link type="primary" @click="openAdjustment(row.id)">增加调整</el-button></template></el-table-column><el-table-column label="应发工资"><template #default="{row}"><span class="money">¥{{row.payableAmount.toFixed(2)}}</span></template></el-table-column><el-table-column label="操作" width="145"><template #default="{row}"><el-button data-testid="export-payroll-slip" link type="primary" @click="openEmployeeExport(row)">导出工资条 PNG</el-button><el-popover v-if="row.issues.length" trigger="hover" :content="row.issues.join('；')"><template #reference><el-tag type="warning">异常 {{row.issues.length}}</el-tag></template></el-popover></template></el-table-column></el-table>
    </template>
  </PageShell>
  <component :is="adjustmentEditorComponent" v-model="adjustmentVisible" v-bind="adjustmentEditorProps" data-testid="mobile-payroll-adjustment-editor" class="payroll-adjustment-editor" :title="adjustmentEditingId?'编辑工资调整':'增加工资调整'">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false"/><p v-if="adjustmentSaveStatus" data-testid="payroll-adjustment-save-status" role="status" aria-live="polite">{{ adjustmentSaveStatus }}</p><el-form label-position="top"><el-form-item label="调整金额（可为负数）" required><input v-if="isMobileLayout" v-model.number="adjustment.amount" data-testid="payroll-adjustment-amount" class="native-number" type="number" inputmode="decimal" step="0.01"/><el-input-number v-else v-model="adjustment.amount"/></el-form-item><el-form-item label="调整原因" required><el-input v-model="adjustment.reason" data-testid="payroll-adjustment-reason"/></el-form-item></el-form><template #footer><div class="adjustment-actions"><el-button :disabled="adjustmentSaving" @click="adjustmentVisible=false">取消</el-button><el-button data-testid="payroll-adjustment-save" type="primary" :loading="adjustmentSaving" :disabled="adjustmentSaving" @click="saveAdjustment">保存</el-button></div></template>
  </component>
  <PayrollExportDialog :visible="exportVisible" :run="store.payroll" :item="exportItem" @close="closeExport"/>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElDialog, ElMessage, ElMessageBox } from 'element-plus'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import PayrollExportDialog from '@/components/employee-attendance/PayrollExportDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import PageShell from './EmployeeAttendancePageShell.vue'
import MobilePayrollList from './MobilePayrollList.vue'
import { syncPendingLeaveIssue, useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { PayrollAdjustment, PayrollItem } from '@/types/employeeAttendance'

type PageContext = { session: number; mobile: boolean }
type PayrollIdentity = { month: string; runId: string | null; itemId?: string }
type ActionContext = PageContext & PayrollIdentity & { operation: number }
type AdjustmentContext = ActionContext & {
  editorSession: number
  editingId: string
  itemId: string
  revision: number
}

const store = useEmployeeAttendanceStore()
const { isMobileLayout } = useMobileLayout()
const adjustmentVisible = ref(false)
const adjustmentItemId = ref('')
const adjustmentEditingId = ref('')
const adjustmentEditingUpdatedAt = ref('')
const adjustmentEditorIdentity = ref<PayrollIdentity | null>(null)
const formError = ref('')
const adjustmentSaveStatus = ref('')
const exportVisible = ref(false)
const exportItem = ref<PayrollItem | null>(null)
const adjustment = reactive({ amount: 0, reason: '' })
const adjustmentSaveOwner = ref<number | null>(null)
const actionOwner = ref<number | null>(null)
const adjustmentSaving = computed(() => adjustmentSaveOwner.value !== null)
const actionBusy = computed(() => actionOwner.value !== null)
const pendingTokens = reactive(new Map<string, number>())
const pendingIds = computed(() => [...pendingTokens.keys()])
const payrollBusy = computed(() => adjustmentSaving.value || actionBusy.value || pendingTokens.size > 0)
const adjustmentEditorComponent = computed(() => isMobileLayout.value ? MobileFullscreenDialog : ElDialog)
const adjustmentEditorProps = computed(() => isMobileLayout.value
  ? { saving: adjustmentSaving.value, fullscreen: true }
  : { width: '480px', closeOnClickModal: false })

const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const isCancel = (error: unknown) => error === 'cancel' || error === 'close' || (error instanceof Error && ['cancel', 'close'].includes(error.message))

let pageActive = true
let pageSession = 0
let loadOperation = 0
let actionOperation = 0
let adjustmentEditorSession = 0
let adjustmentRevision = 0
let adjustmentSaveOperation = 0
let mutationOperation = 0

watch(adjustment, () => { adjustmentRevision += 1 }, { deep: true, flush: 'sync' })
watch(adjustmentVisible, (open, previous) => {
  if (previous && !open) {
    adjustmentEditorSession += 1
    adjustmentEditorIdentity.value = null
    formError.value = ''
    adjustmentSaveStatus.value = ''
  }
})
watch(isMobileLayout, () => {
  invalidatePayrollSession()
  void load()
})
watch(() => store.month, () => { invalidatePayrollSession() }, { flush: 'sync' })
watch(() => store.payroll?.id ?? null, (id, previous) => {
  if (id !== previous) invalidatePayrollSession()
})

function invalidatePayrollSession() {
  pageSession += 1
  loadOperation += 1
  actionOperation += 1
  adjustmentSaveOperation += 1
  adjustmentEditorSession += 1
  actionOwner.value = null
  adjustmentSaveOwner.value = null
  adjustmentVisible.value = false
  adjustmentEditorIdentity.value = null
  exportVisible.value = false
  exportItem.value = null
  pendingTokens.clear()
}

function current(context: PageContext) {
  return pageActive && context.session === pageSession && context.mobile === isMobileLayout.value
}

function captureIdentity(itemId?: string): PayrollIdentity {
  return { month: store.month, runId: store.payroll?.id ?? null, ...(itemId ? { itemId } : {}) }
}

function identityCurrent(identity: PayrollIdentity) {
  const run = store.payroll
  if (store.month !== identity.month || (run?.id ?? null) !== identity.runId) return false
  if (run && run.month !== identity.month) return false
  return !identity.itemId || Boolean(run?.items.some((item) => item.id === identity.itemId))
}

function actionCurrent(context: ActionContext, status?: 'DRAFT' | 'CONFIRMED') {
  return current(context)
    && actionOwner.value === context.operation
    && identityCurrent(context)
    && (!status || store.payroll?.status === status)
}

function editorCurrent(context: AdjustmentContext) {
  return current(context)
    && adjustmentSaveOwner.value === context.operation
    && identityCurrent(context)
    && adjustmentVisible.value
    && context.editorSession === adjustmentEditorSession
    && context.editingId === adjustmentEditingId.value
    && context.itemId === adjustmentItemId.value
}

function beginAction(identity: PayrollIdentity): ActionContext {
  const operation = ++actionOperation
  actionOwner.value = operation
  return { ...identity, operation, session: pageSession, mobile: isMobileLayout.value }
}

async function load() {
  const context = { operation: ++loadOperation, session: pageSession, mobile: isMobileLayout.value }
  const month = store.month
  try {
    const [run, summary] = await store.runQuiet(() => Promise.all([api.getPayroll(month), api.getOverview(month)]))
    if (!current(context) || context.operation !== loadOperation || store.month !== month) return
    store.overview = summary
    if (run) syncPendingLeaveIssue(run, summary.pendingLeaves)
    store.payroll = run
  } catch (error) {
    if (current(context) && context.operation === loadOperation) {
      store.setError(errorText(error, '工资数据加载失败'))
    }
  }
}

async function generate() {
  if (actionBusy.value) return
  const context = beginAction(captureIdentity())
  store.clearError()
  try {
    const generated = await store.runQuiet(() => api.generatePayroll(context.month), true)
    if (!actionCurrent(context)) return
    const summary = await store.runQuiet(() => api.getOverview(context.month))
    if (!actionCurrent(context)) return
    syncPendingLeaveIssue(generated, summary.pendingLeaves)
    store.overview = summary
    store.payroll = generated
    ElMessage.success('工资草稿已生成')
  } catch (error) {
    if (actionCurrent(context)) store.setError(errorText(error, '工资草稿生成失败'))
  } finally {
    if (actionOwner.value === context.operation) actionOwner.value = null
  }
}

function openAdjustment(itemId: string, row?: PayrollAdjustment) {
  const run = store.payroll
  if (!run || run.status !== 'DRAFT' || !run.items.some((item) => item.id === itemId)) return
  if (row && row.payrollItemId !== itemId) return
  adjustmentEditorSession += 1
  adjustmentItemId.value = itemId
  adjustmentEditingId.value = row?.id || ''
  adjustmentEditingUpdatedAt.value = row?.updatedAt || ''
  adjustmentEditorIdentity.value = captureIdentity(itemId)
  Object.assign(adjustment, row ? { amount: row.amount, reason: row.reason } : { amount: 0, reason: '' })
  formError.value = ''
  adjustmentSaveStatus.value = '已保存'
  adjustmentVisible.value = true
}

async function saveAdjustment() {
  if (adjustmentSaving.value || store.payroll?.status !== 'DRAFT') return
  const editorIdentity = adjustmentEditorIdentity.value
  if (!editorIdentity || !identityCurrent(editorIdentity)) return
  if (!Number.isFinite(adjustment.amount) || adjustment.amount === 0 || !adjustment.reason.trim()) {
    formError.value = '请填写非零调整金额和原因'
    return
  }

  const operation = ++adjustmentSaveOperation
  adjustmentSaveOwner.value = operation
  const context: AdjustmentContext = {
    ...editorIdentity,
    itemId: adjustmentItemId.value,
    operation,
    session: pageSession,
    mobile: isMobileLayout.value,
    editorSession: adjustmentEditorSession,
    editingId: adjustmentEditingId.value,
    revision: adjustmentRevision
  }
  const payload = { ...adjustment }
  formError.value = ''
  adjustmentSaveStatus.value = '保存中…'
  store.clearError()
  try {
    if (!editorCurrent(context) || store.payroll?.status !== 'DRAFT') return
    const saved = await store.runQuiet(() => context.editingId
      ? (adjustmentEditingUpdatedAt.value
          ? api.updatePayrollAdjustment(context.editingId, payload, adjustmentEditingUpdatedAt.value)
          : api.updatePayrollAdjustment(context.editingId, payload))
      : api.createPayrollAdjustment(context.itemId, payload), true)
    if (!editorCurrent(context) || store.payroll?.status !== 'DRAFT') return
    if (!context.editingId) adjustmentEditingId.value = saved.id
    if (context.revision !== adjustmentRevision) {
      adjustmentSaveStatus.value = '有较新输入待保存'
      return
    }
    adjustmentVisible.value = false
    await load()
  } catch (error) {
    if (editorCurrent(context)) {
      formError.value = errorText(error, '保存失败')
      adjustmentSaveStatus.value = '保存失败'
    }
  } finally {
    if (adjustmentSaveOwner.value === context.operation) adjustmentSaveOwner.value = null
  }
}

function adjustmentIdentity(row: PayrollAdjustment) {
  const run = store.payroll
  const item = run?.items.find((candidate) => candidate.id === row.payrollItemId)
  return item?.adjustments.some((candidate) => candidate.id === row.id)
    ? captureIdentity(item.id)
    : null
}

async function removeAdjustment(row: PayrollAdjustment) {
  if (store.payroll?.status !== 'DRAFT' || pendingTokens.has(row.id)) return
  const identity = adjustmentIdentity(row)
  if (!identity) return
  const token = ++mutationOperation
  const context = { ...identity, session: pageSession, mobile: isMobileLayout.value }
  pendingTokens.set(row.id, token)
  try {
    if (context.mobile) {
      await ElMessageBox.confirm(
        '删除工资调整后将重新计算工资草稿，是否继续？',
        '确认删除工资调整',
        { type: 'warning' }
      )
    }
    if (!current(context) || !identityCurrent(context)
      || pendingTokens.get(row.id) !== token || store.payroll?.status !== 'DRAFT') return
    await store.runQuiet(() => api.deletePayrollAdjustment(row.updatedAt ? row : row.id), true)
    if (!current(context) || !identityCurrent(context)
      || pendingTokens.get(row.id) !== token || store.payroll?.status !== 'DRAFT') return
    await load()
  } catch (error) {
    if (current(context) && identityCurrent(context) && pendingTokens.get(row.id) === token && !isCancel(error)) {
      store.setError(errorText(error, '工资调整删除失败'))
    }
  } finally {
    if (pendingTokens.get(row.id) === token) pendingTokens.delete(row.id)
  }
}

async function confirm() {
  const run = store.payroll
  if (!run || run.status !== 'DRAFT' || run.issueCount > 0 || actionBusy.value) return
  const context = beginAction(captureIdentity())
  try {
    await ElMessageBox.confirm(
      '确认后当月考勤、请假、提成和奖金将被锁定。',
      '确认工资',
      { type: 'warning' }
    )
    if (!actionCurrent(context, 'DRAFT')) return
    const confirmed = await store.runQuiet(() => api.confirmPayroll(context.runId!), true)
    if (!actionCurrent(context, 'DRAFT')) return
    store.payroll = confirmed
  } catch (error) {
    if (actionCurrent(context) && !isCancel(error)) {
      store.setError(errorText(error, '工资确认失败'))
    }
  } finally {
    if (actionOwner.value === context.operation) actionOwner.value = null
  }
}

async function reopen() {
  const run = store.payroll
  if (!run || run.status !== 'CONFIRMED' || actionBusy.value) return
  const context = beginAction(captureIdentity())
  try {
    const { value } = await ElMessageBox.prompt(
      '撤销后可重新修改当月数据，请填写原因。',
      '撤销确认',
      { inputPattern: /\S+/, inputErrorMessage: '原因必填' }
    )
    if (!actionCurrent(context, 'CONFIRMED')) return
    const reopened = await store.runQuiet(() => api.reopenPayroll(context.runId!, value), true)
    if (!actionCurrent(context, 'CONFIRMED')) return
    store.payroll = reopened
  } catch (error) {
    if (actionCurrent(context) && !isCancel(error)) {
      store.setError(errorText(error, '撤销工资确认失败'))
    }
  } finally {
    if (actionOwner.value === context.operation) actionOwner.value = null
  }
}

function openSummaryExport() {
  if (!store.payroll) return
  exportItem.value = null
  exportVisible.value = true
}

function openEmployeeExport(item: PayrollItem) {
  exportItem.value = item
  exportVisible.value = true
}

function closeExport() {
  exportVisible.value = false
  exportItem.value = null
}

onMounted(() => {
  store.restoreMonthMode()
  void load()
})
onBeforeUnmount(() => {
  pageActive = false
  invalidatePayrollSession()
})
</script>

<style scoped>
.payroll-summary{display:flex;align-items:center;gap:28px;padding:14px;margin-bottom:12px;border:1px solid #dbe5f0;border-radius:7px;background:#f8fbff}.payroll-summary span{display:block;margin-bottom:6px;color:#64748b;font-size:12px}.payroll-summary strong{font-size:18px}.summary-actions{display:flex;gap:8px;margin-left:auto}.issue{margin:8px 0}.native-number{box-sizing:border-box;width:100%;min-height:44px;padding:8px 11px;color:#1f2937;background:#fff;border:1px solid #dcdfe6;border-radius:4px;font:inherit}.adjustment-actions{display:flex;justify-content:flex-end;gap:10px}.payroll-adjustment-editor.mobile-fullscreen-dialog--active :deep(.el-input__wrapper){min-height:44px}@media(max-width:767px){.adjustment-actions{padding-bottom:max(4px,env(safe-area-inset-bottom))}.adjustment-actions .el-button{min-height:44px;flex:1;margin-left:0}}
</style>
