import dayjs from 'dayjs'

const BEIJING_UTC_OFFSET_MS = 8 * 60 * 60 * 1000
const BUSINESS_DAY_START_HOUR_MS = 4 * 60 * 60 * 1000
const BEIJING_BUSINESS_DATE_SHIFT_MS = BEIJING_UTC_OFFSET_MS - BUSINESS_DAY_START_HOUR_MS

export function todayInBeijing() {
  return dayjs().format('YYYY-MM-DD')
}

export function businessDateInBeijing(now = new Date()) {
  return new Date(now.getTime() + BEIJING_BUSINESS_DATE_SHIFT_MS).toISOString().slice(0, 10)
}

export function currentMonthInBeijing() {
  return dayjs().format('YYYY-MM')
}

export function getDateRangeFromQuery(query: { date?: string; startDate?: string; endDate?: string }) {
  const today = todayInBeijing()
  return {
    startDate: query.startDate || query.date || today,
    endDate: query.endDate || query.date || today
  }
}

export function datesBetween(startDate: string, endDate: string) {
  const dates: string[] = []
  let cursor = dayjs(startDate)
  const end = dayjs(endDate)
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }
  return dates
}
