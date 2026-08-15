<template>
  <el-drawer
    :model-value="visible"
    :append-to-body="false"
    :with-header="false"
    :direction="isMobileLayout ? 'btt' : 'rtl'"
    :size="isMobileLayout ? '100%' : 'min(560px, 100vw)'"
    title="每日排班编辑"
    aria-label="每日排班编辑"
    class="schedule-day-drawer"
    :class="{ 'schedule-day-drawer--fullscreen': isMobileLayout }"
    data-testid="schedule-day-drawer"
    @update:model-value="emit('update:visible', $event)"
  >
    <section class="schedule-day-drawer__content" aria-label="每日排班编辑">
      <header class="schedule-day-drawer__header">
        <div><h3>{{ date }} 排班</h3><p>所有时段必须在当天内，时段之间的空档自动作为休息时间。</p></div>
        <el-button :class="{ 'mobile-touch-target': isMobileLayout }" link @click="close">关闭</el-button>
      </header>
      <el-alert v-if="displayError" :title="displayError" type="error" :closable="false" show-icon />
      <div class="schedule-day-drawer__body">
        <el-form label-position="top">
          <el-form-item label="当天状态"><el-switch v-model="form.isWorkday" :class="{ 'mobile-touch-control': isMobileLayout }" active-text="工作日" inactive-text="休息日" /></el-form-item>
          <template v-if="form.isWorkday">
            <div v-for="(segment, index) in form.segments" :key="segment.key" class="planned-interval" data-testid="planned-interval">
              <span class="planned-interval__label">时段 {{ index + 1 }}</span>
              <el-time-select v-model="segment.startTime" :class="{ 'mobile-touch-control': isMobileLayout }" :data-testid="`interval-start-${index}`" start="00:00" step="00:30" end="23:30" placeholder="上班" />
              <span>至</span>
              <el-time-select v-model="segment.endTime" :class="{ 'mobile-touch-control': isMobileLayout }" :data-testid="`interval-end-${index}`" start="00:30" step="00:30" end="24:00" placeholder="下班" />
              <el-button :class="{ 'mobile-touch-target': isMobileLayout }" link type="danger" :disabled="form.segments.length === 1" @click="removeInterval(index)">删除</el-button>
            </div>
            <el-button data-testid="add-planned-interval" :class="{ 'mobile-touch-target': isMobileLayout }" plain @click="addInterval">添加工作时段</el-button>
            <div class="schedule-day-drawer__summary">休息 {{ rest }} 分钟 · 工作 {{ workHours }} 小时</div>
          </template>
          <el-form-item label="备注"><el-input v-model="form.remark" data-testid="schedule-day-remark" :class="{ 'mobile-touch-control': isMobileLayout }" maxlength="200" show-word-limit /></el-form-item>
        </el-form>
      </div>
      <footer class="schedule-day-drawer__footer">
        <el-button v-if="row" :class="{ 'mobile-touch-target': isMobileLayout }" type="danger" plain :loading="saving || deleteConfirming" :disabled="saving || deleteConfirming" @click="requestDelete">删除当天排班</el-button>
        <span class="schedule-day-drawer__spacer" />
        <el-button :class="{ 'mobile-touch-target': isMobileLayout }" @click="close">取消</el-button>
        <el-button :class="{ 'mobile-touch-target': isMobileLayout }" type="primary" :loading="saving" @click="save">保存</el-button>
      </footer>
    </section>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useMobileLayout } from '@/composables/useMobileLayout'
import { breakMinutes, normalizeClockIntervals, scheduledMinutes } from '@/utils/attendanceIntervals'
import type { MonthlyScheduleDay, MonthlySchedulePayload, ScheduleSegment } from '@/types/employeeAttendance'

type EditableSegment = Pick<ScheduleSegment, 'startTime' | 'endTime'> & { key: number }
type EditablePayload = Omit<MonthlySchedulePayload, 'segments'> & { segments: EditableSegment[] }
const props = withDefaults(defineProps<{ visible: boolean; date: string; employeeId: string; row?: MonthlyScheduleDay; saving?: boolean; error?: string }>(), { row: undefined, saving: false, error: '' })
const emit = defineEmits<{ 'update:visible': [visible: boolean]; 'revision-change': [revision: number]; save: [payload: MonthlySchedulePayload, revision: number]; delete: [id: string, revision: number] }>()
const { isMobileLayout } = useMobileLayout()
const form = ref<EditablePayload>({ employeeId: '', date: '', isWorkday: true, segments: [], remark: '' })
const localError = ref('')
const deleteConfirming = ref(false)
let nextSegmentKey = 0
let formRevision = 0
let editorEpoch = 0
let deleteConfirmOperation = 0

