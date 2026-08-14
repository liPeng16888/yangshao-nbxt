// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { readEmployeePhoto, uploadEmployeePhoto } from '@/api/employeeAttendance'
import {
  mockConfirmPayroll,
  mockCreateEmployee,
  mockCopyPreviousMonthSchedules,
  mockCreatePayrollAdjustment,
  mockDeleteAttendance,
  mockDeleteEmployee,
  mockDeleteLeave,
  mockDeleteMonthlyScheduleDay,
  mockGeneratePayroll,
  mockGetOverview,
  mockGetAttendance,
  mockGetCommissions,
  mockGetEmployee,
  mockGetEmployees,
  mockGetLeaves,
  mockGetPayroll,
  mockGetMonthlySchedules,
  mockGetScheduleAttendanceOverview,
  mockGetWeeklySchedules,
  mockReadEmployeePhoto,
  mockReviewLeave,
  mockReopenPayroll,
  mockSaveAttendance,
  mockSaveBonus,
  mockSaveCommission,
  mockSaveCommissionType,
  mockSaveDateOverride,
  mockSaveLeave,
  mockSaveLeaveType,
  mockSaveMonthlySetting,
  mockSaveMonthlyScheduleDay,
  mockBatchSaveMonthlySchedules,
  mockSaveWeeklySchedule,
  mockUploadEmployeePhoto,
  mockUpdateEmployee,
  resetEmployeeAttendanceMock
} from '@/mocks/employeeAttendance'

