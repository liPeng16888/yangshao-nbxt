import { UnauthorizedException } from '@nestjs/common'
import { UserRole, type FrontendMenuPermission } from '@prisma/client'
import type { PrismaService } from '../prisma/prisma.service'

export interface CurrentUser {
  id: string
  account: string
  username: string
  role: UserRole
  dataOwnerId: string
  permissionVersion: number
  permissions: FrontendMenuPermission[]
  requiresAccessGuardPassword: boolean
  isFrontendMainAccount: boolean
  isFrontendSubAccount: boolean
}

export async function resolveCurrentUserIdentity(
  prisma: PrismaService,
  userId: string,
  tokenPermissionVersion: number
): Promise<CurrentUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      parentFrontendUser: {
        select: { id: true, role: true, disabled: true, deletedAt: true }
      },
      frontendSubAccountPermissions: {
        select: { permission: true },
        orderBy: { permission: 'asc' }
      }
    }
  })

  if (!user || user.deletedAt || user.disabled) {
    throw new UnauthorizedException({
      code: user?.disabled ? 'ACCOUNT_DISABLED' : 'UNAUTHORIZED',
      message: user?.disabled ? user.disabledReason || '已禁止登录，请联系管理员解除' : '登录已失效'
    })
  }
  if (!Number.isInteger(tokenPermissionVersion) || tokenPermissionVersion !== user.permissionVersion) {
    throw new UnauthorizedException('账号权限已更新，请重新登录')
  }

  const isFrontendSubAccount = user.role === UserRole.FRONTEND_SUB_USER
  const isFrontendMainAccount = user.role === UserRole.FRONTEND_USER
  let dataOwnerId = user.id
  if (isFrontendSubAccount) {
    const parent = user.parentFrontendUser
    if (
      !user.parentFrontendUserId || !parent || parent.id !== user.parentFrontendUserId ||
      parent.role !== UserRole.FRONTEND_USER || parent.disabled || parent.deletedAt
    ) {
      throw new UnauthorizedException('主账号已停用，请联系管理员')
    }
    dataOwnerId = parent.id
  }

  return {
    id: user.id,
    account: user.account,
    username: user.username,
    role: user.role,
    dataOwnerId,
    permissionVersion: user.permissionVersion,
    permissions: isFrontendSubAccount
      ? user.frontendSubAccountPermissions.map((item) => item.permission)
      : [],
    requiresAccessGuardPassword: isFrontendSubAccount ? user.requiresAccessGuardPassword : true,
    isFrontendMainAccount,
    isFrontendSubAccount
  }
}
