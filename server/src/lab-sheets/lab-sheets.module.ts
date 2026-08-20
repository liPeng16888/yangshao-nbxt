import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { LabCellChangeService } from './lab-cell-change.service'
import { LabSheetStreamAuthService } from './lab-sheet-stream-auth.service'
import { LabSheetsController } from './lab-sheets.controller'
import { LabSheetsStreamController } from './lab-sheets-stream.controller'
import { LabSheetsService } from './lab-sheets.service'

@Module({
  imports: [AuthModule],
  controllers: [LabSheetsController, LabSheetsStreamController],
  providers: [LabSheetsService, LabSheetRealtimeService, LabCellChangeService, LabSheetStreamAuthService],
  exports: [LabSheetsService, LabCellChangeService]
})
export class LabSheetsModule {}
