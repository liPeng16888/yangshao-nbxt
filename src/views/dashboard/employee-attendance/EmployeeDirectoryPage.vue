<template>
  <PageShell class="employee-directory-page" title="员工档案" description="管理员工人事信息、薪资参数和私有照片；敏感信息默认脱敏。" :show-month="false" :show-employee="false" @refresh="load">
    <MobileEmployeeList v-if="isMobileLayout" :employees="store.employees" :busy="employeeSaving || store.saving" @create="openCreate" @edit="openEdit" @reveal="reveal" @preview-photo="previewPhoto" @upload-photo="upload" @remove="removeEmployee" />
    <template v-else>
      <div class="toolbar">
        <el-input v-model="keyword" clearable placeholder="搜索编号、姓名或手机" style="width:260px" />
        <el-select v-model="statusFilter" clearable placeholder="全部状态" style="width:130px"><el-option label="在职" value="ACTIVE"/><el-option label="停用/离职" value="INACTIVE"/></el-select>
        <el-button type="primary" @click="openCreate">新增员工</el-button>
      </div>
      <el-table :data="filtered" empty-text="暂无员工档案">
        <el-table-column prop="employeeNumber" label="编号" width="100"/><el-table-column prop="name" label="姓名" width="110"/>
        <el-table-column prop="phone" label="手机" width="130"/><el-table-column label="照片" width="72"><template #default="{ row }"><el-button v-if="row.hasPhoto" link type="primary" @click="previewPhoto(row)">查看</el-button><span v-else class="muted">无</span></template></el-table-column><el-table-column prop="idCardMasked" label="身份证" min-width="160"/>
        <el-table-column prop="bankCardMasked" label="银行卡" min-width="160"/><el-table-column prop="baseSalary" label="基本月薪" width="110"><template #default="{ row }">¥{{ row.baseSalary.toFixed(2) }}</template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{ statusName(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="265" fixed="right"><template #default="{ row }">
          <el-button :data-testid="`edit-employee-${row.id}`" link type="primary" @click="openEdit(row)">编辑</el-button><el-button link @click="reveal(row)">查看敏感信息</el-button>
          <el-upload :show-file-list="false" :auto-upload="false" accept="image/png,image/jpeg,image/webp" :on-change="(file:any) => upload(row, file.raw)" style="display:inline-block"><el-button link type="primary">照片</el-button></el-upload>
          <el-button link type="danger" @click="removeEmployee(row)">删除/停用</el-button>
        </template></el-table-column>
      </el-table>
    </template>
  </PageShell>

  <component :is="employeeEditorComponent" v-model="visible" v-bind="employeeEditorProps" class="employee-editor-dialog" :title="editingId ? '编辑员工' : '新增员工'">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
    <el-form label-position="top" class="form-grid employee-editor-form">
      <el-form-item label="员工编号" required><el-input v-model="form.employeeNumber" data-testid="employee-number"/></el-form-item><el-form-item label="姓名" required><el-input v-model="form.name" data-testid="employee-name"/></el-form-item>
      <el-form-item label="在职状态"><el-select v-model="form.status"><el-option label="在职" value="ACTIVE"/><el-option label="停用/离职" value="INACTIVE"/></el-select></el-form-item>
      <el-form-item label="手机"><el-input v-model="form.phone" data-testid="employee-phone"/></el-form-item><el-form-item label="身份证"><el-input v-model="form.idCard" data-testid="employee-id-card" placeholder="编辑时留空保持原值"/></el-form-item><el-form-item label="银行卡"><el-input v-model="form.bankCard" data-testid="employee-bank-card" placeholder="编辑时留空保持原值"/></el-form-item>
      <el-form-item label="住址"><el-input v-model="form.address" data-testid="employee-address" placeholder="编辑时留空保持原值"/></el-form-item><el-form-item label="紧急联系人"><el-input v-model="form.emergencyContact" data-testid="employee-emergency-contact" placeholder="编辑时留空保持原值"/></el-form-item><el-form-item label="入职日期" required><el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD"/></el-form-item>
      <el-form-item label="离职日期"><el-date-picker v-model="form.terminationDate" type="date" value-format="YYYY-MM-DD" clearable/></el-form-item>
      <el-form-item label="基本月薪"><el-input-number v-model="form.baseSalary" :min="0"/></el-form-item><el-form-item label="全勤奖"><el-input-number v-model="form.attendanceBonus" :min="0"/></el-form-item><el-form-item label="加班时薪"><el-input-number v-model="form.overtimeHourlyRate" :min="0"/></el-form-item><el-form-item label="默认月休额度"><el-input-number v-model="form.restQuotaDays" :min="0"/></el-form-item>
    </el-form>
    <template #footer><div class="employee-editor-actions"><el-button :disabled="employeeSaving" @click="closeEditor">取消</el-button><el-button data-testid="employee-save" type="primary" :loading="employeeSaving" :disabled="employeeSaving" @click="save">保存</el-button></div></template>
  </component>

  <el-dialog v-model="revealVisible" title="敏感信息（本次查看）" :width="isMobileLayout ? '100%' : '560px'" :fullscreen="isMobileLayout" @closed="releaseRevealed">
    <el-descriptions v-if="revealed" :column="1" border><el-descriptions-item label="身份证">{{ revealed.idCard || '-' }}</el-descriptions-item><el-descriptions-item label="银行卡">{{ revealed.bankCard || '-' }}</el-descriptions-item><el-descriptions-item label="住址">{{ revealed.address || '-' }}</el-descriptions-item><el-descriptions-item label="紧急联系人">{{ revealed.emergencyContact || '-' }}</el-descriptions-item></el-descriptions>
  </el-dialog>
  <el-dialog v-model="photoVisible" title="员工私有照片" :width="isMobileLayout ? '100%' : '520px'" :fullscreen="isMobileLayout" @closed="releasePhoto"><img v-if="photoUrl" :src="photoUrl" alt="员工照片" class="employee-photo-preview"/><el-empty v-else description="照片内容暂不可用，请重新上传"/></el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElDialog, ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import MobileFullscreenDialog from '@/components/mobile/MobileFullscreenDialog.vue'
