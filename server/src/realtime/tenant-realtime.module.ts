import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { TenantRealtimeController } from './tenant-realtime.controller'
import { TenantRealtimeService } from './tenant-realtime.service'

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [TenantRealtimeController],
  providers: [TenantRealtimeService],
  exports: [TenantRealtimeService]
})
export class TenantRealtimeModule {}
