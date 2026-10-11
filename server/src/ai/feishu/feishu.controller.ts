import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { ZodError } from 'zod'
import { AuthGuard } from '../../auth/auth.guard'
import { CurrentUserInfo } from '../../auth/current-user.decorator'
import type { CurrentUser } from '../../auth/current-user'
import { FeishuService } from './feishu.service'
import { FeishuRuntime } from './feishu.runtime'
import { feishuBot } from './feishu.types'
async function validated<T>(fn: () => Promise<T>) { try { return await fn() } catch (e) { if (e instanceof ZodError) throw new BadRequestException('输入格式不正确'); throw e } }

@Controller('admin/ai/feishu')
@UseGuards(AuthGuard)
export class AdminFeishuController {
  constructor(private readonly service: FeishuService, private readonly runtime: FeishuRuntime) {}
  @Get('configs/:bot') async config(@CurrentUserInfo() u: CurrentUser, @Param('bot') bot: string) { const kind = feishuBot(bot); return { ...await this.service.getConfig(u, kind), status: this.runtime.status(kind) } }
  @Put('configs/:bot') save(@CurrentUserInfo() u: CurrentUser, @Param('bot') bot: string, @Body() b: unknown) { return validated(() => this.service.saveConfig(u, feishuBot(bot), b)) }
  @Post('configs/:bot/test') test(@CurrentUserInfo() u: CurrentUser, @Param('bot') bot: string) { return this.runtime.test(u, feishuBot(bot)) }
  @Post('configs/:bot/invitations') invite(@CurrentUserInfo() u: CurrentUser, @Param('bot') bot: string, @Body() b: unknown) { return validated(() => this.service.invitations(u, feishuBot(bot), b)) }
  @Get('configs/:bot/bindings') bindings(@CurrentUserInfo() u: CurrentUser, @Param('bot') bot: string) { return this.service.bindings(u, feishuBot(bot)) }
  @Patch('configs/:bot/bindings/:id') update(@CurrentUserInfo() u: CurrentUser, @Param('bot') bot: string, @Param('id') id: string, @Body() b: unknown) { return validated(() => this.service.editBinding(u, feishuBot(bot), id, b)) }
  @Delete('configs/:bot/bindings/:id') remove(@CurrentUserInfo() u: CurrentUser, @Param('bot') bot: string, @Param('id') id: string) { return this.service.unbind(u, feishuBot(bot), id) }
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
