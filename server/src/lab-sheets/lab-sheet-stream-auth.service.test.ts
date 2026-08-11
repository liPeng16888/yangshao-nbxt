import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { describe, expect, it, vi } from 'vitest'
import { LabSheetStreamAuthService } from './lab-sheet-stream-auth.service'

const secret = 'stream-auth-test-secret'

describe('LabSheetStreamAuthService', () => {
  it('resolves a subaccount stream to its main-account data owner', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sub-1', account: 'sub-1', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
          permissionVersion: 3, requiresAccessGuardPassword: true, disabled: false, deletedAt: null,
          parentFrontendUserId: 'front-1',
          parentFrontendUser: { id: 'front-1', role: UserRole.FRONTEND_USER, disabled: false, deletedAt: null },
          frontendSubAccountPermissions: [{ permission: 'DATA_MAIN' }]
        })
      }
    }
    const service = new LabSheetStreamAuthService(prisma as never, { get: vi.fn(() => secret) } as never)
    const token = jwt.sign({ sub: 'sub-1', permissionVersion: 3 }, secret)

    await expect(service.verifyFrontendToken(token)).resolves.toMatchObject({
      id: 'sub-1', dataOwnerId: 'front-1', permissions: ['DATA_MAIN']
    })
  })

  it('rejects a stream token after its permission version changes', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sub-1', account: 'sub-1', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
          permissionVersion: 4, requiresAccessGuardPassword: true, disabled: false, deletedAt: null,
          parentFrontendUserId: 'front-1',
          parentFrontendUser: { id: 'front-1', role: UserRole.FRONTEND_USER, disabled: false, deletedAt: null },
          frontendSubAccountPermissions: []
        })
      }
    }
    const service = new LabSheetStreamAuthService(prisma as never, { get: vi.fn(() => secret) } as never)
    const oldToken = jwt.sign({ sub: 'sub-1', permissionVersion: 3 }, secret)

    await expect(service.verifyFrontendToken(oldToken)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects a subaccount stream without data calculation permission', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sub-1', account: 'sub-1', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
          permissionVersion: 3, requiresAccessGuardPassword: true, disabled: false, deletedAt: null,
          parentFrontendUserId: 'front-1',
          parentFrontendUser: { id: 'front-1', role: UserRole.FRONTEND_USER, disabled: false, deletedAt: null },
          frontendSubAccountPermissions: [{ permission: 'REPORTS' }]
        })
      }
    }
    const service = new LabSheetStreamAuthService(prisma as never, { get: vi.fn(() => secret) } as never)
    const token = jwt.sign({ sub: 'sub-1', permissionVersion: 3 }, secret)

    await expect(service.verifyFrontendToken(token)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
