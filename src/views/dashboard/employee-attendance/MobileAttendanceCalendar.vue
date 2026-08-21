<template>
  <section class="mobile-attendance-calendar" data-testid="mobile-attendance-calendar">
    <div class="mobile-attendance-calendar__legend" aria-label="考勤状态图例">
      <span v-for="item in legend" :key="item.tone"><i :class="`mobile-attendance-calendar__swatch--${item.tone}`" />{{ item.label }}</span>
    </div>
    <div class="mobile-attendance-calendar__weekdays">
      <span v-for="weekday in weekdays" :key="weekday" data-testid="mobile-calendar-weekday">{{ weekday }}</span>
    </div>
    <div class="mobile-attendance-calendar__grid">
      <template v-for="cell in calendarCells" :key="cell.key">
        <span v-if="!cell.date" class="mobile-attendance-calendar__blank" aria-hidden="true" />
        <button
        v-else
        type="button"
        data-testid="mobile-calendar-day"
        class="mobile-attendance-day mobile-touch-target"
        :class="[`mobile-attendance-day--${cell.info?.backgroundTone || 'future'}`, { 'mobile-attendance-day--selected': selectedDates.includes(cell.date) }]"
        :data-date="cell.date"
        :data-status="cell.info?.status || 'FUTURE'"
        :aria-label="dayAriaLabel(cell.date, cell.info)"
        :aria-pressed="batchMode ? selectedDates.includes(cell.date) : undefined"
        @click="select(cell.date)"
      >
        <span class="mobile-attendance-day__heading"><strong>{{ cell.day }}</strong><b>{{ statusLabel(cell.info?.status) }}</b></span>
        <span class="mobile-attendance-day__summary">{{ plannedSummary(cell.info) }}</span>
        <span v-if="actualSummary(cell.info)" class="mobile-attendance-day__summary">{{ actualSummary(cell.info) }}</span>
        <span v-if="leaveSummary(cell.info)" class="mobile-attendance-day__summary mobile-attendance-day__summary--leave">{{ leaveSummary(cell.info) }}</span>
        <span v-if="overtimeSummary(cell.info)" class="mobile-attendance-day__summary mobile-attendance-day__summary--overtime">{{ overtimeSummary(cell.info) }}</span>
        <span v-if="exceptionSummary(cell.info)" class="mobile-attendance-day__summary mobile-attendance-day__summary--exception">{{ exceptionSummary(cell.info) }}</span>
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import type { AttendanceCalendarDay, AttendanceCalendarStatus } from '@/types/employeeAttendance'

const props = defineProps<{ month: string; days: AttendanceCalendarDay[]; selectedDates: string[]; batchMode: boolean }>()
const emit = defineEmits<{ selectDate: [date: string]; toggleDate: [date: string] }>()
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const legend = [
  { tone: 'future', label: '未来' }, { tone: 'normal', label: '正常/加班/不足' },
  { tone: 'leave', label: '请假' }, { tone: 'absent', label: '旷工' }, { tone: 'rest', label: '排休' }
]
const statusLabels: Record<AttendanceCalendarStatus, string> = {
  FUTURE: '未来', ABSENT: '旷工', LEAVE: '请假', REST: '排休', NORMAL: '正常', OVERTIME: '加班', SHORT: '不足'
}

const daysByDate = computed(() => new Map(props.days.map((day) => [day.date, day])))
const monthStart = computed(() => dayjs(`${props.month || dayjs().format('YYYY-MM')}-01`))
const monthDays = computed(() => Array.from({ length: monthStart.value.daysInMonth() }, (_, index) => {
  const date = monthStart.value.add(index, 'day').format('YYYY-MM-DD')
  return { key: date, date, day: index + 1, info: daysByDate.value.get(date) }
}))
const calendarCells = computed(() => {
  const leading = Array.from({ length: monthStart.value.day() }, (_, index) => ({ key: `leading-${props.month}-${index}`, date: '', day: 0, info: undefined }))
  const used = leading.length + monthDays.value.length
  const trailing = Array.from({ length: (7 - (used % 7)) % 7 }, (_, index) => ({ key: `trailing-${props.month}-${index}`, date: '', day: 0, info: undefined }))
  return [...leading, ...monthDays.value, ...trailing]
})

