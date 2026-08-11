import { ForbiddenException, Injectable } from '@nestjs/common'
import type { FrontendMenuPermission } from '@prisma/client'
import { UserRole } from '@prisma/client'
import {
  concatMap,
  filter,
  interval,
  map,
  merge,
  Observable,
  of,
  Subject
} from 'rxjs'

import type { CurrentUser } from '../auth/current-user'

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

  stream(
    initialUser: CurrentUser,
    revalidate: () => Promise<CurrentUser>
  ): Observable<SharedPrepaidServerSentEvent> {
    this.assertCanConnect(initialUser)
    const connected = of({ data: { type: 'connected', updatedAt: new Date().toISOString() } })
    const changes = this.changes.pipe(
      concatMap(async (event) => {
        const currentUser = await revalidate()
        this.assertCanConnect(currentUser)
        return this.canReceive(currentUser, event.module) ? { data: event } : null
      }),
      filter((message): message is { data: SharedPrepaidRealtimeChangeEvent } => message !== null)
    )
    const heartbeat = interval(25000).pipe(
      concatMap(async () => {
        const currentUser = await revalidate()
        this.assertCanConnect(currentUser)
        return currentUser
      }),
      map(() => ({ data: { type: 'heartbeat', updatedAt: new Date().toISOString() } }))
    )
    return merge(connected, changes, heartbeat)
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
}
