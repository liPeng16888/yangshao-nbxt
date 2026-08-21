import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { SaveFrontendPreferenceDto } from './frontend-preferences.dto'
import { parsePreferenceSection } from './frontend-preferences.permissions'
import { FrontendPreferencesService } from './frontend-preferences.service'

@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
@FrontendPermission('DATA_MAIN', 'LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE')
@Controller('frontend-preferences')
export class FrontendPreferencesController {
  constructor(private readonly preferences: FrontendPreferencesService) {}

  @Get()
  list(@CurrentUserInfo() user: CurrentUser) {
    return this.preferences.list(user)
  }

  @Put(':section')
  save(
    @CurrentUserInfo() user: CurrentUser,
    @Param('section') section: string,
    @Body() dto: SaveFrontendPreferenceDto
  ) {
    return this.preferences.save(user, parsePreferenceSection(section), dto)
  }
}
