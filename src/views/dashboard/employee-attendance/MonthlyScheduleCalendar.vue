<template>
  <section class="monthly-schedule-calendar" data-testid="monthly-schedule-calendar">
    <div class="calendar-weekdays">
      <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
    </div>
    <div class="calendar-grid">
      <div v-for="cell in cells" :key="cell.key" class="calendar-cell" :class="{ 'calendar-cell--blank': !cell.date }">
        <button
          v-if="cell.date"
          type="button"
          class="calendar-day"
          :class="{ 'calendar-day--selected': selectedDates.includes(cell.date), 'calendar-day--rest': cell.row && !cell.row.isWorkday }"
          :data-date="cell.date"
          @click="select(cell.date)"
        >
          <span class="calendar-day__number">{{ cell.day }}</span>
          <template v-if="cell.row?.isWorkday">
            <span v-for="segment in cell.row.segments" :key="`${segment.startTime}-${segment.endTime}`" class="calendar-day__segment">
              {{ segment.startTime }}–{{ segment.endTime }}
            </span>
            <span class="calendar-day__summary">休息 {{ cell.row.breakMinutes }} 分钟 · 工作 {{ hours(cell.row.scheduledMinutes) }} 小时</span>
          </template>
          <span v-else-if="cell.row" class="calendar-day__status">休息</span>
          <span v-else class="calendar-day__status">未排班</span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import type { MonthlyScheduleDay } from '@/types/employeeAttendance'

const props = defineProps<{ month: string; rows: MonthlyScheduleDay[]; selectedDates: string[]; batchMode: boolean }>()
const emit = defineEmits<{ selectDate: [date: string]; toggleDate: [date: string] }>()
const weekdays = ['日', '一', '二', '三', '四', '五', '六']

const rowsByDate = computed(() => new Map(props.rows.map((row) => [row.date, row])))
const cells = computed(() => {
  const start = dayjs(`${props.month || dayjs().format('YYYY-MM')}-01`)
  const leading = Array.from({ length: start.day() }, (_, index) => ({ key: `leading-${index}`, date: '', day: '', row: undefined }))
  const days = Array.from({ length: start.daysInMonth() }, (_, index) => {
    const date = start.add(index, 'day').format('YYYY-MM-DD')
    return { key: date, date, day: String(index + 1), row: rowsByDate.value.get(date) }
  })
  const trailing = Array.from({ length: (7 - ((leading.length + days.length) % 7)) % 7 }, (_, index) => ({ key: `trailing-${index}`, date: '', day: '', row: undefined }))
  return [...leading, ...days, ...trailing]
})

function hours(minutes: number) {
  const value = minutes / 60
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}
function select(date: string) { props.batchMode ? emit('toggleDate', date) : emit('selectDate', date) }
</script>

<style scoped>
.monthly-schedule-calendar{border:1px solid #dbe5f0;border-radius:8px;overflow:hidden}.calendar-weekdays,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.calendar-weekdays{background:#eff6ff;color:#475569;font-size:12px}.calendar-weekdays span{padding:8px;text-align:center;border-right:1px solid #dbe5f0}.calendar-weekdays span:last-child{border-right:0}.calendar-cell{min-height:128px;border-right:1px solid #e2e8f0;border-top:1px solid #e2e8f0}.calendar-cell:nth-child(7n){border-right:0}.calendar-cell--blank{background:#f8fafc}.calendar-day{width:100%;height:100%;min-height:127px;border:0;background:#fff;padding:8px;text-align:left;cursor:pointer;color:#1e293b;display:flex;flex-direction:column;gap:4px}.calendar-day:hover{background:#f8fbff}.calendar-day--selected{box-shadow:inset 0 0 0 2px #409eff;background:#eff6ff}.calendar-day--rest{background:#f8fafc;color:#64748b}.calendar-day__number{font-weight:700;font-size:13px}.calendar-day__segment{font-size:12px;line-height:1.35}.calendar-day__status,.calendar-day__summary{margin-top:auto;font-size:12px;color:#64748b}.calendar-day__summary{line-height:1.45}@media(max-width:900px){.calendar-cell{min-height:100px}.calendar-day{min-height:99px;padding:5px}.calendar-day__summary{display:none}.calendar-day__segment{font-size:11px}}
</style>
