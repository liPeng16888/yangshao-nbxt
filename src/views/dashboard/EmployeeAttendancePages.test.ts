import { defineComponent, nextTick, ref } from 'vue'
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
import EmployeeDirectoryPage from './employee-attendance/EmployeeDirectoryPage.vue'
import EmployeeSchedulesPage from './employee-attendance/EmployeeSchedulesPage.vue'
import EmployeeAttendanceRecordsPage from './employee-attendance/EmployeeAttendanceRecordsPage.vue'
import EmployeeLeavePage from './employee-attendance/EmployeeLeavePage.vue'
import EmployeeCompensationPage from './employee-attendance/EmployeeCompensationPage.vue'
import EmployeePayrollPage from './employee-attendance/EmployeePayrollPage.vue'

const attendanceLayout = vi.hoisted(() => ({ mobile: undefined as unknown as ReturnType<typeof ref<boolean>> }))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: attendanceLayout.mobile })
}))

beforeEach(() => {
  attendanceLayout.mobile = ref(false)
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
    key: (index: number) => Array.from(values.keys())[index] ?? null, get length() { return values.size }
  } satisfies Storage })
  resetEmployeeAttendanceMock()
})

describe('employee attendance navigation', () => {
  it('adds six exact routes, redirects old overview links, and positions the merged menu between lab report and finance', async () => {
    expect(appRouter.getRoutes().map((route) => route.path)).toEqual(expect.arrayContaining([
      '/employee-attendance/overview', '/employee-attendance/employees', '/employee-attendance/schedules',
      '/employee-attendance/records', '/employee-attendance/leave', '/employee-attendance/compensation',
      '/employee-attendance/payroll'
    ]))
    expect(appRouter.resolve('/employee-attendance').redirectedFrom).toBeUndefined()
    const attendanceRoot = appRouter.getRoutes().find((route) => route.path === '/employee-attendance')
    const oldOverview = appRouter.getRoutes().find((route) => route.path === '/employee-attendance/overview')
    expect(attendanceRoot?.redirect).toBe('/employee-attendance/schedules')
    expect(oldOverview?.redirect).toBe('/employee-attendance/schedules')
    expect(appRouter.resolve('/employee-attendance/schedules').meta.title).toBe('排班考勤概览')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: defineComponent({ template: '<div />' }) }] })
    await router.push('/employee-attendance/overview')
    const wrapper = mount(AppSidebar, { props: { collapsed: false }, global: { plugins: [router, ElementPlus] } })
    const text = wrapper.text()
    expect(text.indexOf('化验报告')).toBeLessThan(text.indexOf('员工考勤'))
    expect(text.indexOf('员工考勤')).toBeLessThan(text.indexOf('财务'))
    expect(wrapper.findAll('.side-nav__child').map((node) => node.text())).toEqual([
      '排班考勤概览', '员工档案', '考勤记录', '请假管理', '提成与奖金', '工资统计'
    ])
    expect(wrapper.findAll('.side-nav__child').map((node) => node.attributes('href'))).toEqual([
      '/employee-attendance/schedules', '/employee-attendance/employees', '/employee-attendance/records',
      '/employee-attendance/leave', '/employee-attendance/compensation', '/employee-attendance/payroll'
    ])
    expect(wrapper.findAll('.side-nav__child').some((node) => node.text() === '考勤概览')).toBe(false)
    expect(wrapper.findAll('.side-nav__child').some((node) => node.text() === '排班管理')).toBe(false)
  })

  it('protects every attendance route with its own access feature', () => {
    expect(accessGuardFeatures).toContain('EMPLOYEE_ATTENDANCE')
    expect(featureForPath('/employee-attendance/payroll')).toBe('EMPLOYEE_ATTENDANCE')
  })

  it('labels the merged overview overtime card as the selected-month total and removes unsupported terminated status', async () => {
    const overview = mount(EmployeeSchedulesPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    expect(overview.text()).toContain('本月加班总时长')
    overview.unmount()
    const directory = mount(EmployeeDirectoryPage, { global: { plugins: [createPinia(), ElementPlus], stubs: { teleport: true, 'el-select': true, 'el-option': true, 'el-date-picker': true, 'el-input-number': true } } })
    await flushPromises()
    expect(directory.text()).not.toContain('TERMINATED')
    expect(directory.html()).not.toContain('value="TERMINATED"')
    directory.unmount()
  })

  it('renders all six management pages with loading completion and meaningful empty/sample states', async () => {
    const pages = [
      [EmployeeSchedulesPage, '排班考勤概览'], [EmployeeDirectoryPage, '员工档案'],
      [EmployeeAttendanceRecordsPage, '考勤记录'],
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
    expect((wrapper.get('[data-testid="employee-address"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('[data-testid="employee-emergency-contact"]').element as HTMLInputElement).value).toBe('')
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

  it('renders exclusive mobile employee cards with masked identity, avatar and photo states', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="mobile-employee-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-employee-card-emp-1"]').text()).toContain('在职')
    expect(wrapper.get('[data-testid="mobile-employee-card-emp-1"]').text()).toContain('410****1234')
    expect(wrapper.get('[data-testid="mobile-employee-card-emp-1"]').text()).toContain('张')
    expect(wrapper.get('[data-testid="mobile-employee-card-emp-1"]').text()).toContain('暂无照片')
    expect(wrapper.text()).not.toContain('410000199001011234')
    expect(wrapper.find('.el-table').exists()).toBe(false)
    wrapper.unmount()
  })

  it('filters mobile employee cards through a full-screen search and status drawer', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()

    const store = useEmployeeAttendanceStore(pinia)
    store.employees[1]!.status = 'INACTIVE'
    await nextTick()
    await wrapper.get('[data-testid="mobile-employee-filter"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-employee-keyword"]').setValue('李四')
    const status = wrapper.getComponent<any>('[data-testid="mobile-employee-status"]')
    status.vm.$emit('update:modelValue', 'INACTIVE')
    await nextTick()
    await wrapper.get('[data-testid="mobile-employee-filter"]').findAll('.mobile-filter-drawer__actions button')[1]!.trigger('click')

    expect(wrapper.findAll('[data-testid="mobile-employee-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-employee-card-emp-2"]').text()).toContain('停用/离职')
    expect(wrapper.get('[data-testid="mobile-employee-filter"]').text()).toContain('李四')
    expect(wrapper.get('[data-testid="mobile-employee-filter"]').text()).toContain('停用/离职')
    wrapper.unmount()
  })

  it('uses a full-screen mobile employee editor and retains a newer draft after an older save fails', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const create = vi.spyOn(attendanceApi, 'createEmployee').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-employee"]').trigger('click')
    expect(wrapper.getComponent({ name: 'MobileFullscreenDialog' }).props('fullscreen')).toBe(true)
    expect(wrapper.get('.employee-editor-dialog').classes()).toContain('mobile-fullscreen-dialog--active')
    expect(wrapper.get('.employee-editor-dialog').attributes('style')).toContain('100dvh')
    await wrapper.get('[data-testid="employee-number"]').setValue('YG901')
    await wrapper.get('[data-testid="employee-name"]').setValue('第一版姓名')
    await wrapper.get('[data-testid="employee-phone"]').setValue('13900009999')
    await wrapper.get('[data-testid="employee-id-card"]').setValue('410000198812121234')
    await wrapper.get('[data-testid="employee-bank-card"]').setValue('6222029999999999')
    await wrapper.get('[data-testid="employee-address"]').setValue('保存期间地址')
    await wrapper.get('[data-testid="employee-emergency-contact"]').setValue('联系人 13900008888')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    await wrapper.get('[data-testid="employee-name"]').setValue('保存期间的新姓名')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    expect(create).toHaveBeenCalledTimes(1)
    rejectSave(new Error('旧保存失败'))
    await flushPromises()

    expect((wrapper.get('[data-testid="employee-name"]').element as HTMLInputElement).value).toBe('保存期间的新姓名')
    expect((wrapper.get('[data-testid="employee-phone"]').element as HTMLInputElement).value).toBe('13900009999')
    expect((wrapper.get('[data-testid="employee-id-card"]').element as HTMLInputElement).value).toBe('410000198812121234')
    expect((wrapper.get('[data-testid="employee-bank-card"]').element as HTMLInputElement).value).toBe('6222029999999999')
    expect((wrapper.get('[data-testid="employee-address"]').element as HTMLInputElement).value).toBe('保存期间地址')
    expect((wrapper.get('[data-testid="employee-emergency-contact"]').element as HTMLInputElement).value).toBe('联系人 13900008888')
    expect(wrapper.text()).not.toContain('旧保存失败')
    wrapper.unmount()
    create.mockRestore()
  })

  it('ignores an employee save failure after closing and reopening the editor', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const create = vi.spyOn(attendanceApi, 'createEmployee').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-employee"]').trigger('click')
    await wrapper.get('[data-testid="employee-number"]').setValue('YG902')
    await wrapper.get('[data-testid="employee-name"]').setValue('旧会话')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    await wrapper.getComponent({ name: 'MobileFullscreenDialog' }).vm.$emit('update:modelValue', false)
    await wrapper.get('[data-testid="mobile-create-employee"]').trigger('click')
    await wrapper.get('[data-testid="employee-name"]').setValue('新会话')
    rejectSave(new Error('旧会话失败'))
    await flushPromises()

    expect((wrapper.get('[data-testid="employee-name"]').element as HTMLInputElement).value).toBe('新会话')
    expect(wrapper.text()).not.toContain('旧会话失败')
    wrapper.unmount()
    create.mockRestore()
  })

  it('requires a fresh access grant on mobile and owns private photo blob URLs until close', async () => {
    attendanceLayout.mobile.value = true
    window.localStorage.setItem('ys_mock_access_guard_groups', JSON.stringify([{
      id: 'attendance-group', name: '员工考勤验证', enabled: true, ttlMinutes: 5, grantVersion: 1, password: '1234',
      recoveryPrompt: '', recoveryAnswer: '', features: ['EMPLOYEE_ATTENDANCE']
    }]))
    window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify({
      'attendance-group': { groupId: 'attendance-group', grantVersion: 1, token: 'expired', expiresAt: Date.now() - 1, features: ['EMPLOYEE_ATTENDANCE'] }
    }))
    const photo = new Blob(['private-photo'], { type: 'image/png' })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const readPhoto = vi.spyOn(attendanceApi, 'readEmployeePhoto').mockResolvedValue(photo)
    const reveal = vi.spyOn(attendanceApi, 'revealEmployee')
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:employee-photo')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const pinia = createPinia()
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).employees[0]!.hasPhoto = true
    await nextTick()

    await wrapper.get('[data-testid="mobile-reveal-employee-emp-1"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="mobile-reveal-employee-emp-1"]').trigger('click')
    expect(reveal).not.toHaveBeenCalled()
    expect(useAccessGuardStore(pinia).dialogVisible).toBe(true)
    await expect(useAccessGuardStore(pinia).verifyPassword('1234')).resolves.toMatchObject({ ok: true })
    await flushPromises()
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('410000199001011234')

    await wrapper.get('[data-testid="mobile-preview-photo-emp-1"]').trigger('click')
    await flushPromises()
    expect(readPhoto).toHaveBeenCalledWith('emp-1')
    expect(createUrl).toHaveBeenCalledWith(photo)
    expect(wrapper.get('img[alt="员工照片"]').attributes('src')).toBe('blob:employee-photo')
    await wrapper.findAllComponents({ name: 'ElDialog' }).find((node) => node.props('title') === '员工私有照片')!.vm.$emit('closed')
    expect(revokeUrl).toHaveBeenCalledWith('blob:employee-photo')

    wrapper.unmount()
    readPhoto.mockRestore(); reveal.mockRestore(); createUrl.mockRestore(); revokeUrl.mockRestore()
  })

  it('does not create a private photo URL when the page unmounts before the blob arrives', async () => {
    attendanceLayout.mobile.value = true
    let resolvePhoto!: (blob: Blob) => void
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn() })
    const readPhoto = vi.spyOn(attendanceApi, 'readEmployeePhoto').mockReturnValue(new Promise((resolve) => { resolvePhoto = resolve }))
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stale-photo')
    const pinia = createPinia()
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).employees[0]!.hasPhoto = true
    await nextTick()
    await wrapper.get('[data-testid="mobile-preview-photo-emp-1"]').trigger('click')
    await wrapper.get('[data-testid="mobile-preview-photo-emp-1"]').trigger('click')
    expect(readPhoto).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    resolvePhoto(new Blob(['stale'], { type: 'image/png' }))
    await flushPromises()

    expect(createUrl).not.toHaveBeenCalled()
    readPhoto.mockRestore(); createUrl.mockRestore()
  })

  it('revokes the active employee photo preview and closes mobile dialogs on layout change', async () => {
    attendanceLayout.mobile.value = true
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:layout-photo') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const readPhoto = vi.spyOn(attendanceApi, 'readEmployeePhoto').mockResolvedValue(new Blob(['layout'], { type: 'image/png' }))
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL')
    const pinia = createPinia()
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).employees[0]!.hasPhoto = true
    await nextTick()

    await wrapper.get('[data-testid="mobile-preview-photo-emp-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('img[alt="员工照片"]').exists()).toBe(true)
    attendanceLayout.mobile.value = false
    await nextTick()

    expect(revokeUrl).toHaveBeenCalledWith('blob:layout-photo')
    expect(wrapper.find('img[alt="员工照片"]').exists()).toBe(false)
    wrapper.unmount(); readPhoto.mockRestore(); revokeUrl.mockRestore()
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
    expect(wrapper.get('[data-testid="schedule-day-drawer"]').classes()).not.toContain('schedule-day-drawer--fullscreen')
    const drawerTimeControls = wrapper.get('[data-testid="schedule-day-drawer"]').findAllComponents({ name: 'ElTimeSelect' })
    expect(drawerTimeControls.every((control: any) => !control.classes().includes('mobile-touch-control'))).toBe(true)
    for (let index = 1; index < drawerTimeControls.length; index += 2) {
      expect(drawerTimeControls[index]?.props('end')).toBe('24:00')
    }
    await wrapper.get('[data-testid="add-planned-interval"]').trigger('click')
    expect(wrapper.findAll('[data-testid="planned-interval"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('休息 60 分钟')
    expect(wrapper.text()).toContain('工作 8.5 小时')
    await wrapper.findAll('[data-testid="planned-interval"]')[1]!.findAll('button').find((node) => node.text() === '删除')!.trigger('click')
    expect(wrapper.findAll('[data-testid="planned-interval"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders the mobile attendance filter, exclusive calendar, overview cards and batch action bar', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    await flushPromises()
    store.employeeId = 'emp-1'
    await flushPromises()

    const filter = wrapper.get('[data-testid="mobile-attendance-filter"]')
    expect(filter.text()).toContain('2026-08')
    expect(filter.text()).toContain('YG001 张三')
    expect(wrapper.find('[data-testid="monthly-schedule-calendar"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="mobile-calendar-day"]')).toHaveLength(31)
    expect(wrapper.findAll('[data-testid="attendance-overview-card"]')).toHaveLength(8)
    expect(wrapper.get('[data-testid="attendance-overview-cards"]').classes()).toContain('overview-grid--mobile')
    expect(wrapper.findAll('[data-testid="attendance-issue-card"]').length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="month-rest-quota"]').exists()).toBe(true)
    expect(wrapper.getComponent('[data-testid="month-rest-quota"]').classes()).toContain('mobile-touch-control')

    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    expect(wrapper.get('[data-testid="mobile-schedule-action-bar"]').text()).toContain('已选择 1 天')
    expect(wrapper.get('[data-testid="mobile-schedule-action-bar"]').text()).toContain('应用并覆盖')
    wrapper.unmount()
  })

  it('sizes the three visible schedule actions only in mobile layout while preserving their text and behavior', async () => {
    attendanceLayout.mobile.value = true
    const mobilePinia = createPinia()
    const mobile = mount(EmployeeSchedulesPage, { global: { plugins: [mobilePinia, ElementPlus] } })
    const mobileStore = useEmployeeAttendanceStore(mobilePinia)
    mobileStore.selectMonth('2026-08'); mobileStore.employeeId = 'emp-1'
    await flushPromises()

    const mobileCopy = mobile.get('[data-testid="copy-previous-month"]')
    const mobileBatch = mobile.get('[data-testid="batch-mode"]')
    const mobileQuotaSave = mobile.get('.schedule-summary__quota .el-button')
    expect(mobileCopy.text()).toBe('复制上月排班')
    expect(mobileBatch.text()).toBe('批量选择日期')
    expect(mobileQuotaSave.text()).toBe('保存')
    for (const button of [mobileCopy, mobileBatch, mobileQuotaSave]) expect(button.classes()).toContain('mobile-touch-target')
    await mobileBatch.trigger('click')
    expect(mobile.get('[data-testid="batch-mode"]').text()).toBe('退出批量选择')
    expect(mobile.get('[data-testid="batch-mode"]').classes()).toContain('mobile-touch-target')
    mobile.unmount()

    attendanceLayout.mobile.value = false
    const desktopPinia = createPinia()
    const desktop = mount(EmployeeSchedulesPage, { global: { plugins: [desktopPinia, ElementPlus] } })
    const desktopStore = useEmployeeAttendanceStore(desktopPinia)
    desktopStore.selectMonth('2026-08'); desktopStore.employeeId = 'emp-1'
    await flushPromises()
    expect(desktop.get('[data-testid="copy-previous-month"]').text()).toBe('复制上月排班')
    expect(desktop.get('[data-testid="batch-mode"]').text()).toBe('批量选择日期')
    expect(desktop.get('.schedule-summary__quota .el-button').text()).toBe('保存')
    for (const button of [
      desktop.get('[data-testid="copy-previous-month"]'),
      desktop.get('[data-testid="batch-mode"]'),
      desktop.get('.schedule-summary__quota .el-button')
    ]) expect(button.classes()).not.toContain('mobile-touch-target')
    desktop.unmount()
  })

  it('opens mobile day and batch editors fullscreen while preserving a newer edit after save failure', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()

    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    const drawer = wrapper.get('[data-testid="schedule-day-drawer"]')
    expect(drawer.classes()).toContain('schedule-day-drawer--fullscreen')
    const timeControls = drawer.findAllComponents({ name: 'ElTimeSelect' })
    timeControls[0]!.vm.$emit('update:modelValue', '09:00')
    await nextTick()
    await drawer.findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    timeControls[0]!.vm.$emit('update:modelValue', '09:30')
    await nextTick()
    rejectSave(new Error('版本冲突'))
    await flushPromises()
    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).not.toContain('版本冲突')
    expect((timeControls[0]!.vm as any).modelValue).toBe('09:30')
    expect(timeControls.every((control: any) => control.classes().includes('mobile-touch-control'))).toBe(true)
    expect(drawer.getComponent({ name: 'ElSwitch' }).classes()).toContain('mobile-touch-control')
    expect(drawer.get('[data-testid="schedule-day-remark"]').element.closest('.el-input')?.classList.contains('mobile-touch-control')).toBe(true)

    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '关闭')!.trigger('click')
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    const batchDialog = wrapper.findAllComponents({ name: 'ElDialog' }).find((node) => node.props('title') === '批量设置月度排班')!
    expect(batchDialog.props('fullscreen')).toBe(true)
    expect(wrapper.find('.schedule-batch-dialog--fullscreen').exists()).toBe(true)
    expect(wrapper.findAllComponents({ name: 'ElTimeSelect' }).every((control) => control.classes().includes('mobile-touch-control'))).toBe(true)
    expect(wrapper.text()).toContain('将完整覆盖 1 个日期')
    await wrapper.findAll('button').find((node) => node.text() === '取消')!.trigger('click')
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-testid="copy-previous-month"]').trigger('click')
    const copyDialog = wrapper.findAllComponents({ name: 'ElDialog' }).find((node) => node.props('title') === '复制上月排班')!
    expect(copyDialog.props('fullscreen')).toBe(true)
    expect(wrapper.find('.schedule-copy-dialog--fullscreen').exists()).toBe(true)
    expect(copyDialog.findAll('.mobile-touch-target')).toHaveLength(2)
    wrapper.unmount()
    save.mockRestore()
  })

  it('does not surface an older day save failure in a newer day editor', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()

    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '关闭')!.trigger('click')
    await wrapper.get('[data-date="2026-08-04"]').trigger('click')
    const newerControls = wrapper.get('[data-testid="schedule-day-drawer"]').findAllComponents({ name: 'ElTimeSelect' })
    newerControls[0]!.vm.$emit('update:modelValue', '10:00')
    await nextTick()
    rejectSave(new Error('旧日期保存失败'))
    await flushPromises()

    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).toContain('2026-08-04')
    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).not.toContain('旧日期保存失败')
    expect((newerControls[0]!.vm as any).modelValue).toBe('10:00')
    wrapper.unmount()
    save.mockRestore()
  })

  it('ignores a failed save from an earlier same-date editor session without setting the global error', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()

    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '关闭')!.trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    const reopenedControls = wrapper.get('[data-testid="schedule-day-drawer"]').findAllComponents({ name: 'ElTimeSelect' })
    reopenedControls[0]!.vm.$emit('update:modelValue', '10:00')
    await nextTick()
    rejectSave(new Error('旧会话保存失败'))
    await flushPromises()

    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).not.toContain('旧会话保存失败')
    expect((reopenedControls[0]!.vm as any).modelValue).toBe('10:00')
    expect(store.error).toBe('')
    wrapper.unmount()
    save.mockRestore()
  })

  it('does not close or reload a newer same-date edit when an older save succeeds', async () => {
    attendanceLayout.mobile.value = true
    let resolveSave!: (row: any) => void
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    const combined = vi.spyOn(attendanceApi, 'getScheduleAttendanceOverview')
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    const loadCount = combined.mock.calls.length

    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '关闭')!.trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    const reopenedControls = wrapper.get('[data-testid="schedule-day-drawer"]').findAllComponents({ name: 'ElTimeSelect' })
    reopenedControls[0]!.vm.$emit('update:modelValue', '10:00')
    await nextTick()
    resolveSave({ id: 'saved-old-session' })
    await flushPromises()

    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).toContain('2026-08-03')
    expect((reopenedControls[0]!.vm as any).modelValue).toBe('10:00')
    expect(combined.mock.calls.length).toBe(loadCount)
    wrapper.unmount()
    save.mockRestore(); combined.mockRestore()
  })

  it('keeps an obsolete employee save failure out of the new employee session and global error', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')

    store.employeeId = 'emp-2'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    rejectSave(new Error('旧员工保存失败'))
    await flushPromises()

    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).not.toContain('旧员工保存失败')
    expect(store.error).toBe('')
    wrapper.unmount()
    save.mockRestore()
  })

  it('does not write a late day failure after the page unmounts', async () => {
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    wrapper.unmount()
    rejectSave(new Error('卸载后保存失败'))
    await flushPromises()

    expect(store.error).toBe('')
    save.mockRestore()
  })

  it('ignores a failed delete from an earlier same-date editor session', async () => {
    attendanceLayout.mobile.value = true
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    let rejectDelete!: (error: Error) => void
    const remove = vi.spyOn(attendanceApi, 'deleteMonthlyScheduleDay').mockReturnValue(new Promise((_resolve, reject) => { rejectDelete = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '删除当天排班')!.trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '关闭')!.trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    rejectDelete(new Error('旧会话删除失败'))
    await flushPromises()

    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).not.toContain('旧会话删除失败')
    expect(store.error).toBe('')
    wrapper.unmount()
    remove.mockRestore(); confirm.mockRestore()
  })

  it('does not start a delete after its confirmation belongs to a closed same-date editor', async () => {
    attendanceLayout.mobile.value = true
    let resolveConfirm!: (value: any) => void
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve }))
    const remove = vi.spyOn(attendanceApi, 'deleteMonthlyScheduleDay')
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08'); store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '删除当天排班')!.trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '关闭')!.trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    resolveConfirm('confirm')
    await flushPromises()

    expect(remove).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).toContain('2026-08-03')
    wrapper.unmount(); remove.mockRestore(); confirm.mockRestore()
  })

  it('asks for confirmation before deleting a day schedule', async () => {
    attendanceLayout.mobile.value = true
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const remove = vi.spyOn(attendanceApi, 'deleteMonthlyScheduleDay').mockResolvedValue()
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()

    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '删除当天排班')!.trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith(
      '确认删除 2026-08-03 的排班？',
      '删除当天排班',
      expect.objectContaining({ type: 'warning' })
    )
    expect(remove).toHaveBeenCalledWith('monthly-emp-1-2026-08-03')
    wrapper.unmount()
    confirm.mockRestore(); remove.mockRestore()
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
    const batchTimeControls = wrapper.findAllComponents({ name: 'ElTimeSelect' })
    expect(batchTimeControls.filter((_control, index) => index % 2 === 1).some((control) => control.props('end') === '24:00')).toBe(true)
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
    const response = (employeeId: string, id: string) => ({
      month: '2026-08', employee: { id: employeeId, employeeNumber: employeeId, name: employeeId }, readonly: false,
      overview: { month: '2026-08', activeEmployees: 2, todayPresent: 1, todayOnLeave: 0, todayAbsent: 0, overtimeHours: 0, pendingLeaves: 0, projectedPayroll: 0, issueCount: 0, issues: [] },
      days: [{
        date: '2026-08-03', day: 3, isFuture: false, status: 'REST' as const,
        schedule: { id, employeeId, date: '2026-08-03', isWorkday: false, segments: [], scheduledMinutes: 0, breakMinutes: 0 },
        actualSegments: [], scheduledMinutes: 0, workedMinutes: 0, approvedLeaveMinutes: 0, overtimeMinutes: 0,
        displayMinutes: 0, shortageMinutes: 0, durationText: '公司排休', leaveTypeName: '', leaveReason: '', absenceReason: '', backgroundTone: 'rest' as const, durationTone: 'rest' as const
      }]
    })
    let resolveFirst!: (value: ReturnType<typeof response>) => void
    let resolveSecond!: (value: ReturnType<typeof response>) => void
    const first = new Promise<ReturnType<typeof response>>((resolve) => { resolveFirst = resolve })
    const second = new Promise<ReturnType<typeof response>>((resolve) => { resolveSecond = resolve })
    let employeeRequest = 0
    const schedules = vi.spyOn(attendanceApi, 'getScheduleAttendanceOverview').mockImplementation((employeeId) => {
      if (!employeeId) return Promise.resolve({ ...response('', 'none'), employee: null, days: [] })
      employeeRequest += 1
      return employeeRequest === 1 ? first : second
    })
    vi.spyOn(attendanceApi, 'getMonthlySettings').mockResolvedValue([])
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    store.employeeId = 'emp-2'
    await flushPromises()
    resolveSecond(response('emp-2', 'new'))
    await flushPromises()
    resolveFirst(response('emp-1', 'old'))
    await flushPromises()

    expect(employeeRequest).toBe(2)
    expect(store.monthlySchedules).toEqual([expect.objectContaining({ id: 'new', employeeId: 'emp-2' })])
    wrapper.unmount()
    schedules.mockRestore()
  })

  it('does not surface a late failure from an obsolete employee/month request', async () => {
    const response = (employeeId: string, id: string) => ({
      month: '2026-08', employee: { id: employeeId, employeeNumber: employeeId, name: employeeId }, readonly: false,
      overview: { month: '2026-08', activeEmployees: 2, todayPresent: 1, todayOnLeave: 0, todayAbsent: 0, overtimeHours: 0, pendingLeaves: 0, projectedPayroll: 0, issueCount: 0, issues: [] },
      days: [{
        date: '2026-08-03', day: 3, isFuture: false, status: 'REST' as const,
        schedule: { id, employeeId, date: '2026-08-03', isWorkday: false, segments: [], scheduledMinutes: 0, breakMinutes: 0 },
        actualSegments: [], scheduledMinutes: 0, workedMinutes: 0, approvedLeaveMinutes: 0, overtimeMinutes: 0,
        displayMinutes: 0, shortageMinutes: 0, durationText: '公司排休', leaveTypeName: '', leaveReason: '', absenceReason: '', backgroundTone: 'rest' as const, durationTone: 'rest' as const
      }]
    })
    let rejectFirst!: (error: Error) => void
    let resolveSecond!: (value: ReturnType<typeof response>) => void
    const first = new Promise<ReturnType<typeof response>>((_resolve, reject) => { rejectFirst = reject })
    const second = new Promise<ReturnType<typeof response>>((resolve) => { resolveSecond = resolve })
    let employeeRequest = 0
    const schedules = vi.spyOn(attendanceApi, 'getScheduleAttendanceOverview').mockImplementation((employeeId) => {
      if (!employeeId) return Promise.resolve({ ...response('', 'none'), employee: null, days: [] })
      employeeRequest += 1
      return employeeRequest === 1 ? first : second
    })
    vi.spyOn(attendanceApi, 'getMonthlySettings').mockResolvedValue([])
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    store.employeeId = 'emp-2'
    await flushPromises()
    resolveSecond(response('emp-2', 'new-success'))
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

  it('forces a fresh combined snapshot after a save even while the same-month refresh is pending', async () => {
    const realCombined = attendanceApi.getScheduleAttendanceOverview
    const first = await realCombined('emp-1', '2026-08')
    let resolvePending!: (value: typeof first) => void
    const pending = new Promise<typeof first>((resolve) => { resolvePending = resolve })
    const combined = vi.spyOn(attendanceApi, 'getScheduleAttendanceOverview')
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(pending)
      .mockResolvedValue(first)
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockResolvedValue(first.days.find((day) => day.schedule)?.schedule!)
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08')
    store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.findAll('button').find((node) => node.text() === '刷新')!.trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalled()
    expect(combined.mock.calls.filter(([employeeId]) => employeeId === 'emp-1')).toHaveLength(2)
    resolvePending(first)
    await flushPromises()
    combined.mockRestore()
    save.mockRestore()
    wrapper.unmount()
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

  it('ignores an obsolete batch failure after closing and reopening with newer selection and edits', async () => {
    attendanceLayout.mobile.value = true
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    let rejectBatch!: (error: Error) => void
    const saveBatch = vi.spyOn(attendanceApi, 'batchSaveMonthlySchedules').mockReturnValue(new Promise((_resolve, reject) => { rejectBatch = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08'); store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    await wrapper.findAll('button').find((node) => node.text() === '确认批量覆盖')!.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((node) => node.text() === '取消')!.trigger('click')
    await wrapper.get('[data-date="2026-08-04"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    const controls = wrapper.findAllComponents({ name: 'ElTimeSelect' })
    controls[0]!.vm.$emit('update:modelValue', '10:00')
    await nextTick()
    rejectBatch(new Error('旧批量失败'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('旧批量失败')
    expect((controls[0]!.vm as any).modelValue).toBe('10:00')
    expect(store.error).toBe('')
    wrapper.unmount(); confirm.mockRestore(); saveBatch.mockRestore()
  })

  it('guards duplicate batch confirmation while the first confirmation is pending', async () => {
    attendanceLayout.mobile.value = true
    let resolveConfirm!: (value: any) => void
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve }))
    const saveBatch = vi.spyOn(attendanceApi, 'batchSaveMonthlySchedules')
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08'); store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    const button = wrapper.findAll('button').find((node) => node.text() === '确认批量覆盖')!
    await button.trigger('click'); await button.trigger('click')
    expect(confirm).toHaveBeenCalledTimes(1)
    resolveConfirm('cancel')
    await flushPromises()
    expect(saveBatch).toHaveBeenCalledTimes(1)
    wrapper.unmount(); confirm.mockRestore(); saveBatch.mockRestore()
  })

  it('does not start a batch mutation after its confirmation belongs to a closed dialog session', async () => {
    attendanceLayout.mobile.value = true
    let resolveConfirm!: (value: any) => void
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve }))
    const saveBatch = vi.spyOn(attendanceApi, 'batchSaveMonthlySchedules')
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08'); store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    await wrapper.findAll('button').find((node) => node.text() === '确认批量覆盖')!.trigger('click')
    await wrapper.findAll('button').find((node) => node.text() === '取消')!.trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    resolveConfirm('confirm')
    await flushPromises()

    expect(saveBatch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('批量设置月度排班')
    wrapper.unmount(); confirm.mockRestore(); saveBatch.mockRestore()
  })

  it('keeps the active batch failure local and retains the exact batch form', async () => {
    attendanceLayout.mobile.value = true
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const saveBatch = vi.spyOn(attendanceApi, 'batchSaveMonthlySchedules').mockRejectedValue(new Error('当前批量失败'))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08'); store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="batch-mode"]').trigger('click')
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    await wrapper.get('[data-testid="apply-batch"]').trigger('click')
    const controls = wrapper.findAllComponents({ name: 'ElTimeSelect' })
    controls[0]!.vm.$emit('update:modelValue', '10:00')
    await nextTick()
    await wrapper.findAll('button').find((node) => node.text() === '确认批量覆盖')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('当前批量失败')
    expect((controls[0]!.vm as any).modelValue).toBe('10:00')
    expect(store.error).toBe('')
    wrapper.unmount(); confirm.mockRestore(); saveBatch.mockRestore()
  })

  it('keeps the active day failure local and retains the exact day form', async () => {
    attendanceLayout.mobile.value = true
    const save = vi.spyOn(attendanceApi, 'saveMonthlyScheduleDay').mockRejectedValue(new Error('当前当天失败'))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08'); store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-date="2026-08-03"]').trigger('click')
    const controls = wrapper.get('[data-testid="schedule-day-drawer"]').findAllComponents({ name: 'ElTimeSelect' })
    controls[0]!.vm.$emit('update:modelValue', '10:00')
    await nextTick()
    await wrapper.get('[data-testid="schedule-day-drawer"]').findAll('button').find((node) => node.text() === '保存')!.trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).toContain('当前当天失败')
    expect((controls[0]!.vm as any).modelValue).toBe('10:00')
    expect(store.error).toBe('')
    wrapper.unmount(); save.mockRestore()
  })

  it('ignores obsolete copy results after employee change or closing and reopening the same context', async () => {
    attendanceLayout.mobile.value = true
    let rejectCopy!: (error: Error) => void
    const copy = vi.spyOn(attendanceApi, 'copyPreviousMonthSchedules').mockReturnValue(new Promise((_resolve, reject) => { rejectCopy = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    store.selectMonth('2026-08'); store.employeeId = 'emp-1'
    await flushPromises()
    await wrapper.get('[data-testid="copy-previous-month"]').trigger('click')
    await wrapper.findAll('button').find((node) => node.text().startsWith('确认复制'))!.trigger('click')
    await wrapper.findAll('button').find((node) => node.text() === '取消')!.trigger('click')
    store.employeeId = 'emp-2'
    await flushPromises()
    await wrapper.get('[data-testid="copy-previous-month"]').trigger('click')
    rejectCopy(new Error('旧复制失败'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('旧复制失败')
    expect(store.error).toBe('')
    wrapper.unmount(); copy.mockRestore()
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

  it('renders exclusive mobile attendance cards with actual intervals, status and exception summaries', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).attendance[0]!.lateMinutes = 2
    await nextTick()

    expect(wrapper.findAll('[data-testid="mobile-attendance-record-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-attendance-record-card-att-emp-1"]').text()).toContain('实际时段')
    expect(wrapper.get('[data-testid="mobile-attendance-record-card-att-emp-1"]').text()).toContain('异常')
    expect(wrapper.get('[data-testid="mobile-attendance-record-card-att-emp-1"]').text()).toContain('迟到 2 分钟')
    expect(wrapper.find('.el-table').exists()).toBe(false)
    wrapper.unmount()
  })

  it('applies mutually exclusive mobile month or date-range filters with employee and status filters', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).attendance[0]!.lateMinutes = 2
    await nextTick()

    expect(wrapper.find('[data-testid="mobile-attendance-month"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-attendance-start-date"]').exists()).toBe(false)
    await wrapper.get('[data-testid="mobile-attendance-mode-range"]').trigger('click')
    expect(wrapper.find('[data-testid="mobile-attendance-month"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-attendance-start-date"]').exists()).toBe(true)
    await wrapper.get('[data-testid="mobile-attendance-start-date"]').setValue(dayjs().format('YYYY-MM-DD'))
    await wrapper.get('[data-testid="mobile-attendance-end-date"]').setValue(dayjs().format('YYYY-MM-DD'))
    await wrapper.get('[data-testid="mobile-attendance-employee"]').setValue('emp-1')
    await wrapper.get('[data-testid="mobile-attendance-status"]').setValue('NORMAL')
    await wrapper.get('[data-testid="mobile-attendance-apply-filter"]').trigger('click')
    await flushPromises()

    const store = useEmployeeAttendanceStore(pinia)
    expect(store.startDate).toBe(dayjs().format('YYYY-MM-DD'))
    expect(store.endDate).toBe(dayjs().format('YYYY-MM-DD'))
    expect(store.employeeId).toBe('emp-1')
    expect(wrapper.findAll('[data-testid="mobile-attendance-record-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-attendance-filter-summary"]').text()).toContain('日期范围')

    await wrapper.get('[data-testid="mobile-attendance-mode-month"]').trigger('click')
    expect(wrapper.find('[data-testid="mobile-attendance-start-date"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-attendance-month"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens a full-screen mobile multi-interval editor and disables explicit absence while intervals exist', async () => {
    attendanceLayout.mobile.value = true
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-edit-attendance-att-emp-1"]').trigger('click')
    expect(wrapper.getComponent({ name: 'MobileFullscreenDialog' }).props('fullscreen')).toBe(true)
    expect(wrapper.get('[data-testid="mobile-attendance-editor"]').classes()).toContain('mobile-fullscreen-dialog--active')
    expect(wrapper.get('[data-testid="mobile-attendance-editor"]').attributes('style')).toContain('100dvh')
    expect(wrapper.findAll('[data-testid="actual-interval"]')).toHaveLength(1)
    expect(wrapper.getComponent<any>('[data-testid="attendance-explicit-absence"]').props('disabled')).toBe(true)
    await wrapper.get('[data-testid="add-actual-interval"]').trigger('click')
    expect(wrapper.findAll('[data-testid="actual-interval"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-attendance-editor"]').classes()).toContain('mobile-attendance-editor')
    wrapper.unmount()
  })

  it('disables edit and delete for payroll-locked mobile attendance records', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).attendance[0]!.lockedAt = '2026-08-31T12:00:00+08:00'
    await nextTick()

    const card = wrapper.get('[data-testid="mobile-attendance-record-card-att-emp-1"]')
    expect(card.text()).toContain('工资已锁定')
    expect(card.get('[data-testid="mobile-edit-attendance-att-emp-1"]').attributes('disabled')).toBeDefined()
    expect(card.get('[data-testid="mobile-remove-attendance-att-emp-1"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('retains newer mobile attendance edits, blocks duplicate saves and ignores the older failure', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveAttendance').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-edit-attendance-att-emp-1"]').trigger('click')
    await wrapper.get('[data-testid="attendance-remark"]').setValue('提交版本')
    await wrapper.get('[data-testid="attendance-save"]').trigger('click')
    await wrapper.get('[data-testid="attendance-remark"]').setValue('保存期间的新备注')
    await wrapper.get('[data-testid="attendance-save"]').trigger('click')
    expect(save).toHaveBeenCalledTimes(1)
    rejectSave(new Error('旧考勤保存失败'))
    await flushPromises()

    expect((wrapper.get('[data-testid="attendance-remark"]').element as HTMLInputElement).value).toBe('保存期间的新备注')
    expect(wrapper.text()).not.toContain('旧考勤保存失败')
    wrapper.unmount()
    save.mockRestore()
  })

  it('confirms a mobile attendance removal before deleting it', async () => {
    attendanceLayout.mobile.value = true
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const remove = vi.spyOn(attendanceApi, 'deleteAttendance')
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-remove-attendance-att-emp-1"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith('删除后无法恢复，是否继续？', '确认删除考勤记录', { type: 'warning' })
    expect(remove).toHaveBeenCalledWith('att-emp-1')
    wrapper.unmount()
    confirm.mockRestore(); remove.mockRestore()
  })

  it('does not reload or surface state after an attendance save settles post-unmount', async () => {
    attendanceLayout.mobile.value = true
    let resolveSave!: (record: Awaited<ReturnType<typeof attendanceApi.saveAttendance>>) => void
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const save = vi.spyOn(attendanceApi, 'saveAttendance').mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    const load = vi.spyOn(attendanceApi, 'getAttendance')
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const loadCount = load.mock.calls.length

    await wrapper.get('[data-testid="mobile-edit-attendance-att-emp-1"]').trigger('click')
    await wrapper.get('[data-testid="attendance-save"]').trigger('click')
    wrapper.unmount()
    resolveSave(existing)
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(loadCount)
    expect(useEmployeeAttendanceStore(pinia).error).toBe('')
    save.mockRestore(); load.mockRestore()
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

    for (const component of [EmployeeSchedulesPage, EmployeePayrollPage]) {
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
