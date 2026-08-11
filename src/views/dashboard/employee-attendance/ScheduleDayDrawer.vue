<template>
  <aside v-if="visible" class="schedule-day-drawer" data-testid="schedule-day-drawer" aria-label="每日排班编辑">
    <header class="schedule-day-drawer__header">
      <div><h3>{{ date }} 排班</h3><p>所有时段必须在当天内，时段之间的空档自动作为休息时间。</p></div>
      <el-button link @click="close">关闭</el-button>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="schedule-day-drawer__body">
      <el-form label-position="top">
        <el-form-item label="当天状态"><el-switch v-model="form.isWorkday" active-text="工作日" inactive-text="休息日" /></el-form-item>
        <template v-if="form.isWorkday">
          <div v-for="(segment, index) in form.segments" :key="`${index}-${segment.startTime}-${segment.endTime}`" class="planned-interval" data-testid="planned-interval">
            <span class="planned-interval__label">时段 {{ index + 1 }}</span>
            <el-time-select v-model="segment.startTime" start="00:00" step="00:30" end="23:30" placeholder="上班" />
            <span>至</span>
            <el-time-select v-model="segment.endTime" start="00:30" step="00:30" end="23:30" placeholder="下班" />
            <el-button link type="danger" :disabled="form.segments.length === 1" @click="removeInterval(index)">删除</el-button>
          </div>
          <el-button data-testid="add-planned-interval" plain @click="addInterval">添加工作时段</el-button>
          <div class="schedule-day-drawer__summary">休息 {{ rest }} 分钟 · 工作 {{ workHours }} 小时</div>
        </template>
        <el-form-item label="备注"><el-input v-model="form.remark" maxlength="200" show-word-limit /></el-form-item>
      </el-form>
    </div>
    <footer class="schedule-day-drawer__footer">
      <el-button v-if="row" type="danger" plain :loading="saving" @click="emit('delete', row.id)">删除当天排班</el-button>
      <span class="schedule-day-drawer__spacer" />
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { breakMinutes, normalizeClockIntervals, scheduledMinutes } from '@/utils/attendanceIntervals'
import type { MonthlyScheduleDay, MonthlySchedulePayload, ScheduleSegment } from '@/types/employeeAttendance'

const props = withDefaults(defineProps<{ visible: boolean; date: string; employeeId: string; row?: MonthlyScheduleDay; saving?: boolean; error?: string }>(), { row: undefined, saving: false, error: '' })
const emit = defineEmits<{ 'update:visible': [visible: boolean]; save: [payload: MonthlySchedulePayload]; delete: [id: string] }>()
const form = ref<MonthlySchedulePayload>({ employeeId: '', date: '', isWorkday: true, segments: [], remark: '' })

function copiedSegments(segments: ScheduleSegment[]) { return segments.map(({ startTime, endTime }) => ({ startTime, endTime })) }
function reset() {
  form.value = props.row
    ? { employeeId: props.row.employeeId, date: props.row.date, isWorkday: props.row.isWorkday, segments: copiedSegments(props.row.segments), remark: props.row.remark || '' }
    : { employeeId: props.employeeId, date: props.date, isWorkday: true, segments: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:30' }], remark: '' }
}
watch(() => [props.visible, props.date, props.employeeId, props.row?.id] as const, () => { if (props.visible) reset() }, { immediate: true })

const normalized = computed(() => {
  if (!form.value.isWorkday) return []
  try { return normalizeClockIntervals(form.value.segments) } catch { return [] }
})
const rest = computed(() => normalized.value.length ? breakMinutes(normalized.value) : 0)
const workHours = computed(() => {
  const hours = scheduledMinutes(normalized.value) / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '')
})
function clockToMinutes(time: string) { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) }
function timeFromMinutes(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` }
function addInterval() {
  const last = form.value.segments.at(-1)
  const startMinutes = last && /^\d{2}:\d{2}$/.test(last.endTime) ? clockToMinutes(last.endTime) + 60 : 8 * 60
  const start = Math.min(startMinutes, 23 * 60)
  const end = Math.min(start + 30, 23 * 60 + 30)
  form.value.segments.push({ startTime: timeFromMinutes(start), endTime: timeFromMinutes(end) })
}
function removeInterval(index: number) { if (form.value.segments.length > 1) form.value.segments.splice(index, 1) }
function close() { emit('update:visible', false) }
function save() { emit('save', { ...form.value, segments: copiedSegments(form.value.segments), remark: form.value.remark || '' }) }
</script>

<style scoped>
.schedule-day-drawer{position:fixed;z-index:20;top:0;right:0;width:min(560px,100vw);height:100vh;background:#fff;box-shadow:-8px 0 24px rgba(15,23,42,.16);display:flex;flex-direction:column}.schedule-day-drawer__header,.schedule-day-drawer__footer{padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;gap:12px;align-items:flex-start}.schedule-day-drawer__header h3{margin:0 0 6px}.schedule-day-drawer__header p{margin:0;color:#64748b;font-size:13px;line-height:1.5}.schedule-day-drawer__header .el-button{margin-left:auto}.schedule-day-drawer__body{padding:18px 20px;overflow:auto;flex:1}.planned-interval{display:grid;grid-template-columns:58px minmax(0,1fr) 20px minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:10px}.planned-interval__label{font-size:13px;color:#64748b}.schedule-day-drawer__summary{margin:14px 0 20px;padding:10px 12px;border-radius:6px;background:#f8fafc;color:#334155}.schedule-day-drawer__footer{border-top:1px solid #e2e8f0;border-bottom:0;align-items:center}.schedule-day-drawer__spacer{flex:1}@media(max-width:560px){.planned-interval{grid-template-columns:1fr 18px 1fr}.planned-interval__label{grid-column:1/-1}.planned-interval .el-button{grid-column:1/-1;justify-self:start}}
</style>
