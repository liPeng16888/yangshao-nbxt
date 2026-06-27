import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import { LabSheetsService } from './lab-sheets.service'

@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
@Controller('lab-sheets')
export class LabSheetsController {
  constructor(private readonly sheets: LabSheetsService) {}

  @Get('current')
  getCurrent(@CurrentUserInfo() user: CurrentUser) {
    return this.sheets.getSheetForFrontendUser(user.id)
  }

  @Get()
  getByDate(@CurrentUserInfo() user: CurrentUser, @Query('date') date: string) {
    return this.sheets.getSheetForFrontendUser(user.id, date)
  }

  @Get('parameters/current')
  async getCurrentParameters(@CurrentUserInfo() user: CurrentUser) {
    return (await this.sheets.getSheetForFrontendUser(user.id)).parameters
  }

  @Put('parameters/current')
  updateCurrentParameters(@CurrentUserInfo() user: CurrentUser, @Body() parameters: Record<string, number>) {
    return this.sheets.updateCurrentParameters(user.id, parameters)
  }

  @Post(':sheetId/sample-blocks')
  addBlocks(@CurrentUserInfo() user: CurrentUser, @Param('sheetId') sheetId: string, @Body('count') count: number) {
    return this.sheets.addSampleBlocks(user.id, sheetId, Number(count || 0))
  }

  @Put(':sheetId/cells')
  saveBlock(@CurrentUserInfo() user: CurrentUser, @Param('sheetId') sheetId: string, @Body() block: Record<string, unknown>) {
    return this.sheets.saveSampleBlock(user, sheetId, block)
  }

  @Get('history')
  getHistory(@CurrentUserInfo() user: CurrentUser) {
    return this.sheets.getHistory(user.id)
  }
}
