<template>
  <el-dialog :model-value="visible" title="批量设置月度排班" width="640px" :close-on-click-modal="false" @update:model-value="emit('update:visible', $event)">
    <el-alert :title="`已选择 ${selectedDates.length} 个日期；保存时将完整覆盖 ${selectedDates.length} 个日期，其中 ${overwrittenCount} 天已有排班。`" type="warning" :closable="false" show-icon />
    <el-alert v-if="displayError" class="batch-error" :title="displayError" type="error" :closable="false" show-icon />
    <el-form label-position="top" class="batch-form">
      <el-form-item label="当天状态"><el-switch v-model="form.isWorkday" active-text="工作日" inactive-text="休息日" /></el-form-item>
      <template v-if="form.isWorkday">
        <div v-for="(segment, index) in form.segments" :key="segment.key" class="batch-interval">
          <span>时段 {{ index + 1 }}</span>
          <el-time-select v-model="segment.startTime" start="00:00" step="00:30" end="23:30" placeholder="上班" />
          <span>至</span>
          <el-time-select v-model="segment.endTime" start="00:30" step="00:30" end="24:00" placeholder="下班" />
          <el-button link type="danger" :disabled="form.segments.length === 1" @click="removeInterval(index)">删除</el-button>
        </div>
        <el-button plain @click="addInterval">添加工作时段</el-button>
        <p class="batch-summary">休息 {{ rest }} 分钟 · 工作 {{ workHours }} 小时</p>
      </template>
      <el-form-item label="备注"><el-input v-model="form.remark" maxlength="200" show-word-limit /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="confirmSave">确认批量覆盖</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { breakMinutes, normalizeClockIntervals, scheduledMinutes } from '@/utils/attendanceIntervals'
import type { BatchMonthlySchedulePayload, MonthlyScheduleDay, ScheduleSegment } from '@/types/employeeAttendance'

type EditableSegment = Pick<ScheduleSegment, 'startTime' | 'endTime'> & { key: number }
type EditablePayload = Omit<BatchMonthlySchedulePayload, 'employeeId' | 'dates' | 'segments'> & { segments: EditableSegment[] }
const props = withDefaults(defineProps<{ visible: boolean; employeeId: string; selectedDates: string[]; rows: MonthlyScheduleDay[]; saving?: boolean; error?: string }>(), { saving: false, error: '' })
const emit = defineEmits<{ 'update:visible': [visible: boolean]; save: [payload: BatchMonthlySchedulePayload] }>()
const form = ref<EditablePayload>({ isWorkday: true, segments: [], remark: '' })
const localError = ref('')
let nextSegmentKey = 0
const overwrittenCount = computed(() => props.selectedDates.filter((date) => props.rows.some((row) => row.date === date)).length)
const normalized = computed(() => {
  if (!form.value.isWorkday) return []
  try { return normalizeClockIntervals(form.value.segments) } catch { return [] }
})
const rest = computed(() => normalized.value.length ? breakMinutes(normalized.value) : 0)
const workHours = computed(() => {
  const hours = scheduledMinutes(normalized.value) / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '')
})
watch(() => props.visible, (visible) => {
  if (visible) {
    localError.value = ''
    form.value = { isWorkday: true, segments: editableSegments([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:30' }]), remark: '' }
  }
})
const displayError = computed(() => localError.value || props.error)
function editableSegments(segments: ReadonlyArray<Pick<ScheduleSegment, 'startTime' | 'endTime'>>) { return segments.map(({ startTime, endTime }) => ({ key: nextSegmentKey++, startTime, endTime })) }
function copiedSegments(segments: ReadonlyArray<Pick<ScheduleSegment, 'startTime' | 'endTime'>>) { return segments.map(({ startTime, endTime }) => ({ startTime, endTime })) }
function clockToMinutes(time: string) { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) }
function timeFromMinutes(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
function addInterval() {
  const last = form.value.segments.at(-1)
  const start = Math.min((last ? clockToMinutes(last.endTime) + 60 : 8 * 60), 23 * 60 + 30)
  form.value.segments.push({ key: nextSegmentKey++, startTime: timeFromMinutes(start), endTime: timeFromMinutes(Math.min(start + 30, 24 * 60)) })
}
function removeInterval(index: number) { if (form.value.segments.length > 1) form.value.segments.splice(index, 1) }
async function confirmSave() {
  localError.value = ''
  if (form.value.isWorkday) {
    try { normalizeClockIntervals(form.value.segments) } catch (error) { localError.value = error instanceof Error ? error.message : '排班时段无效'; return }
  }
  const text = `将完整覆盖 ${props.selectedDates.length} 个日期，其中 ${overwrittenCount.value} 天已有排班`
  try {
    await ElMessageBox.confirm(text, '确认批量覆盖', { type: 'warning', confirmButtonText: '确认覆盖', cancelButtonText: '返回修改' })
    emit('save', { employeeId: props.employeeId, dates: [...props.selectedDates], isWorkday: form.value.isWorkday, segments: copiedSegments(form.value.segments), remark: form.value.remark || '' })
  } catch { /* keep the dialog and its entered intervals for direct correction */ }
}
</script>

<style scoped>
.batch-error{margin-top:12px}.batch-form{margin-top:16px}.batch-interval{display:grid;grid-template-columns:58px minmax(0,1fr) 20px minmax(0,1fr) auto;gap:8px;align-items:center;margin-bottom:10px}.batch-summary{margin:14px 0 20px;padding:10px 12px;background:#f8fafc;border-radius:6px;color:#334155}@media(max-width:640px){.batch-interval{grid-template-columns:1fr 18px 1fr}.batch-interval>span:first-child,.batch-interval .el-button{grid-column:1/-1}}
</style>
