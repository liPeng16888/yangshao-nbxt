import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { SharedPrepaidModule } from '../shared-prepaid/shared-prepaid.module'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { LabCellChangeService } from './lab-cell-change.service'
import { LabSheetStreamAuthService } from './lab-sheet-stream-auth.service'
import { LabSheetsController } from './lab-sheets.controller'
import { LabSheetsStreamController } from './lab-sheets-stream.controller'
import { LabSheetsService } from './lab-sheets.service'
import { SampleRetestsService } from './sample-retests.service'

@Module({
  imports: [AuthModule, SharedPrepaidModule],
  controllers: [LabSheetsController, LabSheetsStreamController],
  providers: [LabSheetsService, SampleRetestsService, LabSheetRealtimeService, LabCellChangeService, LabSheetStreamAuthService],
  exports: [LabSheetsService, SampleRetestsService, LabCellChangeService]
})
export class LabSheetsModule {}
