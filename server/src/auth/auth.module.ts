import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { FrontendSubAccountsService } from './frontend-subaccounts.service'
import { FrontendPermissionGuard } from './frontend-permission.guard'

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, FrontendSubAccountsService, FrontendPermissionGuard],
  exports: [AuthService, PasswordService, FrontendPermissionGuard]
})
export class AuthModule {}
