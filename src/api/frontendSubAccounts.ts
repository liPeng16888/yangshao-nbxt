import request, { useMocks } from '@/utils/request'
import {
  mockCreateFrontendSubAccount,
  mockDeleteFrontendSubAccount,
  mockFrontendSubAccounts,
  mockResetFrontendSubAccountPassword,
  mockSetFrontendSubAccountStatus,
  mockUpdateFrontendSubAccount
} from '@/mocks/db'
import type {
  CreateFrontendSubAccountPayload,
  FrontendSubAccountDto,
  ResetFrontendSubAccountPasswordPayload,
  UpdateFrontendSubAccountPayload
} from '@/types/frontendSubAccount'

export async function listFrontendSubAccounts(): Promise<FrontendSubAccountDto[]> {
  if (useMocks) return mockFrontendSubAccounts()
  return request.get('/auth/frontend-subaccounts')
}

export async function createFrontendSubAccount(payload: CreateFrontendSubAccountPayload): Promise<FrontendSubAccountDto> {
  if (useMocks) return mockCreateFrontendSubAccount(payload)
  return request.post('/auth/frontend-subaccounts', payload)
}

export async function updateFrontendSubAccount(id: string, payload: UpdateFrontendSubAccountPayload): Promise<FrontendSubAccountDto> {
  if (useMocks) return mockUpdateFrontendSubAccount(id, payload)
  return request.patch(`/auth/frontend-subaccounts/${id}`, payload)
}

export async function setFrontendSubAccountStatus(id: string, disabled: boolean, disabledReason?: string) {
  if (useMocks) return mockSetFrontendSubAccountStatus(id, disabled, disabledReason)
  return request.patch(`/auth/frontend-subaccounts/${id}/status`, { disabled, disabledReason })
}

export async function resetFrontendSubAccountPassword(id: string, payload: ResetFrontendSubAccountPasswordPayload) {
  if (useMocks) return mockResetFrontendSubAccountPassword(id, payload)
  return request.post(`/auth/frontend-subaccounts/${id}/reset-password`, payload)
}

export async function deleteFrontendSubAccount(id: string) {
  if (useMocks) return mockDeleteFrontendSubAccount(id)
  return request.delete(`/auth/frontend-subaccounts/${id}`)
}
