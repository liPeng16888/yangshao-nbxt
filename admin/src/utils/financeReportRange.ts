import dayjs from 'dayjs'

export type FinanceReportMode = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface FinanceReportRange {
  startDate: string
  endDate: string
}

export function buildFinanceReportRange(
  mode: FinanceReportMode,
  date: string,
  customStartDate = '',
  customEndDate = ''
): FinanceReportRange {
  const base = dayjs(date)
  if (mode === 'weekly') {
    return {
      startDate: base.startOf('week').format('YYYY-MM-DD'),
      endDate: base.endOf('week').format('YYYY-MM-DD')
    }
  }
  if (mode === 'monthly') {
    return {
      startDate: base.startOf('month').format('YYYY-MM-DD'),
      endDate: base.endOf('month').format('YYYY-MM-DD')
    }
  }
  if (mode === 'custom') {
    return {
      startDate: customStartDate || date,
      endDate: customEndDate || customStartDate || date
    }
  }
  return { startDate: date, endDate: date }
}
