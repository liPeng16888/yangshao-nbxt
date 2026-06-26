export type ReportMode = 'daily' | 'weekly' | 'monthly' | 'custom'

export interface DateRange {
  mode: ReportMode
  date?: string
  startDate?: string
  endDate?: string
}

export interface SampleDetectionDailyRow {
  date: string
  sampleCount: number
  totalPrice: number
}

export interface SampleDetectionReport {
  summary: {
    totalSamples: number
    totalPrice: number
    averageSamples: number
    averagePrice: number
  }
  rows: SampleDetectionDailyRow[]
}

export interface FinanceDailyRow {
  date: string
  amount: number
  count: number
  mainCategory: string
}

export interface FinanceCategoryRow {
  category: string
  amount: number
  count: number
  color: string
}

export interface FinanceReport {
  summary: {
    totalAmount: number
    totalCount: number
    averageAmount: number
    highestExpenseDay: string
  }
  rows: FinanceDailyRow[]
  categories: FinanceCategoryRow[]
}

export interface FinanceCategoryRule {
  name: string
  color: string
  keywords: string[]
}