function editableSegments(segments: ReadonlyArray<Pick<ScheduleSegment, 'startTime' | 'endTime'>>): EditableSegment[] {
  return segments.map(({ startTime, endTime }) => ({ key: nextSegmentKey++, startTime, endTime }))
}
function copiedSegments(segments: ReadonlyArray<Pick<ScheduleSegment, 'startTime' | 'endTime'>>) { return segments.map(({ startTime, endTime }) => ({ startTime, endTime })) }
function reset() {
  localError.value = ''
  form.value = props.row
    ? { employeeId: props.row.employeeId, date: props.row.date, isWorkday: props.row.isWorkday, segments: editableSegments(props.row.segments), remark: props.row.remark || '' }
    : { employeeId: props.employeeId, date: props.date, isWorkday: true, segments: editableSegments([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:30' }]), remark: '' }
}
watch(() => [props.visible, props.date, props.employeeId, props.row?.id] as const, () => {
  editorEpoch += 1
  deleteConfirming.value = false
  if (props.visible) reset()
}, { immediate: true })
watch(form, () => { formRevision += 1; emit('revision-change', formRevision) }, { deep: true, flush: 'sync' })
const displayError = computed(() => localError.value || props.error)
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
  const start = Math.min(startMinutes, 23 * 60 + 30)
  form.value.segments.push({ key: nextSegmentKey++, startTime: timeFromMinutes(start), endTime: timeFromMinutes(Math.min(start + 30, 24 * 60)) })
}
function removeInterval(index: number) { if (form.value.segments.length > 1) form.value.segments.splice(index, 1) }
function close() { emit('update:visible', false) }
async function requestDelete() {
  if (!props.row || deleteConfirming.value || props.saving) return
  if (!isMobileLayout.value) { emit('delete', props.row.id, formRevision); return }
  const context = { operation: ++deleteConfirmOperation, epoch: editorEpoch, revision: formRevision, rowId: props.row.id, date: props.date, employeeId: props.employeeId }
  deleteConfirming.value = true
  try {
    await ElMessageBox.confirm(`确认删除 ${props.date} 的排班？`, '删除当天排班', {
      type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消'
    })
    if (!props.visible || context.operation !== deleteConfirmOperation || context.epoch !== editorEpoch || context.revision !== formRevision ||
      props.row?.id !== context.rowId || props.date !== context.date || props.employeeId !== context.employeeId) return
    emit('delete', context.rowId, context.revision)
  } catch { /* retain the open editor and all current values */ } finally {
    if (context.operation === deleteConfirmOperation) deleteConfirming.value = false
  }
}
function save() {
  localError.value = ''
  if (form.value.isWorkday) {
    try { normalizeClockIntervals(form.value.segments) } catch (error) { localError.value = error instanceof Error ? error.message : '排班时段无效'; return }
  }
  emit('save', { ...form.value, segments: copiedSegments(form.value.segments), remark: form.value.remark || '' }, formRevision)
}
</script>

<style scoped>
.schedule-day-drawer__content{height:100%;min-width:0;display:flex;flex-direction:column}.schedule-day-drawer__header,.schedule-day-drawer__footer{padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;gap:12px;align-items:flex-start}.schedule-day-drawer__header>div{min-width:0}.schedule-day-drawer__header h3{margin:0 0 6px;overflow-wrap:anywhere}.schedule-day-drawer__header p{margin:0;color:#64748b;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.schedule-day-drawer__header .el-button{margin-left:auto}.schedule-day-drawer__body{min-width:0;padding:18px 20px;overflow:auto;flex:1}.planned-interval{display:grid;grid-template-columns:58px minmax(0,1fr) 20px minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:10px}.planned-interval__label{font-size:13px;color:#64748b}.schedule-day-drawer__summary{margin:14px 0 20px;padding:10px 12px;border-radius:6px;background:#f8fafc;color:#334155}.schedule-day-drawer__footer{border-top:1px solid #e2e8f0;border-bottom:0;align-items:center}.schedule-day-drawer__spacer{flex:1}:global(.schedule-day-drawer--fullscreen){width:100%!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;padding-top:max(12px,env(safe-area-inset-top));padding-bottom:max(8px,env(safe-area-inset-bottom));border-radius:0!important}:global(.schedule-day-drawer--fullscreen .el-drawer__body){min-height:0;padding:0;overflow:hidden}:global(.schedule-day-drawer--fullscreen .mobile-touch-control),:global(.schedule-day-drawer--fullscreen .mobile-touch-control .el-input__wrapper),:global(.schedule-day-drawer--fullscreen .mobile-touch-control .el-select__wrapper){min-height:44px}@media(max-width:560px){.schedule-day-drawer__header,.schedule-day-drawer__body{padding-inline:14px}.schedule-day-drawer__footer{flex-wrap:wrap;padding:10px 14px}.schedule-day-drawer__footer .el-button{margin-left:0}.schedule-day-drawer__spacer{display:none}.planned-interval{grid-template-columns:minmax(0,1fr) 18px minmax(0,1fr)}.planned-interval__label{grid-column:1/-1}.planned-interval .el-button{grid-column:1/-1;justify-self:start}}
</style>
