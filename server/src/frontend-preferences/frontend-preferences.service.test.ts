import { UserRole, type FrontendMenuPermission, type FrontendPreferenceSection } from '@prisma/client'
import { ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { FrontendPreferencesService } from './frontend-preferences.service'

const updatedAt = new Date('2026-08-13T01:02:03.000Z')

function mainUser(id = 'main-1'): CurrentUser {
  return {
    id,
    account: id,
    username: '主账号',
    role: UserRole.FRONTEND_USER,
    dataOwnerId: id,
    permissionVersion: 1,
    permissions: [],
    requiresAccessGuardPassword: true,
    isFrontendMainAccount: true,
    isFrontendSubAccount: false
  }
}

function currentSubUser(input: {
  id: string
  dataOwnerId: string
  permissions: FrontendMenuPermission[]
}): CurrentUser {
  return {
    ...mainUser(input.id),
    role: UserRole.FRONTEND_SUB_USER,
    dataOwnerId: input.dataOwnerId,
    permissions: input.permissions,
    isFrontendMainAccount: false,
    isFrontendSubAccount: true
  }
}

function record(overrides: Partial<{
  section: FrontendPreferenceSection
  value: unknown
  version: number
  updatedById: string
}> = {}) {
  const updatedById = overrides.updatedById ?? 'main-1'
  return {
    section: overrides.section ?? 'LAB_REPORT_SMS_TEMPLATE',
    value: overrides.value ?? { prefix: '旧', suffix: '' },
    version: overrides.version ?? 1,
    updatedAt,
    updatedBy: { id: updatedById, username: '修改人' }
  }
}

function createPrismaMock() {
  const frontendBusinessPreference = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn()
  }
  return {
    frontendBusinessPreference,
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ frontendBusinessPreference }))
  }
}

