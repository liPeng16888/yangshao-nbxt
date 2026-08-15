import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { BlacklistController } from './blacklist.controller'

const user: CurrentUser = { id: 'viewer-1', account: 'front-1', username: '重名用户', role: UserRole.FRONTEND_USER }

describe('BlacklistController', () => {
  it('passes the authenticated stable id into search and check reads', async () => {
    const service = { search: vi.fn(), check: vi.fn() }
    const controller = new BlacklistController(service as never)

    await controller.search(user, 'phone')
    await controller.check(user, 'phone')

    expect(service.search).toHaveBeenCalledWith('viewer-1', 'phone')
    expect(service.check).toHaveBeenCalledWith('viewer-1', 'phone')
  })
})
