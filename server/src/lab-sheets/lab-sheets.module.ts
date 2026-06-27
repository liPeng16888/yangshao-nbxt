import { Module } from '@nestjs/common'
import { LabSheetsController } from './lab-sheets.controller'
import { LabSheetsService } from './lab-sheets.service'

@Module({
  controllers: [LabSheetsController],
  providers: [LabSheetsService],
  exports: [LabSheetsService]
})
export class LabSheetsModule {}
