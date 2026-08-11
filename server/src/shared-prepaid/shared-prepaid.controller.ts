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
import { SharedPrepaidIdempotencyHeaders } from './shared-prepaid-idempotency-headers.decorator'
import {
  SharedPrepaidLedgerService
} from './shared-prepaid-ledger.service'
import {
  SharedPrepaidQueryService
} from './shared-prepaid-query.service'
import {
  SharedPrepaidSettlementService
} from './shared-prepaid-settlement.service'
import {
  CreateSharedPrepaidRechargeDto,
  ReverseSharedPrepaidRechargeDto,
  SharedPrepaidConsumptionQueryDto,
  SharedPrepaidIdempotencyHeadersDto,
  SharedPrepaidMemberQueryDto,
  SharedPrepaidRechargeQueryDto,
  SharedPrepaidSettlementIdParamsDto,
  SharedPrepaidSettlementPaymentDto,
  SharedPrepaidSettlementRejectDto,
  SharedPrepaidSettlementSelectionDto
} from './shared-prepaid.dto'

@Controller('shared-prepaid')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
export class SharedPrepaidController {
  constructor(
    private readonly ledger: SharedPrepaidLedgerService,
    private readonly queryService: SharedPrepaidQueryService,
    private readonly settlementService: SharedPrepaidSettlementService
  ) {}

  @Post('settlements/preview')
  @FrontendPermission('PREPAID_SETTLEMENTS')
  previewSettlement(
    @CurrentUserInfo() user: CurrentUser,
    @Body() body: SharedPrepaidSettlementSelectionDto
  ) {
    return this.settlementService.previewSettlement(user, body?.payableIds)
  }

  @Post('settlements')
  @FrontendPermission('PREPAID_SETTLEMENTS')
  createSettlement(
    @CurrentUserInfo() user: CurrentUser,
    @SharedPrepaidIdempotencyHeaders() headers: SharedPrepaidIdempotencyHeadersDto,
    @Body() body: SharedPrepaidSettlementSelectionDto
  ) {
    return this.settlementService.createSettlement(user, body.payableIds, headers['x-idempotency-key'])
  }

  @Post('settlements/:id/payment')
  @FrontendPermission('PREPAID_SETTLEMENTS')
  submitSettlementPayment(
    @CurrentUserInfo() user: CurrentUser,
    @Param() params: SharedPrepaidSettlementIdParamsDto,
    @SharedPrepaidIdempotencyHeaders() headers: SharedPrepaidIdempotencyHeadersDto,
    @Body() body: SharedPrepaidSettlementPaymentDto
  ) {
    return this.settlementService.submitPayment(user, params.id, body, headers['x-idempotency-key'])
  }

  @Post('settlements/:id/confirm')
  @FrontendPermission('PREPAID_SETTLEMENTS')
  confirmSettlementReceipt(
    @CurrentUserInfo() user: CurrentUser,
    @Param() params: SharedPrepaidSettlementIdParamsDto,
    @SharedPrepaidIdempotencyHeaders() headers: SharedPrepaidIdempotencyHeadersDto
  ) {
    return this.settlementService.confirmReceipt(user, params.id, headers['x-idempotency-key'])
  }

  @Post('settlements/:id/reject')
  @FrontendPermission('PREPAID_SETTLEMENTS')
  rejectSettlement(
    @CurrentUserInfo() user: CurrentUser,
    @Param() params: SharedPrepaidSettlementIdParamsDto,
    @SharedPrepaidIdempotencyHeaders() headers: SharedPrepaidIdempotencyHeadersDto,
    @Body() body: SharedPrepaidSettlementRejectDto
  ) {
    return this.settlementService.rejectSettlement(user, params.id, body.reason, headers['x-idempotency-key'])
  }

  @Post('settlements/:id/cancel')
  @FrontendPermission('PREPAID_SETTLEMENTS')
  cancelSettlement(
    @CurrentUserInfo() user: CurrentUser,
    @Param() params: SharedPrepaidSettlementIdParamsDto,
    @SharedPrepaidIdempotencyHeaders() headers: SharedPrepaidIdempotencyHeadersDto
  ) {
    return this.settlementService.cancelSettlement(user, params.id, headers['x-idempotency-key'])
  }

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

  @Get('consumptions')
  @FrontendPermission('PREPAID_CONSUMPTIONS')
  listConsumptions(@Query() query: SharedPrepaidConsumptionQueryDto) {
    return this.queryService.listConsumptions(query)
  }

  @Get('consumptions/filter-options')
  @FrontendPermission('PREPAID_CONSUMPTIONS')
  listConsumptionFilterOptions() {
    return this.queryService.listConsumptionFilterOptions()
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

  @Post('consumptions/:id/reversal')
  @FrontendPermission('PREPAID_CONSUMPTIONS')
  reverseConsumption(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Headers('x-idempotency-key') key: string,
    @Body() body: ReverseSharedPrepaidRechargeDto
  ) {
    return this.ledger.reverseConsumption(user, id, body.reason, key)
  }
}
