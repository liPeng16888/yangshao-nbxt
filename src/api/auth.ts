import request, { useMocks } from '@/utils/request'
import type { AuthResponse, AuthUser, LoginPayload, RegisterPayload } from '@/types/auth'
import { mockLogin, mockMe, mockRegister } from '@/mocks/db'

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  if (useMocks) return mockLogin(payload)
  return request.post('/auth/login', payload)
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  if (useMocks) return mockRegister(payload)
  return request.post('/auth/register', payload)
}

export async function getMe(): Promise<AuthUser> {
  if (useMocks) return mockMe()
  return request.get('/auth/me')
}

export async function logout() {
  if (useMocks) return Promise.resolve()
  return request.post('/auth/logout')
}
