import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { ReportsService } from './reports.service'
import { CustomerOverviewService } from '../customer-overview/customer-overview.service'

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly customerOverviewService: CustomerOverviewService
  ) {}

  @Get('customer-overview')
  @FrontendPermission('CUSTOMER_OVERVIEW')
  async customerOverview(@CurrentUserInfo() user: CurrentUser) {
    const rows = await this.customerOverviewService.getRows([user.dataOwnerId])
    return rows.map(({ frontendUserId: _frontendUserId, frontendUserName: _frontendUserName, ...row }) => row)
  }

  @Get('sample-detection')
  @FrontendPermission('REPORTS')
  sampleDetection(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.reports.sampleDetection(user.dataOwnerId, query)
  }

  @Get('finance')
  @FrontendPermission('REPORTS')
  finance(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.reports.finance(user.dataOwnerId, query)
  }

  @Get('finance/categories')
  @FrontendPermission('REPORTS')
  categories() {
    return this.reports.categories()
  }
}
