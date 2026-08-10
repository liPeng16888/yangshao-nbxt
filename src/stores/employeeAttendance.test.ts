import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEmployeeAttendanceStore } from './employeeAttendance'

describe('employee attendance store operation state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps loading active until every concurrent load has completed', async () => {
    const store = useEmployeeAttendanceStore()
    let finishFirst!: () => void
    let finishSecond!: () => void
    const first = store.run(() => new Promise<void>(resolve => { finishFirst = resolve }))
    const second = store.run(() => new Promise<void>(resolve => { finishSecond = resolve }))
    expect(store.loading).toBe(true)
    finishFirst(); await first
    expect(store.loading).toBe(true)
    finishSecond(); await second
    expect(store.loading).toBe(false)
  })

  it('makes month and date-range filters mutually exclusive and restores month mode before generation', () => {
    const store = useEmployeeAttendanceStore()
    store.selectDateRange('2026-07-01', '2026-07-31')
    expect(store.month).toBe('')
    expect(store.dateQuery()).toEqual({ employeeId: undefined, month: undefined, startDate: '2026-07-01', endDate: '2026-07-31' })

    store.selectMonth('2026-08')
    expect(store.startDate).toBe('')
    expect(store.endDate).toBe('')
    expect(store.dateQuery()).toEqual({ employeeId: undefined, month: '2026-08', startDate: undefined, endDate: undefined })
  })
})
