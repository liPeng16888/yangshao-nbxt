<template>
  <PageShell title="考勤记录" description="仅手工记录实际出勤例外；未录入实际出勤时间时，系统默认按排班正常出勤。" :dirty="visible" @refresh="load">
    <el-alert title="默认正常出勤：未手工录入实际出勤时间时，不计算迟到、早退或缺勤。" type="info" :closable="false" show-icon />
    <div class="toolbar">
      <el-date-picker :model-value="store.startDate" value-format="YYYY-MM-DD" placeholder="开始日期" clearable @update:model-value="changeStartDate" />
      <span>至</span>
      <el-date-picker :model-value="store.endDate" value-format="YYYY-MM-DD" placeholder="结束日期" clearable @update:model-value="changeEndDate" />
      <el-button @click="openCreate">手工新增实际出勤</el-button>
    </div>
    <el-table :data="store.attendance" empty-text="暂无手工考勤记录">
      <el-table-column prop="date" label="日期" width="115" />
      <el-table-column label="员工" width="110"><template #default="{ row }">{{ nameOf(row.employeeId) }}</template></el-table-column>
      <el-table-column label="排班" width="90"><template #default="{ row }">{{ row.isScheduledWorkday ? `${row.scheduledMinutes / 60}小时` : '休息' }}</template></el-table-column>
      <el-table-column label="实际出勤时段" min-width="220"><template #default="{ row }">{{ actualText(row) }}</template></el-table-column>
      <el-table-column prop="lateMinutes" label="迟到" width="75" />
      <el-table-column prop="earlyLeaveMinutes" label="早退" width="75" />
      <el-table-column prop="absenceMinutes" label="缺勤" width="75" />
      <el-table-column prop="overtimeMinutes" label="加班" width="75" />
      <el-table-column label="操作" width="120"><template #default="{ row }">
        <el-button :data-testid="`edit-attendance-${row.employeeId}`" link type="primary" :disabled="!!row.lockedAt" @click="openEdit(row)">编辑</el-button>
        <el-button link type="danger" :disabled="!!row.lockedAt" @click="remove(row.id)">删除</el-button>
      </template></el-table-column>
    </el-table>
  </PageShell>

  <el-dialog v-model="visible" :title="editingId ? '编辑实际出勤' : '新增实际出勤'" width="760px" :close-on-click-modal="false">
    <el-alert v-if="formError" :title="formError" type="error" :closable="false" />
    <el-form label-position="top" class="form-grid">
      <el-form-item label="员工" required><el-select v-model="form.employeeId"><el-option v-for="row in store.employees" :key="row.id" :label="row.name" :value="row.id" /></el-select></el-form-item>
      <el-form-item label="日期" required><el-date-picker v-model="form.date" value-format="YYYY-MM-DD" /></el-form-item>

      <section class="wide actual-section">
        <div class="actual-section__head"><strong>实际出勤时段</strong><el-button data-testid="add-actual-interval" size="small" @click="addActualInterval">增加时段</el-button></div>
        <el-alert v-if="!form.actualSegments.length" title="默认正常出勤：不填写实际出勤时段时，按排班正常出勤。" type="info" :closable="false" />
        <p v-else class="muted">迟到和早退由实际出勤时间计算；缺勤由未覆盖的计划时段计算。</p>
        <div v-for="(segment, index) in form.actualSegments" :key="index" data-testid="actual-interval" class="actual-interval">
          <span>第 {{ index + 1 }} 段</span>
          <el-date-picker v-model="segment.checkInAt" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DDTHH:mm" placeholder="实际上班" :disabled-date="disableOtherDate" />
          <span>至</span>
          <el-date-picker v-model="segment.checkOutAt" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DDTHH:mm" placeholder="实际下班" :disabled-date="disableOtherDate" />
          <el-button link type="danger" @click="removeActualInterval(index)">删除</el-button>
        </div>
      </section>

      <el-form-item label="明确缺勤分钟"><el-input-number v-model="form.explicitAbsenceMinutes" data-testid="attendance-explicit-absence" :min="0" :disabled="hasActualSegments" /></el-form-item>
      <el-form-item label="手工加班分钟"><el-input-number v-model="form.overtimeMinutes" data-testid="attendance-overtime" :min="0" /></el-form-item>
      <el-form-item v-if="editingMetrics" label="计算结果（只读）" class="metrics-readonly"><span>迟到 {{ editingMetrics.lateMinutes }} 分钟，早退 {{ editingMetrics.earlyLeaveMinutes }} 分钟，缺勤 {{ editingMetrics.absenceMinutes }} 分钟</span></el-form-item>
      <el-form-item label="备注" class="wide"><el-input v-model="form.remark" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="store.saving" @click="save">保存</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import PageShell from './EmployeeAttendancePageShell.vue'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import * as api from '@/api/employeeAttendance'
import type { ActualAttendanceSegment, AttendanceRecord, EmployeeAttendanceInput } from '@/types/employeeAttendance'

type AttendanceForm = EmployeeAttendanceInput
type AttendanceMetrics = Pick<AttendanceRecord, 'lateMinutes' | 'earlyLeaveMinutes' | 'absenceMinutes'>

