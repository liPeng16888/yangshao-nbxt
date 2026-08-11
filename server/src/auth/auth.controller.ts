import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { FrontendSubAccountsService } from './frontend-subaccounts.service'
import { CurrentUserInfo } from './current-user.decorator'
import type { CurrentUser } from './current-user'
import {
  AccessGuardGroupDto,
  AccessGuardSettingsDto,
  CreateFrontendSubAccountDto,
  LoginDto,
  RegisterDto,
  ResetFrontendSubAccountPasswordDto,
  SetFrontendSubAccountStatusDto,
  UpdateAdminProfileDto,
  UpdateFrontendSubAccountDto,
  UpdatePasswordDto,
  VerifyAccessGuardGroupDto
} from './dto'

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly frontendSubAccounts: FrontendSubAccountsService
  ) {}

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto, [UserRole.FRONTEND_USER, UserRole.FRONTEND_SUB_USER])
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

  @UseGuards(AuthGuard)
  @Get('auth/frontend-subaccounts')
  listFrontendSubAccounts(@CurrentUserInfo() user: CurrentUser) {
    return this.frontendSubAccounts.list(user)
  }

  @UseGuards(AuthGuard)
  @Post('auth/frontend-subaccounts')
  createFrontendSubAccount(@CurrentUserInfo() user: CurrentUser, @Body() dto: CreateFrontendSubAccountDto) {
    return this.frontendSubAccounts.create(user, dto)
  }

  @UseGuards(AuthGuard)
  @Patch('auth/frontend-subaccounts/:id')
  updateFrontendSubAccount(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: UpdateFrontendSubAccountDto
  ) {
    return this.frontendSubAccounts.update(user, id, dto)
  }

  @UseGuards(AuthGuard)
  @Patch('auth/frontend-subaccounts/:id/status')
  setFrontendSubAccountStatus(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: SetFrontendSubAccountStatusDto
  ) {
    return this.frontendSubAccounts.setStatus(user, id, dto)
  }

  @UseGuards(AuthGuard)
  @Post('auth/frontend-subaccounts/:id/reset-password')
  resetFrontendSubAccountPassword(
    @CurrentUserInfo() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: ResetFrontendSubAccountPasswordDto
  ) {
    return this.frontendSubAccounts.resetPassword(user, id, dto)
  }

  @UseGuards(AuthGuard)
  @Delete('auth/frontend-subaccounts/:id')
  deleteFrontendSubAccount(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.frontendSubAccounts.softDelete(user, id)
  }

  @UseGuards(AuthGuard)
  @Patch('auth/profile')
  updateFrontendPassword(@CurrentUserInfo() user: CurrentUser, @Body() dto: UpdatePasswordDto) {
    return this.auth.updateFrontendPassword(user, dto)
  }

  @UseGuards(AuthGuard)
  @Get('auth/access-guard')
  getAccessGuardSettings(@CurrentUserInfo() user: CurrentUser) {
    return this.auth.getAccessGuardSettings(user)
  }

  @UseGuards(AuthGuard)
  @Patch('auth/access-guard')
  updateAccessGuardSettings(@CurrentUserInfo() user: CurrentUser, @Body() dto: AccessGuardSettingsDto) {
    return this.auth.updateAccessGuardSettings(user, dto)
  }

  @UseGuards(AuthGuard)
  @Get('auth/access-groups')
  getAccessGuardGroups(@CurrentUserInfo() user: CurrentUser) {
    return this.auth.getAccessGuardGroups(user)
  }

  @UseGuards(AuthGuard)
  @Post('auth/access-groups')
  createAccessGuardGroup(@CurrentUserInfo() user: CurrentUser, @Body() dto: AccessGuardGroupDto) {
    return this.auth.createAccessGuardGroup(user, dto)
  }

  @UseGuards(AuthGuard)
  @Patch('auth/access-groups/:id')
  updateAccessGuardGroup(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() dto: AccessGuardGroupDto) {
    return this.auth.updateAccessGuardGroup(user, id, dto)
  }

  @UseGuards(AuthGuard)
  @Post('auth/access-groups/:id/verify')
  verifyAccessGuardGroup(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() dto: VerifyAccessGuardGroupDto) {
    return this.auth.verifyAccessGuardGroup(user, id, dto.password)
  }

  @UseGuards(AuthGuard)
  @Delete('auth/access-groups/:id')
  deleteAccessGuardGroup(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) {
    return this.auth.deleteAccessGuardGroup(user, id)
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

  @UseGuards(AuthGuard)
  @Patch('admin/auth/profile')
  updateAdminProfile(@CurrentUserInfo() user: CurrentUser, @Body() dto: UpdateAdminProfileDto) {
    return this.auth.updateAdminProfile(user, dto)
  }
}
