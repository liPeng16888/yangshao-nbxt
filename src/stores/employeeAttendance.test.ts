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
})
