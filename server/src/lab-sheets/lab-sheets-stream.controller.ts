import { Controller, Query, Sse } from '@nestjs/common'
import { from, mergeMap } from 'rxjs'
import { businessDateInBeijing } from '../common/date'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'
import { LabSheetStreamAuthService } from './lab-sheet-stream-auth.service'

@Controller('lab-sheets')
export class LabSheetsStreamController {
  constructor(
    private readonly realtime: LabSheetRealtimeService,
    private readonly streamAuth: LabSheetStreamAuthService
  ) {}

  @Sse('stream')
  stream(@Query('date') date: string, @Query('token') token: string) {
    const targetDate = date || businessDateInBeijing()
    return from(this.streamAuth.verifyFrontendToken(token)).pipe(mergeMap((user) => this.realtime.stream(user.dataOwnerId, targetDate)))
  }
}
