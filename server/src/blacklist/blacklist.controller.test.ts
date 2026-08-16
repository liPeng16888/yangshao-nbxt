import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { BlacklistController } from './blacklist.controller'

const user: CurrentUser = {
  id: 'viewer-1',
  account: 'front-1',
  username: '重名用户',
  role: UserRole.FRONTEND_USER,
  dataOwnerId: 'viewer-1',
  permissionVersion: 0,
  permissions: [],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: true,
  isFrontendSubAccount: false
}

describe('BlacklistController', () => {
  it('passes the authenticated data owner into search and check reads', async () => {
    const service = { search: vi.fn(), check: vi.fn() }
    const controller = new BlacklistController(service as never)

    await controller.search(user, 'phone')
    await controller.check(user, 'phone')

    expect(service.search).toHaveBeenCalledWith('viewer-1', 'phone')
    expect(service.check).toHaveBeenCalledWith('viewer-1', 'phone')
  })

  it('shares blacklist ownership with the main account for frontend subaccounts', async () => {
    const service = { search: vi.fn(), check: vi.fn() }
    const controller = new BlacklistController(service as never)
    const subUser: CurrentUser = {
      ...user,
      id: 'sub-1',
      role: UserRole.FRONTEND_SUB_USER,
      dataOwnerId: 'viewer-1',
      permissions: ['BLACKLIST'],
      isFrontendMainAccount: false,
      isFrontendSubAccount: true
    }

    await controller.search(subUser, 'phone')
    await controller.check(subUser, 'phone')

    expect(service.search).toHaveBeenCalledWith('viewer-1', 'phone')
    expect(service.check).toHaveBeenCalledWith('viewer-1', 'phone')
  })
})
