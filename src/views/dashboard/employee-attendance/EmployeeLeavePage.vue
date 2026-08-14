<template>
  <PageShell title="请假管理" description="自定义请假类型及是否占用月休额度，录入并审批整天、半天或小时请假。" employee-mode="leave-multiple" :dirty="visible || Boolean(typeEditingId)" @refresh="load">
    <el-tabs v-model="tab">
      <el-tab-pane label="请假记录" name="records">
        <div class="toolbar"><el-select v-model="store.leaveStatus" clearable placeholder="全部状态" style="width:130px" @change="load"><el-option label="待审批" value="PENDING"/><el-option label="已批准" value="APPROVED"/><el-option label="已驳回" value="REJECTED"/></el-select><el-date-picker :model-value="store.startDate" value-format="YYYY-MM-DD" placeholder="开始日期" clearable @update:model-value="changeStartDate"/><span>至</span><el-date-picker :model-value="store.endDate" value-format="YYYY-MM-DD" placeholder="结束日期" clearable @update:model-value="changeEndDate"/><el-button type="primary" @click="openLeave()">新增请假</el-button></div>
        <el-table :data="store.leaves" empty-text="暂无请假记录"><el-table-column label="员工"><template #default="{row}">{{nameOf(row.employeeId)}}</template></el-table-column><el-table-column label="类型"><template #default="{row}">{{typeName(row.leaveTypeId)}}</template></el-table-column><el-table-column label="日期"><template #default="{row}">{{row.startDate}} 至 {{row.endDate}}</template></el-table-column><el-table-column label="单位"><template #default="{row}">{{unitLabel[row.unit]}}{{row.unit==='HOUR'?` ${row.hours}小时`:''}}</template></el-table-column><el-table-column prop="reason" label="原因"/><el-table-column label="状态"><template #default="{row}"><el-tag :type="row.status==='APPROVED'?'success':row.status==='REJECTED'?'danger':'warning'">{{statusLabel[row.status]}}</el-tag></template></el-table-column><el-table-column label="操作" width="255"><template #default="{row}"><template v-if="row.status==='PENDING' && !row.lockedAt"><el-button link type="primary" @click="openLeave(row)">编辑</el-button><el-button link type="success" @click="review(row.id,'approve')">批准</el-button><el-button link type="danger" @click="review(row.id,'reject')">驳回</el-button><el-button link @click="removeLeave(row.id)">删除</el-button></template><span v-else class="muted">{{row.lockedAt?'工资已锁定':'已处理'}}</span></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane label="请假类型" name="types">
        <div class="toolbar"><el-input v-model="typeForm.name" placeholder="类型名称" style="width:180px"/><el-switch v-model="typeForm.countsTowardRestQuota" active-text="占月休额度"/><el-switch v-model="typeForm.active" active-text="启用" inactive-text="停用"/><el-button type="primary" :loading="store.saving" @click="saveType">{{typeEditingId?'保存修改':'新增类型'}}</el-button><el-button v-if="typeEditingId" @click="resetType">取消编辑</el-button></div>
        <el-table :data="store.leaveTypes"><el-table-column prop="name" label="类型"/><el-table-column label="占月休"><template #default="{row}">{{row.countsTowardRestQuota?'是':'否'}}</template></el-table-column><el-table-column label="状态"><template #default="{row}">{{row.active?'启用':'停用'}} <el-tag v-if="row.referenced" size="small" type="warning">已使用，仅可停用</el-tag></template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button link type="primary" :disabled="row.referenced" @click="editType(row)">编辑</el-button><el-button link type="danger" @click="removeType(row.id)">删除/停用</el-button></template></el-table-column></el-table>
      </el-tab-pane>
    </el-tabs>
  </PageShell>
  <el-dialog v-model="visible" :title="leaveEditingId?'编辑请假':'新增请假'" width="650px" :close-on-click-modal="false"><el-alert v-if="formError" :title="formError" type="error" :closable="false"/><el-form label-position="top" class="form-grid"><el-form-item label="员工" required><el-select v-model="form.employeeId"><el-option v-for="row in store.activeEmployees" :key="row.id" :label="row.name" :value="row.id"/></el-select></el-form-item><el-form-item label="请假类型" required><el-select v-model="form.leaveTypeId"><el-option v-for="row in store.leaveTypes.filter(item=>item.active || item.id===form.leaveTypeId)" :key="row.id" :label="row.active?row.name:`${row.name}（已停用）`" :value="row.id"/></el-select></el-form-item><el-form-item label="请假单位"><el-select v-model="form.unit"><el-option label="整天" value="FULL_DAY"/><el-option label="半天" value="HALF_DAY"/><el-option label="小时" value="HOUR"/></el-select></el-form-item><el-form-item label="开始日期"><el-date-picker v-model="form.startDate" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="结束日期"><el-date-picker v-model="form.endDate" value-format="YYYY-MM-DD"/></el-form-item><el-form-item v-if="form.unit==='HOUR'" label="小时数"><el-input-number v-model="form.hours" :min="0.01"/></el-form-item><el-form-item label="请假原因" required class="wide"><el-input v-model="form.reason" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" :loading="store.saving" @click="saveLeave">保存</el-button></template></el-dialog>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessageBox } from 'element-plus'
