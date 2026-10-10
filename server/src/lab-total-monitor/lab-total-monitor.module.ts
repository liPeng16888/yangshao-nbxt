import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { LabTotalMonitorController, AdminLabTotalMonitorController } from './lab-total-monitor.controller'
import { LabTotalMonitorService } from './lab-total-monitor.service'

@Module({ imports: [AdminModule], controllers: [LabTotalMonitorController, AdminLabTotalMonitorController], providers: [LabTotalMonitorService] })
export class LabTotalMonitorModule {}
