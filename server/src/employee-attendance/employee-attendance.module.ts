import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { EmployeeDataCipherService } from './employee-data-cipher.service'
import { EmployeeAttendanceController } from './employee-attendance.controller'
import { EmployeeAttendanceService } from './employee-attendance.service'
import { PrivateEmployeePhotoService } from './private-employee-photo.service'

@Module({
  imports: [AuthModule],
  controllers: [EmployeeAttendanceController],
  providers: [EmployeeAttendanceService, EmployeeDataCipherService, PrivateEmployeePhotoService],
  exports: [EmployeeAttendanceService]
})
export class EmployeeAttendanceModule {}
