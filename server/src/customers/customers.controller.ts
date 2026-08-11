import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { CustomersService } from './customers.service'

@Controller('customers')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
@FrontendPermission('DATA_MAIN', 'CUSTOMER_OVERVIEW', 'PREPAID_RECHARGE', 'PREPAID_CUSTOMERS')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUserInfo() user: CurrentUser, @Query('keyword') keyword?: string) {
    return this.customers.list(user.dataOwnerId, keyword)
  }

  @Post()
  create(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.customers.create(user.dataOwnerId, user.id, body)
  }

  @Delete(':id')
  remove(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: { baseUpdatedAt?: string }) {
    return this.customers.remove(user.dataOwnerId, user.id, id, body?.baseUpdatedAt)
  }
}
