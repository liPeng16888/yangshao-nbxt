import { defineComponent, nextTick } from 'vue'
import dayjs from 'dayjs'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import appRouter from '@/router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { accessGuardFeatures, featureForPath } from '@/router/guards'
import * as attendanceApi from '@/api/employeeAttendance'
import { mockCreateEmployee, mockGetAttendance, mockSaveAttendance, resetEmployeeAttendanceMock } from '@/mocks/employeeAttendance'
import { useEmployeeAttendanceStore } from '@/stores/employeeAttendance'
import { useAccessGuardStore } from '@/stores/accessGuard'
import EmployeeAttendanceOverviewPage from './employee-attendance/EmployeeAttendanceOverviewPage.vue'
import EmployeeDirectoryPage from './employee-attendance/EmployeeDirectoryPage.vue'
import EmployeeSchedulesPage from './employee-attendance/EmployeeSchedulesPage.vue'
import EmployeeAttendanceRecordsPage from './employee-attendance/EmployeeAttendanceRecordsPage.vue'
import EmployeeLeavePage from './employee-attendance/EmployeeLeavePage.vue'
import EmployeeCompensationPage from './employee-attendance/EmployeeCompensationPage.vue'
import EmployeePayrollPage from './employee-attendance/EmployeePayrollPage.vue'

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
    key: (index: number) => Array.from(values.keys())[index] ?? null, get length() { return values.size }
  } satisfies Storage })
  resetEmployeeAttendanceMock()
})

