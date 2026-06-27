import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { RemindersService } from './reminders.service'

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@CurrentUserInfo() user: CurrentUser) {
    return this.reminders.listForFrontendUser(user.id)
  }

  @Patch(':id/read')
  markRead(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.reminders.markRead(user.id, id)
  }
}
