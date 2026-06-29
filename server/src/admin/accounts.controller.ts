import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { AdminAccountsService, CreateSubAdminPayload, FrontendAccountRemarkPayload } from './accounts.service'

@Controller('admin/accounts')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ROOT_ADMIN)
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get('frontend-users')
  listFrontendUsers() {
    return this.accounts.listFrontendUsers()
  }

  @Post('invite-codes')
  createInviteCode(@CurrentUserInfo() user: CurrentUser, @Body() body: { note?: string; expiresAt?: string }) {
    return this.accounts.createInviteCode(user, body)
  }

  @Patch('frontend-users/:id/disabled')
  setFrontendDisabled(@Param('id') id: string, @Body() body: { disabled: boolean; disabledReason?: string }) {
    return this.accounts.setFrontendDisabled(id, Boolean(body.disabled), body.disabledReason)
  }

  @Patch('frontend-users/:id/remark')
  updateFrontendRemark(@Param('id') id: string, @Body() body: FrontendAccountRemarkPayload) {
    return this.accounts.updateFrontendRemark(id, body)
  }

  @Delete('frontend-users/:id')
  deleteFrontendUser(@Param('id') id: string) {
    return this.accounts.deleteFrontendUser(id)
  }

  @Get('sub-admins')
  listSubAdmins() {
    return this.accounts.listSubAdmins()
  }

  @Post('sub-admins')
  createSubAdmin(@CurrentUserInfo() user: CurrentUser, @Body() body: CreateSubAdminPayload) {
    return this.accounts.createSubAdmin(user, body)
  }

  @Patch('sub-admins/:id/permissions')
  updateSubAdminPermissions(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: { frontendUserIds?: string[] }) {
    return this.accounts.updateSubAdminPermissions(user, id, body.frontendUserIds || [])
  }
}
