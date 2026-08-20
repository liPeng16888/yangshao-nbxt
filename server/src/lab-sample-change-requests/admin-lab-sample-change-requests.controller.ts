import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import {
  AdminLabSampleChangeRequestQueryDto,
  ApproveLabSampleChangeRequestDto,
  RejectLabSampleChangeRequestDto
} from './dto'
import { LabSampleChangeRequestsService } from './lab-sample-change-requests.service'

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
@Controller('admin/lab-sheet-change-requests')
export class AdminLabSampleChangeRequestsController {
  constructor(private readonly requests: LabSampleChangeRequestsService) {}

  @Get()
  list(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminLabSampleChangeRequestQueryDto) {
    return this.requests.listForAdmin(user, query)
  }

  @Get(':id')
  detail(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.requests.getForAdmin(user, id)
  }

  @Post(':id/approve')
  approve(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() dto: ApproveLabSampleChangeRequestDto) {
    return this.requests.approveForAdmin(user, id, dto)
  }

  @Post(':id/reject')
  reject(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() dto: RejectLabSampleChangeRequestDto) {
    return this.requests.rejectForAdmin(user, id, dto)
  }
}
