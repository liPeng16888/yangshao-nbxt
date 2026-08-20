import { LabSampleChangeRequestStatus } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsEnum, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value
const trimMulti = ({ value }: { value: unknown }) => Array.isArray(value)
  ? value.map((item) => typeof item === 'string' ? item.trim() : item)
  : typeof value === 'string' ? value.trim() : value

export class CreateLabSampleChangeRequestDto {
  @IsString() @IsNotEmpty() blockId!: string
  @IsISO8601() baseUpdatedAt!: string
  @IsObject() changes!: Record<string, unknown>
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) reason!: string
}

export class FrontendLabSampleChangeRequestQueryDto {
  @Transform(trim) @IsOptional() @IsISO8601({ strict: true }) date?: string
  @IsOptional() @IsEnum(LabSampleChangeRequestStatus) status?: LabSampleChangeRequestStatus
}

export class AdminLabSampleChangeRequestQueryDto extends FrontendLabSampleChangeRequestQueryDto {
  @Transform(trimMulti) @IsOptional() @IsString({ each: true }) @IsNotEmpty({ each: true }) frontendUserIds?: string | string[]
}

export class ApproveLabSampleChangeRequestDto {
  @Transform(trim) @IsOptional() @IsString() @MaxLength(500) reviewRemark?: string
}

export class RejectLabSampleChangeRequestDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) reviewRemark!: string
}
