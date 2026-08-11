import { Injectable } from '@nestjs/common'
import { interval, map, merge, Observable, of, Subject } from 'rxjs'

export type TenantRealtimeOperation = 'create' | 'update' | 'delete'

export interface TenantRealtimePublishEvent {
  dataOwnerId: string
  module: string
  entityId: string
  operation: TenantRealtimeOperation
  changedById: string
  updatedAt: string
}

export interface TenantRealtimeChangeEvent extends Omit<TenantRealtimePublishEvent, 'dataOwnerId'> {
  type: 'change'
}

export interface ServerSentEvent {
  data: unknown
}

@Injectable()
export class TenantRealtimeService {
  // This in-process channel is correct for the current single server instance. Before horizontal
  // scaling, replace it with PostgreSQL LISTEN/NOTIFY or Redis pub/sub so events cross instances.
  private readonly channels = new Map<string, Subject<ServerSentEvent>>()

  stream(dataOwnerId: string): Observable<ServerSentEvent> {
    const channel = this.getChannel(dataOwnerId)
    const connected = of({ data: { type: 'connected', updatedAt: new Date().toISOString() } })
    const heartbeat = interval(25000).pipe(
      map(() => ({ data: { type: 'heartbeat', updatedAt: new Date().toISOString() } }))
    )
    return merge(connected, channel.asObservable(), heartbeat)
  }

  publish({ dataOwnerId, ...metadata }: TenantRealtimePublishEvent) {
    this.channels.get(dataOwnerId)?.next({ data: { type: 'change', ...metadata } satisfies TenantRealtimeChangeEvent })
  }

  private getChannel(dataOwnerId: string) {
    let channel = this.channels.get(dataOwnerId)
    if (!channel) {
      channel = new Subject<ServerSentEvent>()
      this.channels.set(dataOwnerId, channel)
    }
    return channel
  }
}
