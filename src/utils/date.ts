import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'

dayjs.locale('zh-cn')

export function todayInBeijing() {
  return dayjs().format('YYYY-MM-DD')
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
