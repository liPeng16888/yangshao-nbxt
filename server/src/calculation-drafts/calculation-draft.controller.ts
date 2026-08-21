import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Put, UseGuards } from '@nestjs/common'
import { UserRole, type FrontendMenuPermission } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { CurrentUser } from '../auth/current-user'
import { CurrentUserInfo } from '../auth/current-user.decorator'
import { FrontendPermission } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { Roles } from '../auth/roles.decorator'
import { RolesGuard } from '../auth/roles.guard'
import type { CalculationDraftKind } from './calculation-draft.types'
import { CalculationDraftService } from './calculation-draft.service'

@Controller('calculation-drafts')
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER)
@FrontendPermission('DATA_STANDARD_SAMPLE', 'DATA_COEFFICIENT')
export class CalculationDraftController {
  constructor(private readonly drafts: CalculationDraftService) {}

  @Get(':kind')
  async get(@CurrentUserInfo() user: CurrentUser, @Param('kind') publicKind: string) {
    const kind = parsePublicKind(publicKind)
    assertDraftPermission(user, kind)
    return this.drafts.get(user.dataOwnerId, kind)
  }

  @Put(':kind')
  async put(
    @CurrentUserInfo() user: CurrentUser,
    @Param('kind') publicKind: string,
    @Body() body: unknown
  ) {
    const kind = parsePublicKind(publicKind)
    assertDraftPermission(user, kind)
    const parsed = parseSaveBody(body)
    return this.drafts.save(
      user.dataOwnerId,
      kind,
      parsed.baseRevision as number,
      parsed.payload
    )
  }
}

function assertDraftPermission(user: CurrentUser, kind: CalculationDraftKind) {
  if (!user.isFrontendSubAccount) return
  const required: FrontendMenuPermission = kind === 'STANDARD_SAMPLE'
    ? 'DATA_STANDARD_SAMPLE'
    : 'DATA_COEFFICIENT'
  if (!user.permissions.includes(required)) {
    throw new ForbiddenException('子账号没有该菜单的访问权限')
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
    !Object.prototype.hasOwnProperty.call(source, 'baseRevision') ||
    !Object.prototype.hasOwnProperty.call(source, 'payload')
  ) {
    throw new BadRequestException('草稿请求字段无效')
  }
  return source
}
