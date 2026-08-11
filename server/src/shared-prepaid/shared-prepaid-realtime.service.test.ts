import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { firstValueFrom, type Subscription } from 'rxjs'
import { describe, expect, it } from 'vitest'

import { SharedPrepaidRealtimeController } from './shared-prepaid-realtime.controller'
import {
  SharedPrepaidRealtimeService,
  type SharedPrepaidRealtimeChangeEvent
} from './shared-prepaid-realtime.service'

const secret = 'shared-prepaid-realtime-test-secret'

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

function makeController(users: StoredUser[]) {
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = users.find((candidate) => candidate.id === where.id)
        if (!user) return null
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
    }
  }
  const config = { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined }
  const realtime = new SharedPrepaidRealtimeService()
  return {
    realtime,
    controller: new SharedPrepaidRealtimeController(realtime, prisma as never, config as never)
  }
}

function token(userId: string, permissionVersion = 1) {
  return jwt.sign({ sub: userId, permissionVersion }, secret)
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

function subscribeForChange(controller: SharedPrepaidRealtimeController, signedToken: string) {
  let subscription!: Subscription
  let resolveConnected!: () => void
  let resolveChange!: (message: { data: unknown }) => void
  let rejectChange!: (error: unknown) => void
  const connected = new Promise<void>((resolve) => { resolveConnected = resolve })
  const change = new Promise<{ data: unknown }>((resolve, reject) => {
    resolveChange = resolve
    rejectChange = reject
  })
  subscription = controller.stream(signedToken).subscribe({
    next: (message) => {
      const type = (message.data as { type?: string }).type
      if (type === 'connected') resolveConnected()
      if (type === 'change') resolveChange(message)
    },
    error: rejectChange
  })
  return { connected, change, close: () => subscription.unsubscribe() }
}

describe('shared prepaid global realtime', () => {
  it('allows an authenticated frontend main account to connect', async () => {
    const { controller } = makeController([mainUser()])

    await expect(firstValueFrom(controller.stream(token('front-1')))).resolves.toMatchObject({
      data: { type: 'connected' }
    })
  })

  it('denies unauthenticated, admin-only, disabled, revoked, and unpermitted subaccounts', async () => {
    const users: StoredUser[] = [
      mainUser(),
      { ...mainUser('admin-1'), role: UserRole.ROOT_ADMIN },
      { ...mainUser('disabled-1'), disabled: true },
      subUser([])
    ]
    const { controller } = makeController(users)

    await expect(firstValueFrom(controller.stream())).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(firstValueFrom(controller.stream(token('admin-1')))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(firstValueFrom(controller.stream(token('disabled-1')))).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(firstValueFrom(controller.stream(token('front-1', 0)))).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(firstValueFrom(controller.stream(token('sub-1')))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('delivers each module only to subaccounts holding its specific leaf permission', async () => {
    const { controller, realtime } = makeController([
      mainUser(),
      subUser(['PREPAID_RECHARGE'])
    ])
    const stream = subscribeForChange(controller, token('sub-1'))

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

  it('publishes an allowlisted invalidation payload without business or personal details', async () => {
    const { controller, realtime } = makeController([mainUser()])
    const stream = subscribeForChange(controller, token('front-1'))

    await stream.connected
    realtime.publish({
      module: 'settlements', entityId: 'settlement-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z',
      phone: '13800138000', balance: 88, proofUrl: '/api/uploads/proof.png', remark: 'private'
    } as unknown as Omit<SharedPrepaidRealtimeChangeEvent, 'type'>)

    const message = await stream.change
    expect(message).toEqual({
      data: {
        type: 'change', module: 'settlements', entityId: 'settlement-1', operation: 'update',
        changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
      }
    })
    expect(JSON.stringify(message)).not.toMatch(/13800138000|balance|proof|private/i)
    stream.close()
  })

  it('revalidates a connected token before delivering a later change', async () => {
    const user = mainUser()
    const { controller, realtime } = makeController([user])
    let resolveConnected!: () => void
    const connected = new Promise<void>((resolve) => { resolveConnected = resolve })
    const errors = new Promise<unknown>((resolve) => {
      controller.stream(token('front-1')).subscribe({
        next: (message) => {
          if ((message.data as { type?: string }).type === 'connected') resolveConnected()
        },
        error: resolve
      })
    })

    await connected
    user.permissionVersion = 2
    realtime.publish({
      module: 'members', entityId: 'member-1', operation: 'update',
      changedById: 'front-2', updatedAt: '2026-08-12T08:00:00.000Z'
    })

    await expect(errors).resolves.toBeInstanceOf(UnauthorizedException)
  })
})
