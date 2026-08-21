import { Injectable } from '@nestjs/common'
import { interval, map, merge, Observable, of, Subject } from 'rxjs'
import { defaultLabParameters } from '../common/lab'

export interface ServerSentEvent {
  data: unknown
}

export interface LabSheetRealtimeEvent {
  type: 'connected' | 'block-saved' | 'parameters-updated' | 'sheet-reloaded' | 'retests-changed'
  frontendUserId: string
  date: string
  sheetId?: string
  sourceClientId?: string
  changedById?: string
  sampleBlockId?: string
  sampleRetestId?: string
  updatedAt: string
  parameters?: typeof defaultLabParameters & { savedAt?: string }
}

@Injectable()
export class LabSheetRealtimeService {
  private readonly channels = new Map<string, Subject<ServerSentEvent>>()

  stream(frontendUserId: string, date: string): Observable<ServerSentEvent> {
    const channel = this.getChannel(frontendUserId, date)
    const connected = of({
      data: { type: 'connected', frontendUserId, date, updatedAt: new Date().toISOString() }
    })
    const heartbeat = interval(25000).pipe(
      map(() => ({
        data: { type: 'heartbeat', updatedAt: new Date().toISOString() }
      }))
    )
    return merge(connected, channel.asObservable(), heartbeat)
  }

  publish(event: LabSheetRealtimeEvent) {
    const channel = this.channels.get(this.channelKey(event.frontendUserId, event.date))
    if (!channel) return
    channel.next({ data: event.type === 'retests-changed' ? {
      type: 'retests-changed',
      frontendUserId: event.frontendUserId,
      date: event.date,
      sheetId: event.sheetId,
      sampleBlockId: event.sampleBlockId,
      sampleRetestId: event.sampleRetestId,
      sourceClientId: event.sourceClientId,
      changedById: event.changedById,
      updatedAt: event.updatedAt
    } : event })
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
