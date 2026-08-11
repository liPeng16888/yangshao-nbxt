import { Body, Controller, Delete, Get, Header, Headers, Optional, Param, Post, Put, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AccessGuardFeature, UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { AuthService } from '../auth/auth.service'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import {
  AttendanceDto, AttendanceListQueryDto, BonusDto, CommissionRecordDto, CommissionTypeDto,
  CreateEmployeeDto, DateOverrideDto, EmployeeQueryDto, GenerateAttendanceDto, LeaveRequestDto,
  LeaveTypeDto, MonthlySettingDto, PayrollAdjustmentDto, PayrollGenerateDto, PayrollReopenDto, ReviewLeaveDto, WeeklyScheduleDto
} from './employee-attendance.dto'
import { EmployeeAttendanceService } from './employee-attendance.service'
import { EmployeePhotoFile, PrivateEmployeePhotoService } from './private-employee-photo.service'
import { PayrollService } from './payroll.service'

@Controller('employee-attendance')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
export class EmployeeAttendanceController {
  constructor(
    private readonly attendance: EmployeeAttendanceService,
    private readonly auth: AuthService,
    private readonly photos: PrivateEmployeePhotoService,
    @Optional() private readonly payrollService?: PayrollService
  ) {}

  @Get('employees')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  async listEmployees(@CurrentUserInfo() user: CurrentUser, @Query() query: EmployeeQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant)
    return this.attendance.listEmployees(user.dataOwnerId, query)
  }

  @Get('employees/:id')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  async getEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant)
    return this.attendance.getEmployee(user.dataOwnerId, id)
  }

  @Get('employees/:id/reveal')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  async revealEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant, true)
    return this.attendance.revealEmployee(user.dataOwnerId, user.id, id)
  }

  @Post('employees')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  async createEmployee(@CurrentUserInfo() user: CurrentUser, @Body() body: CreateEmployeeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant)
    return this.attendance.createEmployee(user.dataOwnerId, user.id, this.clean(body))
  }

  @Put('employees/:id')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  async updateEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: CreateEmployeeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant)
    return this.attendance.updateEmployee(user.dataOwnerId, user.id, id, this.clean(body))
  }

  @Delete('employees/:id')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  async deleteEmployee(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant)
    return this.attendance.deleteEmployee(user.dataOwnerId, user.id, id)
  }

  @Post('employees/:id/photo')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadPhoto(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @UploadedFile() file: EmployeePhotoFile, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant)
    await this.attendance.getEmployee(user.dataOwnerId, id)
    const photoPath = await this.photos.save(user.dataOwnerId, id, file)
    try {
      return await this.attendance.attachPhoto(user.dataOwnerId, user.id, id, photoPath)
    } catch (error) {
      await this.photos.remove(photoPath).catch(() => false)
      throw error
    }
  }

  @Get('employees/:id/photo')
  @FrontendPermission('ATTENDANCE_EMPLOYEES')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async readPhoto(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant)
    const photo = await this.photos.read(await this.attendance.getPhotoPath(user.dataOwnerId, id))
    return new StreamableFile(photo.buffer, { type: photo.contentType })
  }

  @Get('weekly-schedules')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async listWeeklySchedules(@CurrentUserInfo() user: CurrentUser, @Query('employeeId') employeeId: string | undefined, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listWeeklySchedules(user.dataOwnerId, employeeId)
  }
  @Post('weekly-schedules')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async createWeeklySchedule(@CurrentUserInfo() user: CurrentUser, @Body() body: WeeklyScheduleDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createWeeklySchedule(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('weekly-schedules/:id')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async updateWeeklySchedule(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: WeeklyScheduleDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateWeeklySchedule(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('weekly-schedules/:id')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async deleteWeeklySchedule(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteWeeklySchedule(user.dataOwnerId, user.id, id)
  }

  @Get('overrides')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async listDateOverrides(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listDateOverrides(user.dataOwnerId, query)
  }
  @Post('overrides')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async createDateOverride(@CurrentUserInfo() user: CurrentUser, @Body() body: DateOverrideDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createDateOverride(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('overrides/:id')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async updateDateOverride(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: DateOverrideDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateDateOverride(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('overrides/:id')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async deleteDateOverride(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteDateOverride(user.dataOwnerId, user.id, id)
  }

  @Get('month-settings')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async listMonthlySettings(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string | undefined, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listMonthlySettings(user.dataOwnerId, month)
  }
  @Post('month-settings')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async createMonthlySetting(@CurrentUserInfo() user: CurrentUser, @Body() body: MonthlySettingDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.upsertMonthlySetting(user.dataOwnerId, user.id, this.clean(body))
  }
  @Delete('month-settings/:id')
  @FrontendPermission('ATTENDANCE_SCHEDULES')
  async deleteMonthlySetting(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteMonthlySetting(user.dataOwnerId, user.id, id)
  }

  @Get('attendance')
  @FrontendPermission('ATTENDANCE_RECORDS')
  async listAttendance(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listAttendance(user.dataOwnerId, query)
  }
  @Post('attendance')
  @FrontendPermission('ATTENDANCE_RECORDS')
  async createAttendance(@CurrentUserInfo() user: CurrentUser, @Body() body: AttendanceDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createAttendance(user.dataOwnerId, user.id, this.clean(body))
  }
  @Post('attendance/generate')
  @FrontendPermission('ATTENDANCE_RECORDS')
  async createAttendanceGeneration(@CurrentUserInfo() user: CurrentUser, @Body() body: GenerateAttendanceDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.generateAttendance(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('attendance/:id')
  @FrontendPermission('ATTENDANCE_RECORDS')
  async updateAttendance(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: AttendanceDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateAttendance(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('attendance/:id')
  @FrontendPermission('ATTENDANCE_RECORDS')
  async deleteAttendance(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteAttendance(user.dataOwnerId, user.id, id)
  }

  @Get('leave-types')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async listLeaveTypes(@CurrentUserInfo() user: CurrentUser, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listLeaveTypes(user.dataOwnerId)
  }
  @Post('leave-types')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async createLeaveType(@CurrentUserInfo() user: CurrentUser, @Body() body: LeaveTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createLeaveType(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('leave-types/:id')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async updateLeaveType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: LeaveTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateLeaveType(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('leave-types/:id')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async deleteLeaveType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteLeaveType(user.dataOwnerId, user.id, id)
  }

  @Get('leaves')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async listLeaveRequests(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listLeaveRequests(user.dataOwnerId, query)
  }
  @Post('leaves')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async createLeaveRequest(@CurrentUserInfo() user: CurrentUser, @Body() body: LeaveRequestDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createLeaveRequest(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('leaves/:id')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async updateLeaveRequest(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: LeaveRequestDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateLeaveRequest(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('leaves/:id')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async deleteLeaveRequest(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteLeaveRequest(user.dataOwnerId, user.id, id)
  }
  @Post('leaves/:id/approve')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async approveLeave(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: ReviewLeaveDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.approveLeave(user.dataOwnerId, user.id, id, body.reviewRemark)
  }
  @Post('leaves/:id/reject')
  @FrontendPermission('ATTENDANCE_LEAVE')
  async rejectLeave(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: ReviewLeaveDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.rejectLeave(user.dataOwnerId, user.id, id, body.reviewRemark)
  }

  @Get('commission-types')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async listCommissionTypes(@CurrentUserInfo() user: CurrentUser, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listCommissionTypes(user.dataOwnerId)
  }
  @Post('commission-types')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async createCommissionType(@CurrentUserInfo() user: CurrentUser, @Body() body: CommissionTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createCommissionType(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('commission-types/:id')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async updateCommissionType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: CommissionTypeDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateCommissionType(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('commission-types/:id')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async deleteCommissionType(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteCommissionType(user.dataOwnerId, user.id, id)
  }

  @Get('commissions')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async listCommissionRecords(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listCommissionRecords(user.dataOwnerId, query)
  }
  @Post('commissions')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async createCommissionRecord(@CurrentUserInfo() user: CurrentUser, @Body() body: CommissionRecordDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createCommissionRecord(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('commissions/:id')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async updateCommissionRecord(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: CommissionRecordDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateCommissionRecord(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('commissions/:id')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async deleteCommissionRecord(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteCommissionRecord(user.dataOwnerId, user.id, id)
  }

  @Get('bonuses')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async listBonuses(@CurrentUserInfo() user: CurrentUser, @Query() query: AttendanceListQueryDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.listBonuses(user.dataOwnerId, query)
  }
  @Post('bonuses')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async createBonus(@CurrentUserInfo() user: CurrentUser, @Body() body: BonusDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.createBonus(user.dataOwnerId, user.id, this.clean(body))
  }
  @Put('bonuses/:id')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async updateBonus(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: BonusDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.updateBonus(user.dataOwnerId, user.id, id, this.clean(body))
  }
  @Delete('bonuses/:id')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async deleteBonus(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.deleteBonus(user.dataOwnerId, user.id, id)
  }
  @Get('compensation/totals')
  @FrontendPermission('ATTENDANCE_COMPENSATION')
  async compensationTotals(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.attendance.compensationTotals(user.dataOwnerId, month)
  }

  @Get('overview')
  @FrontendPermission('ATTENDANCE_OVERVIEW')
  async overview(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.overview(user.dataOwnerId, month)
  }

  @Post('payroll/generate')
  @FrontendPermission('ATTENDANCE_PAYROLL')
  async generatePayroll(@CurrentUserInfo() user: CurrentUser, @Body() body: PayrollGenerateDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.generate(user.dataOwnerId, user.id, body.month)
  }

  @Get('payroll')
  @FrontendPermission('ATTENDANCE_PAYROLL')
  async getPayroll(@CurrentUserInfo() user: CurrentUser, @Query('month') month: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.getPayroll(user.dataOwnerId, month)
  }

  @Post('payroll/items/:itemId/adjustments')
  @FrontendPermission('ATTENDANCE_PAYROLL')
  async createPayrollAdjustment(@CurrentUserInfo() user: CurrentUser, @Param('itemId') itemId: string, @Body() body: PayrollAdjustmentDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.createAdjustment(user.dataOwnerId, user.id, itemId, body.amount, body.reason)
  }

  @Put('payroll/adjustments/:id')
  @FrontendPermission('ATTENDANCE_PAYROLL')
  async updatePayrollAdjustment(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: PayrollAdjustmentDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.updateAdjustment(user.dataOwnerId, user.id, id, body.amount, body.reason)
  }

  @Delete('payroll/adjustments/:id')
  @FrontendPermission('ATTENDANCE_PAYROLL')
  async deletePayrollAdjustment(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.deleteAdjustment(user.dataOwnerId, user.id, id)
  }

  @Post('payroll/:id/confirm')
  @FrontendPermission('ATTENDANCE_PAYROLL')
  async confirmPayroll(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.confirm(user.dataOwnerId, user.id, id)
  }

  @Post('payroll/:id/reopen')
  @FrontendPermission('ATTENDANCE_PAYROLL')
  async reopenPayroll(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: PayrollReopenDto, @Headers('x-ys-access-grant') grant?: string) {
    await this.authorize(user.dataOwnerId, grant); return this.payrollService!.reopen(user.dataOwnerId, user.id, id, body.reason)
  }

  private async authorize(frontendUserId: string, grant?: string, requireGrant = false) {
    await this.auth.assertAccessGrant(frontendUserId, grant, AccessGuardFeature.EMPLOYEE_ATTENDANCE, requireGrant)
  }

  private clean<T extends object>(body: T): T {
    const { frontendUserId: _frontendUserId, actorUserId: _actorUserId, ...clean } = body as T & { frontendUserId?: unknown; actorUserId?: unknown }
    return clean as T
  }
}
