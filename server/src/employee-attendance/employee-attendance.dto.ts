import { EmployeeLeaveStatus, EmployeeLeaveUnit, EmployeeStatus } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator'

export const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const BUSINESS_MONTH_PATTERN = /^\d{4}-\d{2}$/

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
  @Transform(({ value }) => number(value)) @IsInt() @Min(0) @Max(1440) scheduledMinutes!: number
}

export class DateOverrideDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @IsBoolean() isWorkday!: boolean
  @Transform(({ value }) => number(value)) @IsInt() @Min(0) @Max(1440) scheduledMinutes!: number
  @Transform(({ value }) => trim(value)) @IsOptional() @IsString() remark?: string
}

export class MonthlySettingDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_MONTH_PATTERN) month!: string
  @Transform(({ value }) => number(value)) @IsNumber() @Min(0) scheduledWorkDays!: number
  @Transform(({ value }) => number(value)) @IsNumber() @Min(0) restQuotaDays!: number
}

export class AttendanceDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @IsBoolean() isScheduledWorkday!: boolean
  @Transform(({ value }) => number(value)) @IsInt() @Min(0) @Max(1440) scheduledMinutes!: number
  @IsOptional() @IsString() checkInAt?: string
  @IsOptional() @IsString() checkOutAt?: string
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) workedMinutes?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) lateMinutes?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) earlyLeaveMinutes?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) absenceMinutes?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) overtimeMinutes?: number
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
  @IsOptional() @Matches(BUSINESS_DATE_PATTERN) startDate?: string
  @IsOptional() @Matches(BUSINESS_DATE_PATTERN) endDate?: string
  @IsOptional() @Matches(BUSINESS_MONTH_PATTERN) month?: string
  @IsOptional() @IsEnum(EmployeeLeaveStatus) status?: EmployeeLeaveStatus
}
