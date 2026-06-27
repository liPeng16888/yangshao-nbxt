import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { ReportsService } from './reports.service'

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sample-detection')
  sampleDetection(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.reports.sampleDetection(user.id, query)
  }

  @Get('finance')
  finance(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.reports.finance(user.id, query)
  }

  @Get('finance/categories')
  categories() {
    return this.reports.categories()
  }
}
