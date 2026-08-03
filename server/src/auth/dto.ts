import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'
import { AccessGuardFeature } from '@prisma/client'

export class LoginDto {
  @IsString()
  account!: string

  @IsString()
  password!: string
}

export class RegisterDto {
  @IsString()
  username!: string

  @IsString()
  account!: string

  @IsString()
  @MinLength(6)
  password!: string

  @IsString()
  confirmPassword!: string

  @IsString()
  inviteCode!: string
}

export class UpdateAdminProfileDto {
  @IsOptional()
  @IsString()
  account?: string

  @IsOptional()
  @IsString()
  username?: string

  @IsOptional()
  @IsString()
  currentPassword?: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string

  @IsOptional()
  @IsString()
  confirmPassword?: string
}

export class UpdatePasswordDto {
  @IsString()
  currentPassword!: string

  @IsString()
  @MinLength(6)
  newPassword!: string

  @IsString()
  confirmPassword!: string
}

export class AccessGuardSettingsDto {
  @IsOptional()
  enabled?: boolean

  @IsOptional()
  ttlMinutes?: number

  @IsOptional()
  @IsString()
  password?: string

  @IsOptional()
  @IsString()
  disablePassword?: string

  @IsOptional()
  @IsString()
  recoveryPrompt?: string

  @IsOptional()
  @IsString()
  recoveryAnswer?: string
}

export class AccessGuardGroupDto {
  @IsString()
  @MaxLength(24)
  name!: string

  @IsBoolean()
  enabled!: boolean

  @IsInt()
  @Min(1)
  @Max(1440)
  ttlMinutes!: number

  @IsString()
  @MinLength(4)
  password!: string

  @IsString()
  recoveryPrompt!: string

  @IsString()
  recoveryAnswer!: string

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(AccessGuardFeature, { each: true })
  features!: AccessGuardFeature[]
}

export class VerifyAccessGuardGroupDto {
  @IsString()
  password!: string
}
