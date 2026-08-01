import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
const BUSINESS_DAY_START_HOUR_MS = 4 * 60 * 60 * 1000
const BEIJING_BUSINESS_DATE_SHIFT_MS = BEIJING_UTC_OFFSET_MS - BUSINESS_DAY_START_HOUR_MS

export function todayInBeijing() {
  return dayjs().format('YYYY-MM-DD')
}

export function businessDateInBeijing(now = new Date()) {
  return new Date(now.getTime() + BEIJING_BUSINESS_DATE_SHIFT_MS).toISOString().slice(0, 10)
}

export function millisecondsUntilNextBusinessDayInBeijing(now = new Date()) {
  const shifted = new Date(now.getTime() + BEIJING_BUSINESS_DATE_SHIFT_MS)
  const nextShiftedMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1
  )
  return nextShiftedMidnight - shifted.getTime()
}

export function currentMonth() {
  return dayjs().format('YYYY-MM')
}

export function formatDateTime(value: string | Date) {
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

export function getReportRange(mode: 'daily' | 'weekly' | 'monthly' | 'custom', date: string, startDate?: string, endDate?: string) {
  const base = dayjs(date)
  if (mode === 'weekly') {
    const day = base.day()
    const diffToMonday = day === 0 ? -6 : 1 - day
    const start = base.add(diffToMonday, 'day')
    return { startDate: start.format('YYYY-MM-DD'), endDate: start.add(6, 'day').format('YYYY-MM-DD') }
  }
  if (mode === 'monthly') {
    return { startDate: base.startOf('month').format('YYYY-MM-DD'), endDate: base.endOf('month').format('YYYY-MM-DD') }
  }
  if (mode === 'custom') {
    return { startDate: startDate || date, endDate: endDate || date }
  }
  return { startDate: date, endDate: date }
}
