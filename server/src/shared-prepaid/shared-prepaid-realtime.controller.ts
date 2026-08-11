import { Controller, ForbiddenException, Query, Sse, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { from, mergeMap } from 'rxjs'

import { resolveCurrentUserIdentity } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'
import { SharedPrepaidRealtimeService } from './shared-prepaid-realtime.service'

@Controller('shared-prepaid')
export class SharedPrepaidRealtimeController {
  constructor(
    private readonly realtime: SharedPrepaidRealtimeService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  @Sse('stream')
  stream(@Query('token') token?: string) {
    return from(this.verifyFrontendToken(token)).pipe(
      mergeMap((identity) => this.realtime.stream(
        identity,
        () => this.verifyFrontendToken(token)
      ))
    )
  }

  private async verifyFrontendToken(token?: string) {
    if (!token) throw new UnauthorizedException('请先登录')
    try {
      const payload = jwt.verify(token, this.config.get<string>('JWT_SECRET') || 'dev-secret') as {
        sub: string
        permissionVersion: number
      }
      const identity = await resolveCurrentUserIdentity(
        this.prisma,
        payload.sub,
        payload.permissionVersion
      )
      if (identity.role !== UserRole.FRONTEND_USER && identity.role !== UserRole.FRONTEND_SUB_USER) {
        throw new ForbiddenException('无权访问')
      }
      this.realtime.assertCanConnect(identity)
      return identity
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error
      throw new UnauthorizedException('登录已失效')
    }
  }
}
