import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { UserRole } from '@prisma/client'
import { firstValueFrom, type Subscription } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CurrentUser } from '../auth/current-user'
import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { ROLES_KEY } from '../auth/roles.decorator'
import { SharedPrepaidRealtimeController } from './shared-prepaid-realtime.controller'
import {
  SharedPrepaidRealtimeService,
  type SharedPrepaidRealtimeChangeEvent
} from './shared-prepaid-realtime.service'

interface StoredUser {
  id: string
  account: string
  username: string
  role: UserRole
  permissionVersion: number
  disabled?: boolean
  disabledReason?: string | null
  deletedAt?: Date | null
  parentFrontendUserId?: string | null
  parentFrontendUser?: {
    id: string
    role: UserRole
    disabled: boolean
    deletedAt: Date | null
  } | null
  permissions?: string[]
}

function persistedUser(user: StoredUser) {
  return {
    requiresAccessGuardPassword: true,
    disabled: false,
    disabledReason: null,
    deletedAt: null,
    parentFrontendUserId: null,
    parentFrontendUser: null,
    ...user,
    frontendSubAccountPermissions: (user.permissions ?? []).map((permission) => ({ permission }))
  }
}

function makeController(users: StoredUser[]) {
  const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    const user = users.find((candidate) => candidate.id === where.id)
    return user ? persistedUser(user) : null
  })
  const prisma = { user: { findUnique } }
  const realtime = new SharedPrepaidRealtimeService(prisma as never)
  return {
    findUnique,
    realtime,
    controller: new SharedPrepaidRealtimeController(realtime)
  }
}

function mainUser(id = 'front-1'): StoredUser {
  return {
    id,
    account: id,
    username: id,
    role: UserRole.FRONTEND_USER,
    permissionVersion: 1
  }
}

function subUser(permissions: string[]): StoredUser {
  return {
    id: 'sub-1',
    account: 'sub-1',
    username: 'sub-1',
    role: UserRole.FRONTEND_SUB_USER,
    permissionVersion: 1,
    parentFrontendUserId: 'front-1',
    parentFrontendUser: {
      id: 'front-1',
      role: UserRole.FRONTEND_USER,
      disabled: false,
      deletedAt: null
    },
    permissions
  }
}

function identity(user: StoredUser): CurrentUser {
  const isFrontendSubAccount = user.role === UserRole.FRONTEND_SUB_USER
  return {
    id: user.id,
    account: user.account,
    username: user.username,
    role: user.role,
    dataOwnerId: isFrontendSubAccount ? user.parentFrontendUserId! : user.id,
    permissionVersion: user.permissionVersion,
    permissions: (user.permissions ?? []) as CurrentUser['permissions'],
    requiresAccessGuardPassword: true,
    isFrontendMainAccount: user.role === UserRole.FRONTEND_USER,
    isFrontendSubAccount
  }
}

function issue(controller: SharedPrepaidRealtimeController, user: StoredUser) {
  return controller.issueStreamTicket(identity(user)).ticket
}

function subscribeForChange(controller: SharedPrepaidRealtimeController, ticket: string) {
  let subscription!: Subscription
  let resolveConnected!: () => void
  let resolveChange!: (message: { data: unknown }) => void
  let rejectChange!: (error: unknown) => void
  const connected = new Promise<void>((resolve) => { resolveConnected = resolve })
  const change = new Promise<{ data: unknown }>((resolve, reject) => {
    resolveChange = resolve
    rejectChange = reject
  })
  subscription = controller.stream(ticket).subscribe({
    next: (message) => {
      const type = (message.data as { type?: string }).type
      if (type === 'connected') resolveConnected()
      if (type === 'change') resolveChange(message)
    },
    error: rejectChange
  })
  return { connected, change, close: () => subscription.unsubscribe() }
}

afterEach(() => vi.useRealTimers())

