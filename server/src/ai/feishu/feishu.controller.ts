import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { ZodError } from 'zod'
import { AuthGuard } from '../../auth/auth.guard'
import { CurrentUserInfo } from '../../auth/current-user.decorator'
import type { CurrentUser } from '../../auth/current-user'
import { FeishuService } from './feishu.service'
import { FeishuRuntime } from './feishu.runtime'
async function validated<T>(fn: () => Promise<T>) { try { return await fn() } catch (e) { if (e instanceof ZodError) throw new BadRequestException('输入格式不正确'); throw e } }

@Controller('admin/ai/feishu')
@UseGuards(AuthGuard)
export class AdminFeishuController {
  constructor(private readonly service: FeishuService, private readonly runtime: FeishuRuntime) {}
  @Get('config') async config(@CurrentUserInfo() u: CurrentUser) { return { ...await this.service.getConfig(u), status: this.runtime.status() } }
  @Put('config') save(@CurrentUserInfo() u: CurrentUser, @Body() b: unknown) { return validated(() => this.service.saveConfig(u, b)) }
  @Post('test') test(@CurrentUserInfo() u: CurrentUser) { return this.runtime.test(u) }
  @Post('invitations') invite(@CurrentUserInfo() u: CurrentUser, @Body() b: unknown) { return validated(() => this.service.invitations(u, b)) }
  @Get('bindings') bindings(@CurrentUserInfo() u: CurrentUser) { return this.service.bindings(u) }
  @Patch('bindings/:id') update(@CurrentUserInfo() u: CurrentUser, @Param('id') id: string, @Body() b: unknown) { return validated(() => this.service.editBinding(u, id, b)) }
  @Delete('bindings/:id') remove(@CurrentUserInfo() u: CurrentUser, @Param('id') id: string) { return this.service.unbind(u, id) }
}
@Controller('ai/feishu')
@UseGuards(AuthGuard)
export class FeishuController {
  constructor(private readonly service: FeishuService) {}
  @Post('bind/resolve') resolve(@CurrentUserInfo() u: CurrentUser, @Body() b: unknown) { return validated(() => this.service.resolveBinding(u, b)) }
  @Post('bind/confirm') confirm(@CurrentUserInfo() u: CurrentUser, @Body() b: unknown) { return validated(() => this.service.confirmBinding(u, b)) }
  @Post('access/resolve') access(@CurrentUserInfo() u: CurrentUser, @Body() b: unknown) { return validated(() => this.service.resolveAccess(u, b)) }
  @Post('access/confirm') verify(@CurrentUserInfo() u: CurrentUser, @Body() b: unknown) { return validated(() => this.service.confirmAccess(u, b)) }
}
