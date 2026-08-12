import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AuthModule } from '../auth/auth.module'
import { AdminEmployeeAttendanceController } from './admin-employee-attendance.controller'
import { EmployeeDataCipherService } from './employee-data-cipher.service'
import { EmployeeAttendanceController } from './employee-attendance.controller'
import { EmployeeAttendanceService } from './employee-attendance.service'
import { PrivateEmployeePhotoService } from './private-employee-photo.service'
import { PayrollService } from './payroll.service'
import { PayrollMonthLockService } from './payroll-month-lock.service'

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [EmployeeAttendanceController, AdminEmployeeAttendanceController],
  providers: [EmployeeAttendanceService, EmployeeDataCipherService, PrivateEmployeePhotoService, PayrollMonthLockService, PayrollService],
  exports: [EmployeeAttendanceService, PayrollService]
})
export class EmployeeAttendanceModule {}
