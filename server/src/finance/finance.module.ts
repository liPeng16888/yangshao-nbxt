import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { RemindersModule } from '../reminders/reminders.module'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'

@Module({
  imports: [AdminModule, RemindersModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService]
})
export class FinanceModule {}
