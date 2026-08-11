import { Body, Controller, Get, Headers, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { AuthService } from '../auth/auth.service'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { LabSheetsService } from './lab-sheets.service'

@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
@FrontendPermission('DATA_MAIN')
@Controller('lab-sheets')
export class LabSheetsController {
  constructor(private readonly sheets: LabSheetsService, private readonly auth: AuthService) {}

  @Get('current')
  async getCurrent(@CurrentUserInfo() user: CurrentUser, @Headers('x-ys-access-grant') grant?: string) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.sheets.getDefaultSheetForFrontendUser(user.dataOwnerId, !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA'))
  }

  @Get()
  async getByDate(@CurrentUserInfo() user: CurrentUser, @Query('date') date: string, @Headers('x-ys-access-grant') grant?: string) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.sheets.getSheetForFrontendUser(user.dataOwnerId, date, !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA'))
  }

  @Get('parameters/current')
  async getCurrentParameters(@CurrentUserInfo() user: CurrentUser) {
    return (await this.sheets.getSheetForFrontendUser(user.dataOwnerId)).parameters
  }

  @Put('parameters/current')
  updateCurrentParameters(@CurrentUserInfo() user: CurrentUser, @Body() parameters: Record<string, number>, @Headers('x-ys-client-id') sourceClientId?: string) {
    return this.sheets.updateCurrentParameters(user.dataOwnerId, parameters, sourceClientId, user.id)
  }

  @Put('parameters/current/apply')
  async applyCurrentParameters(
    @CurrentUserInfo() user: CurrentUser,
    @Body() payload: unknown,
    @Headers('x-ys-client-id') sourceClientId?: string,
    @Headers('x-ys-access-grant') grant?: string
  ) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.sheets.applyCurrentParametersFromIndex(
      user.dataOwnerId,
      payload,
      sourceClientId,
      !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA'),
      user.id
    )
  }

  @Post(':sheetId/sample-blocks')
  async addBlocks(
    @CurrentUserInfo() user: CurrentUser,
    @Param('sheetId') sheetId: string,
    @Body('count') count: number,
    @Headers('x-ys-client-id') sourceClientId?: string,
    @Headers('x-ys-access-grant') grant?: string
  ) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.sheets.addSampleBlocks(
      user.dataOwnerId,
      sheetId,
      Number(count || 0),
      sourceClientId,
      !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA'),
      user.id
    )
  }

  @Put(':sheetId/cells')
  async saveBlock(@CurrentUserInfo() user: CurrentUser, @Param('sheetId') sheetId: string, @Body() block: Record<string, unknown>, @Headers('x-ys-client-id') sourceClientId?: string, @Headers('x-ys-access-grant') grant?: string) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.sheets.saveSampleBlock(user, sheetId, block, sourceClientId, !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA'))
  }

  @Get('history')
  getHistory(@CurrentUserInfo() user: CurrentUser) {
    return this.sheets.getHistory(user.dataOwnerId)
  }
}
