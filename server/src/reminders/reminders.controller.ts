import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { RemindersService } from './reminders.service'

@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
@FrontendPermission(
  'FINANCE_EXPENSES', 'FINANCE_INCOME', 'FINANCE_UNSETTLED',
  'FINANCE_MONTHLY_SETTLEMENT', 'PREPAID_RECHARGE', 'PREPAID_CUSTOMERS',
  'PREPAID_CONSUMPTIONS', 'PREPAID_SETTLEMENTS'
)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@CurrentUserInfo() user: CurrentUser) {
    return this.reminders.listForFrontendUser(user.dataOwnerId)
  }

  @Patch(':id/read')
  markRead(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.reminders.markRead(user.dataOwnerId, id)
  }
}
