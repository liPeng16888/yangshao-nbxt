import dayjs from 'dayjs'

export function todayInBeijing() {
  return dayjs().format('YYYY-MM-DD')
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
