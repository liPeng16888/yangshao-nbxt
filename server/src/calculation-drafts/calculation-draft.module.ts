import { Module } from '@nestjs/common'
import { CalculationDraftController } from './calculation-draft.controller'
import { CalculationDraftService } from './calculation-draft.service'

@Module({
  controllers: [CalculationDraftController],
  providers: [CalculationDraftService]
})
export class CalculationDraftModule {}
