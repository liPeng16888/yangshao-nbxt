import { IsOptional, IsString, MinLength } from 'class-validator'

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