describe('shared prepaid global realtime', () => {
  it('guards ticket issuance with frontend role and any prepaid leaf permission', () => {
    const handler = SharedPrepaidRealtimeController.prototype.issueStreamTicket
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as Array<{ name: string }>

    expect(guards.map((guard) => guard.name)).toEqual([
      'AuthGuard', 'RolesGuard', 'FrontendPermissionGuard'
    ])
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.FRONTEND_USER])
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, handler)).toEqual([
      'PREPAID_RECHARGE',
      'PREPAID_CUSTOMERS',
      'PREPAID_CONSUMPTIONS',
      'PREPAID_SETTLEMENTS'
    ])
  })

  it('uses a short opaque ticket and allows it exactly once', async () => {
    const user = mainUser()
    const { controller } = makeController([user])
    const result = controller.issueStreamTicket(identity(user))

    expect(result.ticket).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(result.ticket).not.toContain(user.id)
    expect(result.expiresAt - Date.now()).toBeLessThanOrEqual(30_000)
    await expect(firstValueFrom(controller.stream(result.ticket))).resolves.toMatchObject({
      data: { type: 'connected' }
    })
    await expect(firstValueFrom(controller.stream(result.ticket))).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects missing and expired tickets', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T08:00:00.000Z'))
    const user = mainUser()
    const { controller } = makeController([user])
    const ticket = issue(controller, user)

    await expect(firstValueFrom(controller.stream())).rejects.toBeInstanceOf(UnauthorizedException)
    vi.advanceTimersByTime(30_001)
    await expect(firstValueFrom(controller.stream(ticket))).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it.each([
    ['permission version revocation', (user: StoredUser) => { user.permissionVersion += 1 }, UnauthorizedException],
    ['disabled account', (user: StoredUser) => { user.disabled = true }, UnauthorizedException],
    ['missing prepaid leaf', (user: StoredUser) => { user.permissions = [] }, ForbiddenException]
  ] as const)('rejects a ticket after %s', async (_label, revoke, errorType) => {
    const user = subUser(['PREPAID_RECHARGE'])
    const { controller } = makeController([user])
    const ticket = issue(controller, user)
    revoke(user)

    await expect(firstValueFrom(controller.stream(ticket))).rejects.toBeInstanceOf(errorType)
  })

  it('denies admin-only identities and subaccounts without a prepaid leaf at ticket issue', () => {
    const admin = { ...mainUser('admin-1'), role: UserRole.ROOT_ADMIN }
    const sub = subUser([])
    const { controller } = makeController([admin, sub])

    expect(() => controller.issueStreamTicket(identity(admin))).toThrow(ForbiddenException)
    expect(() => controller.issueStreamTicket(identity(sub))).toThrow(ForbiddenException)
  })

  it('delivers each module only to subaccounts holding its specific leaf permission', async () => {
    const user = subUser(['PREPAID_RECHARGE'])
    const { controller, realtime } = makeController([mainUser(), user])
    const stream = subscribeForChange(controller, issue(controller, user))

    await stream.connected
    realtime.publish({
      module: 'members', entityId: 'member-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })
    realtime.publish({
      module: 'recharges', entityId: 'recharge-1', operation: 'create',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:01.000Z'
    })

    await expect(stream.change).resolves.toEqual({
      data: {
        type: 'change', module: 'recharges', entityId: 'recharge-1', operation: 'create',
        changedById: 'front-2', updatedAt: '2026-08-12T08:00:01.000Z'
      }
    })
    stream.close()
  })

  it('bounds bursts per module, delivers the latest event, and strips sensitive fields', async () => {
    const user = mainUser()
    const { controller, realtime, findUnique } = makeController([user])
    const stream = subscribeForChange(controller, issue(controller, user))
    await stream.connected

    let release!: () => void
    findUnique.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve(persistedUser(user))
    }))
    realtime.publish({
      module: 'members', entityId: 'member-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })
    realtime.publish({
      module: 'members', entityId: 'member-2', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:01.000Z'
    })
    realtime.publish({
      module: 'members', entityId: 'member-latest', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:02.000Z',
      phone: '13800138000', balance: 88, proofUrl: '/api/uploads/proof.png', remark: 'private'
    } as unknown as Omit<SharedPrepaidRealtimeChangeEvent, 'type'>)
    release()

    const message = await stream.change
    expect(message).toEqual({
      data: {
        type: 'change', module: 'members', entityId: 'member-latest', operation: 'update',
        changedById: 'front-2', updatedAt: '2026-08-12T08:00:02.000Z'
      }
    })
    expect(JSON.stringify(message)).not.toMatch(/13800138000|balance|proof|private/i)
    expect(findUnique).toHaveBeenCalledTimes(2)
    stream.close()
  })

  it.each([
    ['permission version revocation', (user: StoredUser) => { user.permissionVersion += 1 }, UnauthorizedException],
    ['account disablement', (user: StoredUser) => { user.disabled = true }, UnauthorizedException],
    ['last prepaid leaf removal', (user: StoredUser) => { user.permissions = [] }, ForbiddenException]
  ] as const)('reauthorizes before delivery and terminates after %s', async (_label, revoke, errorType) => {
    const user = subUser(['PREPAID_RECHARGE'])
    const { controller, realtime } = makeController([user])
    const ticket = issue(controller, user)
    let resolveConnected!: () => void
    const connected = new Promise<void>((resolve) => { resolveConnected = resolve })
    const errors = new Promise<unknown>((resolve) => {
      controller.stream(ticket).subscribe({
        next: (message) => {
          if ((message.data as { type?: string }).type === 'connected') resolveConnected()
        },
        error: resolve
      })
    })

    await connected
    revoke(user)
    realtime.publish({
      module: 'recharges', entityId: 'recharge-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })

    await expect(errors).resolves.toBeInstanceOf(errorType)
  })
})
