import { Module } from '@nestjs/common'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { LabSheetStreamAuthService } from './lab-sheet-stream-auth.service'
import { LabSheetsController } from './lab-sheets.controller'
import { LabSheetsStreamController } from './lab-sheets-stream.controller'
import { LabSheetsService } from './lab-sheets.service'

@Module({
  controllers: [LabSheetsController, LabSheetsStreamController],
  providers: [LabSheetsService, LabSheetRealtimeService, LabSheetStreamAuthService],
  exports: [LabSheetsService]
})
export class LabSheetsModule {}