describe('employee attendance navigation', () => {
  it('adds seven exact routes and positions the menu between lab report and finance', async () => {
    expect(appRouter.getRoutes().map((route) => route.path)).toEqual(expect.arrayContaining([
      '/employee-attendance/overview', '/employee-attendance/employees', '/employee-attendance/schedules',
      '/employee-attendance/records', '/employee-attendance/leave', '/employee-attendance/compensation',
      '/employee-attendance/payroll'
    ]))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: defineComponent({ template: '<div />' }) }] })
    await router.push('/employee-attendance/overview')
    const wrapper = mount(AppSidebar, { props: { collapsed: false }, global: { plugins: [router, ElementPlus] } })
    const text = wrapper.text()
    expect(text.indexOf('化验报告')).toBeLessThan(text.indexOf('员工考勤'))
    expect(text.indexOf('员工考勤')).toBeLessThan(text.indexOf('财务'))
    expect(wrapper.findAll('.side-nav__child').map((node) => node.text())).toEqual([
      '考勤概览', '员工档案', '排班管理', '考勤记录', '请假管理', '提成与奖金', '工资统计'
    ])
  })

  it('protects every attendance route with its own access feature', () => {
    expect(accessGuardFeatures).toContain('EMPLOYEE_ATTENDANCE')
    expect(featureForPath('/employee-attendance/payroll')).toBe('EMPLOYEE_ATTENDANCE')
  })

  it('labels the overview overtime card as the selected-month total and removes unsupported terminated status', async () => {
    const overview = mount(EmployeeAttendanceOverviewPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    expect(overview.text()).toContain('本月加班总时长')
    overview.unmount()

    const directory = mount(EmployeeDirectoryPage, { global: { plugins: [createPinia(), ElementPlus], stubs: { teleport: true, 'el-select': true, 'el-option': true, 'el-date-picker': true, 'el-input-number': true } } })
    await flushPromises()
    expect(directory.text()).not.toContain('TERMINATED')
    expect(directory.html()).not.toContain('value="TERMINATED"')
    directory.unmount()
  })

  it('renders all seven management pages with loading completion and meaningful empty/sample states', async () => {
    const pages = [
      [EmployeeAttendanceOverviewPage, '考勤概览'], [EmployeeDirectoryPage, '员工档案'],
      [EmployeeSchedulesPage, '排班管理'], [EmployeeAttendanceRecordsPage, '考勤记录'],
      [EmployeeLeavePage, '请假管理'], [EmployeeCompensationPage, '提成与奖金'], [EmployeePayrollPage, '工资统计']
    ] as const
    for (const [component, title] of pages) {
      const wrapper = mount(component, { global: { plugins: [createPinia(), ElementPlus] } })
      await flushPromises()
      expect(wrapper.text()).toContain(title)
      expect(wrapper.find('.attendance-error').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('keeps employee form values on mutation failure and initializes sensitive edit fields blank', async () => {
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [createPinia(), ElementPlus], stubs: { teleport: true, 'el-select': true, 'el-option': true, 'el-date-picker': true, 'el-input-number': true } } })
    await flushPromises()

    await wrapper.get('[data-testid="edit-employee-emp-1"]').trigger('click')
    expect((wrapper.get('[data-testid="employee-id-card"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('[data-testid="employee-bank-card"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain('离职日期')

    const createButton = wrapper.findAll('button').find(node => node.text() === '新增员工')!
    await createButton.trigger('click')
    await wrapper.get('[data-testid="employee-number"]').setValue('YG001')
    await wrapper.get('[data-testid="employee-name"]').setValue('重复员工')
    await wrapper.get('[data-testid="employee-id-card"]').setValue('410000198812121234')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('员工编号已存在')
    expect((wrapper.get('[data-testid="employee-name"]').element as HTMLInputElement).value).toBe('重复员工')
    expect((wrapper.get('[data-testid="employee-id-card"]').element as HTMLInputElement).value).toBe('410000198812121234')
    wrapper.unmount()
  })

  it('loads an existing monthly rest quota and clears stale values for an employee without a setting', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    await flushPromises()
    store.employeeId = 'emp-1'
    await flushPromises()
    expect((wrapper.get('[data-testid="month-rest-quota"] input').element as HTMLInputElement).value).toBe('4')
    expect(wrapper.text()).toContain('排班工作日')

    const employee = await mockCreateEmployee({ employeeNumber: 'YG777', name: '无月设置员工', status: 'ACTIVE', hireDate: '2026-08-01', restQuotaDays: 3 })
    await store.loadEmployees()
    store.employeeId = employee.id
    await flushPromises()
    expect((wrapper.get('[data-testid="month-rest-quota"] input').element as HTMLInputElement).value).toBe('3')
    wrapper.unmount()
  })

  it('renders a month calendar and edits multiple intervals in the day drawer', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    await flushPromises()
    store.employeeId = 'emp-1'
    await flushPromises()
    expect(wrapper.find('[data-testid="monthly-schedule-calendar"]').exists()).toBe(true)
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).toContain('添加工作时段')
    expect(wrapper.get('[data-testid="schedule-day-drawer"]').attributes('aria-label')).toBe('每日排班编辑')
    await wrapper.get('[data-testid="add-planned-interval"]').trigger('click')
    expect(wrapper.findAll('[data-testid="planned-interval"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('休息 60 分钟')
    expect(wrapper.text()).toContain('工作 8.5 小时')
    wrapper.unmount()
  })

  it('confirms the count before fully overwriting selected dates', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    await flushPromises()
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-date="2026-08-04"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    expect(wrapper.text()).toContain('将完整覆盖 2 个日期')
    wrapper.unmount()
  })

  it('copies the previous month only after overwrite confirmation', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    await flushPromises()
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="copy-previous-month"]').trigger('click')
    expect(wrapper.text()).toContain('覆盖当前月已有排班')
    wrapper.unmount()
  })

  it('keeps the latest employee/month response when an older schedule request resolves last', async () => {
    let resolveFirst!: (rows: any[]) => void
    let resolveSecond!: (rows: any[]) => void
    const first = new Promise<any[]>((resolve) => { resolveFirst = resolve })
    const second = new Promise<any[]>((resolve) => { resolveSecond = resolve })
    const schedules = vi.spyOn(attendanceApi, 'getMonthlySchedules')
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second)
    vi.spyOn(attendanceApi, 'getMonthlySettings').mockResolvedValue([])
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    store.employeeId = 'emp-2'
    await flushPromises()
    resolveSecond([{ id: 'new', employeeId: 'emp-2', date: '2026-08-03', isWorkday: false, segments: [], scheduledMinutes: 0, breakMinutes: 0 }])
    await flushPromises()
    resolveFirst([{ id: 'old', employeeId: 'emp-1', date: '2026-08-03', isWorkday: true, segments: [{ startTime: '08:00', endTime: '16:00' }], scheduledMinutes: 480, breakMinutes: 0 }])
    await flushPromises()

    expect(schedules).toHaveBeenCalledTimes(2)
    expect(store.monthlySchedules).toEqual([expect.objectContaining({ id: 'new', employeeId: 'emp-2' })])
    wrapper.unmount()
    schedules.mockRestore()
  })

  it('does not surface a late failure from an obsolete employee/month request', async () => {
    let rejectFirst!: (error: Error) => void
    let resolveSecond!: (rows: any[]) => void
    const first = new Promise<any[]>((_resolve, reject) => { rejectFirst = reject })
    const second = new Promise<any[]>((resolve) => { resolveSecond = resolve })
    const schedules = vi.spyOn(attendanceApi, 'getMonthlySchedules')
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second)
    vi.spyOn(attendanceApi, 'getMonthlySettings').mockResolvedValue([])
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    store.employeeId = 'emp-2'
    await flushPromises()
    resolveSecond([{ id: 'new-success', employeeId: 'emp-2', date: '2026-08-03', isWorkday: false, segments: [], scheduledMinutes: 0, breakMinutes: 0 }])
    await flushPromises()
    rejectFirst(new Error('旧请求失败'))
    await flushPromises()

    expect(store.monthlySchedules).toEqual([expect.objectContaining({ id: 'new-success', employeeId: 'emp-2' })])
    expect(store.error).toBe('')
    wrapper.unmount()
    schedules.mockRestore()
  })

  it('does not request schedules with an empty month and restores a valid month', async () => {
    const schedules = vi.spyOn(attendanceApi, 'getMonthlySchedules')
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.employeeId = 'emp-1'
    store.selectMonth('')
    await flushPromises()
    expect(store.month).toMatch(/^\d{4}-\d{2}$/)
    expect(schedules).not.toHaveBeenCalledWith('emp-1', '')
    wrapper.unmount()
    schedules.mockRestore()
  })

  it('saves and deletes the selected daily schedule using its calendar payload', async () => {
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockImplementation(async (payload) => ({ id: 'saved', ...payload, scheduledMinutes: 480, breakMinutes: 0 }))
    const remove = vi.spyOn(attendanceApi, 'deleteMonthlyScheduleDay').mockResolvedValue()
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    const drawer = wrapper.get('[data-testid="schedule-day-drawer"]')
    await drawer.findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'emp-1', date: '2026-08-03', isWorkday: true, segments: [expect.objectContaining({ startTime: '08:00', endTime: '16:00' })] }))

    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '删除当天排班')!.trigger('click')
    await flushPromises()
    expect(remove).toHaveBeenCalledWith('monthly-emp-1-2026-08-03')
    wrapper.unmount()
    save.mockRestore(); remove.mockRestore()
  })

  it('rejects a locally invalid interval without discarding the edited values', async () => {
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay')
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    const timeControls = wrapper.get('[data-testid="schedule-day-drawer"]').findAllComponents({ name: 'ElTimeSelect' })
    timeControls[0]!.vm.$emit('update:modelValue', '18:00')
    await nextTick()
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).toContain('下班时间晚于上班时间')
    expect((timeControls[0]!.vm as any).modelValue).toBe('18:00')
    wrapper.unmount()
    save.mockRestore()
  })

  it('confirms a batch payload before saving and clears the selected dates on success', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const saveBatch = vi.spyOn(attendanceApi, 'batchSaveMonthlySchedules').mockResolvedValue({ rows: [], updated: 2, overwritten: 2 })
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-date="2026-08-04"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    await wrapper.findAll('button').find((node) => node.text() === '确认批量覆盖')!.trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalled()
    expect(saveBatch).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'emp-1', dates: ['2026-08-03', '2026-08-04'] }))
    expect(wrapper.find('[data-testid="apply-batch"]').exists()).toBe(false)
    wrapper.unmount()
    confirm.mockRestore(); saveBatch.mockRestore()
  })

  it('shows a copy failure without closing the confirmation and refreshes after a successful copy', async () => {
    const copy = vi.spyOn(attendanceApi, 'copyPreviousMonthSchedules')
      .mockRejectedValueOnce(new Error('上月暂无可复制排班'))
      .mockResolvedValueOnce({ copied: 22, targetMonth: '2026-08' })
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="copy-previous-month"]').trigger('click')
    const copyButton = () => wrapper.findAll('button').find((node) => node.text().startsWith('确认复制'))!
    await copyButton().trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('上月暂无可复制排班')
    await copyButton().trigger('click')
    await flushPromises()
    expect(copy).toHaveBeenLastCalledWith('emp-1', '2026-08', true)
    expect(wrapper.text()).not.toContain('上月暂无可复制排班')
    wrapper.unmount()
    copy.mockRestore()
  })

  it('visibly switches the records page between mutually exclusive month and date-range filters', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    await flushPromises()
    store.selectDateRange('2026-07-01', '2026-07-31')
    await nextTick()

    const monthPicker = wrapper.findAllComponents({ name: 'ElDatePicker' }).find((node) => node.props('type') === 'month')!
    monthPicker.vm.$emit('update:modelValue', '2026-08')
    await nextTick()
    expect(store.month).toBe('2026-08')
    expect(store.startDate).toBe('')
    expect(store.endDate).toBe('')

    const startPicker = wrapper.findAllComponents({ name: 'ElDatePicker' }).find((node) => node.props('placeholder') === '开始日期')!
    startPicker.vm.$emit('update:modelValue', '2026-08-10')
    await nextTick()
    expect(store.month).toBe('2026-08')
    expect(store.startDate).toBe('2026-08-10')
    wrapper.unmount()

    for (const component of [EmployeeLeavePage, EmployeeCompensationPage]) {
      const pagePinia = createPinia()
      const page = mount(component, { global: { plugins: [pagePinia, ElementPlus] } })
      const pageStore = useEmployeeAttendanceStore(pagePinia)
      await flushPromises()
      const pageStart = page.findAllComponents({ name: 'ElDatePicker' }).find((node) => node.props('placeholder') === '开始日期')!
      pageStart.vm.$emit('update:modelValue', '2026-08-10')
      await nextTick()
      expect(pageStore.month).not.toBe('')
      page.unmount()
    }
  })

  it('keeps every actual attendance segment when saving an unchanged legacy edit form', async () => {
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const segments = [
      { checkInAt: `${existing.date}T08:00:00+08:00`, checkOutAt: `${existing.date}T12:00:00+08:00` },
      { checkInAt: `${existing.date}T13:00:00+08:00`, checkOutAt: `${existing.date}T17:00:00+08:00` }
    ]
    await mockSaveAttendance({ employeeId: existing.employeeId, date: existing.date, actualSegments: segments, explicitAbsenceMinutes: 0, overtimeMinutes: 0 }, existing.id)
    const spy = vi.spyOn(attendanceApi, 'saveAttendance')
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.findAll('button').find((node) => node.text() === '编辑')!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await flushPromises()

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      actualSegments: [
        expect.objectContaining({ checkInAt: `${existing.date}T08:00`, checkOutAt: `${existing.date}T12:00` }),
        expect.objectContaining({ checkInAt: `${existing.date}T13:00`, checkOutAt: `${existing.date}T17:00` })
      ]
    }), existing.id)
    spy.mockRestore()
    wrapper.unmount()
  })

  it('renders and edits a legacy attendance response without actualSegments', async () => {
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const legacy = { ...existing } as Record<string, unknown>
    delete legacy.actualSegments
    const request = vi.spyOn(attendanceApi, 'getAttendance').mockResolvedValue([legacy as any])
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    expect(wrapper.text()).toContain('未手工录入（默认正常）')
    await wrapper.get('[data-testid="edit-attendance-emp-1"]').trigger('click')
    expect(wrapper.text()).toContain('默认正常出勤')
    request.mockRestore()
    wrapper.unmount()
  })

  it('shows default normal attendance and lets an administrator add actual intervals', async () => {
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const save = vi.spyOn(attendanceApi, 'saveAttendance')
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    expect(wrapper.text()).toContain('默认正常出勤')
    await wrapper.get('[data-testid="edit-attendance-emp-1"]').trigger('click')
    await wrapper.get('[data-testid="add-actual-interval"]').trigger('click')
    expect(wrapper.findAll('[data-testid="actual-interval"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('迟到和早退由实际出勤时间计算')
    expect(wrapper.text()).not.toContain('按排班批量生成')

    const controls = wrapper.findAll('[data-testid="actual-interval"]').flatMap((row) => row.findAllComponents({ name: 'ElDatePicker' }))
    ;(controls[1]! as any).vm.$emit('update:modelValue', `${existing.date}T12:00`)
    ;(controls[2]! as any).vm.$emit('update:modelValue', `${existing.date}T13:00`)
    ;(controls[3]! as any).vm.$emit('update:modelValue', `${existing.date}T16:00`)
    await wrapper.findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      actualSegments: [
        expect.objectContaining({ checkInAt: `${existing.date}T08:02`, checkOutAt: `${existing.date}T12:00` }),
        expect.objectContaining({ checkInAt: `${existing.date}T13:00`, checkOutAt: `${existing.date}T16:00` })
      ]
    }), existing.id)
    save.mockRestore()
    wrapper.unmount()
  })

  it('filters leave records by multiple employees and treats empty selection as all', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const request = vi.spyOn(attendanceApi, 'getLeaves')
    request.mockClear()

    const select = wrapper.getComponent<any>('[data-testid="leave-employee-filter"]')
    select.vm.$emit('update:modelValue', ['emp-1'])
    select.vm.$emit('change', ['emp-1'])
    await flushPromises()
    expect(useEmployeeAttendanceStore(pinia).leaveEmployeeIds).toEqual(['emp-1'])
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ employeeIds: ['emp-1'] }))
    expect(useEmployeeAttendanceStore(pinia).leaves.every((row) => row.employeeId === 'emp-1')).toBe(true)

    select.vm.$emit('update:modelValue', [])
    select.vm.$emit('change', [])
    await flushPromises()
    expect(useEmployeeAttendanceStore(pinia).leaveEmployeeIds).toEqual([])
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ employeeIds: [] }))
    expect(new Set(useEmployeeAttendanceStore(pinia).leaves.map((row) => row.employeeId)).size).toBeGreaterThan(1)
    request.mockRestore()
    wrapper.unmount()
  })

  it('keeps invalid same-day actual interval values visible and never submits them', async () => {
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const save = vi.spyOn(attendanceApi, 'saveAttendance')
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    const edit = async () => {
      await wrapper.get('[data-testid="edit-attendance-emp-1"]').trigger('click')
      await flushPromises()
      return wrapper.findAll('[data-testid="actual-interval"]')[0]!.findAllComponents({ name: 'ElDatePicker' })
    }
    const submitInvalid = async (message: string) => {
      await wrapper.findAll('button').find((node) => node.text() === '保存')!.trigger('click')
      await flushPromises()
      expect(save).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain(message)
    }

    const otherDate = dayjs(existing.date).add(1, 'day').format('YYYY-MM-DD')
    let controls = await edit()
    ;(controls[0]! as any).vm.$emit('update:modelValue', `${otherDate}T08:00`)
    await submitInvalid('必须在所选日期内')
    expect((controls[0]! as any).vm.modelValue).toBe(`${otherDate}T08:00`)

    controls = await edit()
    ;(controls[0]! as any).vm.$emit('update:modelValue', `${existing.date}T18:00`)
    ;(controls[1]! as any).vm.$emit('update:modelValue', `${existing.date}T08:00`)
    await submitInvalid('下班时间必须晚于上班时间')
    expect((controls[0]! as any).vm.modelValue).toBe(`${existing.date}T18:00`)

    controls = await edit()
    ;(controls[0]! as any).vm.$emit('update:modelValue', `${existing.date}T24:00`)
    await submitInvalid('不支持 24:00')
    expect((controls[0]! as any).vm.modelValue).toBe(`${existing.date}T24:00`)

    controls = await edit()
    await wrapper.get('[data-testid="add-actual-interval"]').trigger('click')
    const intervalControls = wrapper.findAll('[data-testid="actual-interval"]').flatMap((row) => row.findAllComponents({ name: 'ElDatePicker' }))
    ;(intervalControls[1]! as any).vm.$emit('update:modelValue', `${existing.date}T12:00`)
    ;(intervalControls[2]! as any).vm.$emit('update:modelValue', `${existing.date}T11:00`)
    ;(intervalControls[3]! as any).vm.$emit('update:modelValue', `${existing.date}T16:00`)
    await submitInvalid('重叠或顺序错误')
    expect((intervalControls[2]! as any).vm.modelValue).toBe(`${existing.date}T11:00`)

    save.mockRestore()
    wrapper.unmount()
  })

  it('saves an explicit absence and manual overtime without actual intervals', async () => {
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const save = vi.spyOn(attendanceApi, 'saveAttendance')
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="edit-attendance-emp-1"]').trigger('click')
    await wrapper.get('[data-testid="actual-interval"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('默认正常出勤')

    const absence = wrapper.getComponent<any>('[data-testid="attendance-explicit-absence"]')
    const overtime = wrapper.getComponent<any>('[data-testid="attendance-overtime"]')
    absence.vm.$emit('update:modelValue', 120)
    overtime.vm.$emit('update:modelValue', 45)
    await wrapper.findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: existing.employeeId, date: existing.date, actualSegments: [], explicitAbsenceMinutes: 120, overtimeMinutes: 45
    }), existing.id)
    save.mockRestore()
    wrapper.unmount()
  })

  it('restores a valid month when navigating from date filtering to monthly pages', async () => {
    const pinia = createPinia()
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')

    for (const component of [EmployeeAttendanceOverviewPage, EmployeeSchedulesPage, EmployeePayrollPage]) {
      store.selectDateRange('2026-07-01', '2026-07-31')
      const page = mount(component, { global: { plugins: [pinia, ElementPlus] } })
      await flushPromises()
      expect(store.month).toBe('2026-08')
      expect(store.startDate).toBe('')
      expect(store.endDate).toBe('')
      expect(store.error).toBe('')
      page.unmount()
    }
  })

  it('requires a successful attendance access verification before revealing sensitive employee values', async () => {
    window.localStorage.setItem('ys_mock_access_guard_groups', JSON.stringify([{
      id: 'attendance-group', name: '员工考勤验证', enabled: true, ttlMinutes: 5, password: '1234',
      recoveryPrompt: '', recoveryAnswer: '', features: ['EMPLOYEE_ATTENDANCE']
    }]))
    const pinia = createPinia()
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [pinia, ElementPlus], stubs: { teleport: true, 'el-select': true, 'el-option': true, 'el-date-picker': true, 'el-input-number': true } } })
    await flushPromises()
    await wrapper.findAll('button').find((node) => node.text() === '查看敏感信息')!.trigger('click')
    await flushPromises()
    const access = useAccessGuardStore(pinia)
    expect(access.dialogVisible).toBe(true)
    await expect(access.verifyPassword('wrong')).resolves.toMatchObject({ ok: false, message: '访问密码不正确' })
    expect(wrapper.text()).not.toContain('410000199001011234')
    await expect(access.verifyPassword('1234')).resolves.toMatchObject({ ok: true })
    await flushPromises()
    expect(wrapper.text()).toContain('410000199001011234')
    wrapper.unmount()
  })

  it('retains a non-employee form value and surfaces the error when a leave-type mutation fails', async () => {
    const pinia = createPinia()
    const passThrough = { template: '<div><slot /></div>' }
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus], stubs: {
      teleport: true, 'el-tabs': passThrough, 'el-tab-pane': passThrough, 'el-table': true, 'el-table-column': true,
      'el-select': true, 'el-option': true, 'el-date-picker': true, 'el-input-number': true, 'el-switch': true
    } } })
    await flushPromises()
    const input = wrapper.get('input[placeholder="类型名称"]')
    await input.setValue('事假')
    await wrapper.findAll('button').find((node) => node.text() === '新增类型')!.trigger('click')
    await flushPromises()
    expect(useEmployeeAttendanceStore(pinia).error).toContain('名称已存在')
    expect((input.element as HTMLInputElement).value).toBe('事假')
    wrapper.unmount()
  })

  it('marks referenced leave and commission types as immutable while keeping their one-way deactivate action', async () => {
    for (const component of [EmployeeLeavePage, EmployeeCompensationPage]) {
      const wrapper = mount(component, { global: { plugins: [createPinia(), ElementPlus] } })
      await flushPromises()
      expect(wrapper.text()).toContain('已使用，仅可停用')
      expect(wrapper.text()).toContain('删除/停用')
      wrapper.unmount()
    }
  })

  it('opens the payroll export dialog in summary and selected-employee modes', async () => {
    const pinia = createPinia()
    const PayrollExportDialogStub = defineComponent({
      name: 'PayrollExportDialog',
      props: { visible: Boolean, run: Object, item: Object },
      emits: ['close'],
      template: '<div v-if="visible" data-testid="payroll-export-dialog" />'
    })
    const wrapper = mount(EmployeePayrollPage, {
      global: { plugins: [pinia, ElementPlus], stubs: { PayrollExportDialog: PayrollExportDialogStub } }
    })
    const store = useEmployeeAttendanceStore(pinia)
    await flushPromises()
    const employee = store.employees[0]
    const item = {
      id: 'payroll-item-1', employeeId: employee.id, employee, payableAmount: 6200, issues: [], adjustments: [],
      calculationSnapshot: {
        generatedAt: '2026-08-31T00:00:00.000Z',
        input: { baseSalary: 6000, attendanceBonus: 200, scheduledWorkDays: 22, restQuotaDays: 4, countedLeaveDays: 0, absenceDays: 0, overtimeMinutes: 0, overtimeHourlyRate: 20, commissionAmount: 0, bonusAmount: 0, adjustments: [] },
        result: { dailyRate: 272.73, excessLeaveDays: 0, leaveDeduction: 0, absenceDeduction: 0, overtimeHours: 0, overtimePay: 0, commissionAmount: 0, bonusAmount: 0, adjustmentAmount: 0, attendanceBonus: 200, payableAmount: 6200, issues: [] }
      }
    }
    store.payroll = { id: 'run-1', month: '2026-08', status: 'DRAFT', totalAmount: 6200, issueCount: 0, issues: [], items: [item] }
    await nextTick()

    await wrapper.get('[data-testid="export-payroll-summary"]').trigger('click')
    let dialog = wrapper.getComponent(PayrollExportDialogStub)
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('run')).toEqual(store.payroll)
    expect(dialog.props('item')).toBeNull()

    dialog.vm.$emit('close')
    await nextTick()
    await wrapper.get('[data-testid="export-payroll-slip"]').trigger('click')
    dialog = wrapper.getComponent(PayrollExportDialogStub)
    expect(dialog.props('visible')).toBe(true)
    expect(dialog.props('item')).toEqual(item)
    wrapper.unmount()
  })

  it('visibly blocks payroll confirmation while the selected-month draft has issues', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeePayrollPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    await flushPromises()
    store.payroll = {
      id: 'blocked-run', month: '2026-08', status: 'DRAFT', totalAmount: 0, issueCount: 1,
      issues: ['1 条请假待审批'], items: []
    }
    await nextTick()

    const confirmButton = wrapper.findAll('button').find((node) => node.text().includes('确认工资并锁定'))!
    expect(confirmButton.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('1 条请假待审批')
    wrapper.unmount()
  })
})
