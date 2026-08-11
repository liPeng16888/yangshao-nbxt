import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { FinanceService } from './finance.service'

@Controller()
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('finance')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_EXPENSES')
  listEntries(@CurrentUserInfo() user: CurrentUser, @Query('month') month?: string) {
    return this.finance.listFrontendExpenses(user.dataOwnerId, month)
  }

  @Post('finance')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_EXPENSES')
  createEntry(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    if (Array.isArray(body)) return this.finance.createFrontendExpenses(user.dataOwnerId, user.id, body)
    return this.finance.createFrontendExpense(user.dataOwnerId, user.id, body)
  }

  @Get('finance/months')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_EXPENSES')
  listMonths(@CurrentUserInfo() user: CurrentUser) {
    return this.finance.listFrontendExpenseMonths(user.dataOwnerId)
  }

  @Get('finance/income-bills')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_INCOME')
  incomeBills(@CurrentUserInfo() user: CurrentUser, @Query('month') month?: string) {
    return this.finance.getFrontendIncomeReport(user.dataOwnerId, month)
  }

  @Get('finance/unsettled-samples')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_UNSETTLED')
  unsettledSamples(@CurrentUserInfo() user: CurrentUser) {
    return this.finance.getFrontendUnsettledSamples(user.dataOwnerId)
  }

  @Put('finance/unsettled-samples/paid')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_UNSETTLED')
  markSamplesPaid(@CurrentUserInfo() user: CurrentUser, @Body() body: { blockIds?: string[] }) {
    return this.finance.markFrontendSamplesPaid(user.dataOwnerId, body?.blockIds || [], user.id)
  }

  @Put('finance/unsettled-samples/:blockId/paid')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_UNSETTLED')
  markPaid(@CurrentUserInfo() user: CurrentUser, @Param('blockId') blockId: string) {
    return this.finance.markFrontendSamplePaid(user.dataOwnerId, blockId, user.id)
  }

  @Get('finance/monthly-settlements')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_MONTHLY_SETTLEMENT')
  monthlySettlements(@CurrentUserInfo() user: CurrentUser, @Query('month') month?: string) {
    return this.finance.getFrontendMonthlySettlementReport(user.dataOwnerId, month)
  }

  @Put('finance/monthly-settlements/:id')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_MONTHLY_SETTLEMENT')
  updateMonthlySettlement(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.finance.updateFrontendMonthlySettlement(user.dataOwnerId, user.id, body)
  }

  @Post('finance/delete-requests')
  @Roles(UserRole.FRONTEND_USER)
  @FrontendPermission('FINANCE_EXPENSES')
  createDeletionRequest(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.finance.createFrontendDeletionRequest(user.dataOwnerId, user.id, body)
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

  @Get('admin/finance/delete-requests')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  adminDeletionRequests(@CurrentUserInfo() user: CurrentUser, @Query() query: any) {
    return this.finance.getAdminDeletionRequests(user, query)
  }

  @Post('admin/finance/delete-requests/:id/approve')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  approveDeletionRequest(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.finance.approveDeletionRequest(user, id)
  }

  @Post('admin/finance/delete-requests/:id/reject')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  rejectDeletionRequest(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.finance.rejectDeletionRequest(user, id, body)
  }

  @Patch('admin/finance/monthly-customers/remark')
  @Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
  updateAdminMonthlyCustomerRemark(@CurrentUserInfo() user: CurrentUser, @Body() body: any) {
    return this.finance.updateAdminMonthlyCustomerRemark(user, body)
  }
}
