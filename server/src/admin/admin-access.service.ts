import { ForbiddenException, Injectable } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'

@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllowedFrontendUserIds(user: CurrentUser, requestedIds?: string[]) {
    if (user.role === UserRole.ROOT_ADMIN) {
      if (requestedIds?.length) return requestedIds
      const users = await this.prisma.user.findMany({
        where: { role: UserRole.FRONTEND_USER, deletedAt: null },
        select: { id: true }
      })
      return users.map((item) => item.id)
    }

    if (user.role !== UserRole.SUB_ADMIN) throw new ForbiddenException('没有后台访问权限')
    const permissions = await this.prisma.subAdminFrontendPermission.findMany({
      where: { subAdminId: user.id },
      select: { frontendUserId: true }
    })
    const allowed = permissions.map((item) => item.frontendUserId)
    if (!requestedIds?.length) return allowed
    const denied = requestedIds.some((id) => !allowed.includes(id))
    if (denied) throw new ForbiddenException('没有访问部分前端账号的权限')
    return requestedIds
  }

  parseFrontendUserIds(value?: string | string[]) {
    const raw = Array.isArray(value) ? value.join(',') : value || ''
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}
