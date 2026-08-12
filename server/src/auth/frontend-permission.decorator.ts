import { SetMetadata } from '@nestjs/common'
import type { FrontendMenuPermission } from '@prisma/client'

export const FRONTEND_PERMISSIONS_KEY = 'frontend-menu-permissions'

export const FrontendPermission = (...permissions: FrontendMenuPermission[]) => (
  SetMetadata(FRONTEND_PERMISSIONS_KEY, permissions)
)