const store = useEmployeeAttendanceStore()
const visible = ref(false)
const editingId = ref('')
const editingUpdatedAt = ref('')
const formError = ref('')
const editingMetrics = ref<AttendanceMetrics | null>(null)
const blank = (): AttendanceForm => ({ employeeId: store.employeeId || store.employees[0]?.id || '', date: dayjs().format('YYYY-MM-DD'), actualSegments: [], explicitAbsenceMinutes: 0, overtimeMinutes: 0, remark: '' })
const form = reactive<AttendanceForm>(blank())
const hasActualSegments = computed(() => form.actualSegments.length > 0)
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

function nameOf(id: string) { return store.employees.find(row => row.id === id)?.name || '-' }
function actualText(row: AttendanceRecord) {
  const actualSegments = row.actualSegments ?? []
  if (!actualSegments.length) return '未手工录入（默认正常）'
  return actualSegments.map(segment => `${punchText(segment.checkInAt)}—${punchText(segment.checkOutAt)}`).join('；')
}
function punchText(value?: string | null) { const local = api.toBeijingDateTimeLocal(value); return local ? local.replace('T', ' ') : '未录入' }
function disableOtherDate(value: Date) { return value && dayjs(value).format('YYYY-MM-DD') !== form.date }
function validateActualIntervals(segments: ActualAttendanceSegment[]) {
  const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/
  let previousEnd = ''
  for (const [index, segment] of segments.entries()) {
    const start = String(segment.checkInAt || '')
    const end = String(segment.checkOutAt || '')
    const prefix = `第 ${index + 1} 段实际出勤`
    if (!start || !end) throw new Error(`${prefix}必须同时填写上班和下班时间`)
    if (start.includes('T24:') || end.includes('T24:')) throw new Error(`${prefix}不支持 24:00`)
    if (!localDateTimePattern.test(start) || !localDateTimePattern.test(end)) throw new Error(`${prefix}时间格式无效`)
    if (!start.startsWith(`${form.date}T`) || !end.startsWith(`${form.date}T`)) throw new Error(`${prefix}必须在所选日期内`)
    if (end <= start) throw new Error(`${prefix}下班时间必须晚于上班时间`)
    if (previousEnd && start < previousEnd) throw new Error(`${prefix}与上一段时间重叠或顺序错误`)
    previousEnd = end
  }
}
function addActualInterval() { form.actualSegments.push({ checkInAt: '', checkOutAt: '' }) }
function removeActualInterval(index: number) { form.actualSegments.splice(index, 1) }
async function load() { await store.loadAttendance().catch(() => undefined) }
async function changeStartDate(value: unknown) { store.selectDateRange(typeof value === 'string' ? value : '', store.endDate); await load() }
async function changeEndDate(value: unknown) { store.selectDateRange(store.startDate, typeof value === 'string' ? value : ''); await load() }
function openCreate() { editingId.value = ''; editingUpdatedAt.value = ''; Object.assign(form, blank()); editingMetrics.value = null; formError.value = ''; visible.value = true }
function openEdit(row: AttendanceRecord) {
  editingId.value = row.id
  editingUpdatedAt.value = row.updatedAt || ''
  Object.assign(form, {
    employeeId: row.employeeId,
    date: row.date,
    actualSegments: (row.actualSegments ?? []).map(segment => ({ ...segment, checkInAt: api.toBeijingDateTimeLocal(segment.checkInAt), checkOutAt: api.toBeijingDateTimeLocal(segment.checkOutAt) })),
    explicitAbsenceMinutes: row.explicitAbsenceMinutes || 0,
    overtimeMinutes: row.overtimeMinutes || 0,
    remark: row.remark || ''
  })
  editingMetrics.value = { lateMinutes: row.lateMinutes, earlyLeaveMinutes: row.earlyLeaveMinutes, absenceMinutes: row.absenceMinutes }
  formError.value = ''
  visible.value = true
}
async function save() {
  if (!form.employeeId || !form.date) { formError.value = '员工和日期必填'; return }
  try {
    validateActualIntervals(form.actualSegments)
    const saved = await store.run(() => api.saveAttendance({
      employeeId: form.employeeId,
      date: form.date,
      actualSegments: form.actualSegments.map(segment => ({ ...segment })),
      explicitAbsenceMinutes: hasActualSegments.value ? 0 : form.explicitAbsenceMinutes || 0,
      overtimeMinutes: form.overtimeMinutes || 0,
      remark: form.remark || '',
      baseUpdatedAt: editingUpdatedAt.value || undefined
    }, editingId.value || undefined), true)
    editingMetrics.value = { lateMinutes: saved.lateMinutes, earlyLeaveMinutes: saved.earlyLeaveMinutes, absenceMinutes: saved.absenceMinutes }
    visible.value = false
    await load()
  } catch (error) { formError.value = errorText(error, '保存失败') }
}
async function remove(id: string) { const row = store.attendance.find(item => item.id === id); if (!row) return; try { await store.run(() => api.deleteAttendance(row), true); await load() } catch (error) { store.setError(errorText(error, '考勤记录删除失败')) } }
onMounted(load)
</script>

<style scoped>
.actual-section{display:grid;gap:10px;margin-bottom:18px}.actual-section__head,.actual-interval{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.actual-section__head{justify-content:space-between}.actual-interval :deep(.el-date-editor){width:210px}.metrics-readonly{align-items:flex-start}.metrics-readonly span{line-height:32px;color:#64748b}@media(max-width:760px){.actual-interval :deep(.el-date-editor){width:100%}}
</style>
