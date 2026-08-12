import { firstValueFrom, skip, take } from 'rxjs'
import { describe, expect, it } from 'vitest'
import { LabSheetRealtimeService } from './lab-sheet-realtime.service'

describe('LabSheetRealtimeService tenant channels', () => {
  it('delivers one owner/date update to both main-account and subaccount subscribers', async () => {
    const realtime = new LabSheetRealtimeService()
    const mainEvent = firstValueFrom(realtime.stream('front-1', '2026-08-11').pipe(skip(1), take(1)))
    const subEvent = firstValueFrom(realtime.stream('front-1', '2026-08-11').pipe(skip(1), take(1)))

    realtime.publish({
      type: 'block-saved', frontendUserId: 'front-1', date: '2026-08-11', sheetId: 'sheet-1',
      sourceClientId: 'sub-browser', changedById: 'sub-1', updatedAt: new Date().toISOString()
    })

    await expect(mainEvent).resolves.toMatchObject({ data: { changedById: 'sub-1', sheetId: 'sheet-1' } })
    await expect(subEvent).resolves.toMatchObject({ data: { changedById: 'sub-1', sheetId: 'sheet-1' } })
  })
})
