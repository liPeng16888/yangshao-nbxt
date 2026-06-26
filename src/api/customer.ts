import request, { useMocks } from '@/utils/request'
import type { Customer, CustomerPayload } from '@/types/customer'
import { mockCreateCustomer, mockSearchCustomers } from '@/mocks/db'

export async function searchCustomers(keyword: string): Promise<Customer[]> {
  if (useMocks) return mockSearchCustomers(keyword)
  return request.get('/customers', { params: { keyword } })
}

export async function createCustomer(payload: CustomerPayload): Promise<Customer> {
  if (useMocks) return mockCreateCustomer(payload)
  return request.post('/customers', payload)
}
