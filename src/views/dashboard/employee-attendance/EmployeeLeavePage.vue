<template>
  <PageShell class="employee-leave-page" title="请假管理" description="自定义请假类型及是否占用月休额度，录入并审批整天、半天或小时请假。" employee-mode="leave-multiple" @refresh="load">
    <MobileLeaveList v-if="isMobileLayout" :tab="tab" :rows="store.leaves" :types="store.leaveTypes" :employees="store.employees" :filters="mobileFilters" :month="store.month" :busy="leaveSaving || typeOperationBusy" :pending-leave-ids="pendingLeaveIds" :pending-type-ids="pendingTypeIds" @change-tab="tab = $event" @apply-filters="applyMobileFilters" @create="openLeave()" @edit="openLeave" @approve="review($event, 'approve')" @reject="review($event, 'reject')" @remove="removeLeave" @create-type="openTypeCreate" @edit-type="editType" @remove-type="removeType" />

    <el-tabs v-else v-model="tab">
      <el-tab-pane label="请假记录" name="records">
        <div class="toolbar"><el-select v-model="store.leaveStatus" clearable placeholder="全部状态" style="width:130px" @change="load"><el-option label="待审批" value="PENDING"/><el-option label="已批准" value="APPROVED"/><el-option label="已驳回" value="REJECTED"/></el-select><el-date-picker :model-value="store.startDate" value-format="YYYY-MM-DD" placeholder="开始日期" clearable @update:model-value="changeStartDate"/><span>至</span><el-date-picker :model-value="store.endDate" value-format="YYYY-MM-DD" placeholder="结束日期" clearable @update:model-value="changeEndDate"/><el-button type="primary" @click="openLeave()">新增请假</el-button></div>
        <el-table :data="store.leaves" empty-text="暂无请假记录"><el-table-column label="员工"><template #default="{row}">{{nameOf(row.employeeId)}}</template></el-table-column><el-table-column label="类型"><template #default="{row}">{{typeName(row.leaveTypeId)}}</template></el-table-column><el-table-column label="日期"><template #default="{row}">{{row.startDate}} 至 {{row.endDate}}</template></el-table-column><el-table-column label="单位"><template #default="{row}">{{unitLabel[row.unit]}}{{row.unit==='HOUR'?` ${row.hours}小时`:''}}</template></el-table-column><el-table-column prop="reason" label="原因"/><el-table-column label="状态"><template #default="{row}"><el-tag :type="row.status==='APPROVED'?'success':row.status==='REJECTED'?'danger':'warning'">{{statusLabel[row.status]}}</el-tag></template></el-table-column><el-table-column label="操作" width="255"><template #default="{row}"><template v-if="row.status==='PENDING' && !row.lockedAt"><el-button link type="primary" @click="openLeave(row)">编辑</el-button><el-button link type="success" @click="review(row,'approve')">批准</el-button><el-button link type="danger" @click="review(row,'reject')">驳回</el-button><el-button link @click="removeLeave(row)">删除</el-button></template><span v-else class="muted">{{row.lockedAt?'工资已锁定':'已处理'}}</span></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane label="请假类型" name="types">
        <div class="toolbar"><el-input v-model="typeForm.name" placeholder="类型名称" style="width:180px"/><el-switch v-model="typeForm.countsTowardRestQuota" active-text="占月休额度"/><el-switch v-model="typeForm.active" active-text="启用" inactive-text="停用"/><el-button type="primary" :loading="typeSaving || store.saving" :disabled="typeOperationBusy" @click="saveType">{{typeEditingId?'保存修改':'新增类型'}}</el-button><el-button v-if="typeEditingId" :disabled="typeOperationBusy" @click="resetType">取消编辑</el-button></div>
        <el-table :data="store.leaveTypes"><el-table-column prop="name" label="类型"/><el-table-column label="占月休"><template #default="{row}">{{row.countsTowardRestQuota?'是':'否'}}</template></el-table-column><el-table-column label="状态"><template #default="{row}">{{row.active?'启用':'停用'}} <el-tag v-if="row.referenced" size="small" type="warning">已使用，仅可停用</el-tag></template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button link type="primary" :disabled="typeOperationBusy || row.referenced" @click="editType(row)">编辑</el-button><el-button link type="danger" :disabled="typeOperationBusy" @click="removeType(row)">删除/停用</el-button></template></el-table-column></el-table>
      </el-tab-pane>
    </el-tabs>
  </PageShell>

  <component :is="leaveEditorComponent" v-model="visible" v-bind="leaveEditorProps" data-testid="mobile-leave-editor" class="leave-editor-dialog" :title="leaveEditingId?'编辑请假':'新增请假'">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false"/><el-form label-position="top" class="form-grid leave-editor-form"><el-form-item label="员工" required><el-select v-model="form.employeeId"><el-option v-for="row in store.activeEmployees" :key="row.id" :label="row.name" :value="row.id"/></el-select></el-form-item><el-form-item label="请假类型" required><el-select v-model="form.leaveTypeId"><el-option v-for="row in store.leaveTypes.filter(item=>item.active || item.id===form.leaveTypeId)" :key="row.id" :label="row.active?row.name:`${row.name}（已停用）`" :value="row.id"/></el-select></el-form-item><el-form-item label="请假单位"><el-select v-model="form.unit"><el-option label="整天" value="FULL_DAY"/><el-option label="半天" value="HALF_DAY"/><el-option label="小时" value="HOUR"/></el-select></el-form-item><el-form-item label="开始日期"><el-date-picker v-model="form.startDate" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="结束日期"><el-date-picker v-model="form.endDate" value-format="YYYY-MM-DD"/></el-form-item><el-form-item v-if="form.unit==='HOUR'" label="小时数"><el-input-number v-model="form.hours" :min="0.01"/></el-form-item><el-form-item label="请假原因" required class="wide"><el-input v-model="form.reason" data-testid="leave-reason" type="textarea"/></el-form-item></el-form>
    <template #footer><div class="leave-editor-actions"><el-button :disabled="leaveSaving" @click="visible=false">取消</el-button><el-button data-testid="leave-save" type="primary" :loading="leaveSaving" :disabled="leaveSaving" @click="saveLeave">保存</el-button></div></template>
  </component>

  <MobileFullscreenDialog v-if="isMobileLayout" v-model="typeVisible" data-testid="mobile-leave-type-editor" class="leave-type-editor-dialog" :title="typeEditingId?'编辑请假类型':'新增请假类型'" :saving="typeSaving" fullscreen>
    <el-alert v-if="typeFormError" :title="typeFormError" type="error" :closable="false"/><el-form label-position="top" class="leave-type-editor-form"><el-form-item label="类型名称" required><el-input v-model="typeForm.name" data-testid="leave-type-name"/></el-form-item><el-form-item label="月休额度"><el-switch v-model="typeForm.countsTowardRestQuota" active-text="占用月休额度" inactive-text="不占用月休额度"/></el-form-item><el-form-item label="状态"><el-switch v-model="typeForm.active" active-text="启用" inactive-text="停用"/></el-form-item></el-form>
    <template #footer><div class="leave-editor-actions"><el-button :disabled="typeOperationBusy" @click="typeVisible=false">取消</el-button><el-button data-testid="leave-type-save" type="primary" :loading="typeSaving || store.saving" :disabled="typeOperationBusy" @click="saveType">保存</el-button></div></template>
  </MobileFullscreenDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElDialog, ElMessageBox } from 'element-plus'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import PageShell from './EmployeeAttendancePageShell.vue'
