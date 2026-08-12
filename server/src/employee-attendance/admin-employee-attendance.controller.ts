import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AdminAccessService } from '../admin/admin-access.service'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { AdminEmployeeAttendanceQueryDto, AdminEmployeeRevealDto } from './employee-attendance.dto'
import { PayrollService } from './payroll.service'

@Controller('admin/employee-attendance')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN)
export class AdminEmployeeAttendanceController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly adminAccess: AdminAccessService
  ) {}

  @Get('overview')
  async overview(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminOverview(await this.allowed(user, query), query)
  }

  @Get('employees')
  async employees(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminEmployees(await this.allowed(user, query), query)
  }

  @Get('schedules')
  async schedules(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminSchedules(await this.allowed(user, query), query)
  }

  @Get('attendance')
  async attendance(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminAttendance(await this.allowed(user, query), query)
  }

  @Get('leaves')
  async leaves(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminLeaves(await this.allowed(user, query), query)
  }

  @Get('commissions')
  async commissions(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminCommissions(await this.allowed(user, query), query)
  }

  @Get('bonuses')
  async bonuses(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminBonuses(await this.allowed(user, query), query)
  }

  @Get('payroll')
  async payroll(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminPayroll(await this.allowed(user, query), query)
  }

  @Get('audit')
  async audit(@CurrentUserInfo() user: CurrentUser, @Query() query: AdminEmployeeAttendanceQueryDto) {
    return this.payrollService.adminAudit(await this.allowed(user, query), query)
  }

  @Post('employees/:id/reveal')
  async revealEmployee(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: AdminEmployeeRevealDto,
    @Query() query: AdminEmployeeAttendanceQueryDto
  ) {
    return this.payrollService.adminRevealEmployee(user, await this.allowed(user, query), id, body.password)
  }

  private allowed(user: CurrentUser, query: AdminEmployeeAttendanceQueryDto) {
    return this.adminAccess.getAllowedFrontendUserIds(user, this.adminAccess.parseFrontendUserIds(query.frontendUserIds))
  }
}
