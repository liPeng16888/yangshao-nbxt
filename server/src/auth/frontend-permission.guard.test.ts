import { ForbiddenException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from './current-user'
import { FrontendPermissionGuard } from './frontend-permission.guard'

function context(user: CurrentUser) {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  }
}

const main: CurrentUser = {
  id: 'front-1', account: 'main', username: '主账号', role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
  isFrontendMainAccount: true, isFrontendSubAccount: false
}
const sub: CurrentUser = {
  id: 'sub-1', account: 'sub', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: ['DATA_MAIN'], requiresAccessGuardPassword: true,
  isFrontendMainAccount: false, isFrontendSubAccount: true
}

describe('FrontendPermissionGuard', () => {
  it('does not restrict a frontend main account', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) }
    const guard = new FrontendPermissionGuard(reflector as never)

    expect(guard.canActivate(context(main) as never)).toBe(true)
  })

  it('allows a subaccount when at least one declared leaf permission is assigned', () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['DATA_MAIN', 'DATA_STANDARD_SAMPLE']) }
    const guard = new FrontendPermissionGuard(reflector as never)

    expect(guard.canActivate(context(sub) as never)).toBe(true)
  })

  it('denies a subaccount when the leaf is missing or a customer route forgot to declare one', () => {
    const reflector = { getAllAndOverride: vi.fn() }
    const guard = new FrontendPermissionGuard(reflector as never)

    reflector.getAllAndOverride.mockReturnValueOnce(['REPORTS'])
    expect(() => guard.canActivate(context(sub) as never)).toThrow(ForbiddenException)

    reflector.getAllAndOverride.mockReturnValueOnce(undefined)
    expect(() => guard.canActivate(context(sub) as never)).toThrow(ForbiddenException)
  })
})
