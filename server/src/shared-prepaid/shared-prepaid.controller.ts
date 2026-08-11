import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common'
import { UserRole } from '@prisma/client'

import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import {
  SharedPrepaidLedgerService
} from './shared-prepaid-ledger.service'
import {
  SharedPrepaidQueryService
} from './shared-prepaid-query.service'
import {
  CreateSharedPrepaidRechargeDto,
  ReverseSharedPrepaidRechargeDto,
  SharedPrepaidMemberQueryDto,
  SharedPrepaidRechargeQueryDto
} from './shared-prepaid.dto'

@Controller('shared-prepaid')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
export class SharedPrepaidController {
  constructor(
    private readonly ledger: SharedPrepaidLedgerService,
    private readonly queryService: SharedPrepaidQueryService
  ) {}

  @Get('members')
  @FrontendPermission('PREPAID_CUSTOMERS')
  listMembers(@Query() query: SharedPrepaidMemberQueryDto) {
    return this.queryService.listMembers(query)
  }

  @Get('members/lookup')
  @FrontendPermission('PREPAID_CUSTOMERS')
  lookupMember(@Query('phone') phone: string) {
    return this.queryService.getMemberByPhone(phone)
  }

  @Get('members/:id')
  @FrontendPermission('PREPAID_CUSTOMERS')
  getMemberDetail(@Param('id') id: string) {
    return this.queryService.getMemberDetail(id)
  }

  @Get('recharges')
  @FrontendPermission('PREPAID_RECHARGE')
  listRecharges(@Query() query: SharedPrepaidRechargeQueryDto) {
    return this.queryService.listRecharges(query)
  }

  @Post('recharges')
  @FrontendPermission('PREPAID_RECHARGE')
  createRecharge(
    @CurrentUserInfo() user: CurrentUser,
    @Headers('x-idempotency-key') key: string,
    @Body() body: CreateSharedPrepaidRechargeDto
  ) {
    return this.ledger.createRecharge(user, body, key)
  }

  @Post('recharges/:id/reversal')
  @FrontendPermission('PREPAID_RECHARGE')
  reverseRecharge(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Headers('x-idempotency-key') key: string,
    @Body() body: ReverseSharedPrepaidRechargeDto
  ) {
    return this.ledger.reverseRecharge(user, id, body.reason, key)
  }
}
