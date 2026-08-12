import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import jwt from 'jsonwebtoken'
import type { CurrentUser } from './current-user'
import { resolveCurrentUserIdentity } from './current-user'
import { PrismaService } from '../prisma/prisma.service'

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
      const payload = jwt.verify(token, this.config.get<string>('JWT_SECRET') || 'dev-secret') as {
        sub: string
        permissionVersion: number
      }
      request.user = await resolveCurrentUserIdentity(this.prisma, payload.sub, payload.permissionVersion)
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('登录已失效')
    }
  }
}
