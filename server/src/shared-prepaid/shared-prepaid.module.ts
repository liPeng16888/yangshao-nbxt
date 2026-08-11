import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { SharedPrepaidController } from './shared-prepaid.controller'
import { SharedPrepaidLedgerService } from './shared-prepaid-ledger.service'
import { SharedPrepaidQueryService } from './shared-prepaid-query.service'

@Module({
  imports: [AuthModule],
  controllers: [SharedPrepaidController],
  providers: [SharedPrepaidLedgerService, SharedPrepaidQueryService],
  exports: [SharedPrepaidLedgerService, SharedPrepaidQueryService]
})
export class SharedPrepaidModule {}
