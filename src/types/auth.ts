import type { FrontendMenuPermission } from '@/config/frontendNavigation'

export interface AuthUser {
  id: string
  username: string
  account: string
  role: 'ROOT_ADMIN' | 'SUB_ADMIN' | 'FRONTEND_USER' | 'FRONTEND_SUB_USER' | 'admin' | 'staff'
  dataOwnerId?: string
  permissionVersion?: number
  permissions?: FrontendMenuPermission[]
  requiresAccessGuardPassword?: boolean
  isFrontendMainAccount?: boolean
  isFrontendSubAccount?: boolean
}

export interface LoginPayload {
  account: string
  password: string
}

export interface RegisterPayload {
  username: string
  account: string
  password: string
  confirmPassword: string
  inviteCode: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export interface UpdatePasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}
