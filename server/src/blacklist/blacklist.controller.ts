import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { BlacklistService } from './blacklist.service'

@Controller('blacklist')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
export class BlacklistController {
  constructor(private readonly blacklist: BlacklistService) {}

  @Get()
  search(@CurrentUserInfo() user: CurrentUser, @Query('keyword') keyword?: string) {
    return this.blacklist.search(user.id, keyword)
  }

  @Get('check')
  check(@CurrentUserInfo() user: CurrentUser, @Query('keyword') keyword = '') {
    return this.blacklist.check(user.id, keyword)
  }

  @Post()
  create(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.blacklist.create(user.id, body)
  }

  @Patch(':id')
  update(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.blacklist.update(user.id, id, body)
  }

  @Delete(':id')
  delete(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.blacklist.delete(user.id, id)
  }
}
