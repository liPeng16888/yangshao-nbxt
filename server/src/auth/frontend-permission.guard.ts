import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole, type FrontendMenuPermission } from '@prisma/client'
import type { CurrentUser } from './current-user'
import { FRONTEND_PERMISSIONS_KEY } from './frontend-permission.decorator'

@Injectable()
export class FrontendPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>()
    const user = request.user
    if (!user || user.role !== UserRole.FRONTEND_SUB_USER) return true

    const required = this.reflector.getAllAndOverride<FrontendMenuPermission[]>(FRONTEND_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (required?.some((permission) => user.permissions.includes(permission))) return true
    throw new ForbiddenException('子账号没有该菜单的访问权限')
  }
}
