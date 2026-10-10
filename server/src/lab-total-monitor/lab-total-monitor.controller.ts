import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { LabTotalMonitorService } from './lab-total-monitor.service'

@Controller('lab-total-monitor')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
@FrontendPermission('DATA_MAIN')
export class LabTotalMonitorController {
  constructor(private readonly monitor: LabTotalMonitorService) {}
  @Get()
  config(@CurrentUserInfo() user: CurrentUser) { return this.monitor.frontendConfig(user) }
}

@Controller('admin/lab-total-monitor')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
export class AdminLabTotalMonitorController {
  constructor(private readonly monitor: LabTotalMonitorService) {}
  @Post('bulk')
  bulk(@CurrentUserInfo() user: CurrentUser, @Body() body: unknown) { return this.monitor.bulkAppend(user, body) }
  @Get(':frontendUserId')
  config(@CurrentUserInfo() user: CurrentUser, @Param('frontendUserId') id: string) { return this.monitor.adminConfig(user, id) }
  @Put(':frontendUserId')
  save(@CurrentUserInfo() user: CurrentUser, @Param('frontendUserId') id: string, @Body() body: unknown) { return this.monitor.save(user, id, body) }
}
