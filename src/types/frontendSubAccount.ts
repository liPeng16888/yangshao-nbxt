import type { FrontendMenuPermission } from '@/config/frontendNavigation'

export interface FrontendSubAccountDto {
  id: string
  account: string
  username: string
  disabled: boolean
  disabledReason?: string | null
  requiresAccessGuardPassword: boolean
  permissionVersion: number
  permissions: FrontendMenuPermission[]
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateFrontendSubAccountPayload {
  account: string
  username: string
  password: string
  confirmPassword: string
  permissions: FrontendMenuPermission[]
  requiresAccessGuardPassword: boolean
}

export interface UpdateFrontendSubAccountPayload {
  username: string
  permissions: FrontendMenuPermission[]
  requiresAccessGuardPassword: boolean
}

export interface ResetFrontendSubAccountPasswordPayload {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}