function statusLabel(status?: AttendanceCalendarStatus) { return status ? statusLabels[status] : '未排班' }
function hours(minutes: number) {
  const value = minutes / 60
  return `${Number.isInteger(value) ? value : Number(value.toFixed(1))} 小时`
}
function clock(value: string) { return value.match(/T(\d{2}:\d{2})/)?.[1] || value.slice(0, 5) }
function plannedSummary(info?: AttendanceCalendarDay) {
  if (!info?.schedule) return '排班 未设置'
  if (!info.schedule.isWorkday) return '排班 休息日'
  return `排班 ${info.schedule.segments.map((segment) => `${segment.startTime}–${segment.endTime}`).join('、') || '未设时段'}`
}
function actualSummary(info?: AttendanceCalendarDay) {
  if (!info?.actualSegments.length) return ''
  return `实际 ${info.actualSegments.map((segment) => `${clock(segment.checkInAt)}–${clock(segment.checkOutAt)}`).join('、')}`
}
function leaveSummary(info?: AttendanceCalendarDay) {
  if (!info?.approvedLeaveMinutes) return ''
  return `请假 ${hours(info.approvedLeaveMinutes)}${info.leaveTypeName ? ` · ${info.leaveTypeName}` : ''}`
}
function overtimeSummary(info?: AttendanceCalendarDay) { return info?.overtimeMinutes ? `加班 ${hours(info.overtimeMinutes)}` : '' }
function exceptionSummary(info?: AttendanceCalendarDay) {
  if (!info) return ''
  if (info.status === 'ABSENT') return `异常 旷工${info.absenceReason ? ` · ${info.absenceReason}` : ''}`
  if (info.shortageMinutes > 0) return `异常 出勤不足 ${hours(info.shortageMinutes)}`
  return ''
}
function dayAriaLabel(date: string, info?: AttendanceCalendarDay) {
  return [date, statusLabel(info?.status), plannedSummary(info), actualSummary(info), leaveSummary(info), overtimeSummary(info), exceptionSummary(info)].filter(Boolean).join('，')
}
function select(date: string) { props.batchMode ? emit('toggleDate', date) : emit('selectDate', date) }
</script>

<style scoped>
.mobile-attendance-calendar{min-width:0;overflow:hidden;border:1px solid #dbe5f0;border-radius:12px;background:#fff}.mobile-attendance-calendar__legend{display:flex;flex-wrap:wrap;gap:8px 12px;padding:10px 12px;color:#475569;font-size:11px}.mobile-attendance-calendar__legend span{display:inline-flex;align-items:center;gap:5px}.mobile-attendance-calendar__legend i{width:10px;height:10px;border:1px solid #cbd5e1;border-radius:3px}.mobile-attendance-calendar__swatch--future{background:#fff}.mobile-attendance-calendar__swatch--normal{background:#ecfdf3}.mobile-attendance-calendar__swatch--leave{background:#fef9c3}.mobile-attendance-calendar__swatch--absent{background:#fee2e2}.mobile-attendance-calendar__swatch--rest{background:#f1f5f9}.mobile-attendance-calendar__weekdays,.mobile-attendance-calendar__grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.mobile-attendance-calendar__weekdays{background:#eff6ff;color:#475569;font-size:11px}.mobile-attendance-calendar__weekdays span{padding:8px 2px;text-align:center}.mobile-attendance-calendar__blank{min-height:44px;background:#f8fafc;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0}.mobile-attendance-day{min-width:0;min-height:104px;padding:5px 3px;overflow:hidden;color:#1e293b;text-align:left;border:0;border-top:1px solid #e2e8f0;border-right:1px solid #e2e8f0;cursor:pointer}.mobile-attendance-calendar__grid>:nth-child(7n){border-right:0}.mobile-attendance-day--future{background:#fff}.mobile-attendance-day--normal{background:#ecfdf3}.mobile-attendance-day--leave{background:#fef9c3}.mobile-attendance-day--absent{background:#fee2e2}.mobile-attendance-day--rest{background:#f1f5f9}.mobile-attendance-day--selected{box-shadow:inset 0 0 0 2px #2563eb}.mobile-attendance-day__heading{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:2px}.mobile-attendance-day__heading strong{font-size:13px}.mobile-attendance-day__heading b{min-width:0;overflow:hidden;color:#475569;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.mobile-attendance-day__summary{display:block;margin-top:3px;font-size:9px;line-height:1.25;overflow-wrap:anywhere}.mobile-attendance-day__summary--leave{color:#854d0e}.mobile-attendance-day__summary--overtime{color:#1d4ed8;font-weight:700}.mobile-attendance-day__summary--exception{color:#b91c1c;font-weight:700}@media(orientation:landscape){.mobile-attendance-day{min-height:90px;padding-inline:5px}.mobile-attendance-day__summary{font-size:10px}}
</style>
