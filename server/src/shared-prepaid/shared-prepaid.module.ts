import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { SharedPrepaidController } from './shared-prepaid.controller'
import { SharedPrepaidLedgerService } from './shared-prepaid-ledger.service'
import { SharedPrepaidQueryService } from './shared-prepaid-query.service'
import { SharedPrepaidRealtimeController } from './shared-prepaid-realtime.controller'
import { SharedPrepaidRealtimeService } from './shared-prepaid-realtime.service'
import { SharedPrepaidSettlementService } from './shared-prepaid-settlement.service'

@Module({
  imports: [AuthModule],
  controllers: [SharedPrepaidController, SharedPrepaidRealtimeController],
  providers: [
    SharedPrepaidLedgerService,
    SharedPrepaidQueryService,
    SharedPrepaidRealtimeService,
    SharedPrepaidSettlementService
  ],
  exports: [
    SharedPrepaidLedgerService,
    SharedPrepaidQueryService,
    SharedPrepaidRealtimeService,
    SharedPrepaidSettlementService
  ]
})
export class SharedPrepaidModule {}
