import { Module } from '@nestjs/common'
import { AdminAccessService } from './admin-access.service'
import { AdminAccountsController } from './accounts.controller'
import { AdminAccountsService } from './accounts.service'
import { PasswordService } from '../auth/password.service'
import { AdminDataController } from './data.controller'
import { AdminDataService } from './data.service'
import { CustomerOverviewModule } from '../customer-overview/customer-overview.module'

@Module({
  imports: [CustomerOverviewModule],
  controllers: [AdminAccountsController, AdminDataController],
  providers: [AdminAccessService, AdminAccountsService, AdminDataService, PasswordService],
  exports: [AdminAccessService]
})
export class AdminModule {}
