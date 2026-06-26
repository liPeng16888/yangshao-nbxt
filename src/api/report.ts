import request, { useMocks } from '@/utils/request'
import type { DateRange, FinanceCategoryRule, FinanceReport, SampleDetectionReport } from '@/types/report'
import { mockFinanceCategories, mockFinanceReport, mockSampleDetectionReport } from '@/mocks/db'

export async function getSampleDetectionReport(range: DateRange): Promise<SampleDetectionReport> {
  if (useMocks) return mockSampleDetectionReport(range)
  return request.get('/reports/sample-detection', { params: range })
}

export async function getFinanceReport(range: DateRange): Promise<FinanceReport> {
  if (useMocks) return mockFinanceReport(range)
  return request.get('/reports/finance', { params: range })
}

export async function getFinanceCategories(): Promise<FinanceCategoryRule[]> {
  if (useMocks) return mockFinanceCategories()
  return request.get('/reports/finance/categories')
}
