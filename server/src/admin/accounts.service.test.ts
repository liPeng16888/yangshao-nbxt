import { describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
import { AdminAccountsService } from './accounts.service'

describe('AdminAccountsService frontend subaccount visibility', () => {
  it('returns only safe nested frontend subaccount details under each main frontend account', async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'front-1', account: 'main01', username: '主账号', displayRemark: null,
          role: UserRole.FRONTEND_USER, disabled: false, disabledReason: null,
          passwordCipher: null, accessGuardEnabled: false, accessGuardPassword: null,
          accessGuardTtlMinutes: 5, accessGuardRecoveryPrompt: null, accessGuardRecoveryAnswer: null,
          createdAt: new Date('2026-08-11T00:00:00.000Z'), frontendSheets: [], accessGuardGroups: [],
          frontendSubAccounts: [{
            id: 'sub-1', account: 'operator01', username: '操作员', disabled: false,
            requiresAccessGuardPassword: true, createdAt: new Date('2026-08-11T01:00:00.000Z'),
            lastLoginAt: null, passwordHash: 'must-not-leak', passwordCipher: 'must-not-leak',
            frontendSubAccountPermissions: [
              { permission: 'DATA_MAIN' },
              { permission: 'REPORTS' }
            ]
          }]
        }])
      }
    }
    const passwords = { decryptForDisplay: vi.fn().mockReturnValue('') }
    const service = new AdminAccountsService(prisma as never, passwords as never)

    const [account] = await service.listFrontendUsers()

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: UserRole.FRONTEND_USER, deletedAt: null },
      include: expect.objectContaining({
        frontendSubAccounts: expect.objectContaining({
          where: { role: UserRole.FRONTEND_SUB_USER, deletedAt: null }
        })
      })
    }))
    expect(account.frontendSubAccounts).toEqual([{
      id: 'sub-1', account: 'operator01', username: '操作员', disabled: false,
      requiresAccessGuardPassword: true,
      permissions: ['DATA_MAIN', 'REPORTS'],
      createdAt: new Date('2026-08-11T01:00:00.000Z'),
      lastLoginAt: null
    }])
    expect(account.frontendSubAccounts[0]).not.toHaveProperty('passwordHash')
    expect(account.frontendSubAccounts[0]).not.toHaveProperty('passwordCipher')
    expect(account.frontendSubAccounts[0]).not.toHaveProperty('password')
  })
})
