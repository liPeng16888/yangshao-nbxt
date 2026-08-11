<template>
  <section class="monthly-schedule-calendar" data-testid="monthly-schedule-calendar">
    <div class="calendar-legend" data-testid="attendance-calendar-legend" aria-label="考勤状态图例">
      <span v-for="item in legend" :key="item.tone"><i :class="`legend-swatch--${item.tone}`" />{{ item.label }}</span>
    </div>
    <div class="calendar-weekdays">
      <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
    </div>
    <div class="calendar-grid">
      <div v-for="cell in cells" :key="cell.key" class="calendar-cell" :class="{ 'calendar-cell--blank': !cell.date }">
        <button
          v-if="cell.date"
          type="button"
          class="calendar-day"
          :class="[`calendar-day--${cell.info?.backgroundTone || 'future'}`, { 'calendar-day--selected': selectedDates.includes(cell.date) }]"
          :data-date="cell.date"
          :data-status="cell.info?.status || 'FUTURE'"
          @click="select(cell.date)"
        >
          <span class="calendar-day__number">{{ cell.day }}</span>
          <template v-if="cell.info?.schedule?.isWorkday">
            <span v-for="segment in cell.info.schedule.segments" :key="`${segment.startTime}-${segment.endTime}`" class="calendar-day__segment calendar-day__segment--planned">
              {{ segment.startTime }}–{{ segment.endTime }}
            </span>
          </template>
          <template v-if="cell.info">
            <span class="calendar-day__status">{{ statusLabel(cell.info.status) }}</span>
            <span v-if="cell.info.durationText" class="calendar-day__duration" :class="`calendar-day__duration--${cell.info.durationTone}`">{{ cell.info.durationText }}</span>
            <span v-if="cell.info.leaveTypeName" class="calendar-day__detail">{{ cell.info.leaveTypeName }}</span>
            <span v-if="cell.info.leaveReason" class="calendar-day__reason">{{ cell.info.leaveReason }}</span>
            <span v-if="cell.info.status === 'ABSENT'" class="calendar-day__reason">{{ cell.info.absenceReason || '未填写原因' }}</span>
          </template>
          <span v-else class="calendar-day__status">未排班</span>
        </button>
      </div>
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

const daysByDate = computed(() => new Map(props.days.map((day) => [day.date, day])))
const legend = [
  { tone: 'future', label: '未来排班' }, { tone: 'normal', label: '正常/加班/出勤不足' },
  { tone: 'leave', label: '请假' }, { tone: 'absent', label: '旷工' }, { tone: 'rest', label: '公司排休' }
]
const cells = computed(() => {
  const start = dayjs(`${props.month || dayjs().format('YYYY-MM')}-01`)
  const leading = Array.from({ length: start.day() }, (_, index) => ({ key: `leading-${index}`, date: '', day: '', info: undefined }))
  const days = Array.from({ length: start.daysInMonth() }, (_, index) => {
    const date = start.add(index, 'day').format('YYYY-MM-DD')
    return { key: date, date, day: String(index + 1), info: daysByDate.value.get(date) }
  })
  const trailing = Array.from({ length: (7 - ((leading.length + days.length) % 7)) % 7 }, (_, index) => ({ key: `trailing-${index}`, date: '', day: '', info: undefined }))
  return [...leading, ...days, ...trailing]
})

const statusLabels: Record<AttendanceCalendarStatus, string> = { FUTURE: '未来排班', ABSENT: '旷工', LEAVE: '请假', REST: '公司排休', NORMAL: '正常', OVERTIME: '加班', SHORT: '出勤不足' }
function statusLabel(status: AttendanceCalendarStatus) { return statusLabels[status] }
function select(date: string) { props.batchMode ? emit('toggleDate', date) : emit('selectDate', date) }
</script>

<style scoped>
.monthly-schedule-calendar{border:1px solid #dbe5f0;border-radius:8px;overflow:hidden}.calendar-legend{display:flex;flex-wrap:wrap;gap:10px 18px;padding:10px 12px;background:#fff;color:#475569;font-size:12px}.calendar-legend span{display:inline-flex;align-items:center;gap:6px}.calendar-legend i{width:12px;height:12px;border:1px solid #cbd5e1;border-radius:3px}.legend-swatch--future{background:#fff}.legend-swatch--normal{background:#ecfdf3}.legend-swatch--leave{background:#fef9c3}.legend-swatch--absent{background:#fee2e2}.legend-swatch--rest{background:#f1f5f9}.calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.calendar-weekdays{background:#eff6ff;color:#475569;font-size:12px}.calendar-weekdays span{padding:8px;text-align:center;border-right:1px solid #dbe5f0}.calendar-weekdays span:last-child{border-right:0}.calendar-cell{min-height:150px;border-right:1px solid #e2e8f0;border-top:1px solid #e2e8f0}.calendar-cell:nth-child(7n){border-right:0}.calendar-cell--blank{background:#f8fafc}.calendar-day{width:100%;height:100%;min-height:149px;border:0;padding:8px;text-align:left;cursor:pointer;color:#1e293b;display:flex;flex-direction:column;gap:4px}.calendar-day--future{background:#fff}.calendar-day--normal{background:#ecfdf3}.calendar-day--leave{background:#fef9c3}.calendar-day--absent{background:#fee2e2}.calendar-day--rest{background:#f1f5f9;color:#64748b}.calendar-day:hover{filter:brightness(.985)}.calendar-day--selected{box-shadow:inset 0 0 0 2px #409eff}.calendar-day__number{font-weight:700;font-size:13px}.calendar-day__segment{font-size:14px;font-weight:600;line-height:1.4}.calendar-day__status{margin-top:auto;font-size:12px;font-weight:600;color:#475569}.calendar-day__duration,.calendar-day__detail,.calendar-day__reason{font-size:12px;line-height:1.4}.calendar-day__duration--overtime{color:#1d4ed8;font-weight:700}.calendar-day__duration--short{color:#dc2626;font-weight:700}.calendar-day__reason{color:#64748b;overflow-wrap:anywhere}@media(max-width:900px){.calendar-cell{min-height:118px}.calendar-day{min-height:117px;padding:5px}.calendar-day__segment{font-size:13px}.calendar-day__detail,.calendar-day__reason{font-size:11px}}
</style>
