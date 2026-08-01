import request, { useMocks } from '@/utils/request'
import type { CustomerOverviewRow } from '@/types/customerOverview'

export async function getCustomerOverview(): Promise<CustomerOverviewRow[]> {
  if (useMocks) return []
  return request.get('/reports/customer-overview')
}
