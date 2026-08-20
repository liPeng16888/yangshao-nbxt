import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import {
  CreateLabSampleChangeRequestDto,
  FrontendLabSampleChangeRequestQueryDto
} from './dto'
import { LabSampleChangeRequestsService } from './lab-sample-change-requests.service'

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
@Controller('lab-sheets/change-requests')
export class LabSampleChangeRequestsController {
  constructor(private readonly requests: LabSampleChangeRequestsService) {}

  @Post()
  create(
    @CurrentUserInfo() user: CurrentUser,
    @Body() dto: CreateLabSampleChangeRequestDto,
    @Headers('x-ys-historical-access-grant') historical?: string,
    @Headers('x-ys-completed-data-access-grant') completedData?: string
  ) {
    return this.requests.createForFrontend(user, dto, { historical, completedData })
  }

  @Get()
  list(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: FrontendLabSampleChangeRequestQueryDto,
    @Headers('x-ys-historical-access-grant') historical?: string,
    @Headers('x-ys-completed-data-access-grant') completedData?: string
  ) {
    return this.requests.listForFrontend(user, query, { historical, completedData })
  }

  @Get(':id')
  detail(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Headers('x-ys-historical-access-grant') historical?: string,
    @Headers('x-ys-completed-data-access-grant') completedData?: string
  ) {
    return this.requests.getForFrontend(user, id, { historical, completedData })
  }

  @Post(':id/withdraw')
  withdraw(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Headers('x-ys-historical-access-grant') historical?: string,
    @Headers('x-ys-completed-data-access-grant') completedData?: string
  ) {
    return this.requests.withdrawForFrontend(user, id, { historical, completedData })
  }
}
