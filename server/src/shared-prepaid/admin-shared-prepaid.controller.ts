import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsIn, IsOptional } from 'class-validator'
import { UserRole } from '@prisma/client'

import { AdminAccessService } from '../admin/admin-access.service'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import {
  SharedPrepaidConsumptionQueryDto,
  SharedPrepaidMemberQueryDto,
  SharedPrepaidRechargeQueryDto,
  SharedPrepaidSettlementQueryDto
} from './shared-prepaid.dto'
import { SharedPrepaidQueryService } from './shared-prepaid-query.service'

class AdminSharedPrepaidScopeQueryDto {
  @IsOptional()
  frontendUserIds?: string | string[]
}

class AdminSharedPrepaidMemberQueryDto extends SharedPrepaidMemberQueryDto {
  @IsOptional()
  frontendUserIds?: string | string[]
}

class AdminSharedPrepaidRechargeQueryDto extends SharedPrepaidRechargeQueryDto {
  @IsOptional()
  frontendUserIds?: string | string[]

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsIn(['ACTIVE', 'REVERSED'], { message: '充值状态参数错误' })
  status?: 'ACTIVE' | 'REVERSED'
}

class AdminSharedPrepaidConsumptionQueryDto extends SharedPrepaidConsumptionQueryDto {
  @IsOptional()
  frontendUserIds?: string | string[]
}

class AdminSharedPrepaidSettlementQueryDto extends SharedPrepaidSettlementQueryDto {
  @IsOptional()
  frontendUserIds?: string | string[]
}

@Controller('admin/shared-prepaid')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
export class AdminSharedPrepaidController {
  constructor(
    private readonly queryService: SharedPrepaidQueryService,
    private readonly adminAccess: AdminAccessService
  ) {}

  @Get('recharges')
  async listRecharges(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: AdminSharedPrepaidRechargeQueryDto
  ) {
    const { frontendUserIds, ...filters } = query
    return this.queryService.listAdminRecharges(await this.allowed(user, frontendUserIds), filters)
  }

  @Get('recharges/:id')
  async getRechargeDetail(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Query() query: AdminSharedPrepaidScopeQueryDto
  ) {
    return this.queryService.getAdminRechargeDetail(await this.allowed(user, query.frontendUserIds), id)
  }

  @Get('members')
  async listMembers(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: AdminSharedPrepaidMemberQueryDto
  ) {
    const { frontendUserIds, ...filters } = query
    return this.queryService.listAdminMembers(await this.allowed(user, frontendUserIds), filters)
  }

  @Get('members/:id')
  async getMemberDetail(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Query() query: AdminSharedPrepaidScopeQueryDto
  ) {
    return this.queryService.getAdminMemberDetail(await this.allowed(user, query.frontendUserIds), id)
  }

  @Get('consumptions')
  async listConsumptions(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: AdminSharedPrepaidConsumptionQueryDto
  ) {
    const { frontendUserIds, ...filters } = query
    return this.queryService.listAdminConsumptions(await this.allowed(user, frontendUserIds), filters)
  }

  @Get('consumptions/:id')
  async getConsumptionDetail(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Query() query: AdminSharedPrepaidScopeQueryDto
  ) {
    return this.queryService.getAdminConsumptionDetail(await this.allowed(user, query.frontendUserIds), id)
  }

  @Get('settlements')
  async listSettlements(
    @CurrentUserInfo() user: CurrentUser,
    @Query() query: AdminSharedPrepaidSettlementQueryDto
  ) {
    const { frontendUserIds, ...filters } = query
    return this.queryService.listAdminSettlements(await this.allowed(user, frontendUserIds), filters)
  }

  @Get('settlements/:id')
  async getSettlementDetail(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Query() query: AdminSharedPrepaidScopeQueryDto
  ) {
    return this.queryService.getAdminSettlementDetail(await this.allowed(user, query.frontendUserIds), id)
  }

  private allowed(user: CurrentUser, value?: string | string[]) {
    return this.adminAccess.getAllowedFrontendUserIds(
      user,
      this.adminAccess.parseFrontendUserIds(value)
    )
  }
}
