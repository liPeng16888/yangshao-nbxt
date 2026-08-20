import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { LabSheetsModule } from './lab-sheets/lab-sheets.module'
import { LabSampleChangeRequestsModule } from './lab-sample-change-requests/lab-sample-change-requests.module'
import { FinanceModule } from './finance/finance.module'
import { BlacklistModule } from './blacklist/blacklist.module'
import { UploadsModule } from './uploads/uploads.module'
import { RemindersModule } from './reminders/reminders.module'
import { AdminModule } from './admin/admin.module'
import { CustomersModule } from './customers/customers.module'
import { ReportsModule } from './reports/reports.module'
import { CustomerOverviewModule } from './customer-overview/customer-overview.module'
import { MedicineInventoryModule } from './medicine-inventory/medicine-inventory.module'
import { EmployeeAttendanceModule } from './employee-attendance/employee-attendance.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    LabSheetsModule,
    LabSampleChangeRequestsModule,
    FinanceModule,
    BlacklistModule,
    CustomersModule,
    UploadsModule,
    RemindersModule,
    ReportsModule,
    CustomerOverviewModule,
    AdminModule,
    MedicineInventoryModule,
    EmployeeAttendanceModule
  ]
})
export class AppModule {}
