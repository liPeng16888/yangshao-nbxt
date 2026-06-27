import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { UserRole } from '@prisma/client'
import { ROLES_KEY } from './roles.decorator'
import type { CurrentUser } from './current-user'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()])
    if (!roles?.length) return true
    const request = context.switchToHttp().getRequest<{ user?: CurrentUser }>()
    if (request.user && roles.includes(request.user.role)) return true
    throw new ForbiddenException('没有访问权限')
  }
}
