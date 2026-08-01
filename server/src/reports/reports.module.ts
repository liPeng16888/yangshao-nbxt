import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { CustomerOverviewModule } from '../customer-overview/customer-overview.module'

@Module({
  imports: [CustomerOverviewModule],
  controllers: [ReportsController],
  providers: [ReportsService]
})
export class ReportsModule {}
