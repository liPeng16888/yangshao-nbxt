import request, { useMocks } from '@/utils/request'
import type { FinanceEntry, FinancePayload } from '@/types/finance'
import { mockCreateFinance, mockFinanceByMonth, mockFinanceMonths } from '@/mocks/db'

export async function getFinanceEntries(month: string): Promise<FinanceEntry[]> {
  if (useMocks) return mockFinanceByMonth(month)
  return request.get('/finance', { params: { month } })
}

export async function createFinanceEntry(payload: FinancePayload): Promise<FinanceEntry> {
  if (useMocks) return mockCreateFinance(payload)
  return request.post('/finance', payload)
}

export async function createFinanceEntries(payloads: FinancePayload[]): Promise<FinanceEntry[]> {
  if (useMocks) return Promise.all(payloads.map((payload) => mockCreateFinance(payload)))
  return request.post('/finance', payloads)
}

export async function getFinanceMonths(): Promise<string[]> {
  if (useMocks) return mockFinanceMonths()
  return request.get('/finance/months')
}

export async function requestFinanceEntryDeletion(sourceId: string, reason: string): Promise<{ id: string; status: 'PENDING' }> {
  if (useMocks) return { id: `delete-request-${Date.now()}`, status: 'PENDING' }
  return request.post('/finance/delete-requests', { sourceType: 'expense', sourceId, reason })
}
