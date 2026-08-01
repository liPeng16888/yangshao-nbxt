import { Module } from '@nestjs/common'
import { CustomerOverviewService } from './customer-overview.service'

@Module({
  providers: [CustomerOverviewService],
  exports: [CustomerOverviewService]
})
export class CustomerOverviewModule {}
