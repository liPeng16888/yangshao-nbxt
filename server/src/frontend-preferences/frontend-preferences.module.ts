import { Module } from '@nestjs/common'
import { FrontendPreferencesController } from './frontend-preferences.controller'
import { FrontendPreferencesService } from './frontend-preferences.service'

@Module({
  controllers: [FrontendPreferencesController],
  providers: [FrontendPreferencesService],
  exports: [FrontendPreferencesService]
})
export class FrontendPreferencesModule {}