import PageShell from './EmployeeAttendancePageShell.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { LeaveRequest, LeaveRequestPayload, LeaveType } from '@/types/employeeAttendance'

const store = useEmployeeAttendanceStore(), tab = ref('records'), visible = ref(false), formError = ref(''), leaveEditingId = ref(''), leaveEditingUpdatedAt = ref(''), typeEditingId = ref(''), typeEditingUpdatedAt = ref('')
const unitLabel: Record<string, string> = { FULL_DAY: '整天', HALF_DAY: '半天', HOUR: '小时' }, statusLabel: Record<string, string> = { PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回' }
const typeForm = reactive({ name: '', active: true, countsTowardRestQuota: true })
const blank = (): LeaveRequestPayload => ({ employeeId: store.employeeId || store.activeEmployees[0]?.id || '', leaveTypeId: store.leaveTypes.find(row => row.active)?.id || '', startDate: dayjs().format('YYYY-MM-DD'), endDate: dayjs().format('YYYY-MM-DD'), unit: 'FULL_DAY', hours: undefined, reason: '' })
const form = reactive<LeaveRequestPayload>(blank())
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const isCancel = (error: unknown) => error === 'cancel' || error === 'close' || (error instanceof Error && ['cancel', 'close'].includes(error.message))
function nameOf(id: string) { return store.employees.find(row => row.id === id)?.name || '-' }
function typeName(id: string) { return store.leaveTypes.find(row => row.id === id)?.name || '-' }
async function load() { await store.loadLeaves().catch(() => undefined) }
async function changeStartDate(value: unknown) { store.selectDateRange(typeof value === 'string' ? value : '', store.endDate); await load() }
async function changeEndDate(value: unknown) { store.selectDateRange(store.startDate, typeof value === 'string' ? value : ''); await load() }
function openLeave(row?: LeaveRequest) { leaveEditingId.value = row?.id || ''; leaveEditingUpdatedAt.value = row?.updatedAt || ''; Object.assign(form, row ? { employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, startDate: row.startDate, endDate: row.endDate, unit: row.unit, hours: row.hours, reason: row.reason } : blank()); formError.value = ''; visible.value = true }
async function saveLeave() { try { await store.run(() => api.saveLeave({ ...form }, leaveEditingId.value || undefined, leaveEditingUpdatedAt.value || undefined), true); visible.value = false; await load() } catch (error) { formError.value = errorText(error, '保存失败') } }
async function review(id: string, action: 'approve' | 'reject') { let remark = ''; try { if (action === 'reject') remark = await ElMessageBox.prompt('请填写驳回原因', '驳回请假').then(row => row.value); await store.run(() => api.reviewLeave(id, action, remark), true); await load() } catch (error) { if (!isCancel(error)) store.setError(errorText(error, '请假审批失败')) } }
async function removeLeave(id: string) { const row = store.leaves.find(item => item.id === id); if (!row) return; try { await store.run(() => api.deleteLeave(row), true); await load() } catch (error) { store.setError(errorText(error, '请假记录删除失败')) } }
function resetType() { typeEditingId.value = ''; typeEditingUpdatedAt.value = ''; Object.assign(typeForm, { name: '', active: true, countsTowardRestQuota: true }) }
function editType(row: LeaveType) { typeEditingId.value = row.id; typeEditingUpdatedAt.value = row.updatedAt || ''; Object.assign(typeForm, { name: row.name, active: row.active, countsTowardRestQuota: row.countsTowardRestQuota }) }
async function saveType() { if (!typeForm.name.trim()) { store.setError('请填写类型名称'); return } try { await store.run(() => api.saveLeaveType({ ...typeForm }, typeEditingId.value || undefined, typeEditingUpdatedAt.value || undefined), true); resetType(); await load() } catch (error) { store.setError(errorText(error, '请假类型保存失败')) } }
async function removeType(id: string) { const row = store.leaveTypes.find(item => item.id === id); if (!row) return; try { await store.run(() => api.deleteLeaveType(row), true); await load() } catch (error) { store.setError(errorText(error, '请假类型删除或停用失败')) } }
onMounted(load)
</script>
