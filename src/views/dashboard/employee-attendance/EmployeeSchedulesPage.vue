<template>
  <PageShell title="排班管理" description="周排班模板＋指定日期覆盖，并可按月调整应出勤天数和月休额度。" :dirty="true" @refresh="load">
    <el-tabs v-model="tab">
      <el-tab-pane label="周排班模板" name="weekly">
        <div class="toolbar"><el-button type="primary" :disabled="!store.employeeId" :loading="store.saving" @click="saveWeek">保存本周模板</el-button></div>
        <el-empty v-if="!store.employeeId" description="请先选择员工" />
        <el-table v-else :data="weekRows">
          <el-table-column prop="label" label="星期" />
          <el-table-column label="工作日"><template #default="{row}"><el-switch v-model="row.isWorkday"/></template></el-table-column>
          <el-table-column label="开始时间" min-width="150"><template #default="{row}"><el-time-select v-model="row.plannedStartTime" start="00:00" step="00:30" end="23:30" clearable :disabled="!row.isWorkday" placeholder="上班"/></template></el-table-column>
          <el-table-column label="结束时间" min-width="150"><template #default="{row}"><el-time-select v-model="row.plannedEndTime" start="00:30" step="00:30" end="23:30" clearable :disabled="!row.isWorkday" placeholder="下班"/></template></el-table-column>
          <el-table-column label="自动计算分钟"><template #default="{row}">{{ row.isWorkday ? derivedMinutes(row) : 0 }}</template></el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="临时调班" name="override">
        <div class="toolbar"><el-date-picker v-model="overrideForm.date" value-format="YYYY-MM-DD"/><el-switch v-model="overrideForm.isWorkday" active-text="上班" inactive-text="休息"/><el-time-select v-model="overrideForm.plannedStartTime" start="00:00" step="00:30" end="23:30" clearable :disabled="!overrideForm.isWorkday" placeholder="开始时间"/><el-time-select v-model="overrideForm.plannedEndTime" start="00:30" step="00:30" end="23:30" clearable :disabled="!overrideForm.isWorkday" placeholder="结束时间"/><span>自动计算 {{ overrideForm.isWorkday ? derivedMinutes(overrideForm) : 0 }} 分钟</span><el-input v-model="overrideForm.remark" placeholder="调班备注" style="width:200px"/><el-button type="primary" :loading="store.saving" @click="saveOverride">{{ overrideEditingId ? '保存修改' : '新增调班' }}</el-button><el-button v-if="overrideEditingId" @click="resetOverride">取消编辑</el-button></div>
        <el-table :data="store.overrides" empty-text="暂无临时调班"><el-table-column prop="date" label="日期"/><el-table-column label="类型"><template #default="{row}">{{row.isWorkday?'上班':'休息'}}</template></el-table-column><el-table-column prop="plannedStartTime" label="开始时间"><template #default="{row}">{{row.plannedStartTime||'-'}}</template></el-table-column><el-table-column prop="plannedEndTime" label="结束时间"><template #default="{row}">{{row.plannedEndTime||'-'}}</template></el-table-column><el-table-column prop="scheduledMinutes" label="自动计算分钟"/><el-table-column prop="remark" label="备注"/><el-table-column label="操作" width="150"><template #default="{row}"><el-button link type="primary" @click="editOverride(row)">编辑</el-button><el-button link type="danger" @click="removeOverride(row.id)">删除</el-button></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane label="月度设置" name="month">
        <div class="toolbar"><el-input-number v-model="monthForm.scheduledWorkDays" data-testid="month-scheduled-days" :min="0"/><span>应出勤天</span><el-input-number v-model="monthForm.restQuotaDays" data-testid="month-rest-quota" :min="0"/><span>月休额度</span><el-button type="primary" :disabled="!store.employeeId" :loading="store.saving" @click="saveMonth">保存</el-button><el-button v-if="selectedMonthSetting" type="danger" plain @click="removeMonth">删除当前设置</el-button></div>
        <el-alert v-if="store.employeeId && !selectedMonthSetting" title="当前员工本月尚未设置，表单已使用员工默认月休额度。" type="info" :closable="false" show-icon/>
        <el-table :data="store.monthSettings" empty-text="暂无月度设置"><el-table-column label="员工"><template #default="{row}">{{nameOf(row.employeeId)}}</template></el-table-column><el-table-column prop="month" label="月份"/><el-table-column prop="scheduledWorkDays" label="应出勤天"/><el-table-column prop="restQuotaDays" label="月休额度"/></el-table>
      </el-tab-pane>
    </el-tabs>
  </PageShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import PageShell from './EmployeeAttendancePageShell.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { DateOverride } from '@/types/employeeAttendance'

const store = useEmployeeAttendanceStore()
const tab = ref('weekly')
const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const weekRows = reactive(labels.map((label, weekday) => ({ id: '', updatedAt: '', label, weekday, isWorkday: weekday > 0 && weekday < 6, plannedStartTime: weekday > 0 && weekday < 6 ? '08:00' : null as string | null, plannedEndTime: weekday > 0 && weekday < 6 ? '16:00' : null as string | null, scheduledMinutes: weekday > 0 && weekday < 6 ? 480 : 0 })))
const overrideEditingId = ref('')
const overrideEditingUpdatedAt = ref('')
const overrideForm = reactive({ date: dayjs().format('YYYY-MM-DD'), isWorkday: true, plannedStartTime: '08:00' as string | null, plannedEndTime: '16:00' as string | null, scheduledMinutes: 480, remark: '' })
const monthForm = reactive({ scheduledWorkDays: 22, restQuotaDays: 4 })
const selectedMonthSetting = computed(() => store.monthSettings.find(row => row.employeeId === store.employeeId && row.month === store.month))
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