import MobileLeaveList, { type MobileLeaveFilters, type MobileLeaveTab } from './MobileLeaveList.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { LeaveRequest, LeaveRequestPayload, LeaveType } from '@/types/employeeAttendance'

const store = useEmployeeAttendanceStore(), { isMobileLayout } = useMobileLayout()
const tab = ref<MobileLeaveTab>('records'), visible = ref(false), typeVisible = ref(false)
const formError = ref(''), typeFormError = ref(''), leaveEditingId = ref(''), typeEditingId = ref(''), leaveSaving = ref(false), typeSaving = ref(false)
const reviewTokens = reactive(new Map<string, number>()), removeTokens = reactive(new Map<string, number>()), typeRemoveTokens = reactive(new Map<string, number>())
const pendingLeaveIds = computed(() => Array.from(new Set([...reviewTokens.keys(), ...removeTokens.keys()])))
const pendingTypeIds = computed(() => [...typeRemoveTokens.keys()])
const typeOperationBusy = computed(() => typeSaving.value || typeRemoveTokens.size > 0 || store.saving)
const unitLabel: Record<string, string> = { FULL_DAY: '整天', HALF_DAY: '半天', HOUR: '小时' }, statusLabel: Record<string, string> = { PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回' }
const typeForm = reactive({ name: '', active: true, countsTowardRestQuota: true })
const blank = (): LeaveRequestPayload => ({ employeeId: store.employeeId || store.activeEmployees[0]?.id || '', leaveTypeId: store.leaveTypes.find(row => row.active)?.id || '', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD'), unit: 'FULL_DAY', hours: undefined, reason: '' })
const form = reactive<LeaveRequestPayload>(blank())
const mobileFilters = computed<MobileLeaveFilters>(() => ({ employeeIds: [...store.leaveEmployeeIds], status: store.leaveStatus, startDate: store.startDate, endDate: store.endDate }))
const leaveEditorComponent = computed(() => isMobileLayout.value ? MobileFullscreenDialog : ElDialog)
const leaveEditorProps = computed(() => isMobileLayout.value ? { saving: leaveSaving.value, fullscreen: true } : { width: '650px', closeOnClickModal: false })
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const isCancel = (error: unknown) => error === 'cancel' || error === 'close' || (error instanceof Error && ['cancel', 'close'].includes(error.message))
let pageActive = true, pageSession = 0, leaveEditorSession = 0, leaveFormRevision = 0, leaveSaveOperation = 0, typeEditorSession = 0, typeFormRevision = 0, typeSaveOperation = 0, mutationOperation = 0
const leaveLoadControllers = new Set<AbortController>()

watch(form, () => { leaveFormRevision += 1 }, { deep: true, flush: 'sync' })
watch(typeForm, () => { typeFormRevision += 1 }, { deep: true, flush: 'sync' })
watch(visible, (open, previous) => { if (previous && !open) { leaveEditorSession += 1; formError.value = '' } })
watch(typeVisible, (open, previous) => { if (previous && !open) { typeEditorSession += 1; typeFormError.value = '' } })
watch(isMobileLayout, () => { pageSession += 1; cancelOwnedLoads(); leaveEditorSession += 1; typeEditorSession += 1; leaveSaveOperation += 1; typeSaveOperation += 1; visible.value = false; typeVisible.value = false; leaveSaving.value = false; typeSaving.value = false; reviewTokens.clear(); removeTokens.clear(); typeRemoveTokens.clear() })

function nameOf(id: string) { return store.employees.find(row => row.id === id)?.name || '-' }
function typeName(id: string) { return store.leaveTypes.find(row => row.id === id)?.name || '-' }
function contextCurrent(context: { session: number; mobile: boolean }) { return pageActive && context.session === pageSession && context.mobile === isMobileLayout.value }
function leaveEditorCurrent(context: { operation: number; session: number; editorSession: number; editingId: string; mobile: boolean }) { return contextCurrent(context) && visible.value && context.operation === leaveSaveOperation && context.editorSession === leaveEditorSession && context.editingId === leaveEditingId.value }
function typeEditorCurrent(context: { operation: number; session: number; editorSession: number; editingId: string; mobile: boolean }) { const editorOpen = context.mobile ? typeVisible.value : !isMobileLayout.value; return contextCurrent(context) && editorOpen && context.operation === typeSaveOperation && context.editorSession === typeEditorSession && context.editingId === typeEditingId.value }
function actionableLeave(id: string) { const row = store.leaves.find((item) => item.id === id); return row?.status === 'PENDING' && !row.lockedAt }
function cancelOwnedLoads() { for (const controller of leaveLoadControllers) controller.abort(); leaveLoadControllers.clear() }
async function load() {
  const context = { session: pageSession, mobile: isMobileLayout.value }
  if (!contextCurrent(context)) return
  const controller = new AbortController()
  leaveLoadControllers.add(controller)
  try { await store.loadLeaves({ signal: controller.signal, isCurrent: () => contextCurrent(context) }).catch(() => undefined) }
  finally { leaveLoadControllers.delete(controller) }
}
async function changeStartDate(value: unknown) { store.selectDateRange(typeof value === 'string' ? value : '', store.endDate); await load() }
async function changeEndDate(value: unknown) { store.selectDateRange(store.startDate, typeof value === 'string' ? value : ''); await load() }
async function applyMobileFilters(filters: MobileLeaveFilters) { store.leaveEmployeeIds = [...filters.employeeIds]; store.leaveStatus = filters.status; if (filters.startDate || filters.endDate) store.selectDateRange(filters.startDate, filters.endDate); else store.restoreMonthMode(); await load() }
function openLeave(row?: LeaveRequest) { if (row && (row.status !== 'PENDING' || row.lockedAt)) return; leaveEditorSession += 1; leaveEditingId.value = row?.id || ''; Object.assign(form, row ? { employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, startDate: row.startDate, endDate: row.endDate, unit: row.unit, hours: row.hours, reason: row.reason } : blank()); formError.value = ''; visible.value = true }
async function saveLeave() {
  if (leaveSaving.value) return
  if (!form.employeeId || !form.leaveTypeId || !form.startDate || !form.endDate || !form.reason.trim()) { formError.value = '请填写完整请假信息'; return }
  const context = { operation: ++leaveSaveOperation, session: pageSession, editorSession: leaveEditorSession, revision: leaveFormRevision, editingId: leaveEditingId.value, mobile: isMobileLayout.value }
  const payload: LeaveRequestPayload = { ...form }; leaveSaving.value = true; formError.value = ''; store.clearError()
  try { const saved = await store.runQuiet(() => api.saveLeave(payload, context.editingId || undefined), true); if (!leaveEditorCurrent(context)) return; if (!context.editingId && context.revision !== leaveFormRevision) { leaveEditingId.value = saved.id; return }; if (context.revision !== leaveFormRevision) return; visible.value = false; await load() }
  catch (error) { if (leaveEditorCurrent(context) && context.revision === leaveFormRevision) formError.value = errorText(error, '保存失败') }
  finally { if (pageActive && context.operation === leaveSaveOperation) leaveSaving.value = false }
}
async function review(row: LeaveRequest, action: 'approve' | 'reject') {
  if (!actionableLeave(row.id) || reviewTokens.has(row.id)) return
  const token = ++mutationOperation, context = { session: pageSession, mobile: isMobileLayout.value }; reviewTokens.set(row.id, token)
  try {
    let remark = ''
    if (context.mobile && action === 'approve') await ElMessageBox.confirm('批准后将按现有服务端规则计入排班与工资，是否继续？', '确认批准请假', { type: 'warning' })
    if (action === 'reject') { const result = context.mobile ? await ElMessageBox.prompt('请填写驳回原因', '驳回请假', { inputPattern: /\S+/, inputErrorMessage: '请填写驳回原因' }) : await ElMessageBox.prompt('请填写驳回原因', '驳回请假'); remark = context.mobile ? result.value.trim() : result.value; if (context.mobile && !remark) return }
    if (!contextCurrent(context) || reviewTokens.get(row.id) !== token || !actionableLeave(row.id)) return
    await store.runQuiet(() => api.reviewLeave(row.id, action, remark), true); if (contextCurrent(context) && reviewTokens.get(row.id) === token) await load()
  } catch (error) { if (contextCurrent(context) && reviewTokens.get(row.id) === token && !isCancel(error)) store.setError(errorText(error, '请假审批失败')) }
  finally { if (reviewTokens.get(row.id) === token) reviewTokens.delete(row.id) }
}
async function removeLeave(row: LeaveRequest) {
  if (!actionableLeave(row.id) || removeTokens.has(row.id)) return
  const token = ++mutationOperation, context = { session: pageSession, mobile: isMobileLayout.value }; removeTokens.set(row.id, token)
  try { if (context.mobile) await ElMessageBox.confirm('删除后无法恢复，是否继续？', '确认删除请假', { type: 'warning' }); if (!contextCurrent(context) || removeTokens.get(row.id) !== token || !actionableLeave(row.id)) return; await store.runQuiet(() => api.deleteLeave(row.id), true); if (contextCurrent(context) && removeTokens.get(row.id) === token) await load() }
  catch (error) { if (contextCurrent(context) && removeTokens.get(row.id) === token && !isCancel(error)) store.setError(errorText(error, '请假记录删除失败')) }
  finally { if (removeTokens.get(row.id) === token) removeTokens.delete(row.id) }
}
function resetType() { typeEditorSession += 1; typeEditingId.value = ''; typeFormError.value = ''; Object.assign(typeForm, { name: '', active: true, countsTowardRestQuota: true }); typeVisible.value = false }
function openTypeCreate() { typeEditorSession += 1; typeEditingId.value = ''; Object.assign(typeForm, { name: '', active: true, countsTowardRestQuota: true }); typeFormError.value = ''; typeVisible.value = true }
function editType(row: LeaveType) { if (row.referenced) return; typeEditorSession += 1; typeEditingId.value = row.id; Object.assign(typeForm, { name: row.name, active: row.active, countsTowardRestQuota: row.countsTowardRestQuota }); typeFormError.value = ''; if (isMobileLayout.value) typeVisible.value = true }
async function saveType() {
  if (typeOperationBusy.value) return
  if (!typeForm.name.trim()) { if (isMobileLayout.value) typeFormError.value = '请填写类型名称'; else store.setError('请填写类型名称'); return }
  const context = { operation: ++typeSaveOperation, session: pageSession, editorSession: typeEditorSession, revision: typeFormRevision, editingId: typeEditingId.value, mobile: isMobileLayout.value }
  const payload = { ...typeForm }; typeSaving.value = true; typeFormError.value = ''; store.clearError()
  try { const saved = await store.runQuiet(() => api.saveLeaveType(payload, context.editingId || undefined), true); if (!typeEditorCurrent(context)) return; if (!context.editingId && context.revision !== typeFormRevision) { typeEditingId.value = saved.id; return }; if (context.revision !== typeFormRevision) return; resetType(); await load() }
  catch (error) { if (typeEditorCurrent(context) && context.revision === typeFormRevision) { const message = errorText(error, '请假类型保存失败'); if (context.mobile) typeFormError.value = message; store.setError(message) } }
  finally { if (pageActive && context.operation === typeSaveOperation) typeSaving.value = false }
}
async function removeType(row: LeaveType) {
  if (typeOperationBusy.value) return
  const token = ++mutationOperation, context = { session: pageSession, mobile: isMobileLayout.value }; typeRemoveTokens.set(row.id, token)
  try { if (context.mobile) await ElMessageBox.confirm('删除或停用后需重新编辑才能恢复，是否继续？', '确认删除或停用请假类型', { type: 'warning' }); if (!contextCurrent(context) || typeRemoveTokens.get(row.id) !== token) return; await store.runQuiet(() => api.deleteLeaveType(row.id), true); if (contextCurrent(context) && typeRemoveTokens.get(row.id) === token) await load() }
  catch (error) { if (contextCurrent(context) && typeRemoveTokens.get(row.id) === token && !isCancel(error)) store.setError(errorText(error, '请假类型删除或停用失败')) }
  finally { if (typeRemoveTokens.get(row.id) === token) typeRemoveTokens.delete(row.id) }
}
onMounted(load)
onBeforeUnmount(() => { pageActive = false; pageSession += 1; cancelOwnedLoads(); leaveSaveOperation += 1; typeSaveOperation += 1; reviewTokens.clear(); removeTokens.clear(); typeRemoveTokens.clear() })
</script>

<style scoped>
.leave-editor-dialog:not(.mobile-fullscreen-dialog--active){width:650px}.leave-editor-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}.leave-editor-actions{display:flex;justify-content:flex-end;gap:10px}.leave-type-editor-form{display:grid;gap:4px}:deep(.employee-leave-page.attendance-page--mobile .attendance-mobile-controls){display:none}.leave-editor-dialog.mobile-fullscreen-dialog--active :deep(.el-input__wrapper),.leave-editor-dialog.mobile-fullscreen-dialog--active :deep(.el-select__wrapper),.leave-editor-dialog.mobile-fullscreen-dialog--active :deep(.el-input-number),.leave-type-editor-dialog :deep(.el-input__wrapper),.leave-type-editor-dialog :deep(.el-switch){min-height:44px}@media(max-width:900px){.leave-editor-form{grid-template-columns:1fr}}@media(max-width:767px){.leave-editor-actions{padding-bottom:max(4px,env(safe-area-inset-bottom))}.leave-editor-actions .el-button{min-height:44px;flex:1;margin-left:0}}
</style>
