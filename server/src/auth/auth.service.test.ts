import { ForbiddenException } from '@nestjs/common'
import { AccessGuardFeature, UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'
import type { CurrentUser } from './current-user'

const secret = 'access-guard-test-secret'
const frontendUser: CurrentUser = {
  id: 'front-1', account: 'front-1', username: '前台一', role: UserRole.FRONTEND_USER
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
