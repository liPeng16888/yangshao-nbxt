import { firstValueFrom, filter, take } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { TenantRealtimeService } from './tenant-realtime.service'

describe('TenantRealtimeService', () => {
  it('isolates tenant channels and publishes metadata without full record contents', async () => {
    const service = new TenantRealtimeService()
    const tenantAEvent = firstValueFrom(service.stream('tenant-a').pipe(
      filter((event) => (event.data as { type?: string }).type === 'change'),
      take(1)
    ))
    let tenantBReceived = false
    const tenantBSubscription = service.stream('tenant-b').pipe(
      filter((event) => (event.data as { type?: string }).type === 'change')
    ).subscribe(() => { tenantBReceived = true })

    service.publish({
      dataOwnerId: 'tenant-a', module: 'customers', entityId: 'customer-1',
      operation: 'update', changedById: 'sub-1', updatedAt: '2026-08-11T00:00:00.000Z'
    })

    const received = await tenantAEvent
    expect(received.data).toEqual({
      type: 'change', module: 'customers', entityId: 'customer-1',
      operation: 'update', changedById: 'sub-1', updatedAt: '2026-08-11T00:00:00.000Z'
    })
    expect(received.data).not.toHaveProperty('dataOwnerId')
    expect(received.data).not.toHaveProperty('record')
    expect(received.data).not.toHaveProperty('data')
    expect(tenantBReceived).toBe(false)
    tenantBSubscription.unsubscribe()
  })
})