describe('employee attendance mock repository', () => {
  const seedMonthlyDate = async (employeeId: string, date: string) => {
    const isWorkday = ![0, 6].includes(dayjs(date).day())
    await mockBatchSaveMonthlySchedules({
      employeeId, dates: [date], isWorkday,
      segments: isWorkday ? [{ startTime: '08:00', endTime: '16:00' }] : [], remark: ''
    })
  }
  const seedMonthlyRange = async (employeeId: string, startDate: string, endDate: string) => {
    for (let cursor = dayjs(startDate); !cursor.isAfter(dayjs(endDate), 'day'); cursor = cursor.add(1, 'day')) await seedMonthlyDate(employeeId, cursor.format('YYYY-MM-DD'))
  }

  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size }
    } satisfies Storage })
    window.localStorage.clear()
    resetEmployeeAttendanceMock()
  })

  it('ships persisted sample employees for an immediately demonstrable frontend', async () => {
    expect((await mockGetEmployees()).map((row) => row.name)).toEqual(expect.arrayContaining(['张三', '李四']))
    await mockCreateEmployee({
      employeeNumber: 'YG003', name: '王五', status: 'ACTIVE', hireDate: '2026-08-01',
      baseSalary: 5200, attendanceBonus: 300, overtimeHourlyRate: 30, restQuotaDays: 4
    })
    expect((await mockGetEmployees({ keyword: '王五' }))[0]?.employeeNumber).toBe('YG003')
    expect(await mockUploadEmployeePhoto('emp-1', new File(['photo'], 'photo.png', { type: 'image/png' }))).toEqual({ id: 'emp-1', hasPhoto: true })
    expect(Object.values(window.localStorage).join('')).not.toContain('410000199001011234')
  })

  it('returns the full August calendar parity fixture from the unified Mock read', async () => {
    const schedule = (date: string) => mockSaveMonthlyScheduleDay({ employeeId: 'emp-1', date, isWorkday: true, segments: [{ startTime: '08:00', endTime: '18:00' }], remark: '' })
    for (const date of ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-20']) await schedule(date)
    await mockSaveAttendance({ employeeId: 'emp-1', date: '2026-08-05', actualSegments: [{ checkInAt: '2026-08-05T08:00:00+08:00', checkOutAt: '2026-08-05T18:00:00+08:00' }], explicitAbsenceMinutes: 0, overtimeMinutes: 30 })
    await mockSaveAttendance({ employeeId: 'emp-1', date: '2026-08-06', actualSegments: [{ checkInAt: '2026-08-06T08:00:00+08:00', checkOutAt: '2026-08-06T17:00:00+08:00' }], explicitAbsenceMinutes: 0, overtimeMinutes: 0 })
    const leave = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: '2026-08-07', endDate: '2026-08-07', unit: 'HOUR', hours: 4, reason: '照顾家人' })
    await mockReviewLeave(leave.id, 'APPROVED')
    await mockSaveAttendance({ employeeId: 'emp-1', date: '2026-08-08', actualSegments: [], explicitAbsenceMinutes: 600, overtimeMinutes: 0, remark: '无故未到' })

    const result = await mockGetScheduleAttendanceOverview('emp-1', '2026-08')
    const byDate = (date: string) => result.days.find((day) => day.date === date)
    expect(byDate('2026-08-04')).toMatchObject({ status: 'NORMAL', backgroundTone: 'normal', displayMinutes: 600 })
    expect(byDate('2026-08-05')).toMatchObject({ status: 'OVERTIME', durationTone: 'overtime', displayMinutes: 630 })
    expect(byDate('2026-08-06')).toMatchObject({ status: 'SHORT', durationTone: 'short', displayMinutes: 540, shortageMinutes: 60 })
    expect(byDate('2026-08-07')).toMatchObject({ status: 'LEAVE', backgroundTone: 'leave', workedMinutes: 360, approvedLeaveMinutes: 240, displayMinutes: 600, leaveReason: '照顾家人' })
    expect(byDate('2026-08-08')).toMatchObject({ status: 'ABSENT', backgroundTone: 'absent', absenceReason: '无故未到' })
    expect(byDate('2026-08-20')).toMatchObject({ status: 'FUTURE', backgroundTone: 'future', schedule: { segments: [{ startTime: '08:00', endTime: '18:00' }] } })
  })

  it('round-trips private employee photos in Mock without exposing a public URL', async () => {
    const photo = new File(['private-photo'], 'photo.png', { type: 'image/png' })
    await mockUploadEmployeePhoto('emp-1', photo)
    const readBack = await mockReadEmployeePhoto('emp-1')
    expect(readBack).toBeInstanceOf(Blob)
    expect(readBack).toMatchObject({ size: photo.size, type: 'image/png' })
  })

  it('round-trips private employee photos through the public Mock API used by the page', async () => {
    const photo = new File(['private-photo-api'], 'photo.png', { type: 'image/png' })
    await uploadEmployeePhoto('emp-1', photo)
    const readBack = await readEmployeePhoto('emp-1')
    expect(readBack).toBeInstanceOf(Blob)
    expect(readBack).toMatchObject({ size: photo.size, type: 'image/png' })
  })

  it('derives schedule minutes from planned start/end and rejects overnight shifts', async () => {
    const saved = await mockSaveWeeklySchedule({ employeeId: 'emp-1', weekday: 1, isWorkday: true, scheduledMinutes: 1, plannedStartTime: '08:30', plannedEndTime: '17:30' })
    expect(saved).toMatchObject({ scheduledMinutes: 540, plannedStartTime: '08:30', plannedEndTime: '17:30' })
    await expect(mockSaveWeeklySchedule({ employeeId: 'emp-1', weekday: 2, isWorkday: true, scheduledMinutes: 1, plannedStartTime: '20:00', plannedEndTime: '08:00' })).rejects.toThrow('跨日排班')
    const rest = await mockSaveWeeklySchedule({ employeeId: 'emp-1', weekday: 0, isWorkday: false, scheduledMinutes: 480, plannedStartTime: '08:00', plannedEndTime: '17:00' })
    expect(rest).toMatchObject({ scheduledMinutes: 0, plannedStartTime: null, plannedEndTime: null })
    expect((await mockGetWeeklySchedules('emp-1')).find((row) => row.weekday === 1)?.scheduledMinutes).toBe(540)
  })

  it('batch overwrite replaces every selected day and persists intervals', async () => {
    await mockBatchSaveMonthlySchedules({
      employeeId: 'emp-1', dates: ['2026-08-03', '2026-08-04'], isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }], remark: ''
    })
    const rows = await mockGetMonthlySchedules('emp-1', '2026-08')
    expect(rows.filter(row => ['2026-08-03', '2026-08-04'].includes(row.date)).every(row => row.scheduledMinutes === 480 && row.segments.length === 2)).toBe(true)
  })

  it('derives monthly setting workdays from persisted monthly schedules instead of accepting a client total', async () => {
    const month = dayjs().format('YYYY-MM')
    const rows = await mockGetMonthlySchedules('emp-1', month)
    const setting = await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 3 })
    expect(setting).toMatchObject({ restQuotaDays: 3, scheduledWorkDays: rows.filter((row) => row.isWorkday && row.segments.length > 0).length })
  })

  it('returns every selected cross-month batch row with exact update and overwrite counts', async () => {
    const first = await mockBatchSaveMonthlySchedules({
      employeeId: 'emp-1', dates: ['2026-09-01', '2026-08-31'], isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '16:00' }], remark: '跨月排班'
    })
    expect(first).toMatchObject({ updated: 2, overwritten: 1 })
    expect(first.rows.map((row) => row.date)).toEqual(['2026-08-31', '2026-09-01'])

    const second = await mockBatchSaveMonthlySchedules({
      employeeId: 'emp-1', dates: ['2026-08-31', '2026-09-01'], isWorkday: true,
      segments: [{ startTime: '09:00', endTime: '17:00' }], remark: '再次覆盖'
    })
    expect(second).toMatchObject({ updated: 2, overwritten: 2 })
    expect(second.rows.map((row) => row.segments[0]?.startTime)).toEqual(['09:00', '09:00'])
  })

  it('rejects impossible business dates and months instead of silently normalizing them', async () => {
    await expect(mockBatchSaveMonthlySchedules({
      employeeId: 'emp-1', dates: ['2026-02-31'], isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '16:00' }], remark: ''
    })).rejects.toThrow('日期格式无效')
    await expect(mockGetMonthlySchedules('emp-1', '2026-13')).rejects.toThrow('月份格式无效')
  })

  it('only seeds the current business month, so a previous-month copy has no phantom source', async () => {
    const month = dayjs().format('YYYY-MM')
    const previousMonth = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')
    const nextMonth = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')
    const targetBefore = await mockGetMonthlySchedules('emp-1', month)
    expect(targetBefore).not.toHaveLength(0)
    expect(await mockGetMonthlySchedules('emp-1', previousMonth)).toEqual([])
    expect(await mockGetMonthlySchedules('emp-1', nextMonth)).toEqual([])

    await expect(mockCopyPreviousMonthSchedules('emp-1', month, true)).rejects.toThrow('上月暂无可复制排班')
    expect(await mockGetMonthlySchedules('emp-1', month)).toEqual(targetBefore)
  })

  it('does not delete the target month when a persisted source row is invalid', async () => {
    const month = dayjs().format('YYYY-MM')
    const previousMonth = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')
    const state = JSON.parse(window.localStorage.getItem('ys_employee_attendance_v2:mock-default')!) as Record<string, any>
    state.monthlySchedules = [
      ...state.monthlySchedules.filter((row: { employeeId: string }) => row.employeeId !== 'emp-1'),
      { id: 'source-invalid', employeeId: 'emp-1', date: `${previousMonth}-01`, isWorkday: true, segments: [{ sequence: 0, startTime: '24:00', endTime: '16:00' }], remark: '', scheduledMinutes: 480, breakMinutes: 0 },
      { id: 'target-preserved', employeeId: 'emp-1', date: `${month}-01`, isWorkday: false, segments: [], remark: '保留目标', scheduledMinutes: 0, breakMinutes: 0 }
    ]
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'copy-atomic' }))
    window.localStorage.setItem('ys_employee_attendance_v2:copy-atomic', JSON.stringify(state))

    await expect(mockCopyPreviousMonthSchedules('emp-1', month, true)).rejects.toThrow('同一自然日')
    await expect(mockGetMonthlySchedules('emp-1', month)).resolves.toEqual([expect.objectContaining({ id: 'target-preserved', remark: '保留目标' })])
  })

  it('clears cached attendance metrics for overwritten target dates missing from a sparse source month', async () => {
    const targetMonth = dayjs().format('YYYY-MM')
    const sourceMonth = dayjs(`${targetMonth}-01`).subtract(1, 'month').format('YYYY-MM')
    const staleDate = `${targetMonth}-${String(dayjs(`${targetMonth}-01`).daysInMonth()).padStart(2, '0')}`
    const state = JSON.parse(window.localStorage.getItem('ys_employee_attendance_v2:mock-default')!) as Record<string, any>
    state.monthlySchedules = [
      { id: 'source-1', employeeId: 'emp-1', date: `${sourceMonth}-01`, isWorkday: true, segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }], remark: '', scheduledMinutes: 480, breakMinutes: 0 },
      { id: 'target-1', employeeId: 'emp-1', date: `${targetMonth}-01`, isWorkday: true, segments: [{ sequence: 0, startTime: '09:00', endTime: '17:00' }], remark: '', scheduledMinutes: 480, breakMinutes: 0 },
      { id: 'target-stale', employeeId: 'emp-1', date: staleDate, isWorkday: true, segments: [{ sequence: 0, startTime: '09:00', endTime: '17:00' }], remark: '', scheduledMinutes: 480, breakMinutes: 0 }
    ]
    state.attendance = [{
      id: 'attendance-stale', employeeId: 'emp-1', date: staleDate, isScheduledWorkday: true,
      scheduledMinutes: 480, actualSegments: [], explicitAbsenceMinutes: 30,
      workedMinutes: 480, lateMinutes: 10, earlyLeaveMinutes: 5, absenceMinutes: 30,
      overtimeMinutes: 45, remark: '', manuallyEdited: true
    }]
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'copy-sparse' }))
    window.localStorage.setItem('ys_employee_attendance_v2:copy-sparse', JSON.stringify(state))

    await mockCopyPreviousMonthSchedules('emp-1', targetMonth, true)

    await expect(mockGetAttendance({ employeeId: 'emp-1', month: targetMonth })).resolves.toMatchObject([{
      id: 'attendance-stale', isScheduledWorkday: false, scheduledMinutes: 0,
      workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0,
      explicitAbsenceMinutes: 30, absenceMinutes: 0, overtimeMinutes: 45
    }])
  })

  it('upgrades only a legacy version, prunes provable round-one phantom rows, and preserves new-version empties', async () => {
    const month = dayjs().format('YYYY-MM')
    const previousMonth = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')
    const nextMonth = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')
    const defaultState = JSON.parse(window.localStorage.getItem('ys_employee_attendance_v2:mock-default')!) as Record<string, any>
    const seedRows = (targetMonth: string) => defaultState.employees.flatMap((employee: { id: string }) => Array.from({ length: dayjs(`${targetMonth}-01`).daysInMonth() }, (_, index) => {
      const date = `${targetMonth}-${String(index + 1).padStart(2, '0')}`
      const weekly = defaultState.weeklySchedules.find((row: { employeeId: string; weekday: number }) => row.employeeId === employee.id && row.weekday === dayjs(date).day())
      return { id: `monthly-${employee.id}-${date}`, employeeId: employee.id, date, isWorkday: weekly.isWorkday, segments: weekly.isWorkday ? [{ sequence: 0, startTime: weekly.plannedStartTime, endTime: weekly.plannedEndTime }] : [], remark: '', scheduledMinutes: weekly.scheduledMinutes, breakMinutes: 0 }
    }))
    defaultState.monthlySchedules = [
      ...seedRows(previousMonth), ...seedRows(month), ...seedRows(nextMonth),
      { id: 'manual-previous', employeeId: 'emp-1', date: `${previousMonth}-01`, isWorkday: true, segments: [{ sequence: 0, startTime: '07:00', endTime: '15:00' }], remark: '手工保留', scheduledMinutes: 480, breakMinutes: 0 }
    ]
    delete defaultState.schemaVersion
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'legacy-a' }))
    window.localStorage.setItem('ys_employee_attendance_v2:legacy-a', JSON.stringify(defaultState))

    expect((await mockGetMonthlySchedules('emp-1', previousMonth)).map((row) => row.id)).toEqual(['manual-previous'])
    expect(await mockGetMonthlySchedules('emp-1', nextMonth)).toEqual([])
    expect(await mockGetMonthlySchedules('emp-1', month)).toHaveLength(dayjs(`${month}-01`).daysInMonth())
    expect(JSON.parse(window.localStorage.getItem('ys_employee_attendance_v2:legacy-a')!).schemaVersion).toBeGreaterThan(0)

    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'current-empty' }))
    window.localStorage.setItem('ys_employee_attendance_v2:current-empty', JSON.stringify({ ...defaultState, schemaVersion: 3, monthlySchedules: [] }))
    expect(await mockGetMonthlySchedules('emp-1', month)).toEqual([])
  })

  it('upgrades legacy attendance pairs into actual intervals while keeping empty legacy records safe', async () => {
    const state = JSON.parse(window.localStorage.getItem('ys_employee_attendance_v2:mock-default')!) as Record<string, any>
    const pair = state.attendance[0]
    const empty = { ...state.attendance[1], id: 'legacy-empty-attendance', checkInAt: '', checkOutAt: '' }
    delete pair.actualSegments
    delete empty.actualSegments
    state.schemaVersion = 3
    state.attendance = [pair, empty]
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'legacy-attendance-pairs' }))
    window.localStorage.setItem('ys_employee_attendance_v2:legacy-attendance-pairs', JSON.stringify(state))

    const rows = await mockGetAttendance()
    expect(rows.find((row) => row.id === pair.id)?.actualSegments).toEqual([
      expect.objectContaining({ sequence: 0, checkInAt: pair.checkInAt, checkOutAt: pair.checkOutAt })
    ])
    expect(rows.find((row) => row.id === empty.id)?.actualSegments).toEqual([])
    expect(JSON.parse(window.localStorage.getItem('ys_employee_attendance_v2:legacy-attendance-pairs')!).schemaVersion).toBeGreaterThan(3)
    expect((await mockGetAttendance()).find((row) => row.id === pair.id)?.actualSegments).toHaveLength(1)
  })

  it('prunes matching migrated seeds for any employee while retaining current-month and edited prefixed rows', async () => {
    const month = dayjs().format('YYYY-MM')
    const previousMonth = dayjs(`${month}-01`).subtract(1, 'month').format('YYYY-MM')
    const nextMonth = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')
    const state = JSON.parse(window.localStorage.getItem('ys_employee_attendance_v2:mock-default')!) as Record<string, any>
    const employeeId = 'legacy-any-employee'
    const sourceEmployee = state.employees.find((row: { id: string }) => row.id === 'emp-1')
    state.employees.push({ ...sourceEmployee, id: employeeId, employeeNumber: 'LEGACY001' })
    state.weeklySchedules.push(...state.weeklySchedules.filter((row: { employeeId: string }) => row.employeeId === 'emp-1').map((row: Record<string, unknown>) => ({ ...row, id: `ws-${employeeId}-${row.weekday}`, employeeId })))
    const seed = (date: string) => {
      const weekly = state.weeklySchedules.find((row: { employeeId: string; weekday: number }) => row.employeeId === employeeId && row.weekday === dayjs(date).day())
      return { id: `migrated-${employeeId}-${date}`, employeeId, date, isWorkday: weekly.isWorkday, segments: weekly.isWorkday ? [{ sequence: 0, startTime: weekly.plannedStartTime, endTime: weekly.plannedEndTime }] : [], remark: '', scheduledMinutes: weekly.scheduledMinutes, breakMinutes: 0 }
    }
    const unchangedPrevious = seed(`${previousMonth}-01`)
    const editedPrevious = { ...seed(`${previousMonth}-02`), segments: [{ sequence: 0, startTime: '07:00', endTime: '15:00' }] }
    state.monthlySchedules = [unchangedPrevious, editedPrevious, seed(`${month}-01`), seed(`${nextMonth}-01`)]
    delete state.schemaVersion
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'legacy-migrated-any' }))
    window.localStorage.setItem('ys_employee_attendance_v2:legacy-migrated-any', JSON.stringify(state))

    expect((await mockGetMonthlySchedules(employeeId, previousMonth)).map((row) => row.id)).toEqual([editedPrevious.id])
    expect(await mockGetMonthlySchedules(employeeId, nextMonth)).toEqual([])
    expect((await mockGetMonthlySchedules(employeeId, month)).map((row) => row.id)).toEqual([`migrated-${employeeId}-${month}-01`])
  })

  it('treats an empty actual-segment list as normal attendance unless absence is explicit', async () => {
    let next = dayjs().add(1, 'day')
    while (next.day() === 0 || next.day() === 6) next = next.add(1, 'day')
    const date = next.format('YYYY-MM-DD')
    const saved = await mockSaveAttendance({ employeeId: 'emp-1', date, actualSegments: [], explicitAbsenceMinutes: 30, overtimeMinutes: 0 })
    expect(saved).toMatchObject({ workedMinutes: 480, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 30, actualSegments: [] })
  })

  it('derives partial explicit absence in Mock payroll without creating an unresolved full-day blocker', async () => {
    const month = dayjs().format('YYYY-MM')
    const employee = await mockCreateEmployee({
      employeeNumber: 'YG901', name: '部分缺勤员工', status: 'ACTIVE', hireDate: `${month}-01`,
      baseSalary: 4800, attendanceBonus: 200, overtimeHourlyRate: 20, restQuotaDays: 2
    })
    const date = `${month}-01`
    await mockBatchSaveMonthlySchedules({
      employeeId: employee.id, dates: [date], isWorkday: true,
      segments: [{ startTime: '16:00', endTime: '24:00' }], remark: ''
    })
    await mockSaveMonthlySetting({ employeeId: employee.id, month, restQuotaDays: 2 })
    await mockSaveAttendance({ employeeId: employee.id, date, actualSegments: [], explicitAbsenceMinutes: 30, overtimeMinutes: 0 })

    const item = (await mockGeneratePayroll(month)).items.find((row) => row.employeeId === employee.id)!

    expect(item.calculationSnapshot.input.absenceDays).toBe(0.0625)
    expect(item.issues.join('')).not.toContain('未处理缺勤')
  })

  it('re-derives Mock attendance from the current schedule and current approved leave while preserving raw absence', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const employee = await mockCreateEmployee({ employeeNumber: 'YG902', name: '动态考勤员工', status: 'ACTIVE', hireDate: today })
    await mockBatchSaveMonthlySchedules({
      employeeId: employee.id, dates: [today], isWorkday: true,
      segments: [{ startTime: '16:00', endTime: '24:00' }], remark: ''
    })
    await mockSaveAttendance({ employeeId: employee.id, date: today, actualSegments: [], explicitAbsenceMinutes: 60, overtimeMinutes: 0 })
    const leave = await mockSaveLeave({
      employeeId: employee.id, leaveTypeId: 'leave-type-sick', startDate: today, endDate: today,
      unit: 'HOUR', hours: 0.5, reason: '临时请假'
    })
    await mockReviewLeave(leave.id, 'APPROVED')
    await mockBatchSaveMonthlySchedules({
      employeeId: employee.id, dates: [today], isWorkday: true,
      segments: [{ startTime: '18:00', endTime: '24:00' }], remark: '排班已调整'
    })

    await expect(mockGetAttendance({ employeeId: employee.id })).resolves.toMatchObject([{
      scheduledMinutes: 360, workedMinutes: 360, explicitAbsenceMinutes: 60, absenceMinutes: 30
    }])
  })

  it('keeps raw attendance but clears stale derived metrics when its draft schedule day is deleted', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const employee = await mockCreateEmployee({ employeeNumber: 'YG906', name: '删除排班员工', status: 'ACTIVE', hireDate: today })
    const schedule = (await mockBatchSaveMonthlySchedules({
      employeeId: employee.id, dates: [today], isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '16:00' }], remark: ''
    })).rows[0]!
    const saved = await mockSaveAttendance({
      employeeId: employee.id, date: today, actualSegments: [], explicitAbsenceMinutes: 30, overtimeMinutes: 45
    })

    await mockDeleteMonthlyScheduleDay(schedule.id)

    await expect(mockGetAttendance({ employeeId: employee.id })).resolves.toMatchObject([{
      id: saved.id,
      isScheduledWorkday: false,
      scheduledMinutes: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      explicitAbsenceMinutes: 30,
      absenceMinutes: 0,
      overtimeMinutes: 45,
      actualSegments: []
    }])
    const overview = await mockGetOverview(dayjs().format('YYYY-MM'))
    expect(overview.todayPresent + overview.todayOnLeave + overview.todayAbsent).toBe(2)
  })

  it('rejects lexical hour 24 in Mock actual attendance timestamps instead of accepting Date normalization', async () => {
    const businessDate = dayjs().add(1, 'day').format('YYYY-MM-DD')
    const lexicalDate = dayjs(businessDate).subtract(1, 'day').format('YYYY-MM-DD')
    await mockBatchSaveMonthlySchedules({
      employeeId: 'emp-1', dates: [businessDate], isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '16:00' }], remark: ''
    })

    await expect(mockSaveAttendance({
      employeeId: 'emp-1', date: businessDate,
      actualSegments: [{ checkInAt: `${lexicalDate}T24:00:00+08:00`, checkOutAt: `${businessDate}T00:30:00+08:00` }],
      explicitAbsenceMinutes: 0,
      overtimeMinutes: 0
    })).rejects.toThrow('打卡时间必须包含明确时区')
  })

  it('classifies scheduled employees in Mock overview without double-counting default-normal, leave, and absence', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const normal = await mockCreateEmployee({ employeeNumber: 'YG903', name: '默认正常员工', status: 'ACTIVE', hireDate: today })
    const leaveEmployee = await mockCreateEmployee({ employeeNumber: 'YG904', name: '请假员工', status: 'ACTIVE', hireDate: today })
    const absent = await mockCreateEmployee({ employeeNumber: 'YG905', name: '缺勤员工', status: 'ACTIVE', hireDate: today })
    for (const employee of [normal, leaveEmployee, absent]) {
      await mockBatchSaveMonthlySchedules({ employeeId: employee.id, dates: [today], isWorkday: true, segments: [{ startTime: '08:00', endTime: '16:00' }], remark: '' })
    }
    const leave = await mockSaveLeave({
      employeeId: leaveEmployee.id, leaveTypeId: 'leave-type-sick', startDate: today, endDate: today,
      unit: 'FULL_DAY', reason: '整天请假'
    })
    await mockReviewLeave(leave.id, 'APPROVED')
    await mockSaveAttendance({ employeeId: absent.id, date: today, actualSegments: [], explicitAbsenceMinutes: 30, overtimeMinutes: 0 })

    const overview = await mockGetOverview(dayjs().format('YYYY-MM'))

    expect(overview.todayPresent).toBe(4)
    expect(overview.todayOnLeave).toBe(1)
    expect(overview.todayAbsent).toBe(0)
    expect(overview.todayPresent + overview.todayOnLeave + overview.todayAbsent).toBe(5)
  })

  it.each([
    ['HALF_DAY' as const, undefined],
    ['HOUR' as const, 1]
  ])('classifies positive approved %s leave coverage once as leave in Mock overview', async (unit, hours) => {
    const today = dayjs().format('YYYY-MM-DD')
    const employee = await mockCreateEmployee({ employeeNumber: `YG-${unit}`, name: `${unit}请假员工`, status: 'ACTIVE', hireDate: today })
    await mockBatchSaveMonthlySchedules({
      employeeId: employee.id, dates: [today], isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '16:00' }], remark: ''
    })
    await mockSaveAttendance({ employeeId: employee.id, date: today, actualSegments: [], explicitAbsenceMinutes: 480, overtimeMinutes: 0 })
    const leave = await mockSaveLeave({
      employeeId: employee.id, leaveTypeId: 'leave-type-sick', startDate: today, endDate: today,
      unit, hours, reason: '部分请假'
    })
    await mockReviewLeave(leave.id, 'APPROVED')

    const overview = await mockGetOverview(dayjs().format('YYYY-MM'))

    expect(overview.todayOnLeave).toBe(1)
    expect(overview.todayPresent + overview.todayOnLeave + overview.todayAbsent).toBe(3)
  })

  it('zeros derived attendance after both single and batch changes from workday to explicit rest day', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const employee = await mockCreateEmployee({ employeeNumber: 'YG-REST', name: '休息日员工', status: 'ACTIVE', hireDate: today })
    await mockSaveMonthlyScheduleDay({
      employeeId: employee.id, date: today, isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '16:00' }], remark: '先工作'
    })
    const saved = await mockSaveAttendance({
      employeeId: employee.id, date: today,
      actualSegments: [{ checkInAt: `${today}T09:00:00+08:00`, checkOutAt: `${today}T12:00:00+08:00` }],
      explicitAbsenceMinutes: 60, overtimeMinutes: 45, remark: '保留原始信息'
    })
    await mockSaveMonthlyScheduleDay({ employeeId: employee.id, date: today, isWorkday: false, segments: [], remark: '单日改休' })
    await expect(mockGetAttendance({ employeeId: employee.id })).resolves.toMatchObject([{
      id: saved.id, isScheduledWorkday: false, scheduledMinutes: 0, workedMinutes: 0,
      lateMinutes: 0, earlyLeaveMinutes: 0, explicitAbsenceMinutes: 60, absenceMinutes: 0,
      overtimeMinutes: 45, remark: '保留原始信息', actualSegments: saved.actualSegments
    }])

    await mockSaveMonthlyScheduleDay({
      employeeId: employee.id, date: today, isWorkday: true,
      segments: [{ startTime: '08:00', endTime: '16:00' }], remark: '恢复工作'
    })
    await mockBatchSaveMonthlySchedules({ employeeId: employee.id, dates: [today], isWorkday: false, segments: [], remark: '批量改休' })
    await expect(mockGetAttendance({ employeeId: employee.id })).resolves.toMatchObject([{
      isScheduledWorkday: false, scheduledMinutes: 0, workedMinutes: 0,
      lateMinutes: 0, earlyLeaveMinutes: 0, explicitAbsenceMinutes: 60, absenceMinutes: 0,
      overtimeMinutes: 45, remark: '保留原始信息', actualSegments: saved.actualSegments
    }])

    const payroll = await mockGeneratePayroll(dayjs().format('YYYY-MM'))
    expect(payroll.items.find((item) => item.employeeId === employee.id)?.calculationSnapshot.input.absenceDays).toBe(0)
  })

  it('returns zero derived absence immediately when attendance is saved on an explicit rest day', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    const employee = await mockCreateEmployee({ employeeNumber: 'YG-REST-SAVE', name: '休息日即时响应', status: 'ACTIVE', hireDate: today })
    await mockSaveMonthlyScheduleDay({ employeeId: employee.id, date: today, isWorkday: false, segments: [], remark: '明确休息' })

    const saved = await mockSaveAttendance({
      employeeId: employee.id, date: today, actualSegments: [],
      explicitAbsenceMinutes: 60, overtimeMinutes: 45, remark: '保留原始信息'
    })

    expect(saved).toMatchObject({
      isScheduledWorkday: false, scheduledMinutes: 0, workedMinutes: 0,
      lateMinutes: 0, earlyLeaveMinutes: 0, explicitAbsenceMinutes: 60, absenceMinutes: 0,
      overtimeMinutes: 45, remark: '保留原始信息'
    })
    await expect(mockGetAttendance({ employeeId: employee.id })).resolves.toMatchObject([{
      id: saved.id, explicitAbsenceMinutes: 60, absenceMinutes: 0
    }])
  })

  it('derives payroll from monthly schedules and treats missing attendance as normal', async () => {
    await mockReviewLeave('leave-1', 'APPROVED')
    const month = dayjs().format('YYYY-MM')
    const existing = (await mockGetAttendance({ employeeId: 'emp-1', month }))[0]
    if (existing) await mockDeleteAttendance(existing.id)
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 4 })
    const payroll = await mockGeneratePayroll(month)
    const item = payroll.items.find(row => row.employeeId === 'emp-1')!
    expect(item.issues).toEqual([])
    expect(item.calculationSnapshot.result).toMatchObject({ absenceDeduction: 0, attendanceBonus: 300 })
  })

  it('enforces timezone-aware paired punches and full uncovered no-punch absence', async () => {
    const date = dayjs().add(1, 'day').format('YYYY-MM-DD')
    const base = { employeeId: 'emp-1', date, isScheduledWorkday: true, scheduledMinutes: 480 }
    await expect(mockSaveAttendance({ ...base, scheduledMinutes: 0, absenceMinutes: 0 })).rejects.toThrow('工作日时长')
    await expect(mockSaveAttendance({ ...base, checkInAt: `${date}T08:00:00+08:00` })).rejects.toThrow('同时填写')
    await expect(mockSaveAttendance({ ...base, checkInAt: `${date}T08:00`, checkOutAt: `${date}T17:00` })).rejects.toThrow('时区')
    await expect(mockSaveAttendance({ ...base, absenceMinutes: 1 })).rejects.toThrow('完整记录')
  })

  it('rejects mixed month and date-range filters in Mock just like the server', async () => {
    await expect(mockGetAttendance({ month: '2026-08', startDate: '2026-08-01' }))
      .rejects.toThrow('月份和日期范围不能同时使用')
    await expect(mockGetLeaves({ month: '2026-08', endDate: '2026-08-31' }))
      .rejects.toThrow('月份和日期范围不能同时使用')
  })

  it('isolates persisted records by the authenticated frontend account and never exposes plaintext sensitive fields in normal lists', async () => {
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'front-a', account: 'lab-a' }))
    resetEmployeeAttendanceMock()
    await mockCreateEmployee({ employeeNumber: 'A003', name: '甲账号员工', status: 'ACTIVE', hireDate: '2026-01-01', idCard: '410000198812121234', bankCard: '6222021234567890123' })
    const normal = (await mockGetEmployees({ keyword: '甲账号' }))[0] as unknown as Record<string, unknown>
    expect(normal.idCard).toBeUndefined()
    expect(normal.bankCard).toBeUndefined()
    expect(JSON.stringify(Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.getItem(window.localStorage.key(index)!)))).not.toContain('410000198812121234')

    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'front-b', account: 'lab-b' }))
    expect(await mockGetEmployees({ keyword: '甲账号' })).toEqual([])
    window.localStorage.setItem('ys_user', JSON.stringify({ id: 'front-a', account: 'lab-a' }))
    expect((await mockGetEmployees({ keyword: '甲账号' }))[0]?.employeeNumber).toBe('A003')
  })

  it('blocks confirmation while leave is pending', async () => {
    const draft = await mockGeneratePayroll(dayjs().format('YYYY-MM'))
    expect(draft.issues.join('')).not.toContain('请假待审批')
    await expect(mockConfirmPayroll(draft.id)).rejects.toThrow('待审批请假')
  })

  it('locks confirmed payroll and preserves adjustments only while the run is a draft', async () => {
    const month = dayjs().format('YYYY-MM')
    const previousMonth = dayjs().subtract(1, 'month').format('YYYY-MM')
    const previousMonday = dayjs(`${previousMonth}-01`).day(1).month() === dayjs(`${previousMonth}-01`).month()
      ? dayjs(`${previousMonth}-01`).day(1).format('YYYY-MM-DD')
      : dayjs(`${previousMonth}-01`).add(1, 'week').day(1).format('YYYY-MM-DD')
    await mockReviewLeave('leave-1', 'APPROVED')
    await seedMonthlyDate('emp-1', previousMonday)
    await mockSaveLeave({
      employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: previousMonday, endDate: previousMonday,
      unit: 'FULL_DAY', reason: '上月待审请假'
    })
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 4 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, restQuotaDays: 4 })
    const draft = await mockGeneratePayroll(month)
    expect(draft.issues.join('')).not.toContain('请假待审批')
    await mockCreatePayrollAdjustment(draft.items[0].id, { amount: 88, reason: '补发岗位补贴' })
    await mockConfirmPayroll(draft.id)
    expect((await mockGetAttendance({ month })).every((row) => Boolean(row.lockedAt))).toBe(true)
    await expect(mockCreatePayrollAdjustment(draft.items[0].id, { amount: 10, reason: '已确认后修改' }))
      .rejects.toThrow('已确认')
  })

  it('calculates leave, absence, overtime, commission, bonus and signed adjustments with two-decimal rounding', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 0 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, restQuotaDays: 4 })
    const leaveDate = dayjs(`${month}-01`).day(1).month() === dayjs(`${month}-01`).month()
      ? dayjs(`${month}-01`).day(1).format('YYYY-MM-DD')
      : dayjs(`${month}-01`).add(1, 'week').day(1).format('YYYY-MM-DD')
    const leave = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: leaveDate, endDate: leaveDate, unit: 'FULL_DAY', reason: '事假' })
    await mockReviewLeave(leave.id, 'APPROVED')
    await mockSaveAttendance({ employeeId: 'emp-1', date: leaveDate, isScheduledWorkday: true, scheduledMinutes: 480, absenceMinutes: 0, overtimeMinutes: 0 })
    const current = (await mockGetAttendance({ employeeId: 'emp-1', month })).find((row) => row.id === 'att-emp-1')!
    await mockSaveAttendance({
      employeeId: current.employeeId, date: current.date, actualSegments: [], explicitAbsenceMinutes: 240, overtimeMinutes: 31
    }, current.id)
    const draft = await mockGeneratePayroll(month)
    const item = draft.items.find((row) => row.employeeId === 'emp-1')!
    await mockCreatePayrollAdjustment(item.id, { amount: -10.01, reason: '补扣' })
    const refreshed = await mockGetPayroll(month)
    const result = refreshed!.items.find((row) => row.employeeId === 'emp-1')!.calculationSnapshot.result
    expect(result).toMatchObject({ attendanceBonus: 0, overtimePay: 15.5, commissionAmount: 96, bonusAmount: 200, adjustmentAmount: -10.01, leaveDeduction: 285.71, absenceDeduction: 142.86, payableAmount: 5872.92 })
  })

  it('matches conflict, inactive-type, overlapping-month, history-delete and employment-window rules', async () => {
    const today = dayjs().format('YYYY-MM-DD')
    await mockSaveDateOverride({ employeeId: 'emp-1', date: today, isWorkday: false, scheduledMinutes: 0 })
    await expect(mockSaveDateOverride({ employeeId: 'emp-1', date: today, isWorkday: true, scheduledMinutes: 480 })).rejects.toThrow('已有临时调班')

    const inactiveType = await mockSaveLeaveType({ name: '已停用类型', active: false, countsTowardRestQuota: true })
    const nextMonday = dayjs().add(1, 'week').day(1).format('YYYY-MM-DD')
    await expect(mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: inactiveType.id, startDate: nextMonday, endDate: nextMonday, unit: 'FULL_DAY', reason: '不应保存' })).rejects.toThrow('已停用')

    const end = dayjs().endOf('month').add(2, 'day').format('YYYY-MM-DD')
    const start = dayjs().endOf('month').subtract(4, 'day').format('YYYY-MM-DD')
    await seedMonthlyRange('emp-1', start, end)
    const spanning = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: start, endDate: end, unit: 'FULL_DAY', reason: '跨月请假' })
    expect((await mockGetLeaves({ month: dayjs().add(1, 'month').format('YYYY-MM') })).map(row => row.id)).toContain(spanning.id)

    const employee = await mockCreateEmployee({ employeeNumber: 'YG099', name: '历史员工', status: 'ACTIVE', hireDate: dayjs().startOf('month').format('YYYY-MM-DD') })
    await mockSaveBonus({ employeeId: employee.id, date: today, amount: 1, reason: '历史奖金' })
    await mockDeleteEmployee(employee.id)
    expect((await mockGetEmployee(employee.id)).status).toBe('INACTIVE')

    const inactive = await mockCreateEmployee({ employeeNumber: 'YG100', name: '未入职停用员工', status: 'INACTIVE', hireDate: dayjs().startOf('month').format('YYYY-MM-DD') })
    const draft = await mockGeneratePayroll(dayjs().format('YYYY-MM'))
    expect(draft.items.some(row => row.employeeId === inactive.id)).toBe(false)
  })

  it('flags uncovered no-punch time and subtracts approved leave coverage from recorded absence', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 4 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, restQuotaDays: 4 })
    const record = (await mockGetAttendance({ employeeId: 'emp-2', month }))[0]
    await expect(mockSaveAttendance({ ...record, checkInAt: '', checkOutAt: '', absenceMinutes: 0 }, record.id))
      .rejects.toThrow('必须完整记录')

    await mockSaveAttendance({ ...record, checkInAt: '', checkOutAt: '', absenceMinutes: 480 }, record.id)
    const refreshed = await mockGeneratePayroll(month)
    const snapshot = refreshed.items.find(row => row.employeeId === 'emp-2')!.calculationSnapshot.result
    expect(snapshot).toMatchObject({ attendanceBonus: 0, absenceDeduction: 130.95 })
  })

  it('includes rest-day overtime and stores a complete immutable server-shaped calculation snapshot', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 4 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, restQuotaDays: 4 })
    let restDate = dayjs(`${month}-01`)
    while (restDate.day() !== 6) restDate = restDate.add(1, 'day')
    await mockSaveAttendance({ employeeId: 'emp-1', date: restDate.format('YYYY-MM-DD'), isScheduledWorkday: false, scheduledMinutes: 0, absenceMinutes: 0, overtimeMinutes: 60 })

    const draft = await mockGeneratePayroll(month)
    const snapshot = draft.items.find((row) => row.employeeId === 'emp-1')!.calculationSnapshot
    expect(Object.keys(snapshot.input).sort()).toEqual(['adjustments', 'absenceDays', 'attendanceBonus', 'baseSalary', 'bonusAmount', 'commissionAmount', 'countedLeaveDays', 'overtimeHourlyRate', 'overtimeMinutes', 'restQuotaDays', 'scheduledWorkDays'].sort())
    expect(Object.keys(snapshot.result).sort()).toEqual(['absenceDeduction', 'adjustmentAmount', 'attendanceBonus', 'bonusAmount', 'commissionAmount', 'dailyRate', 'excessLeaveDays', 'issues', 'leaveDeduction', 'overtimeHours', 'overtimePay', 'payableAmount'].sort())
    expect(snapshot).toEqual({
      input: expect.objectContaining({ baseSalary: 6000, scheduledWorkDays: 21, overtimeMinutes: 90, overtimeHourlyRate: 30, adjustments: [] }),
      result: expect.objectContaining({ overtimeHours: 1.5, overtimePay: 45, payableAmount: expect.any(Number), issues: [] }),
      generatedAt: expect.any(String)
    })

    const confirmed = await mockConfirmPayroll(draft.id)
    const returnedSnapshot = confirmed.items.find((row) => row.employeeId === 'emp-1')!.calculationSnapshot
    returnedSnapshot.result.payableAmount = -1
    expect((await mockGetPayroll(month))!.items.find((row) => row.employeeId === 'emp-1')!.calculationSnapshot.result.payableAmount).not.toBe(-1)
  })

  it('counts only the scheduled overlap of a cross-month approved leave in each payroll month', async () => {
    const month = dayjs().format('YYYY-MM')
    const nextMonth = dayjs(`${month}-01`).add(1, 'month').format('YYYY-MM')
    let start = dayjs(`${month}-01`).endOf('month')
    while (start.day() === 0 || start.day() === 6) start = start.subtract(1, 'day')
    let end = dayjs(`${nextMonth}-01`)
    while (end.day() === 0 || end.day() === 6) end = end.add(1, 'day')
    await seedMonthlyRange('emp-1', start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'))
    const leave = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD'), unit: 'FULL_DAY', reason: '跨月事假' })
    await mockReviewLeave(leave.id, 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 0 })
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month: nextMonth, restQuotaDays: 0 })

    const current = (await mockGeneratePayroll(month)).items.find((row) => row.employeeId === 'emp-1')!.calculationSnapshot.input
    const next = (await mockGeneratePayroll(nextMonth)).items.find((row) => row.employeeId === 'emp-1')!.calculationSnapshot.input
    expect(current.countedLeaveDays).toBe(1)
    expect(next.countedLeaveDays).toBe(1)
  })

  it('deducts an explicitly recorded absence without blocking payroll confirmation', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 4 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, restQuotaDays: 4 })
    const record = (await mockGetAttendance({ employeeId: 'emp-1', month }))[0]
    await mockSaveAttendance({
      employeeId: record.employeeId, date: record.date, actualSegments: [], explicitAbsenceMinutes: 480, overtimeMinutes: record.overtimeMinutes
    }, record.id)
    const draft = await mockGeneratePayroll(month)
    const item = draft.items.find((row) => row.employeeId === 'emp-1')!
    expect(item.issues).toEqual([])
    expect(item.calculationSnapshot.result).toMatchObject({ attendanceBonus: 0, absenceDeduction: 285.71 })
    await expect(mockConfirmPayroll(draft.id)).resolves.toMatchObject({ status: 'CONFIRMED' })
  })

  it('preserves a draft payroll item and its adjustment after employee eligibility changes', async () => {
    const month = dayjs().format('YYYY-MM')
    await mockReviewLeave('leave-1', 'APPROVED')
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 4 })
    const record = (await mockGetAttendance({ employeeId: 'emp-1', month }))[0]
    await mockSaveAttendance({ ...record, checkInAt: `${record.date}T08:00:00+08:00`, checkOutAt: `${record.date}T17:00:00+08:00`, absenceMinutes: 0 }, record.id)
    const draft = await mockGeneratePayroll(month)
    const item = draft.items.find((row) => row.employeeId === 'emp-1')!
    await mockCreatePayrollAdjustment(item.id, { amount: 88, reason: '补发' })
    const employee = await mockGetEmployee('emp-1')
    await mockUpdateEmployee('emp-1', { ...employee, status: 'INACTIVE', terminationDate: '', hireDate: dayjs().add(1, 'month').format('YYYY-MM-DD') })

    const refreshed = await mockGeneratePayroll(month)
    expect(refreshed.items.find((row) => row.id === item.id)?.adjustments).toEqual([expect.objectContaining({ amount: 88, reason: '补发' })])
  })

  it('scopes overview pending leave and overtime to the selected month', async () => {
    const currentMonth = dayjs().format('YYYY-MM')
    const previousMonth = dayjs().subtract(1, 'month').format('YYYY-MM')
    const previousWorkday = dayjs(`${previousMonth}-10`).format('YYYY-MM-DD')
    await seedMonthlyDate('emp-1', previousWorkday)
    const leave = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: previousWorkday, endDate: previousWorkday, unit: 'FULL_DAY', reason: '上月请假' })
    expect(leave.status).toBe('PENDING')
    const todayRecord = (await mockGetAttendance({ employeeId: 'emp-1', month: currentMonth }))[0]
    await mockSaveAttendance({ ...todayRecord, checkInAt: `${todayRecord.date}T08:00:00+08:00`, checkOutAt: `${todayRecord.date}T17:00:00+08:00`, overtimeMinutes: 150 }, todayRecord.id)

    const overview = await mockGetOverview(currentMonth)
    expect(overview.pendingLeaves).toBe(1) // seeded current-month leave only; previous month must not add another blocker
    expect(overview.overtimeHours).toBe(3.5)

    await mockGeneratePayroll(currentMonth)
    const generatedOverview = await mockGetOverview(currentMonth)
    expect(generatedOverview.issues.filter((issue) => issue.includes('请假待审批'))).toHaveLength(1)
    expect(generatedOverview.issueCount).toBe(generatedOverview.issues.length)

    const currentWorkday = dayjs(`${currentMonth}-01`).day(1).month() === dayjs(`${currentMonth}-01`).month()
      ? dayjs(`${currentMonth}-01`).day(1).format('YYYY-MM-DD')
      : dayjs(`${currentMonth}-01`).add(1, 'week').day(1).format('YYYY-MM-DD')
    const secondPending = await mockSaveLeave({
      employeeId: 'emp-2', leaveTypeId: 'leave-type-rest', startDate: currentWorkday, endDate: currentWorkday,
      unit: 'FULL_DAY', reason: '新增待审批请假'
    })
    const increasedOverview = await mockGetOverview(currentMonth)
    expect(increasedOverview.pendingLeaves).toBe(2)
    expect(increasedOverview.issues.filter((issue) => issue.includes('请假待审批'))).toEqual(['2 条请假待审批'])

    await mockReviewLeave('leave-1', 'APPROVED')
    await mockReviewLeave(secondPending.id, 'APPROVED')
    const clearedOverview = await mockGetOverview(currentMonth)
    expect(clearedOverview.pendingLeaves).toBe(0)
    expect(clearedOverview.issues.some((issue) => issue.includes('请假待审批'))).toBe(false)
  })

  it('restricts referenced type edits while allowing records to retain the same inactive type', async () => {
    await expect(mockSaveLeaveType({ name: '改名事假', active: true, countsTowardRestQuota: true }, 'leave-type-rest')).rejects.toThrow('已使用')
    const disabled = await mockSaveCommissionType({ name: '送样提成', unitName: '份', unitPrice: 12, active: false }, 'ct-1')
    expect(disabled.active).toBe(false)
    const existing = (await mockGetCommissions())[0]
    await expect(mockSaveCommission({ ...existing, commissionTypeId: 'ct-1', quantity: 9 }, existing.id)).resolves.toBeTruthy()
    const other = await mockSaveCommissionType({ name: '停用新类型', unitName: '份', unitPrice: 1, active: false })
    await expect(mockSaveCommission({ ...existing, commissionTypeId: other.id }, existing.id)).rejects.toThrow('已停用')
  })

  it('enforces pending-only leave mutations, unique type names and confirmed-month checks on both sides of date moves', async () => {
    const month = dayjs().format('YYYY-MM')
    const today = dayjs().format('YYYY-MM-DD')
    const nextMonth = dayjs().add(1, 'month').format('YYYY-MM')
    let nextWorkday = dayjs(`${nextMonth}-01`)
    while (nextWorkday.day() === 0 || nextWorkday.day() === 6) nextWorkday = nextWorkday.add(1, 'day')
    const nextDate = nextWorkday.format('YYYY-MM-DD')
    await seedMonthlyDate('emp-1', nextDate)

    await expect(mockSaveLeaveType({ name: '事假', active: true, countsTowardRestQuota: true })).rejects.toThrow('名称已存在')
    await expect(mockSaveCommissionType({ name: '送样提成', unitName: '份', unitPrice: 10, active: true })).rejects.toThrow('名称已存在')
    await mockReviewLeave('leave-1', 'APPROVED')
    await expect(mockSaveLeave({ employeeId: 'emp-2', leaveTypeId: 'leave-type-rest', startDate: today, endDate: today, unit: 'FULL_DAY', reason: '修改' }, 'leave-1')).rejects.toThrow('已处理')
    await expect(mockDeleteLeave('leave-1')).rejects.toThrow('已处理')

    const currentOverride = await mockSaveDateOverride({ employeeId: 'emp-1', date: today, isWorkday: false, scheduledMinutes: 0 })
    const nextOverride = await mockSaveDateOverride({ employeeId: 'emp-1', date: nextDate, isWorkday: true, scheduledMinutes: 480, plannedStartTime: '08:00', plannedEndTime: '16:00' })
    const nextAttendance = await mockSaveAttendance({ employeeId: 'emp-1', date: nextDate, isScheduledWorkday: true, scheduledMinutes: 480, absenceMinutes: 480, overtimeMinutes: 0 })
    const nextLeave = await mockSaveLeave({ employeeId: 'emp-1', leaveTypeId: 'leave-type-rest', startDate: nextDate, endDate: nextDate, unit: 'FULL_DAY', reason: '下月请假' })
    const currentCommission = await mockSaveCommission({ employeeId: 'emp-1', commissionTypeId: 'ct-1', date: today, quantity: 2 })
    const nextCommission = await mockSaveCommission({ employeeId: 'emp-1', commissionTypeId: 'ct-1', date: nextDate, quantity: 1 })
    const currentBonus = await mockSaveBonus({ employeeId: 'emp-1', date: today, amount: 20, reason: '本月奖金' })
    const nextBonus = await mockSaveBonus({ employeeId: 'emp-1', date: nextDate, amount: 10, reason: '下月奖金' })
    await mockSaveMonthlySetting({ employeeId: 'emp-1', month, restQuotaDays: 4 })
    await mockSaveMonthlySetting({ employeeId: 'emp-2', month, restQuotaDays: 4 })
    await mockConfirmPayroll((await mockGeneratePayroll(month)).id)

    const currentAttendance = (await mockGetAttendance({ employeeId: 'emp-1', month }))[0]
    const moveChecks = [
      () => mockSaveDateOverride({ ...currentOverride, date: nextDate }, currentOverride.id),
      () => mockSaveDateOverride({ ...nextOverride, date: today }, nextOverride.id),
      () => mockSaveAttendance({ ...currentAttendance, date: nextDate }, currentAttendance.id),
      () => mockSaveAttendance({ ...nextAttendance, date: today }, nextAttendance.id),
      () => mockSaveLeave({ ...nextLeave, startDate: today, endDate: today }, nextLeave.id),
      () => mockSaveCommission({ ...currentCommission, date: nextDate }, currentCommission.id),
      () => mockSaveCommission({ ...nextCommission, date: today }, nextCommission.id),
      () => mockSaveBonus({ ...currentBonus, date: nextDate }, currentBonus.id),
      () => mockSaveBonus({ ...nextBonus, date: today }, nextBonus.id)
    ]
    for (const move of moveChecks) await expect(move()).rejects.toThrow('工资已确认')

    const nextDraft = await mockGeneratePayroll(nextMonth)
    await expect(mockReopenPayroll(nextDraft.id, '错误状态')).rejects.toThrow('只有已确认工资')
    const reopened = await mockReopenPayroll((await mockGetPayroll(month))!.id, '补录')
    await expect(mockReopenPayroll(reopened.id, '再次撤销')).rejects.toThrow('只有已确认工资')
  })
})