import { useMobileLayout } from '@/composables/useMobileLayout'
import PageShell from './EmployeeAttendancePageShell.vue'
import MobileEmployeeList from './MobileEmployeeList.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import { useAccessGuardStore } from '@/stores/accessGuard'
import * as api from '@/api/employeeAttendance'
import type { Employee, EmployeePayload, RevealedEmployee } from '@/types/employeeAttendance'

const store = useEmployeeAttendanceStore()
const accessGuard = useAccessGuardStore()
const accessRequestOwner = Symbol('employee-directory-page')
const { isMobileLayout } = useMobileLayout()
const keyword = ref(''), statusFilter = ref<Employee['status'] | ''>(''), visible = ref(false), editingId = ref(''), formError = ref('')
const revealVisible = ref(false), revealed = ref<RevealedEmployee | null>(null), photoVisible = ref(false), photoUrl = ref('')
const employeeSaving = ref(false), photoPendingId = ref('')
const removingIds = reactive(new Set<string>())
const uploadingIds = reactive(new Set<string>())
const statusLabel = { ACTIVE: '在职', INACTIVE: '停用/离职' } as const
const statusName = (status: Employee['status']) => statusLabel[status]
const blank = (): EmployeePayload => ({ employeeNumber: '', name: '', status: 'ACTIVE', phone: '', idCard: '', bankCard: '', address: '', emergencyContact: '', hireDate: dayjs().format('YYYY-MM-DD'), terminationDate: '', baseSalary: 0, attendanceBonus: 0, overtimeHourlyRate: 0, restQuotaDays: 4 })
const form = reactive<EmployeePayload>(blank())
const filtered = computed(() => store.employees.filter(row => (!keyword.value || `${row.employeeNumber}${row.name}${row.phone}`.includes(keyword.value)) && (!statusFilter.value || row.status === statusFilter.value)))
const employeeEditorComponent = computed(() => isMobileLayout.value ? MobileFullscreenDialog : ElDialog)
const employeeEditorProps = computed(() => isMobileLayout.value
  ? { saving: employeeSaving.value, fullscreen: true }
  : { width: '760px', closeOnClickModal: false })
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const isCancel = (error: unknown) => error === 'cancel' || error === 'close' || (error instanceof Error && ['cancel', 'close'].includes(error.message))
let pageActive = true, editorSession = 0, formRevision = 0, saveOperation = 0, revealOperation = 0, revealPendingOperation = 0, photoOperation = 0, uploadOperation = 0, removeOperation = 0

