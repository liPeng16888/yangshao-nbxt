import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from './current-user'
import { FrontendSubAccountsService } from './frontend-subaccounts.service'

const owner: CurrentUser = {
  id: 'front-1', account: 'owner', username: '主账号', role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
  isFrontendMainAccount: true, isFrontendSubAccount: false
}

const subUser: CurrentUser = {
  id: 'sub-1', account: 'sub', username: '子账号', role: UserRole.FRONTEND_SUB_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: ['DATA_MAIN'], requiresAccessGuardPassword: true,
  isFrontendMainAccount: false, isFrontendSubAccount: true
}

describe('FrontendSubAccountsService', () => {
  const tx = {
    user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    frontendSubAccountPermission: { deleteMany: vi.fn(), createMany: vi.fn() }
  }
  const prisma = {
    user: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  }
  const passwords = {
    hash: vi.fn().mockResolvedValue('new-hash'),
    verify: vi.fn().mockResolvedValue(true)
  }
  const service = new FrontendSubAccountsService(prisma as never, passwords as never)

  beforeEach(() => {
    vi.clearAllMocks()
    tx.frontendSubAccountPermission.deleteMany.mockResolvedValue({ count: 1 })
    tx.frontendSubAccountPermission.createMany.mockResolvedValue({ count: 1 })
  })

  it('allows only a frontend main account to manage subaccounts', async () => {
    await expect(service.list(subUser)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('lists only owned, non-deleted subaccounts with an explicit password-free projection', async () => {
    prisma.user.findMany.mockResolvedValue([])

    await service.list(owner)

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        role: UserRole.FRONTEND_SUB_USER,
        parentFrontendUserId: 'front-1',
        deletedAt: null
      },
      select: expect.not.objectContaining({ passwordHash: true, passwordCipher: true })
    }))
  })

  it('rejects a globally duplicated account before creating anything', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' })

    await expect(service.create(owner, {
      account: 'used', username: '子账号', password: '123456', confirmPassword: '123456',
      permissions: ['DATA_MAIN'], requiresAccessGuardPassword: true
    })).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates an owned subaccount and deduplicates permissions transactionally', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    tx.user.create.mockResolvedValue({
      id: 'sub-2', account: 'sub-2', username: '子账号', disabled: false, lastLoginAt: null,
      requiresAccessGuardPassword: false, permissionVersion: 1, createdAt: new Date(), updatedAt: new Date()
    })

    await service.create(owner, {
      account: 'sub-2', username: '子账号', password: '123456', confirmPassword: '123456',
      permissions: ['DATA_MAIN', 'DATA_MAIN'], requiresAccessGuardPassword: false
    })

    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: UserRole.FRONTEND_SUB_USER,
        parentFrontendUserId: 'front-1',
        requiresAccessGuardPassword: false,
        passwordHash: 'new-hash'
      })
    }))
    expect(tx.frontendSubAccountPermission.createMany).toHaveBeenCalledWith({
      data: [{ subAccountId: 'sub-2', permission: 'DATA_MAIN' }]
    })
  })

  it('updates only an owned target, replaces permissions and invalidates old sessions', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'sub-2' })
    tx.user.update.mockResolvedValue({
      id: 'sub-2', account: 'sub-2', username: '新名称', disabled: false, lastLoginAt: null,
      requiresAccessGuardPassword: true, permissionVersion: 2, createdAt: new Date(), updatedAt: new Date()
    })

    await service.update(owner, 'sub-2', {
      username: '新名称', permissions: ['REPORTS', 'DATA_MAIN', 'REPORTS'], requiresAccessGuardPassword: true
    })

    expect(tx.user.findFirst).toHaveBeenCalledWith({ where: {
      id: 'sub-2', role: UserRole.FRONTEND_SUB_USER, parentFrontendUserId: 'front-1', deletedAt: null
    } })
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-2' },
      data: expect.objectContaining({ permissionVersion: { increment: 1 } })
    }))
    expect(tx.frontendSubAccountPermission.createMany).toHaveBeenCalledWith({
      data: [
        { subAccountId: 'sub-2', permission: 'REPORTS' },
        { subAccountId: 'sub-2', permission: 'DATA_MAIN' }
      ]
    })
  })

  it('requires the main account password and invalidates sessions on password reset', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'front-1', passwordHash: 'owner-hash', deletedAt: null })
    passwords.verify.mockResolvedValueOnce(false)

    await expect(service.resetPassword(owner, 'sub-2', {
      currentPassword: 'wrong', newPassword: '654321', confirmPassword: '654321'
    })).rejects.toBeInstanceOf(UnauthorizedException)
    expect(prisma.$transaction).not.toHaveBeenCalled()

    passwords.verify.mockResolvedValueOnce(true)
    tx.user.findFirst.mockResolvedValue({ id: 'sub-2' })
    tx.user.update.mockResolvedValue({ id: 'sub-2' })

    await service.resetPassword(owner, 'sub-2', {
      currentPassword: 'correct', newPassword: '654321', confirmPassword: '654321'
    })

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'sub-2' },
      data: { passwordHash: 'new-hash', passwordCipher: null, permissionVersion: { increment: 1 } }
    })
  })

  it.each([
    ['status', (service: FrontendSubAccountsService) => service.setStatus(owner, 'sub-2', { disabled: true, disabledReason: '暂停使用' })],
    ['delete', (service: FrontendSubAccountsService) => service.softDelete(owner, 'sub-2')]
  ])('%s changes only an owned target and invalidates its sessions', async (_name, action) => {
    tx.user.findFirst.mockResolvedValue({ id: 'sub-2' })
    tx.user.update.mockResolvedValue({ id: 'sub-2' })

    await action(service)

    expect(tx.user.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({
      id: 'sub-2', parentFrontendUserId: 'front-1', role: UserRole.FRONTEND_SUB_USER
    }) })
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-2' }, data: expect.objectContaining({ permissionVersion: { increment: 1 } })
    }))
  })
})
