import { BadRequestException, Body, Controller, Delete, Get, HttpException, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AuthGuard } from '../auth/auth.guard'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import type { CurrentUser } from '../auth/current-user'
import { AiService } from './ai.service'
import { AiConfigService } from './ai-config.service'
import { z, ZodError } from 'zod'
import { ownerIdsSchema } from './ai-owner-scope'

// All inputs, including configuration, are validated server-side. Never expose provider errors.
async function validated<T>(operation: () => Promise<T>) {
  try { return await operation() } catch (error) {
    if (error instanceof ZodError) throw new BadRequestException('输入格式不正确，请核对必填项、日期和数值')
    // Original business conflict responses may carry complete drafts/snapshots.
    // AI routes retain the status/message, never those unrestricted payloads.
    if (error instanceof HttpException) {
      const response = error.getResponse() as string | { message?: unknown }
      throw new HttpException(typeof response === 'string' ? response : typeof response.message === 'string' ? response.message : '操作未执行，请重新查询并核对草稿或在原页面处理', error.getStatus())
    }
    throw error
  }
}
@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Get('bootstrap') bootstrap(@CurrentUserInfo() user: CurrentUser) { return this.ai.bootstrap(user) }
  @Post('chat') chat(@CurrentUserInfo() user: CurrentUser, @Body() input: unknown) { return validated(() => this.ai.chat(user, input)) }
  @Post('attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  attachment(@CurrentUserInfo() user: CurrentUser, @UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file?.buffer) throw new BadRequestException('请上传照片')
    return this.ai.attachment(user, file.buffer, file.mimetype)
  }
  @Post('conversations/:id/read') read(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: unknown) {
    return validated(async () => { const b = z.object({ ownerId: z.string().optional(), ownerIds: ownerIdsSchema.optional(), grants: z.record(z.string(), z.string()).default({}) }).strict().refine(b => !(b.ownerId && b.ownerIds)).parse(body); return this.ai.conversation(user, id, b.ownerId, b.grants, b.ownerIds) })
  }
  @Post('proposals/:id/decision') confirm(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: unknown) { return validated(() => this.ai.confirm(user, id, body)) }
}
@Controller('admin/ai')
@UseGuards(AuthGuard)
export class AdminAiController {
  constructor(private readonly config: AiConfigService, private readonly ai: AiService) {}
  @Get('config') get(@CurrentUserInfo() user: CurrentUser) { return this.config.getConfig(user) }
  @Put('settings') settings(@CurrentUserInfo() user: CurrentUser, @Body() body: unknown) { return validated(() => this.config.saveSettings(user, body)) }
  @Put('policies/:subjectId') policy(@CurrentUserInfo() user: CurrentUser, @Param('subjectId') id: string, @Body() body: unknown) { return validated(() => this.config.savePolicy(user, id, body)) }
  @Post('models') create(@CurrentUserInfo() user: CurrentUser, @Body() body: unknown) { return validated(() => this.config.saveModel(user, undefined, body)) }
  @Delete('policies/:subjectId') inherit(@CurrentUserInfo() user: CurrentUser, @Param('subjectId') id: string) { return this.config.inheritPolicy(user, id) }
  @Put('models/:id') update(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string, @Body() body: unknown) { return validated(() => this.config.saveModel(user, id, body)) }
  @Delete('models/:id') disable(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) { return this.config.removeModel(user, id) }
  @Post('models/:id/test') test(@CurrentUserInfo() user: CurrentUser, @Param('id') id: string) { return this.ai.testModel(user, id) }
  @Get('logs') logs(@CurrentUserInfo() user: CurrentUser, @Query('page') page?: string) { return this.config.logs(user, Number(page)) }
}
