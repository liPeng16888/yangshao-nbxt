import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetEmployeeAttendanceMock } from '@/mocks/employeeAttendance'
import { syncPendingLeaveIssue, useEmployeeAttendanceStore } from './employeeAttendance'

describe('employee attendance store operation state', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
      key: (index: number) => Array.from(values.keys())[index] ?? null, get length() { return values.size }
    } satisfies Storage })
    setActivePinia(createPinia())
    resetEmployeeAttendanceMock()
  })

  it('loads leaves for multiple employees while an empty selection loads all', async () => {
    const store = useEmployeeAttendanceStore()
    store.leaveEmployeeIds = ['emp-1', 'emp-2']
    await store.loadLeaves()
    expect(store.leaves.every(row => ['emp-1', 'emp-2'].includes(row.employeeId))).toBe(true)
    store.leaveEmployeeIds = []
    await store.loadLeaves()
    expect(new Set(store.leaves.map(row => row.employeeId)).size).toBeGreaterThan(1)
  })

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

  it('keeps the selected month while date range mode is active and restores month mode explicitly', () => {
    const store = useEmployeeAttendanceStore()
    store.selectMonth('2026-08')
    store.selectDateRange('2026-07-01', '2026-07-31')
    expect(store.month).toBe('2026-08')
    expect(store.dateQuery()).toEqual({ employeeId: undefined, month: undefined, startDate: '2026-07-01', endDate: '2026-07-31' })

    store.restoreMonthMode()
    expect(store.startDate).toBe('')
    expect(store.endDate).toBe('')
    expect(store.dateQuery()).toEqual({ employeeId: undefined, month: '2026-08', startDate: undefined, endDate: undefined })
  })

  it('replaces stale pending-leave warnings with the current overview count', () => {
    const run = { issues: ['张三：缺少考勤', '1 条请假待审批'], issueCount: 2 }
    syncPendingLeaveIssue(run, 2)
    expect(run.issues).toEqual(['张三：缺少考勤', '2 条请假待审批'])
    expect(run.issueCount).toBe(2)

    syncPendingLeaveIssue(run, 0)
    expect(run.issues).toEqual(['张三：缺少考勤'])
    expect(run.issueCount).toBe(1)
  })
})