describe('FrontendPreferencesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>
  let realtime: { publish: ReturnType<typeof vi.fn> }
  let service: FrontendPreferencesService

  beforeEach(() => {
    prisma = createPrismaMock()
    realtime = { publish: vi.fn() }
    service = new FrontendPreferencesService(prisma as never, realtime as never)
  })

  it('always queries the parent owner and only the subaccount accessible sections', async () => {
    prisma.frontendBusinessPreference.findMany.mockResolvedValue([])

    await service.list(currentSubUser({ id: 'sub-1', dataOwnerId: 'main-1', permissions: ['DATA_MAIN'] }))

    expect(prisma.frontendBusinessPreference.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { frontendUserId: 'main-1', section: { in: ['LAB_REPORT_SAMPLE_UNITS', 'LAB_ELEMENT_GROUPS'] } }
    }))
  })

  it('creates version one for the parent owner, records the actual actor and publishes after commit', async () => {
    const saved = record({ section: 'LAB_REPORT_SAMPLE_UNITS', value: ['王庄'], updatedById: 'sub-1' })
    prisma.frontendBusinessPreference.create.mockResolvedValue(saved)
    const user = currentSubUser({
      id: 'sub-1',
      dataOwnerId: 'main-1',
      permissions: ['LAB_REPORT_IMAGE_TEMPLATE']
    })

    await expect(service.save(user, 'LAB_REPORT_SAMPLE_UNITS', {
      value: ['  王庄  ', '王庄'],
      baseVersion: 0,
      frontendUserId: 'attacker-owner',
      updatedById: 'attacker-actor'
    } as never)).resolves.toEqual(saved)

    expect(prisma.frontendBusinessPreference.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        frontendUserId: 'main-1',
        section: 'LAB_REPORT_SAMPLE_UNITS',
        value: ['王庄'],
        version: 1,
        updatedById: 'sub-1'
      }
    }))
    expect(realtime.publish).toHaveBeenCalledWith({
      dataOwnerId: 'main-1',
      module: 'frontend-preferences',
      entityId: 'LAB_REPORT_SAMPLE_UNITS',
      operation: 'create',
      changedById: 'sub-1',
      updatedAt: '2026-08-13T01:02:03.000Z'
    })
  })

  it('rejects an exact section the subaccount cannot access before touching storage', async () => {
    const user = currentSubUser({ id: 'sub-1', dataOwnerId: 'main-1', permissions: ['DATA_MAIN'] })

    await expect(service.save(user, 'LAB_REPORT_SMS_TEMPLATE', {
      value: { prefix: '新', suffix: '' }, baseVersion: 0
    })).rejects.toBeInstanceOf(ForbiddenException)

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(realtime.publish).not.toHaveBeenCalled()
  })

  it('returns 409 with the safe current row and never overwrites when baseVersion is stale', async () => {
    prisma.frontendBusinessPreference.updateMany.mockResolvedValue({ count: 0 })
    const current = record({ version: 4, updatedById: 'sub-2' })
    prisma.frontendBusinessPreference.findUnique.mockResolvedValue(current)

    let conflict: unknown
    try {
      await service.save(mainUser('main-1'), 'LAB_REPORT_SMS_TEMPLATE', {
        value: { prefix: '新', suffix: '' }, baseVersion: 3
      })
    } catch (error) {
      conflict = error
    }

    expect(conflict).toMatchObject({ status: 409 })
    expect((conflict as { getResponse(): unknown }).getResponse()).toEqual({
      code: 'PREFERENCE_VERSION_CONFLICT',
      current
    })
    expect(prisma.frontendBusinessPreference.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { frontendUserId: 'main-1', section: 'LAB_REPORT_SMS_TEMPLATE', version: 3 }
    }))
    expect(prisma.frontendBusinessPreference.update).not.toHaveBeenCalled()
    expect(realtime.publish).not.toHaveBeenCalled()
  })

  it('turns a concurrent first-create P2002 into the same safe 409 response', async () => {
    const current = record({ version: 1, updatedById: 'sub-2' })
    prisma.frontendBusinessPreference.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    prisma.frontendBusinessPreference.findUnique.mockResolvedValue(current)

    let conflict: unknown
    try {
      await service.save(mainUser('main-1'), 'LAB_REPORT_SMS_TEMPLATE', {
        value: { prefix: '新', suffix: '' }, baseVersion: 0
      })
    } catch (error) {
      conflict = error
    }

    expect((conflict as { getResponse(): unknown }).getResponse()).toEqual({
      code: 'PREFERENCE_VERSION_CONFLICT',
      current
    })
    expect(realtime.publish).not.toHaveBeenCalled()
  })

  it('increments the matching version, records the actor and publishes an update', async () => {
    const saved = record({ version: 4, updatedById: 'sub-1' })
    prisma.frontendBusinessPreference.updateMany.mockResolvedValue({ count: 1 })
    prisma.frontendBusinessPreference.findUnique.mockResolvedValue(saved)
    const user = currentSubUser({
      id: 'sub-1',
      dataOwnerId: 'main-1',
      permissions: ['LAB_REPORT_SMS_TEMPLATE']
    })

    await expect(service.save(user, 'LAB_REPORT_SMS_TEMPLATE', {
      value: { prefix: '  新  ', suffix: '' }, baseVersion: 3
    })).resolves.toEqual(saved)

    expect(prisma.frontendBusinessPreference.updateMany).toHaveBeenCalledWith({
      where: { frontendUserId: 'main-1', section: 'LAB_REPORT_SMS_TEMPLATE', version: 3 },
      data: { value: { prefix: '新', suffix: '' }, updatedById: 'sub-1', version: { increment: 1 } }
    })
    expect(realtime.publish).toHaveBeenCalledWith(expect.objectContaining({
      dataOwnerId: 'main-1',
      entityId: 'LAB_REPORT_SMS_TEMPLATE',
      operation: 'update',
      changedById: 'sub-1'
    }))
  })
})
