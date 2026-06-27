import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from './current-user'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: CurrentUser }>()
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
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
      request.user = { id: user.id, account: user.account, username: user.username, role: user.role }
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('登录已失效')
    }
  }
}
