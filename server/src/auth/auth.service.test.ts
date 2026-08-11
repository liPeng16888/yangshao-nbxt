import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { AccessGuardFeature, UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'
import { resolveCurrentUserIdentity } from './current-user'
import type { CurrentUser } from './current-user'

const secret = 'access-guard-test-secret'
const frontendUser: CurrentUser = {
  id: 'front-1', account: 'front-1', username: '前台一', role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
  isFrontendMainAccount: true, isFrontendSubAccount: false
}

function signGrant(overrides: Record<string, unknown> = {}) {
  return jwt.sign({
    sub: 'front-1', type: 'access-guard', groupId: 'group-1', grantVersion: 3,
    features: [AccessGuardFeature.EMPLOYEE_ATTENDANCE], exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides
  }, secret)
}

describe('AuthService access-grant revocation', () => {
  const tx = {
    accessGuardGroupFeature: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    accessGuardGroup: { update: vi.fn() }
  }
  const prisma = {
    accessGuardGroup: { findFirst: vi.fn(), create: vi.fn() },
    accessGuardGroupFeature: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  }
  const service = new AuthService(
    prisma as never,
    { verify: vi.fn(), hash: vi.fn(), encryptForDisplay: vi.fn() } as never,
    { get: vi.fn(() => secret) } as never
  )

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.accessGuardGroupFeature.findFirst.mockResolvedValue(null)
  })

  it('accepts a signed grant only when its live enabled group, version and feature still match', async () => {
    prisma.accessGuardGroup.findFirst.mockResolvedValue({ id: 'group-1' })

    await expect(service.hasAccessGrant('front-1', signGrant(), AccessGuardFeature.EMPLOYEE_ATTENDANCE)).resolves.toBe(true)

    expect(prisma.accessGuardGroup.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-1', frontendUserId: 'front-1', enabled: true, grantVersion: 3,
        features: { some: { frontendUserId: 'front-1', feature: AccessGuardFeature.EMPLOYEE_ATTENDANCE } }
      },
      select: { id: true }
    })
  })

  it('rejects an otherwise valid old JWT after its group is changed, disabled or deleted', async () => {
    prisma.accessGuardGroup.findFirst.mockResolvedValue(null)

    await expect(service.hasAccessGrant('front-1', signGrant(), AccessGuardFeature.EMPLOYEE_ATTENDANCE)).resolves.toBe(false)
  })

  it('rejects grants missing a group version without querying the database', async () => {
    const token = signGrant({ grantVersion: undefined })

    await expect(service.hasAccessGrant('front-1', token, AccessGuardFeature.EMPLOYEE_ATTENDANCE)).resolves.toBe(false)
    expect(prisma.accessGuardGroup.findFirst).not.toHaveBeenCalled()
  })

  it('embeds the current group version and authoritative features when issuing a grant', async () => {
    prisma.accessGuardGroup.findFirst.mockResolvedValue({
      id: 'group-1', frontendUserId: 'front-1', name: '员工考勤', enabled: true, ttlMinutes: 5,
      password: '1234', recoveryPrompt: '提示', recoveryAnswer: '答案', grantVersion: 7,
      features: [{ feature: AccessGuardFeature.EMPLOYEE_ATTENDANCE }]
    })

    const result = await service.verifyAccessGuardGroup(frontendUser, 'group-1', '1234')
    const claims = jwt.verify(result.token, secret) as Record<string, unknown>

    expect(claims).toMatchObject({ groupId: 'group-1', grantVersion: 7, features: [AccessGuardFeature.EMPLOYEE_ATTENDANCE] })
    expect(result).toMatchObject({ groupId: 'group-1', grantVersion: 7, features: [AccessGuardFeature.EMPLOYEE_ATTENDANCE] })
  })

  it('increments the grant version in the same transaction as a group edit', async () => {
    prisma.accessGuardGroup.findFirst.mockResolvedValue({ id: 'group-1', frontendUserId: 'front-1' })
    tx.accessGuardGroup.update.mockResolvedValue({
      id: 'group-1', name: '员工考勤', enabled: true, ttlMinutes: 10, password: '5678',
      recoveryPrompt: '提示', recoveryAnswer: '答案', grantVersion: 4,
      features: [{ feature: AccessGuardFeature.EMPLOYEE_ATTENDANCE }]
    })

    await service.updateAccessGuardGroup(frontendUser, 'group-1', {
      name: '员工考勤', enabled: true, ttlMinutes: 10, password: '5678', recoveryPrompt: '提示', recoveryAnswer: '答案',
      features: [AccessGuardFeature.EMPLOYEE_ATTENDANCE]
    })

    expect(tx.accessGuardGroup.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ grantVersion: { increment: 1 } })
    }))
  })

  it('uses a secondary-authorization 403 rather than logging out a valid primary session on a wrong group password', async () => {
    prisma.accessGuardGroup.findFirst.mockResolvedValue({
      id: 'group-1', frontendUserId: 'front-1', enabled: true, password: '1234', ttlMinutes: 5,
      grantVersion: 1, features: [{ feature: AccessGuardFeature.EMPLOYEE_ATTENDANCE }]
    })

    await expect(service.verifyAccessGuardGroup(frontendUser, 'group-1', 'wrong')).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('frontend account identity resolution', () => {
  it('uses a frontend main account as its own data owner', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'front-1', account: 'front-1', username: '主账号', role: UserRole.FRONTEND_USER,
          permissionVersion: 4, requiresAccessGuardPassword: true, disabled: false, deletedAt: null,
          parentFrontendUserId: null, parentFrontendUser: null, frontendSubAccountPermissions: []
        })
      }
    }

    await expect(resolveCurrentUserIdentity(prisma as never, 'front-1', 4)).resolves.toMatchObject({
      id: 'front-1', dataOwnerId: 'front-1', permissionVersion: 4,
      permissions: [], isFrontendMainAccount: true, isFrontendSubAccount: false
    })
  })

  it('uses the active parent as a subaccount data owner and exposes only assigned permissions', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sub-1', account: 'sub-1', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
          permissionVersion: 7, requiresAccessGuardPassword: false, disabled: false, deletedAt: null,
          parentFrontendUserId: 'front-1',
          parentFrontendUser: { id: 'front-1', role: UserRole.FRONTEND_USER, disabled: false, deletedAt: null },
          frontendSubAccountPermissions: [{ permission: 'DATA_MAIN' }]
        })
      }
    }

    await expect(resolveCurrentUserIdentity(prisma as never, 'sub-1', 7)).resolves.toMatchObject({
      id: 'sub-1', dataOwnerId: 'front-1', role: UserRole.FRONTEND_SUB_USER,
      permissionVersion: 7, permissions: ['DATA_MAIN'], requiresAccessGuardPassword: false,
      isFrontendMainAccount: false, isFrontendSubAccount: true
    })
  })

  it.each([
    ['disabled parent', { disabled: true, deletedAt: null }, 7],
    ['deleted parent', { disabled: false, deletedAt: new Date() }, 7],
    ['stale token', { disabled: false, deletedAt: null }, 6]
  ])('rejects a subaccount with %s', async (_caseName, parentState, tokenVersion) => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sub-1', account: 'sub-1', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
          permissionVersion: 7, requiresAccessGuardPassword: true, disabled: false, deletedAt: null,
          parentFrontendUserId: 'front-1',
          parentFrontendUser: { id: 'front-1', role: UserRole.FRONTEND_USER, ...parentState },
          frontendSubAccountPermissions: []
        })
      }
    }

    await expect(resolveCurrentUserIdentity(prisma as never, 'sub-1', tokenVersion)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('logs in a subaccount, records its login and signs the live permission version', async () => {
    const user = {
      id: 'sub-1', account: 'sub-1', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
      passwordHash: 'hash', permissionVersion: 9, requiresAccessGuardPassword: false,
      disabled: false, disabledReason: null, deletedAt: null, parentFrontendUserId: 'front-1',
      parentFrontendUser: { id: 'front-1', role: UserRole.FRONTEND_USER, disabled: false, deletedAt: null },
      frontendSubAccountPermissions: [{ permission: 'DATA_MAIN' }]
    }
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn().mockResolvedValue(user) }
    }
    const service = new AuthService(
      prisma as never,
      { verify: vi.fn().mockResolvedValue(true) } as never,
      { get: vi.fn(() => secret) } as never
    )

    const result = await service.login(
      { account: 'sub-1', password: 'password' },
      [UserRole.FRONTEND_USER, UserRole.FRONTEND_SUB_USER]
    )

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { lastLoginAt: expect.any(Date) }
    })
    expect(jwt.verify(result.token, secret)).toMatchObject({ sub: 'sub-1', permissionVersion: 9 })
    expect(result.user).toMatchObject({
      id: 'sub-1', dataOwnerId: 'front-1', permissions: ['DATA_MAIN'], requiresAccessGuardPassword: false
    })
  })
})
