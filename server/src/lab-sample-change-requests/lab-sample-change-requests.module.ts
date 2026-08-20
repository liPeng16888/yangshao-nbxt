import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AuthModule } from '../auth/auth.module'
import { LabSheetsModule } from '../lab-sheets/lab-sheets.module'
import { AdminLabSampleChangeRequestsController } from './admin-lab-sample-change-requests.controller'
import { LabSampleChangeRequestsController } from './lab-sample-change-requests.controller'
import { LabSampleChangeRequestsService } from './lab-sample-change-requests.service'

@Module({
  imports: [AuthModule, AdminModule, LabSheetsModule],
  controllers: [LabSampleChangeRequestsController, AdminLabSampleChangeRequestsController],
  providers: [LabSampleChangeRequestsService]
})
export class LabSampleChangeRequestsModule {}
