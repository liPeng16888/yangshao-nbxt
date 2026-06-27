import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FinanceService } from './finance.service'

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('finance')
  @Roles(UserRole.FRONTEND_USER)
  listEntries(@CurrentUserInfo() user: CurrentUser, @Query('month') month?: string) {
    return this.finance.listFrontendExpenses(user.id, month)
  }

  @Post('finance')
  @Roles(UserRole.FRONTEND_USER)
  createEntry(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.finance.createFrontendExpense(user.id, body)
  }

  @Get('finance/months')
  @Roles(UserRole.FRONTEND_USER)
  listMonths(@CurrentUserInfo() user: CurrentUser) {
    return this.finance.listFrontendExpenseMonths(user.id)
  }

  @Get('finance/income-bills')
  @Roles(UserRole.FRONTEND_USER)
  incomeBills(@CurrentUserInfo() user: CurrentUser, @Query('month') month?: string) {
    return this.finance.getFrontendIncomeReport(user.id, month)
  }

  @Get('finance/unsettled-samples')
  @Roles(UserRole.FRONTEND_USER)
  unsettledSamples(@CurrentUserInfo() user: CurrentUser) {
    return this.finance.getFrontendUnsettledSamples(user.id)
  }

  @Put('finance/unsettled-samples/:blockId/paid')
  @Roles(UserRole.FRONTEND_USER)
  markPaid(@CurrentUserInfo() user: CurrentUser, @Param('blockId') blockId: string) {
    return this.finance.markFrontendSamplePaid(user.id, blockId)
  }

  @Get('finance/monthly-settlements')
  @Roles(UserRole.FRONTEND_USER)
  monthlySettlements(@CurrentUserInfo() user: CurrentUser, @Query('month') month?: string) {
    return this.finance.getFrontendMonthlySettlementReport(user.id, month)
  }

  @Put('finance/monthly-settlements/:id')
  @Roles(UserRole.FRONTEND_USER)
  updateMonthlySettlement(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.finance.updateFrontendMonthlySettlement(user.id, body)
  }

  @Get('admin/finance/income')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  adminIncome(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.finance.getAdminIncomeReport(user, query)
  }

  @Get('admin/finance/expenses')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  adminExpenses(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.finance.getAdminExpenseReport(user, query)
  }

  @Get('admin/finance/unsettled')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  adminUnsettled(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.finance.getAdminUnsettled(user, query)
  }

  @Post('admin/finance/unsettled/:blockId/remind')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  remindUnsettled(@CurrentUserInfo() user: CurrentUser, @Param('blockId') blockId: string) {
    return this.finance.remindUnsettled(user, blockId)
  }

  @Get('admin/finance/monthly-daily')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  adminMonthlyDaily(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.finance.getAdminMonthlyDaily(user, query)
  }

  @Get('admin/finance/monthly-bills')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  adminMonthlyBills(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.finance.getAdminMonthlyBills(user, query)
  }

  @Post('admin/finance/monthly-bills/:recordId/remind')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  remindMonthlyBill(@CurrentUserInfo() user: CurrentUser, @Param('recordId') recordId: string) {
    return this.finance.remindMonthlyBill(user, recordId)
  }

  @Get('admin/finance/monthly-customers')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  adminMonthlyCustomers(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.finance.getAdminMonthlyCustomers(user, query)
  }

  @Patch('admin/finance/monthly-customers/remark')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  updateAdminMonthlyCustomerRemark(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.finance.updateAdminMonthlyCustomerRemark(user, body)
  }
}
