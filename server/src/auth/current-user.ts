import type { UserRole } from '@prisma/client'

export interface CurrentUser {
  id: string
  account: string
  username: string
  role: UserRole
}
