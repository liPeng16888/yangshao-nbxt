import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { CurrentUser } from './current-user'

export const CurrentUserInfo = createParamDecorator((_data: unknown, context: ExecutionContext): CurrentUser => {
  const request = context.switchToHttp().getRequest<{ user: CurrentUser }>()
  return request.user
})
