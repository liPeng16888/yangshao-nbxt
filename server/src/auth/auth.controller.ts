import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { CurrentUserInfo } from './current-user.decorator'
import type { CurrentUser } from './current-user'
import { LoginDto, RegisterDto } from './dto'

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto, [UserRole.FRONTEND_USER])
  }

  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.registerFrontendUser(dto)
  }

  @UseGuards(AuthGuard)
  @Get('auth/me')
  me(@CurrentUserInfo() user: CurrentUser) {
    return user
  }

  @UseGuards(AuthGuard)
  @Post('auth/logout')
  logout() {
    return { ok: true }
  }

  @Post('admin/auth/login')
  adminLogin(@Body() dto: LoginDto) {
    return this.auth.login(dto, [UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN])
  }

  @UseGuards(AuthGuard)
  @Get('admin/auth/me')
  adminMe(@CurrentUserInfo() user: CurrentUser) {
    return user
  }
}
