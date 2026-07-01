import { Injectable } from '@nestjs/common'
import { interval, map, merge, Observable, Subject } from 'rxjs'
import { defaultLabParameters } from '../common/lab'

export interface ServerSentEvent {
  data: unknown
}

export interface LabSheetRealtimeEvent {
  type: 'block-saved' | 'parameters-updated' | 'sheet-reloaded'
  frontendUserId: string
  date: string
  sheetId: string
  sourceClientId?: string
  updatedAt: string
  block?: unknown
  parameters?: typeof defaultLabParameters & { savedAt?: string }
  sheet?: unknown
}

@Injectable()
export class LabSheetRealtimeService {
  private readonly channels = new Map<string, Subject<ServerSentEvent>>()

  stream(frontendUserId: string, date: string): Observable<ServerSentEvent> {
    const channel = this.getChannel(frontendUserId, date)
    const heartbeat = interval(25000).pipe(
      map(() => ({
        data: { type: 'heartbeat', updatedAt: new Date().toISOString() }
      }))
    )
    return merge(channel.asObservable(), heartbeat)
  }

  publish(event: LabSheetRealtimeEvent) {
    const channel = this.channels.get(this.channelKey(event.frontendUserId, event.date))
    if (!channel) return
    channel.next({ data: event })
  }

  private getChannel(frontendUserId: string, date: string) {
    const key = this.channelKey(frontendUserId, date)
    let channel = this.channels.get(key)
    if (!channel) {
      channel = new Subject<ServerSentEvent>()
      this.channels.set(key, channel)
    }
    return channel
  }

  private channelKey(frontendUserId: string, date: string) {
    return `${frontendUserId}:${date}`
  }
}
