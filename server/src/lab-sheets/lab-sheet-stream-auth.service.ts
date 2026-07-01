import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'

@Injectable()
export class LabSheetStreamAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async verifyFrontendToken(token?: string): Promise<CurrentUser> {
    if (!token) throw new UnauthorizedException('请先登录')
    try {
      const payload = jwt.verify(token, this.config.get<string>('JWT_SECRET') || 'dev-secret') as { sub: string }
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
      if (!user || user.deletedAt || user.disabled) {
        throw new UnauthorizedException({
          code: user?.disabled ? 'ACCOUNT_DISABLED' : 'UNAUTHORIZED',
          message: user?.disabled ? user.disabledReason || '已禁止登录，请联系管理员解除' : '登录已失效'
        })
      }
      if (user.role !== UserRole.FRONTEND_USER) throw new ForbiddenException('无权访问')
      return { id: user.id, account: user.account, username: user.username, role: user.role }
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error
      throw new UnauthorizedException('登录已失效')
    }
  }
}
