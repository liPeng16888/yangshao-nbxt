import { randomBytes } from 'node:crypto'
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { FrontendMenuPermission } from '@prisma/client'
import { UserRole } from '@prisma/client'
import { Observable, Subject } from 'rxjs'

import { resolveCurrentUserIdentity, type CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'

export type SharedPrepaidRealtimeModule = 'recharges' | 'members' | 'consumptions' | 'settlements'
export type SharedPrepaidRealtimeOperation = 'create' | 'update' | 'delete'

export interface SharedPrepaidRealtimeChangeEvent {
  type: 'change'
  module: SharedPrepaidRealtimeModule
  entityId: string
  operation: SharedPrepaidRealtimeOperation
  changedById: string
  updatedAt: string
}

export interface SharedPrepaidRealtimePublishEvent extends Omit<SharedPrepaidRealtimeChangeEvent, 'type'> {}

export interface SharedPrepaidServerSentEvent {
  data: unknown
}

interface StreamTicket {
  userId: string
  permissionVersion: number
  expiresAt: number
}

const STREAM_TICKET_TTL_MS = 30_000
const HEARTBEAT_INTERVAL_MS = 25_000

const permissionByModule: Record<SharedPrepaidRealtimeModule, FrontendMenuPermission> = {
  recharges: 'PREPAID_RECHARGE',
  members: 'PREPAID_CUSTOMERS',
  consumptions: 'PREPAID_CONSUMPTIONS',
  settlements: 'PREPAID_SETTLEMENTS'
}

const prepaidPermissions = Object.values(permissionByModule)

@Injectable()
export class SharedPrepaidRealtimeService {
  // This global in-process channel is valid only while the server has one instance. PostgreSQL
  // LISTEN/NOTIFY or Redis pub/sub is required before multi-instance deployment.
  private readonly changes = new Subject<SharedPrepaidRealtimeChangeEvent>()
  private readonly tickets = new Map<string, StreamTicket>()

  constructor(private readonly prisma: PrismaService) {}

  issueTicket(user: CurrentUser) {
    this.assertCanConnect(user)
    this.pruneExpiredTickets()
    const ticket = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + STREAM_TICKET_TTL_MS
    this.tickets.set(ticket, {
      userId: user.id,
      permissionVersion: user.permissionVersion,
      expiresAt
    })
    return { ticket, expiresAt }
  }

  async consumeTicket(ticket?: string) {
    if (!ticket) throw new UnauthorizedException('缺少实时连接凭证')
    const stored = this.tickets.get(ticket)
    // Delete before awaiting any database work so concurrent consumers cannot reuse it.
    this.tickets.delete(ticket)
    this.pruneExpiredTickets()
    if (!stored || stored.expiresAt <= Date.now()) {
      throw new UnauthorizedException('实时连接凭证已失效')
    }
    const user = await resolveCurrentUserIdentity(
      this.prisma,
      stored.userId,
      stored.permissionVersion
    )
    this.assertCanConnect(user)
    return user
  }

  stream(initialUser: CurrentUser): Observable<SharedPrepaidServerSentEvent> {
    this.assertCanConnect(initialUser)
    const userId = initialUser.id
    const permissionVersion = initialUser.permissionVersion

    return new Observable<SharedPrepaidServerSentEvent>((subscriber) => {
      let closed = false
      let draining = false
      // There are four modules, so each subscriber holds at most four latest invalidations.
      const pending = new Map<SharedPrepaidRealtimeModule, SharedPrepaidRealtimeChangeEvent>()

      const revalidate = async () => {
        const user = await resolveCurrentUserIdentity(this.prisma, userId, permissionVersion)
        this.assertCanConnect(user)
        return user
      }

      const fail = (error: unknown) => {
        if (closed) return
        closed = true
        subscriber.error(error)
      }

      const drain = async () => {
        if (closed || draining) return
        draining = true
        try {
          while (!closed && pending.size > 0) {
            const module = pending.keys().next().value as SharedPrepaidRealtimeModule | undefined
            if (!module) break
            // Authorization is performed immediately before reading and emitting the latest value.
            const currentUser = await revalidate()
            const latest = pending.get(module)
            pending.delete(module)
            if (latest && this.canReceive(currentUser, latest.module)) {
              subscriber.next({ data: latest })
            }
          }
        } catch (error) {
          fail(error)
        } finally {
          draining = false
          if (!closed && pending.size > 0) void drain()
        }
      }

      subscriber.next({ data: { type: 'connected', updatedAt: new Date().toISOString() } })
      const changesSubscription = this.changes.subscribe((event) => {
        if (closed) return
        pending.set(event.module, event)
        void drain()
      })
      const heartbeat = setInterval(() => {
        void revalidate()
          .then(() => {
            if (!closed) {
              subscriber.next({ data: { type: 'heartbeat', updatedAt: new Date().toISOString() } })
            }
          })
          .catch(fail)
      }, HEARTBEAT_INTERVAL_MS)

      return () => {
        closed = true
        pending.clear()
        clearInterval(heartbeat)
        changesSubscription.unsubscribe()
      }
    })
  }

  publish(event: SharedPrepaidRealtimePublishEvent) {
    const { module, entityId, operation, changedById, updatedAt } = event
    this.changes.next({
      type: 'change',
      module,
      entityId,
      operation,
      changedById,
      updatedAt
    })
  }

  assertCanConnect(user: CurrentUser) {
    if (user.role === UserRole.FRONTEND_USER && user.isFrontendMainAccount) return
    if (
      user.role === UserRole.FRONTEND_SUB_USER &&
      user.isFrontendSubAccount &&
      prepaidPermissions.some((permission) => user.permissions.includes(permission))
    ) return
    throw new ForbiddenException('无权访问共享预存款实时更新')
  }

  private canReceive(user: CurrentUser, module: SharedPrepaidRealtimeModule) {
    return user.isFrontendMainAccount || user.permissions.includes(permissionByModule[module])
  }

  private pruneExpiredTickets() {
    const now = Date.now()
    for (const [ticket, stored] of this.tickets) {
      if (stored.expiresAt <= now) this.tickets.delete(ticket)
    }
  }
}
