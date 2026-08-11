import { Controller, Post, Query, Sse, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { from, mergeMap } from 'rxjs'

import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { SharedPrepaidRealtimeService } from './shared-prepaid-realtime.service'

@Controller('shared-prepaid')
export class SharedPrepaidRealtimeController {
  constructor(private readonly realtime: SharedPrepaidRealtimeService) {}

  @Post('stream-ticket')
  @UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission(
    'PREPAID_RECHARGE',
    'PREPAID_CUSTOMERS',
    'PREPAID_CONSUMPTIONS',
    'PREPAID_SETTLEMENTS'
  )
  issueStreamTicket(@CurrentUserInfo() user: CurrentUser) {
    return this.realtime.issueTicket(user)
  }

  @Sse('stream')
  stream(@Query('ticket') ticket?: string) {
    return from(this.realtime.consumeTicket(ticket)).pipe(
      mergeMap((identity) => this.realtime.stream(identity))
    )
  }
}
