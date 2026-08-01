import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { AdminDataService } from './data.service'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
export class AdminDataController {
  constructor(private readonly data: AdminDataService) {}

  @Get('frontend-users/options')
  frontendOptions(@CurrentUserInfo() user: CurrentUser) {
    return this.data.frontendOptions(user)
  }

  @Get('data-statistics/lab-sheets')
  labSheets(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.data.labSheets(user, query)
  }

  @Get('data-statistics/cell-history')
  cellHistory(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.data.cellHistory(user, query)
  }

  @Get('customer-overview')
  customerOverview(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.data.customerOverview(user, query)
  }

  @Get('abnormal-records')
  abnormalRecords(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.data.abnormalRecords(user, query)
  }

  @Patch('abnormal-records/:id/remark')
  updateAbnormalRemark(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: { remark?: string }) {
    return this.data.updateAbnormalRemark(user, id, body.remark || '')
  }

  @Get('blacklist')
  blacklist(@CurrentUserInfo() user: CurrentUser, @Query('keyword') keyword?: string) {
    return this.data.blacklist(user, keyword)
  }
}
