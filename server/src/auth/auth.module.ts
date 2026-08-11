import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PasswordService } from './password.service'
import { FrontendSubAccountsService } from './frontend-subaccounts.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, FrontendSubAccountsService],
  exports: [AuthService, PasswordService]
})
export class AuthModule {}
