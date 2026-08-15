import { BadRequestException, Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import type { CalculationDraftKind } from './calculation-draft.types'
import { CalculationDraftService } from './calculation-draft.service'

@Controller('calculation-drafts')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.FRONTEND_USER)
export class CalculationDraftController {
  constructor(private readonly drafts: CalculationDraftService) {}

  @Get(':kind')
  async get(@CurrentUserInfo() user: CurrentUser, @Param('kind') publicKind: string) {
    return this.drafts.get(user.id, parsePublicKind(publicKind))
  }

  @Put(':kind')
  async put(
    @CurrentUserInfo() user: CurrentUser,
    @Param('kind') publicKind: string,
    @Body() body: unknown
  ) {
    const parsed = parseSaveBody(body)
    return this.drafts.save(
      user.id,
      parsePublicKind(publicKind),
      parsed.baseRevision as number,
      parsed.payload
    )
  }
}

function parsePublicKind(value: string): CalculationDraftKind {
  if (value === 'standard-sample') return 'STANDARD_SAMPLE'
  if (value === 'coefficient') return 'COEFFICIENT'
  throw new BadRequestException('计算草稿类型无效')
}

function parseSaveBody(value: unknown) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('草稿请求格式无效')
  }
  const prototype = Object.getPrototypeOf(value)
  const source = value as Record<string, unknown>
  const keys = Reflect.ownKeys(source)
  if (
    prototype !== Object.prototype && prototype !== null ||
    keys.length !== 2 ||
    keys.some((key) => key !== 'baseRevision' && key !== 'payload') ||
    !Object.hasOwn(source, 'baseRevision') ||
    !Object.hasOwn(source, 'payload')
  ) {
    throw new BadRequestException('草稿请求字段无效')
  }
  return source
}
