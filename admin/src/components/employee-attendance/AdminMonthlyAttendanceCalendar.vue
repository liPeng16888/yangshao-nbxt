<template>
  <section class="admin-attendance-calendar" data-testid="admin-monthly-attendance-calendar">
    <div class="calendar-legend" data-testid="admin-attendance-calendar-legend">
      <span v-for="item in legend" :key="item.tone"><i :class="`legend-swatch--${item.tone}`" />{{ item.label }}</span>
    </div>
    <div class="calendar-weekdays"><span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span></div>
    <div class="calendar-grid">
      <div v-for="cell in cells" :key="cell.key" class="calendar-cell" :class="{ 'calendar-cell--blank': !cell.date }">
        <article v-if="cell.date" class="calendar-day" :class="`calendar-day--${cell.info?.backgroundTone || 'future'}`" :data-date="cell.date" :data-status="cell.info?.status || 'FUTURE'">
          <span class="calendar-day__number">{{ cell.day }}</span>
          <span v-for="segment in cell.info?.schedule?.segments || []" :key="`${segment.startTime}-${segment.endTime}`" class="calendar-day__segment">{{ segment.startTime }}–{{ segment.endTime }}</span>
          <template v-if="cell.info">
            <span class="calendar-day__status">{{ labels[cell.info.status] }}</span>
            <span v-if="cell.info.durationText" class="calendar-day__duration" :class="`calendar-day__duration--${cell.info.durationTone}`">{{ cell.info.durationText }}</span>
            <span v-if="cell.info.leaveTypeName" class="calendar-day__detail">{{ cell.info.leaveTypeName }}</span>
            <span v-if="cell.info.leaveReason" class="calendar-day__reason">{{ cell.info.leaveReason }}</span>
            <span v-if="cell.info.status === 'ABSENT'" class="calendar-day__reason">{{ cell.info.absenceReason || '未填写原因' }}</span>
          </template>
          <span v-else class="calendar-day__status">未排班</span>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import type { AdminAttendanceCalendarDay, AdminAttendanceCalendarStatus } from '../../types'
const props = defineProps<{ month: string; days: AdminAttendanceCalendarDay[] }>()
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const legend = [{ tone: 'future', label: '未来排班' }, { tone: 'normal', label: '正常/加班/出勤不足' }, { tone: 'leave', label: '请假' }, { tone: 'absent', label: '旷工' }, { tone: 'rest', label: '公司排休' }]
const labels: Record<AdminAttendanceCalendarStatus, string> = { FUTURE: '未来排班', ABSENT: '旷工', LEAVE: '请假', REST: '公司排休', NORMAL: '正常', OVERTIME: '加班', SHORT: '出勤不足' }
const byDate = computed(() => new Map(props.days.map((day) => [day.date, day])))
const cells = computed(() => {
  const start = dayjs(`${props.month}-01`)
  const leading = Array.from({ length: start.day() }, (_, index) => ({ key: `leading-${index}`, date: '', day: '', info: undefined }))
  const days = Array.from({ length: start.daysInMonth() }, (_, index) => { const date = start.add(index, 'day').format('YYYY-MM-DD'); return { key: date, date, day: index + 1, info: byDate.value.get(date) } })
  const trailing = Array.from({ length: (7 - ((leading.length + days.length) % 7)) % 7 }, (_, index) => ({ key: `trailing-${index}`, date: '', day: '', info: undefined }))
  return [...leading, ...days, ...trailing]
})
</script>

<style scoped>
.admin-attendance-calendar{border:1px solid var(--ui-line);border-radius:8px;overflow:hidden}.calendar-legend{display:flex;flex-wrap:wrap;gap:10px 18px;padding:10px 12px;color:var(--ui-text-secondary);font-size:12px}.calendar-legend span{display:inline-flex;align-items:center;gap:6px}.calendar-legend i{width:12px;height:12px;border:1px solid var(--ui-line);border-radius:3px}.legend-swatch--future{background:#fff}.legend-swatch--normal{background:var(--ui-success-soft)}.legend-swatch--leave{background:var(--ui-warning-soft)}.legend-swatch--absent{background:var(--ui-danger-soft)}.legend-swatch--rest{background:var(--ui-surface-subtle)}.calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.calendar-weekdays{background:var(--ui-accent-soft);color:var(--ui-text-secondary);font-size:12px}.calendar-weekdays span{padding:8px;text-align:center}.calendar-cell{min-height:145px;border-right:1px solid var(--ui-line-soft);border-top:1px solid var(--ui-line-soft)}.calendar-cell:nth-child(7n){border-right:0}.calendar-cell--blank{background:var(--ui-surface-subtle)}.calendar-day{box-sizing:border-box;min-height:144px;padding:8px;display:flex;flex-direction:column;gap:4px;color:var(--ui-text)}.calendar-day--future{background:#fff}.calendar-day--normal{background:var(--ui-success-soft)}.calendar-day--leave{background:var(--ui-warning-soft)}.calendar-day--absent{background:var(--ui-danger-soft)}.calendar-day--rest{background:var(--ui-surface-subtle)}.calendar-day__number{font-weight:700}.calendar-day__segment{font-size:14px;font-weight:600}.calendar-day__status{margin-top:auto;font-size:12px;font-weight:600;color:var(--ui-text-secondary)}.calendar-day__duration,.calendar-day__detail,.calendar-day__reason{font-size:12px;line-height:1.4}.calendar-day__duration--overtime{color:var(--ui-accent-hover);font-weight:700}.calendar-day__duration--short{color:var(--ui-danger);font-weight:700}.calendar-day__reason{color:var(--ui-text-muted)}@media(max-width:900px){.calendar-cell,.calendar-day{min-height:112px}.calendar-day{padding:5px}.calendar-day__segment{font-size:13px}}
@media(max-width:900px){.admin-attendance-calendar{max-width:100%;overflow-x:auto}.calendar-weekdays,.calendar-grid{min-width:630px}}
</style>
