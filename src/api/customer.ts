import request, { useMocks } from '@/utils/request'
import type { Customer, CustomerPayload } from '@/types/customer'
import { mockCreateCustomer, mockDeleteCustomer, mockSearchCustomers } from '@/mocks/db'

export async function searchCustomers(keyword: string): Promise<Customer[]> {
  if (useMocks) return mockSearchCustomers(keyword)
  return request.get('/customers', { params: { keyword } })
}

export async function createCustomer(payload: CustomerPayload): Promise<Customer> {
  if (useMocks) return mockCreateCustomer(payload)
  return request.post('/customers', payload)
}

export async function deleteCustomer(id: string): Promise<{ id: string }> {
  if (useMocks) return mockDeleteCustomer(id)
  return request.delete(`/customers/${encodeURIComponent(id)}`)
}
