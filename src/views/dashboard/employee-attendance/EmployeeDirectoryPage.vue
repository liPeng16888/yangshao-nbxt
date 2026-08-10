<template>
  <PageShell title="员工档案" description="管理员工人事信息、薪资参数和私有照片；敏感信息默认脱敏。" :show-month="false" :show-employee="false" @refresh="load">
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
  </PageShell>
  <el-dialog v-model="visible" :title="editingId ? '编辑员工' : '新增员工'" width="760px" :close-on-click-modal="false">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
    <el-form label-position="top" class="form-grid">
      <el-form-item label="员工编号" required><el-input v-model="form.employeeNumber" data-testid="employee-number"/></el-form-item><el-form-item label="姓名" required><el-input v-model="form.name" data-testid="employee-name"/></el-form-item>
      <el-form-item label="在职状态"><el-select v-model="form.status"><el-option label="在职" value="ACTIVE"/><el-option label="停用/离职" value="INACTIVE"/></el-select></el-form-item>
      <el-form-item label="手机"><el-input v-model="form.phone"/></el-form-item><el-form-item label="身份证"><el-input v-model="form.idCard" data-testid="employee-id-card" placeholder="编辑时留空保持原值"/></el-form-item><el-form-item label="银行卡"><el-input v-model="form.bankCard" data-testid="employee-bank-card" placeholder="编辑时留空保持原值"/></el-form-item>
      <el-form-item label="住址"><el-input v-model="form.address" placeholder="编辑时留空保持原值"/></el-form-item><el-form-item label="紧急联系人"><el-input v-model="form.emergencyContact" placeholder="编辑时留空保持原值"/></el-form-item><el-form-item label="入职日期" required><el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD"/></el-form-item>
      <el-form-item label="离职日期"><el-date-picker v-model="form.terminationDate" type="date" value-format="YYYY-MM-DD" clearable/></el-form-item>
      <el-form-item label="基本月薪"><el-input-number v-model="form.baseSalary" :min="0"/></el-form-item><el-form-item label="全勤奖"><el-input-number v-model="form.attendanceBonus" :min="0"/></el-form-item><el-form-item label="加班时薪"><el-input-number v-model="form.overtimeHourlyRate" :min="0"/></el-form-item><el-form-item label="默认月休额度"><el-input-number v-model="form.restQuotaDays" :min="0"/></el-form-item>
    </el-form><template #footer><el-button @click="visible=false">取消</el-button><el-button data-testid="employee-save" type="primary" :loading="store.saving" @click="save">保存</el-button></template>
  </el-dialog>
  <el-dialog v-model="revealVisible" title="敏感信息（本次查看）" width="560px"><el-descriptions v-if="revealed" :column="1" border><el-descriptions-item label="身份证">{{ revealed.idCard || '-' }}</el-descriptions-item><el-descriptions-item label="银行卡">{{ revealed.bankCard || '-' }}</el-descriptions-item><el-descriptions-item label="住址">{{ revealed.address || '-' }}</el-descriptions-item><el-descriptions-item label="紧急联系人">{{ revealed.emergencyContact || '-' }}</el-descriptions-item></el-descriptions></el-dialog>
  <el-dialog v-model="photoVisible" title="员工私有照片" width="520px" @closed="releasePhoto"><img v-if="photoUrl" :src="photoUrl" alt="员工照片" style="display:block;max-width:100%;max-height:65vh;margin:auto"/><el-empty v-else description="照片内容暂不可用，请重新上传"/></el-dialog>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import PageShell from './EmployeeAttendancePageShell.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import { useAccessGuardStore } from '@/stores/accessGuard'
import * as api from '@/api/employeeAttendance'
import type { Employee, EmployeePayload, RevealedEmployee } from '@/types/employeeAttendance'