function nameOf(id: string) { return store.employees.find(row => row.id === id)?.name || '-' }
function timeMinutes(value?: string | null) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value!.slice(0, 2)) * 60 + Number(value!.slice(3, 5)) : Number.NaN
}
function derivedMinutes(row: { plannedStartTime?: string | null; plannedEndTime?: string | null }) {
  const start = timeMinutes(row.plannedStartTime), end = timeMinutes(row.plannedEndTime)
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0
}
function schedulePayload(row: { isWorkday: boolean; plannedStartTime?: string | null; plannedEndTime?: string | null }) {
  if (!row.isWorkday) return { plannedStartTime: null, plannedEndTime: null, scheduledMinutes: 0 }
  const scheduledMinutes = derivedMinutes(row)
  if (!scheduledMinutes) throw new Error('工作日必须填写同一天内的计划上下班时间')
  return { plannedStartTime: row.plannedStartTime, plannedEndTime: row.plannedEndTime, scheduledMinutes }
}
function hydrateForms() {
  weekRows.forEach(row => {
    const saved = store.weeklySchedules.find(item => item.weekday === row.weekday)
    const isWorkday = saved?.isWorkday ?? (row.weekday > 0 && row.weekday < 6)
    Object.assign(row, { id: saved?.id || '', updatedAt: saved?.updatedAt || '', isWorkday, plannedStartTime: isWorkday ? saved?.plannedStartTime || '08:00' : null, plannedEndTime: isWorkday ? saved?.plannedEndTime || '16:00' : null, scheduledMinutes: isWorkday ? saved?.scheduledMinutes ?? 480 : 0 })
  })
  const setting = selectedMonthSetting.value
  const employee = store.employees.find(row => row.id === store.employeeId)
  Object.assign(monthForm, setting ? { scheduledWorkDays: setting.scheduledWorkDays, restQuotaDays: setting.restQuotaDays } : { scheduledWorkDays: 0, restQuotaDays: employee?.restQuotaDays ?? 0 })
}
async function load() { try { await store.loadSchedules(); hydrateForms() } catch { /* PageShell displays persistent store error */ } }
async function saveWeek() {
  try { await store.run(() => Promise.all(weekRows.map(row => api.saveWeeklySchedule({ employeeId: store.employeeId, weekday: row.weekday, isWorkday: row.isWorkday, ...schedulePayload(row) }, row.id || undefined, row.updatedAt || undefined))), true); await load(); ElMessage.success('周排班已保存') }
  catch (error) { store.setError(errorText(error, '周排班保存失败')) }
}
function resetOverride() { overrideEditingId.value = ''; overrideEditingUpdatedAt.value = ''; Object.assign(overrideForm, { date: dayjs().format('YYYY-MM-DD'), isWorkday: true, plannedStartTime: '08:00', plannedEndTime: '16:00', scheduledMinutes: 480, remark: '' }) }
function editOverride(row: DateOverride) { overrideEditingId.value = row.id; overrideEditingUpdatedAt.value = row.updatedAt || ''; Object.assign(overrideForm, { date: row.date, isWorkday: row.isWorkday, plannedStartTime: row.isWorkday ? row.plannedStartTime || '08:00' : null, plannedEndTime: row.isWorkday ? row.plannedEndTime || '16:00' : null, scheduledMinutes: row.scheduledMinutes, remark: row.remark || '' }) }
async function saveOverride() {
  if (!store.employeeId) { store.setError('请选择员工'); return }
  try { await store.run(() => api.saveDateOverride({ employeeId: store.employeeId, date: overrideForm.date, isWorkday: overrideForm.isWorkday, remark: overrideForm.remark, ...schedulePayload(overrideForm) }, overrideEditingId.value || undefined, overrideEditingUpdatedAt.value || undefined), true); resetOverride(); await load() }
  catch (error) { store.setError(errorText(error, '临时调班保存失败')) }
}
async function removeOverride(id: string) { const row = store.overrides.find(item => item.id === id); if (!row) return; try { await store.run(() => api.deleteDateOverride(row), true); await load() } catch (error) { store.setError(errorText(error, '临时调班删除失败')) } }
async function saveMonth() {
  if (!store.employeeId) { store.setError('请选择员工'); return }
  try { await store.run(() => api.saveMonthlySetting({ employeeId: store.employeeId, month: store.month, ...monthForm, baseUpdatedAt: selectedMonthSetting.value?.updatedAt }), true); await load() }
  catch (error) { store.setError(errorText(error, '月度设置保存失败')) }
}
async function removeMonth() {
  if (!selectedMonthSetting.value) return
  try { await store.run(() => api.deleteMonthlySetting(selectedMonthSetting.value!), true); await load() }
  catch (error) { store.setError(errorText(error, '月度设置删除失败')) }
}
watch([() => store.employeeId, () => store.month], load)
onMounted(() => { store.restoreMonthMode(); void load() })
</script>
