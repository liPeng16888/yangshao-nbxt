import { EmployeeLeaveStatus, EmployeeLeaveUnit, EmployeeStatus } from '@prisma/client'
import { Transform, Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator'

export const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const BUSINESS_MONTH_PATTERN = /^\d{4}-\d{2}$/
export const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
export const CLOCK_END_TIME_PATTERN = /^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/
export const ZONED_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i

const trim = (value: unknown) => typeof value === 'string' ? value.trim() : value
const number = (value: unknown) => value === '' || value === null || value === undefined ? value : Number(value)

export class EmployeeQueryDto {
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() keyword?: string
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus
}

export class CreateEmployeeDto {
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() employeeNumber!: string
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() name!: string
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() phone?: string
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() idCard?: string
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() bankCard?: string
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() address?: string
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() emergencyContact?: string
  @Transform(({ value }) => trim(value)) @Matches(BUSINESS_DATE_PATTERN) hireDate!: string
  @Transform(({ value }) => trim(value)) @IsOptional() @Matches(BUSINESS_DATE_PATTERN) terminationDate?: string
  @Transform(({ value }) => number(value)) @IsOptional() @IsNumber() @Min(0) baseSalary?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsNumber() @Min(0) attendanceBonus?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsNumber() @Min(0) overtimeHourlyRate?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsNumber() @Min(0) restQuotaDays?: number
}

export class WeeklyScheduleDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Transform(({ value }) => number(value)) @IsInt() @Min(0) @Max(6) weekday!: number
  @IsBoolean() isWorkday!: boolean
  @Transform(({ value }) => trim(value)) @IsOptional() @Matches(CLOCK_TIME_PATTERN) plannedStartTime?: string
  @Transform(({ value }) => trim(value)) @IsOptional() @Matches(CLOCK_TIME_PATTERN) plannedEndTime?: string
  @Transform(({ value }) => number(value)) @IsInt() @Min(0) @Max(1440) scheduledMinutes!: number
}

export class DateOverrideDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @IsBoolean() isWorkday!: boolean
  @Transform(({ value }) => trim(value)) @IsOptional() @Matches(CLOCK_TIME_PATTERN) plannedStartTime?: string
  @Transform(({ value }) => trim(value)) @IsOptional() @Matches(CLOCK_TIME_PATTERN) plannedEndTime?: string
  @Transform(({ value }) => number(value)) @IsInt() @Min(0) @Max(1440) scheduledMinutes!: number
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() remark?: string
}

export class MonthlySettingDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_MONTH_PATTERN) month!: string
  @Transform(({ value }) => number(value)) @IsNumber() @Min(0) restQuotaDays!: number
}

export class ScheduleSegmentDto {
  @Matches(CLOCK_TIME_PATTERN) startTime!: string
  @Matches(CLOCK_END_TIME_PATTERN) endTime!: string
}

export class MonthlyScheduleDayDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @IsBoolean() isWorkday!: boolean
  @ValidateNested({ each: true }) @Type(() => ScheduleSegmentDto) @IsArray() segments!: ScheduleSegmentDto[]
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() remark?: string
}

export class BatchMonthlyScheduleDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @IsBoolean() isWorkday!: boolean
  @ValidateNested({ each: true }) @Type(() => ScheduleSegmentDto) @IsArray() segments!: ScheduleSegmentDto[]
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() remark?: string
  @IsArray() @Matches(BUSINESS_DATE_PATTERN, { each: true }) dates!: string[]
}

export class CopyMonthlyScheduleDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_MONTH_PATTERN) targetMonth!: string
  @IsBoolean() overwrite!: boolean
}

export class MonthlyScheduleQueryDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_MONTH_PATTERN) month!: string
}

export class ActualAttendanceSegmentDto {
  @Matches(ZONED_DATE_TIME_PATTERN) checkInAt!: string
  @Matches(ZONED_DATE_TIME_PATTERN) checkOutAt!: string
}

export class AttendanceDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @ValidateNested({ each: true }) @Type(() => ActualAttendanceSegmentDto) @IsArray() actualSegments!: ActualAttendanceSegmentDto[]
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) @Max(1440) explicitAbsenceMinutes?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) @Max(1440) overtimeMinutes?: number
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() remark?: string
}

export class GenerateAttendanceDto {
  @Matches(BUSINESS_MONTH_PATTERN) month!: string
  @IsArray() @IsString({ each: true }) employeeIds!: string[]
}

export class LeaveTypeDto {
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() name!: string
  @IsOptional() @IsBoolean() active?: boolean
  @IsBoolean() countsTowardRestQuota!: boolean
}

export class LeaveRequestDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @IsString() @IsNotEmpty() leaveTypeId!: string
  @Matches(BUSINESS_DATE_PATTERN) startDate!: string
  @Matches(BUSINESS_DATE_PATTERN) endDate!: string
  @IsEnum(EmployeeLeaveUnit) unit!: EmployeeLeaveUnit
  @Transform(({ value }) => number(value)) @IsOptional() @IsNumber() @Min(0.01) hours?: number
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() reason!: string
}

export class ReviewLeaveDto {
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() reviewRemark?: string
}

export class CommissionTypeDto {
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() name!: string
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() unitName!: string
  @Transform(({ value }) => number(value)) @IsNumber() @Min(0) unitPrice!: number
  @IsOptional() @IsBoolean() active?: boolean
}

export class CommissionRecordDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @IsString() @IsNotEmpty() commissionTypeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @Transform(({ value }) => number(value)) @IsNumber() @Min(0) quantity!: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsNumber() @Min(0) unitPrice?: number
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() remark?: string
}

export class BonusDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @Transform(({ value }) => number(value)) @IsNumber() amount!: number
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() reason!: string
}

export class AttendanceListQueryDto {
  @IsOptional() @IsString() employeeId?: string
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value
    return Array.isArray(values) ? values.map((item) => String(item).trim()) : values
  })
  @IsOptional() @IsArray() @IsString({ each: true }) @IsNotEmpty({ each: true }) employeeIds?: string[]
  @IsOptional() @Matches(BUSINESS_DATE_PATTERN) startDate?: string
  @IsOptional() @Matches(BUSINESS_DATE_PATTERN) endDate?: string
  @IsOptional() @Matches(BUSINESS_MONTH_PATTERN) month?: string
  @IsOptional() @IsEnum(EmployeeLeaveStatus) status?: EmployeeLeaveStatus
}

export class PayrollGenerateDto {
  @Matches(BUSINESS_MONTH_PATTERN) month!: string
}

export class PayrollAdjustmentDto {
  @Transform(({ value }) => number(value)) @IsNumber() amount!: number
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() reason!: string
}

export class PayrollReopenDto {
  @Transform(({ value }) => trim(value)) @IsString() @IsNotEmpty() reason!: string
}

export class AdminEmployeeAttendanceQueryDto {
  @IsOptional() frontendUserIds?: string | string[]
  @IsOptional() @IsString() employeeId?: string
  @IsOptional() @Matches(BUSINESS_DATE_PATTERN) startDate?: string
  @IsOptional() @Matches(BUSINESS_DATE_PATTERN) endDate?: string
  @IsOptional() @Matches(BUSINESS_MONTH_PATTERN) month?: string
  @IsOptional() @IsString() status?: string
}

export class AdminEmployeeRevealDto {
  @IsString() @IsNotEmpty() password!: string
}