const store = useEmployeeAttendanceStore()
const accessGuard = useAccessGuardStore()
const keyword = ref(''), statusFilter = ref<Employee['status'] | ''>(''), visible = ref(false), editingId = ref(''), formError = ref('')
const revealVisible = ref(false), revealed = ref<RevealedEmployee | null>(null), photoVisible = ref(false), photoUrl = ref('')
const statusLabel = { ACTIVE: '在职', INACTIVE: '停用/离职' }
const statusName = (status: Employee['status']) => statusLabel[status]
const blank = (): EmployeePayload => ({ employeeNumber: '', name: '', status: 'ACTIVE', phone: '', idCard: '', bankCard: '', address: '', emergencyContact: '', hireDate: dayjs().format('YYYY-MM-DD'), terminationDate: '', baseSalary: 0, attendanceBonus: 0, overtimeHourlyRate: 0, restQuotaDays: 4 })
const form = reactive<EmployeePayload>(blank())
const filtered = computed(() => store.employees.filter(row => (!keyword.value || `${row.employeeNumber}${row.name}${row.phone}`.includes(keyword.value)) && (!statusFilter.value || row.status === statusFilter.value)))
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const isCancel = (error: unknown) => error === 'cancel' || error === 'close' || (error instanceof Error && ['cancel', 'close'].includes(error.message))

async function load() { await store.loadEmployees().catch(() => undefined) }
function openCreate() { editingId.value = ''; Object.assign(form, blank()); formError.value = ''; visible.value = true }
function openEdit(row: Employee) {
  editingId.value = row.id
  Object.assign(form, blank(), row, { idCard: '', bankCard: '', address: '', emergencyContact: '' })
  formError.value = ''; visible.value = true
}
async function save() {
  if (!form.employeeNumber.trim() || !form.name.trim()) { formError.value = '请填写员工编号和姓名'; return }
  try {
    const payload = api.buildEmployeeMutationPayload(form, Boolean(editingId.value))
    await store.run(() => editingId.value ? api.updateEmployee(editingId.value, payload) : api.createEmployee(payload), true)
    visible.value = false; await load(); ElMessage.success('员工档案已保存')
  } catch (error) { formError.value = errorText(error, '保存失败') }
}
async function revealNow(row: Employee) {
  try { revealed.value = await store.run(() => api.revealEmployee(row.id)); revealVisible.value = true }
  catch (error) { store.setError(errorText(error, '敏感信息查看失败')) }
}
async function reveal(row: Employee) {
  try { await accessGuard.loadGroups() } catch (error) { store.setError(errorText(error, '访问权限加载失败')); return }
  const group = accessGuard.groups.find(item => item.enabled && item.features.includes('EMPLOYEE_ATTENDANCE'))
  if (!group) { store.setError('请先在“访问设置”中创建并启用包含“员工考勤”的访问组，再查看敏感信息。'); return }
  try {
    const sessions = JSON.parse(window.localStorage.getItem('ys_access_guard_group_sessions') || '{}') as Record<string, { token?: string; expiresAt?: number; features?: string[] }>
    if (!api.selectEmployeeAttendanceGrant(sessions)) { delete sessions[group.id]; window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify(sessions)) }
  } catch { window.localStorage.removeItem('ys_access_guard_group_sessions') }
  if (accessGuard.requestFeatureAccess('EMPLOYEE_ATTENDANCE', { title: '员工敏感信息验证', message: '请输入访问密码后查看本次敏感信息', onSuccess: () => revealNow(row) })) await revealNow(row)
}
async function upload(row: Employee, file?: File) {
  if (!file) return
  try { await store.run(() => api.uploadEmployeePhoto(row.id, file), true); await load(); ElMessage.success('照片已保存') }
  catch (error) { store.setError(errorText(error, '照片上传失败')) }
}
async function removeEmployee(row: Employee) {
  try {
    await ElMessageBox.confirm('有历史记录的员工将改为停用或离职，是否继续？', '确认', { type: 'warning' })
    await store.run(() => api.deleteEmployee(row.id), true); await load()
  } catch (error) { if (!isCancel(error)) store.setError(errorText(error, '员工删除或停用失败')) }
}
async function previewPhoto(row: Employee) {
  releasePhoto()
  try { const blob = await store.run(() => api.readEmployeePhoto(row.id)); if (blob) photoUrl.value = URL.createObjectURL(blob); photoVisible.value = true }
  catch (error) { store.setError(errorText(error, '照片读取失败')) }
}
function releasePhoto() { if (photoUrl.value) URL.revokeObjectURL(photoUrl.value); photoUrl.value = '' }
onMounted(load)
</script>
