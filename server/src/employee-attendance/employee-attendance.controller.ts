import { Body, Controller, Delete, Get, Headers, Optional, Param, Post, Put, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AccessGuardFeature, UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { AuthService } from '../auth/auth.service'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import {
  AttendanceDto, AttendanceListQueryDto, BonusDto, CommissionRecordDto, CommissionTypeDto,
  CreateEmployeeDto, DateOverrideDto, EmployeeQueryDto, GenerateAttendanceDto, LeaveRequestDto,
  LeaveTypeDto, MonthlySettingDto, PayrollAdjustmentDto, PayrollGenerateDto, PayrollReopenDto, ReviewLeaveDto, WeeklyScheduleDto
} from './employee-attendance.dto'
import { EmployeeAttendanceService } from './employee-attendance.service'
import { EmployeePhotoFile, PrivateEmployeePhotoService } from './private-employee-photo.service'
import { PayrollService } from './payroll.service'

@Controller('employee-attendance')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
export class EmployeeAttendanceController {
  constructor(
    private readonly attendance: EmployeeAttendanceService,
    private readonly auth: AuthService,
    private readonly photos: PrivateEmployeePhotoService,
    @Optional() private readonly payrollService?: PayrollService
  ) {}

  @Get('employees')
  async listEmployees(@CurrentUserInfo() user: CurrentUser, @Query() query: EmployeeQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant)
    return this.attendance.listEmployees(user.id, query)
  }

  @Get('employees/:id')
  async getEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant)
    return this.attendance.getEmployee(user.id, id)
  }

  @Get('employees/:id/reveal')
  async revealEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant, true)
    return this.attendance.revealEmployee(user.id, user.id, id)
  }

  @Post('employees')
  async createEmployee(@CurrentUserInfo() user: CurrentUser, @Body() body: CreateEmployeeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant)
    return this.attendance.createEmployee(user.id, user.id, this.clean(body))
  }

  @Put('employees/:id')
  async updateEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: CreateEmployeeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant)
    return this.attendance.updateEmployee(user.id, user.id, id, this.clean(body))
  }

  @Delete('employees/:id')
  async deleteEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant)
    return this.attendance.deleteEmployee(user.id, user.id, id)
  }

  @Post('employees/:id/photo')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadPhoto(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @UploadedFile() file: EmployeePhotoFile, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant)
    await this.attendance.getEmployee(user.id, id)
    const photoPath = await this.photos.save(user.id, id, file)
    try {
      return await this.attendance.attachPhoto(user.id, user.id, id, photoPath)
    } catch (error) {
      await this.photos.remove(photoPath).catch(() => false)
      throw error
    }
  }

  @Get('employees/:id/photo')
  async readPhoto(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant)
    return new StreamableFile(await this.photos.read(await this.attendance.getPhotoPath(user.id, id)))
  }

  @Get('weekly-schedules')
  async listWeeklySchedules(@CurrentUserInfo() user: CurrentUser, @Query('employeeId') employeeId: string | undefined, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listWeeklySchedules(user.id, employeeId)
  }
  @Post('weekly-schedules')
  async createWeeklySchedule(@CurrentUserInfo() user: CurrentUser, @Body() body: WeeklyScheduleDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createWeeklySchedule(user.id, user.id, this.clean(body))
  }
  @Put('weekly-schedules/:id')
  async updateWeeklySchedule(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: WeeklyScheduleDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateWeeklySchedule(user.id, user.id, id, this.clean(body))
  }
  @Delete('weekly-schedules/:id')
  async deleteWeeklySchedule(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteWeeklySchedule(user.id, user.id, id)
  }

  @Get('overrides')
  async listDateOverrides(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listDateOverrides(user.id, query)
  }
  @Post('overrides')
  async createDateOverride(@CurrentUserInfo() user: CurrentUser, @Body() body: DateOverrideDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createDateOverride(user.id, user.id, this.clean(body))
  }
  @Put('overrides/:id')
  async updateDateOverride(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: DateOverrideDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateDateOverride(user.id, user.id, id, this.clean(body))
  }
  @Delete('overrides/:id')
  async deleteDateOverride(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteDateOverride(user.id, user.id, id)
  }

  @Get('month-settings')
  async listMonthlySettings(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string | undefined, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listMonthlySettings(user.id, month)
  }
  @Post('month-settings')
  async createMonthlySetting(@CurrentUserInfo() user: CurrentUser, @Body() body: MonthlySettingDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.upsertMonthlySetting(user.id, user.id, this.clean(body))
  }
  @Delete('month-settings/:id')
  async deleteMonthlySetting(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteMonthlySetting(user.id, user.id, id)
  }

  @Get('attendance')
  async listAttendance(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listAttendance(user.id, query)
  }
  @Post('attendance')
  async createAttendance(@CurrentUserInfo() user: CurrentUser, @Body() body: AttendanceDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createAttendance(user.id, user.id, this.clean(body))
  }
  @Post('attendance/generate')
  async createAttendanceGeneration(@CurrentUserInfo() user: CurrentUser, @Body() body: GenerateAttendanceDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.generateAttendance(user.id, user.id, this.clean(body))
  }
  @Put('attendance/:id')
  async updateAttendance(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: AttendanceDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateAttendance(user.id, user.id, id, this.clean(body))
  }
  @Delete('attendance/:id')
  async deleteAttendance(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteAttendance(user.id, user.id, id)
  }

  @Get('leave-types')
  async listLeaveTypes(@CurrentUserInfo() user: CurrentUser, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listLeaveTypes(user.id)
  }
  @Post('leave-types')
  async createLeaveType(@CurrentUserInfo() user: CurrentUser, @Body() body: LeaveTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createLeaveType(user.id, user.id, this.clean(body))
  }
  @Put('leave-types/:id')
  async updateLeaveType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: LeaveTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateLeaveType(user.id, user.id, id, this.clean(body))
  }
  @Delete('leave-types/:id')
  async deleteLeaveType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteLeaveType(user.id, user.id, id)
  }

  @Get('leaves')
  async listLeaveRequests(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listLeaveRequests(user.id, query)
  }
  @Post('leaves')
  async createLeaveRequest(@CurrentUserInfo() user: CurrentUser, @Body() body: LeaveRequestDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createLeaveRequest(user.id, user.id, this.clean(body))
  }
  @Put('leaves/:id')
  async updateLeaveRequest(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: LeaveRequestDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateLeaveRequest(user.id, user.id, id, this.clean(body))
  }
  @Delete('leaves/:id')
  async deleteLeaveRequest(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteLeaveRequest(user.id, user.id, id)
  }
  @Post('leaves/:id/approve')
  async approveLeave(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: ReviewLeaveDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.approveLeave(user.id, user.id, id, body.reviewRemark)
  }
  @Post('leaves/:id/reject')
  async rejectLeave(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: ReviewLeaveDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.rejectLeave(user.id, user.id, id, body.reviewRemark)
  }

  @Get('commission-types')
  async listCommissionTypes(@CurrentUserInfo() user: CurrentUser, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listCommissionTypes(user.id)
  }
  @Post('commission-types')
  async createCommissionType(@CurrentUserInfo() user: CurrentUser, @Body() body: CommissionTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createCommissionType(user.id, user.id, this.clean(body))
  }
  @Put('commission-types/:id')
  async updateCommissionType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: CommissionTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateCommissionType(user.id, user.id, id, this.clean(body))
  }
  @Delete('commission-types/:id')
  async deleteCommissionType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteCommissionType(user.id, user.id, id)
  }

  @Get('commissions')
  async listCommissionRecords(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listCommissionRecords(user.id, query)
  }
  @Post('commissions')
  async createCommissionRecord(@CurrentUserInfo() user: CurrentUser, @Body() body: CommissionRecordDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createCommissionRecord(user.id, user.id, this.clean(body))
  }
  @Put('commissions/:id')
  async updateCommissionRecord(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: CommissionRecordDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateCommissionRecord(user.id, user.id, id, this.clean(body))
  }
  @Delete('commissions/:id')
  async deleteCommissionRecord(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteCommissionRecord(user.id, user.id, id)
  }

  @Get('bonuses')
  async listBonuses(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.listBonuses(user.id, query)
  }
  @Post('bonuses')
  async createBonus(@CurrentUserInfo() user: CurrentUser, @Body() body: BonusDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.createBonus(user.id, user.id, this.clean(body))
  }
  @Put('bonuses/:id')
  async updateBonus(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: BonusDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.updateBonus(user.id, user.id, id, this.clean(body))
  }
  @Delete('bonuses/:id')
  async deleteBonus(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.deleteBonus(user.id, user.id, id)
  }
  @Get('compensation/totals')
  async compensationTotals(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.attendance.compensationTotals(user.id, month)
  }

  @Get('overview')
  async overview(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.overview(user.id, month)
  }

  @Post('payroll/generate')
  async generatePayroll(@CurrentUserInfo() user: CurrentUser, @Body() body: PayrollGenerateDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.generate(user.id, user.id, body.month)
  }

  @Get('payroll')
  async getPayroll(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.getPayroll(user.id, month)
  }

  @Post('payroll/items/:itemId/adjustments')
  async createPayrollAdjustment(@CurrentUserInfo() user: CurrentUser, @Param('itemId') itemId: string, @Body() body: PayrollAdjustmentDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.createAdjustment(user.id, user.id, itemId, body.amount, body.reason)
  }

  @Put('payroll/adjustments/:id')
  async updatePayrollAdjustment(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: PayrollAdjustmentDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.updateAdjustment(user.id, user.id, id, body.amount, body.reason)
  }

  @Delete('payroll/adjustments/:id')
  async deletePayrollAdjustment(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.deleteAdjustment(user.id, user.id, id)
  }

  @Post('payroll/:id/confirm')
  async confirmPayroll(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.confirm(user.id, user.id, id)
  }

  @Post('payroll/:id/reopen')
  async reopenPayroll(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: PayrollReopenDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.id, grant); return this.payrollService!.reopen(user.id, user.id, id, body.reason)
  }

  private async authorize(frontendUserId: string, grant?: string, requireGrant = false) {
    await this.auth.assertAccessGrant(frontendUserId, grant, AccessGuardFeature.EMPLOYEE_ATTENDANCE, requireGrant)
  }

  private clean<T extends object>(body: T): T {
    const { frontendUserId: _frontendUserId, actorUserId: _actorUserId, ...clean } = body as T & { frontendUserId?: unknown; actorUserId?: unknown }
    return clean as T
  }
}
