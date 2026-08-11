import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { resolveCurrentUserIdentity } from '../auth/current-user'

@Injectable()
export class LabSheetStreamAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async verifyFrontendToken(token?: string): Promise<CurrentUser> {
    if (!token) throw new UnauthorizedException('请先登录')
    try {
      const payload = jwt.verify(token, this.config.get<string>('JWT_SECRET') || 'dev-secret') as {
        sub: string
        permissionVersion: number
      }
      const user = await resolveCurrentUserIdentity(this.prisma, payload.sub, payload.permissionVersion)
      if (user.role !== UserRole.FRONTEND_USER && user.role !== UserRole.FRONTEND_SUB_USER) {
        throw new ForbiddenException('无权访问')
      }
      return user
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error
      throw new UnauthorizedException('登录已失效')
    }
  }
}