watch(form, () => { formRevision += 1 }, { deep: true, flush: 'sync' })
watch(visible, (open, previous) => {
  if (previous && !open) {
    editorSession += 1
    formError.value = ''
    Object.assign(form, { idCard: '', bankCard: '', address: '', emergencyContact: '' })
  }
})
watch(isMobileLayout, () => { accessGuard.cancelAccess(accessRequestOwner); closeEditor(); releaseRevealed(); releasePhoto() })

async function load() { if (pageActive) await store.loadEmployees().catch(() => undefined) }
function openCreate() { editorSession += 1; editingId.value = ''; Object.assign(form, blank()); formError.value = ''; visible.value = true }
function openEdit(row: Employee) { editorSession += 1; editingId.value = row.id; Object.assign(form, blank(), row, { idCard: '', bankCard: '', address: '', emergencyContact: '' }); formError.value = ''; visible.value = true }
function closeEditor() { if (visible.value) editorSession += 1; visible.value = false; formError.value = '' }
function currentEditor(context: { operation: number; session: number; editingId: string; mobile: boolean }) { return pageActive && visible.value && context.operation === saveOperation && context.session === editorSession && context.editingId === editingId.value && context.mobile === isMobileLayout.value }
async function save() {
  if (employeeSaving.value) return
  if (!form.employeeNumber.trim() || !form.name.trim()) { formError.value = '请填写员工编号和姓名'; return }
  const context = { operation: ++saveOperation, session: editorSession, revision: formRevision, editingId: editingId.value, mobile: isMobileLayout.value }
  const payload = api.buildEmployeeMutationPayload({ ...form }, Boolean(context.editingId))
  employeeSaving.value = true; formError.value = ''; store.clearError()
  try {
    const saved = await store.runQuiet(() => context.editingId ? api.updateEmployee(context.editingId, payload) : api.createEmployee(payload), true)
    if (!currentEditor(context)) return
    if (!context.editingId && context.revision !== formRevision) { editingId.value = saved.id; return }
    if (context.revision !== formRevision) return
    closeEditor(); await load(); if (pageActive) ElMessage.success('员工档案已保存')
  } catch (error) { if (currentEditor(context) && context.revision === formRevision) formError.value = errorText(error, '保存失败') }
  finally { if (pageActive && context.operation === saveOperation) employeeSaving.value = false }
}
async function revealNow(row: Employee, operation: number) {
  if (!pageActive || operation !== revealOperation || revealPendingOperation === operation) return
  revealPendingOperation = operation
  try { const result = await store.runQuiet(() => api.revealEmployee(row.id)); if (pageActive && operation === revealOperation) { revealed.value = result; revealVisible.value = true } }
  catch (error) { if (pageActive && operation === revealOperation) store.setError(errorText(error, '敏感信息查看失败')) }
  finally { if (revealPendingOperation === operation) revealPendingOperation = 0 }
}
async function reveal(row: Employee) {
  if (accessGuard.dialogVisible || revealPendingOperation) return
  const operation = ++revealOperation
  try { await accessGuard.loadGroups() } catch (error) { if (pageActive && operation === revealOperation) store.setError(errorText(error, '访问权限加载失败')); return }
  if (!pageActive || operation !== revealOperation) return
  const group = accessGuard.groups.find(item => item.enabled && item.features.includes('EMPLOYEE_ATTENDANCE'))
  if (!group) { store.setError('请先在“访问设置”中创建并启用包含“员工考勤”的访问组，再查看敏感信息。'); return }
  try {
    const sessions = JSON.parse(window.localStorage.getItem('ys_access_guard_group_sessions') || '{}') as Record<string, { token?: string; expiresAt?: number; features?: string[] }>
    if (!api.selectEmployeeAttendanceGrant(sessions)) { delete sessions[group.id]; window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify(sessions)) }
  } catch { window.localStorage.removeItem('ys_access_guard_group_sessions') }
  if (accessGuard.requestFeatureAccess('EMPLOYEE_ATTENDANCE', { title: '员工敏感信息验证', message: '请输入访问密码后查看本次敏感信息', owner: accessRequestOwner, onSuccess: () => revealNow(row, operation) })) await revealNow(row, operation)
}
function releaseRevealed() { revealOperation += 1; revealPendingOperation = 0; revealed.value = null; revealVisible.value = false }
async function upload(row: Employee, file?: File) {
  if (!file || uploadingIds.has(row.id)) return
  uploadingIds.add(row.id)
  const operation = ++uploadOperation
  try { await store.runQuiet(() => api.uploadEmployeePhoto(row.id, file), true); if (pageActive && operation === uploadOperation) { await load(); if (pageActive && operation === uploadOperation) ElMessage.success('照片已保存') } }
  catch (error) { if (pageActive && operation === uploadOperation) store.setError(errorText(error, '照片上传失败')) }
  finally { uploadingIds.delete(row.id) }
}
async function removeEmployee(row: Employee) {
  if (removingIds.has(row.id)) return
  removingIds.add(row.id); const operation = ++removeOperation
  try { await ElMessageBox.confirm('有历史记录的员工将改为停用或离职，是否继续？', '确认', { type: 'warning' }); if (!pageActive || operation !== removeOperation) return; await store.runQuiet(() => api.deleteEmployee(row.id), true); if (pageActive && operation === removeOperation) await load() }
  catch (error) { if (pageActive && operation === removeOperation && !isCancel(error)) store.setError(errorText(error, '员工删除或停用失败')) }
  finally { removingIds.delete(row.id) }
}
async function previewPhoto(row: Employee) {
  if (photoPendingId.value === row.id) return
  clearPhotoPreview(); const operation = ++photoOperation; photoPendingId.value = row.id
  try { const blob = await store.runQuiet(() => api.readEmployeePhoto(row.id)); if (!pageActive || operation !== photoOperation) return; if (blob) photoUrl.value = URL.createObjectURL(blob); photoVisible.value = true }
  catch (error) { if (pageActive && operation === photoOperation) store.setError(errorText(error, '照片读取失败')) }
  finally { if (operation === photoOperation) photoPendingId.value = '' }
}
function clearPhotoPreview() { photoOperation += 1; photoPendingId.value = ''; if (photoUrl.value) URL.revokeObjectURL(photoUrl.value); photoUrl.value = '' }
function releasePhoto() { clearPhotoPreview(); photoVisible.value = false }
onMounted(load)
onBeforeUnmount(() => { pageActive = false; saveOperation += 1; revealOperation += 1; uploadOperation += 1; removeOperation += 1; accessGuard.cancelAccess(accessRequestOwner); releasePhoto(); revealed.value = null })
</script>

<style scoped>
.employee-editor-dialog:not(.mobile-fullscreen-dialog--active){width:760px}.employee-editor-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}.employee-editor-actions{display:flex;justify-content:flex-end;gap:10px}.employee-photo-preview{display:block;max-width:100%;max-height:65vh;margin:auto}:deep(.employee-directory-page.attendance-page--mobile .attendance-mobile-controls){display:none}.employee-editor-dialog.mobile-fullscreen-dialog--active :deep(.el-input__wrapper),.employee-editor-dialog.mobile-fullscreen-dialog--active :deep(.el-select__wrapper),.employee-editor-dialog.mobile-fullscreen-dialog--active :deep(.el-input-number){min-height:44px}@media(max-width:900px){.employee-editor-form{grid-template-columns:1fr}}@media(max-width:767px){.employee-editor-actions{padding-bottom:max(4px,env(safe-area-inset-bottom))}.employee-editor-actions .el-button{min-height:44px;flex:1;margin-left:0}}
</style>
