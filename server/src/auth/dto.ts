import { IsString, MinLength } from 'class-validator'

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
