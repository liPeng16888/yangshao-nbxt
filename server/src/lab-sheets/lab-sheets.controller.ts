import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
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
import {
  SampleRetestsService,
  type CreateSampleRetestsPayload,
  type DeleteSampleRetestPayload,
  type SaveSampleRetestPayload,
  type VoidSampleRetestPayload
} from './sample-retests.service'

@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
@FrontendPermission('DATA_MAIN')
@Controller('lab-sheets')
export class LabSheetsController {
  constructor(
    private readonly sheets: LabSheetsService,
    private readonly auth: AuthService,
    private readonly retests: SampleRetestsService
  ) {}

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

  @Post(':sheetId/sample-retests')
  async createRetests(
    @CurrentUserInfo() user: CurrentUser,
    @Param('sheetId') sheetId: string,
    @Body() payload: CreateSampleRetestsPayload,
    @Headers('x-ys-client-id') sourceClientId?: string,
    @Headers('x-ys-access-grant') grant?: string
  ) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.retests.createRetests(
      user, sheetId, payload, sourceClientId,
      !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA')
    )
  }

  @Put(':sheetId/sample-retests/:retestId')
  async saveRetest(
    @CurrentUserInfo() user: CurrentUser,
    @Param('sheetId') sheetId: string,
    @Param('retestId') retestId: string,
    @Body() payload: SaveSampleRetestPayload,
    @Headers('x-ys-client-id') sourceClientId?: string,
    @Headers('x-ys-access-grant') grant?: string
  ) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.retests.saveRetest(
      user, sheetId, retestId, payload, sourceClientId,
      !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA')
    )
  }

  @Delete(':sheetId/sample-retests/:retestId')
  async deleteRetest(
    @CurrentUserInfo() user: CurrentUser,
    @Param('sheetId') sheetId: string,
    @Param('retestId') retestId: string,
    @Body() payload: DeleteSampleRetestPayload,
    @Headers('x-ys-client-id') sourceClientId?: string,
    @Headers('x-ys-access-grant') grant?: string
  ) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.retests.deleteRetest(
      user, sheetId, retestId, payload, sourceClientId,
      !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA')
    )
  }

  @Patch(':sheetId/sample-retests/:retestId/void')
  async voidRetest(
    @CurrentUserInfo() user: CurrentUser,
    @Param('sheetId') sheetId: string,
    @Param('retestId') retestId: string,
    @Body() payload: VoidSampleRetestPayload,
    @Headers('x-ys-client-id') sourceClientId?: string,
    @Headers('x-ys-access-grant') grant?: string
  ) {
    const protectedFeature = await this.auth.isFeatureProtected(user, 'COMPLETED_SAMPLE_DATA')
    return this.retests.voidRetest(
      user, sheetId, retestId, payload, sourceClientId,
      !protectedFeature || await this.auth.hasAccessGrant(user, grant, 'COMPLETED_SAMPLE_DATA')
    )
  }

  @Get('history')
  getHistory(@CurrentUserInfo() user: CurrentUser) {
    return this.sheets.getHistory(user.dataOwnerId)
  }
}
