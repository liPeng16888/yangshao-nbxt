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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

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

  it('adopts a successful employee create id without overwriting a newer draft, then updates that id', async () => {
    attendanceLayout.mobile.value = true
    let resolveCreate!: (employee: Awaited<ReturnType<typeof attendanceApi.createEmployee>>) => void
    const pinia = createPinia()
    const created = { ...(await mockCreateEmployee({ employeeNumber: 'SERVER-ONLY', name: '服务端版本', status: 'ACTIVE', hireDate: '2026-08-01' })), id: 'emp-created-during-edit' }
    const create = vi.spyOn(attendanceApi, 'createEmployee').mockReturnValue(new Promise((resolve) => { resolveCreate = resolve }))
    const update = vi.spyOn(attendanceApi, 'updateEmployee').mockResolvedValue(created)
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-employee"]').trigger('click')
    await wrapper.get('[data-testid="employee-number"]').setValue('YG903')
    await wrapper.get('[data-testid="employee-name"]').setValue('提交版本')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    await wrapper.get('[data-testid="employee-name"]').setValue('创建期间的新姓名')
    resolveCreate(created)
    await flushPromises()

    expect(wrapper.get('.employee-editor-dialog').text()).toContain('编辑员工')
    expect((wrapper.get('[data-testid="employee-name"]').element as HTMLInputElement).value).toBe('创建期间的新姓名')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    await flushPromises()

    expect(create).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('emp-created-during-edit', expect.objectContaining({ employeeNumber: 'YG903', name: '创建期间的新姓名' }))
    expect(wrapper.getComponent({ name: 'MobileFullscreenDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount(); create.mockRestore(); update.mockRestore()
  })

  it('does not adopt a successful employee create id after closing and reopening the editor', async () => {
    attendanceLayout.mobile.value = true
    let resolveCreate!: (employee: Awaited<ReturnType<typeof attendanceApi.createEmployee>>) => void
    const created = { ...(await mockCreateEmployee({ employeeNumber: 'SERVER-STALE', name: '旧服务端版本', status: 'ACTIVE', hireDate: '2026-08-01' })), id: 'emp-stale-create' }
    const create = vi.spyOn(attendanceApi, 'createEmployee')
      .mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
      .mockResolvedValueOnce(created)
    const update = vi.spyOn(attendanceApi, 'updateEmployee')
    const wrapper = mount(EmployeeDirectoryPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-employee"]').trigger('click')
    await wrapper.get('[data-testid="employee-number"]').setValue('YG904')
    await wrapper.get('[data-testid="employee-name"]').setValue('旧会话')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    wrapper.getComponent({ name: 'MobileFullscreenDialog' }).vm.$emit('update:modelValue', false)
    await nextTick()
    await wrapper.get('[data-testid="mobile-create-employee"]').trigger('click')
    await wrapper.get('[data-testid="employee-number"]').setValue('YG905')
    await wrapper.get('[data-testid="employee-name"]').setValue('新会话')
    resolveCreate(created)
    await flushPromises()

    expect(wrapper.get('.employee-editor-dialog').text()).toContain('新增员工')
    await wrapper.get('[data-testid="employee-save"]').trigger('click')
    await flushPromises()
    expect(create).toHaveBeenCalledTimes(2)
    expect(update).not.toHaveBeenCalled()
    wrapper.unmount(); create.mockRestore(); update.mockRestore()
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

  it('cancels its sensitive-access prompt on layout change or unmount without creating a stale grant', async () => {
    attendanceLayout.mobile.value = true
    window.localStorage.setItem('ys_mock_access_guard_groups', JSON.stringify([{
      id: 'attendance-group', name: '员工考勤验证', enabled: true, ttlMinutes: 5, grantVersion: 1, password: '1234',
      recoveryPrompt: '', recoveryAnswer: '', features: ['EMPLOYEE_ATTENDANCE']
    }]))
    const reveal = vi.spyOn(attendanceApi, 'revealEmployee')

    const layoutPinia = createPinia()
    const layoutPage = mount(EmployeeDirectoryPage, { global: { plugins: [layoutPinia, ElementPlus] } })
    await flushPromises()
    await layoutPage.get('[data-testid="mobile-reveal-employee-emp-1"]').trigger('click')
    await flushPromises()
    const layoutAccess = useAccessGuardStore(layoutPinia)
    expect(layoutAccess.dialogVisible).toBe(true)
    attendanceLayout.mobile.value = false
    await nextTick()

    expect(layoutAccess.dialogVisible).toBe(false)
    await expect(layoutAccess.verifyPassword('1234')).resolves.toMatchObject({ ok: false })
    expect(JSON.parse(window.localStorage.getItem('ys_access_guard_group_sessions') || '{}')).toEqual({})
    expect(reveal).not.toHaveBeenCalled()
    layoutPage.unmount()

    attendanceLayout.mobile.value = true
    const unmountPinia = createPinia()
    const unmountPage = mount(EmployeeDirectoryPage, { global: { plugins: [unmountPinia, ElementPlus] } })
    await flushPromises()
    await unmountPage.get('[data-testid="mobile-reveal-employee-emp-1"]').trigger('click')
    await flushPromises()
    const unmountAccess = useAccessGuardStore(unmountPinia)
    expect(unmountAccess.dialogVisible).toBe(true)
    unmountPage.unmount()

    expect(unmountAccess.dialogVisible).toBe(false)
    await expect(unmountAccess.verifyPassword('1234')).resolves.toMatchObject({ ok: false })
    expect(JSON.parse(window.localStorage.getItem('ys_access_guard_group_sessions') || '{}')).toEqual({})
    expect(reveal).not.toHaveBeenCalled()
    reveal.mockRestore()
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

  it('renders UTC, offset and legacy local attendance interval endpoints in Beijing wall time', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).attendance[0]!.actualSegments = [
      { sequence: 0, checkInAt: '2026-08-08T00:05:00Z', checkOutAt: '2026-08-08T04:00:00Z' },
      { sequence: 1, checkInAt: '2026-08-08T13:15:00+08:00', checkOutAt: '2026-08-08T14:20:00+08:00' },
      { sequence: 2, checkInAt: '2026-08-08T15:30', checkOutAt: '2026-08-08T16:45' }
    ]
    await nextTick()

    const card = wrapper.get('[data-testid="mobile-attendance-record-card-att-emp-1"]')
    expect(card.text()).toContain('08:05—12:00')
    expect(card.text()).toContain('13:15—14:20')
    expect(card.text()).toContain('15:30—16:45')
    wrapper.unmount()
  })

  it('applies mutually exclusive mobile month or date-range filters with employee and status filters', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    useEmployeeAttendanceStore(pinia).attendance[0]!.lateMinutes = 2
    await nextTick()

    await wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary').trigger('click')
    expect(wrapper.find('[data-testid="mobile-attendance-month"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mobile-attendance-start-date"]').exists()).toBe(false)
    await wrapper.get('[data-testid="mobile-attendance-mode-range"]').trigger('click')
    expect(wrapper.find('[data-testid="mobile-attendance-month"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-attendance-start-date"]').exists()).toBe(true)
    await wrapper.get('[data-testid="mobile-attendance-start-date"]').setValue(dayjs().format('YYYY-MM-DD'))
    await wrapper.get('[data-testid="mobile-attendance-end-date"]').setValue(dayjs().format('YYYY-MM-DD'))
    await wrapper.get('[data-testid="mobile-attendance-employee"]').setValue('emp-1')
    await wrapper.get('[data-testid="mobile-attendance-status"]').setValue('NORMAL')
    await wrapper.get('[data-testid="mobile-attendance-record-filter"]').findAll('.mobile-filter-drawer__actions button')[1]!.trigger('click')
    await flushPromises()

    const store = useEmployeeAttendanceStore(pinia)
    expect(store.startDate).toBe(dayjs().format('YYYY-MM-DD'))
    expect(store.endDate).toBe(dayjs().format('YYYY-MM-DD'))
    expect(store.employeeId).toBe('emp-1')
    expect(wrapper.findAll('[data-testid="mobile-attendance-record-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary__value').text()).toContain('日期范围')

    await wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-attendance-mode-month"]').trigger('click')
    expect(wrapper.find('[data-testid="mobile-attendance-start-date"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mobile-attendance-month"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps attendance filter drafts inert until apply, cancels safely, and resets exact defaults', async () => {
    attendanceLayout.mobile.value = true
    const load = vi.spyOn(attendanceApi, 'getAttendance')
    const pinia = createPinia()
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const store = useEmployeeAttendanceStore(pinia)
    store.attendance[0]!.lateMinutes = 2
    await nextTick()
    const initialLoads = load.mock.calls.length
    const initialMonth = store.month
    const recordDate = store.attendance[0]!.date

    await wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-attendance-mode-range"]').trigger('click')
    await wrapper.get('[data-testid="mobile-attendance-start-date"]').setValue(recordDate)
    await wrapper.get('[data-testid="mobile-attendance-end-date"]').setValue(recordDate)
    await wrapper.get('[data-testid="mobile-attendance-employee"]').setValue('emp-1')
    await wrapper.get('[data-testid="mobile-attendance-status"]').setValue('NORMAL')

    expect(load).toHaveBeenCalledTimes(initialLoads)
    expect(wrapper.findAll('[data-testid="mobile-attendance-record-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary__value').text()).toContain('全部状态')

    wrapper.getComponent({ name: 'MobileAttendanceRecordList' }).getComponent({ name: 'MobileFilterDrawer' }).vm.$emit('update:modelValue', false)
    await nextTick()
    expect(store.startDate).toBe('')
    expect(store.employeeId).toBe('')
    expect(load).toHaveBeenCalledTimes(initialLoads)

    await wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary').trigger('click')
    expect((wrapper.get('[data-testid="mobile-attendance-status"]').element as HTMLSelectElement).value).toBe('')
    await wrapper.get('[data-testid="mobile-attendance-mode-range"]').trigger('click')
    await wrapper.get('[data-testid="mobile-attendance-start-date"]').setValue(recordDate)
    await wrapper.get('[data-testid="mobile-attendance-end-date"]').setValue(recordDate)
    await wrapper.get('[data-testid="mobile-attendance-employee"]').setValue('emp-1')
    await wrapper.get('[data-testid="mobile-attendance-status"]').setValue('NORMAL')
    await wrapper.get('[data-testid="mobile-attendance-record-filter"]').findAll('.mobile-filter-drawer__actions button')[1]!.trigger('click')
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(initialLoads + 1)
    expect(load).toHaveBeenLastCalledWith({ employeeId: 'emp-1', startDate: recordDate, endDate: recordDate })
    expect(wrapper.findAll('[data-testid="mobile-attendance-record-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary__value').text()).toContain('正常')

    await wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-attendance-record-filter"]').findAll('.mobile-filter-drawer__actions button')[0]!.trigger('click')
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(initialLoads + 2)
    expect(store.month).toBe(initialMonth)
    expect(store.startDate).toBe('')
    expect(store.endDate).toBe('')
    expect(store.employeeId).toBe('')
    expect(wrapper.findAll('[data-testid="mobile-attendance-record-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="mobile-attendance-record-filter"] .mobile-filter-summary__value').text()).toContain('全部状态')
    wrapper.unmount(); load.mockRestore()
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

  it('adopts a successful attendance create id without overwriting a newer draft, then updates that id', async () => {
    attendanceLayout.mobile.value = true
    let resolveCreate!: (record: Awaited<ReturnType<typeof attendanceApi.saveAttendance>>) => void
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const created = { ...existing, id: 'attendance-created-during-edit', remark: '服务端版本' }
    const save = vi.spyOn(attendanceApi, 'saveAttendance')
      .mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
      .mockResolvedValueOnce(created)
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-attendance"]').trigger('click')
    await wrapper.get('[data-testid="attendance-remark"]').setValue('提交版本')
    await wrapper.get('[data-testid="attendance-save"]').trigger('click')
    await wrapper.get('[data-testid="attendance-remark"]').setValue('创建期间的新备注')
    resolveCreate(created)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-attendance-editor"]').text()).toContain('编辑实际出勤')
    expect((wrapper.get('[data-testid="attendance-remark"]').element as HTMLInputElement).value).toBe('创建期间的新备注')
    await wrapper.get('[data-testid="attendance-save"]').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ remark: '创建期间的新备注' }), 'attendance-created-during-edit')
    expect(wrapper.getComponent({ name: 'MobileFullscreenDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount(); save.mockRestore()
  })

  it('does not adopt a successful attendance create id after closing and reopening the editor', async () => {
    attendanceLayout.mobile.value = true
    let resolveCreate!: (record: Awaited<ReturnType<typeof attendanceApi.saveAttendance>>) => void
    const existing = (await mockGetAttendance({ employeeId: 'emp-1' }))[0]!
    const created = { ...existing, id: 'attendance-stale-create' }
    const save = vi.spyOn(attendanceApi, 'saveAttendance')
      .mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
      .mockResolvedValueOnce(created)
    const wrapper = mount(EmployeeAttendanceRecordsPage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-attendance"]').trigger('click')
    await wrapper.get('[data-testid="attendance-remark"]').setValue('旧会话')
    await wrapper.get('[data-testid="attendance-save"]').trigger('click')
    wrapper.getComponent({ name: 'MobileFullscreenDialog' }).vm.$emit('update:modelValue', false)
    await nextTick()
    await wrapper.get('[data-testid="mobile-create-attendance"]').trigger('click')
    await wrapper.get('[data-testid="attendance-remark"]').setValue('新会话')
    resolveCreate(created)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-attendance-editor"]').text()).toContain('新增实际出勤')
    await wrapper.get('[data-testid="attendance-save"]').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ remark: '新会话' }), undefined)
    wrapper.unmount(); save.mockRestore()
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

  it('renders exclusive mobile leave and leave-type cards with all business fields', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const store = useEmployeeAttendanceStore(pinia)
    const pending = store.leaves.find((row) => row.status === 'PENDING')!

    expect(wrapper.findAll('[data-testid="mobile-leave-card"]')).toHaveLength(store.leaves.length)
    const pendingCard = wrapper.get(`[data-testid="mobile-leave-card-${pending.id}"]`)
    expect(pendingCard.text()).toContain('YG002 李四')
    expect(pendingCard.text()).toContain('事假')
    expect(pendingCard.text()).toContain(`${pending.startDate} 至 ${pending.endDate}`)
    expect(pendingCard.text()).toContain('半天')
    expect(pendingCard.text()).toContain('个人事务')
    expect(pendingCard.text()).toContain('待审批')
    expect(wrapper.find('.el-table').exists()).toBe(false)

    await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
    expect(wrapper.findAll('[data-testid="mobile-leave-type-card"]')).toHaveLength(store.leaveTypes.length)
    expect(wrapper.get('[data-testid="mobile-leave-type-card-leave-type-rest"]').text()).toContain('启用')
    expect(wrapper.get('[data-testid="mobile-leave-type-card-leave-type-rest"]').text()).toContain('占用月休额度')
    expect(wrapper.get('[data-testid="mobile-leave-type-card-leave-type-sick"]').text()).toContain('不占用月休额度')
    wrapper.unmount()
  })

  it('keeps mobile leave filter drafts inert until applying employee, status and date filters', async () => {
    attendanceLayout.mobile.value = true
    const request = vi.spyOn(attendanceApi, 'getLeaves')
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const store = useEmployeeAttendanceStore(pinia)
    const initialCalls = request.mock.calls.length
    const rejected = store.leaves.find((row) => row.status === 'REJECTED')!

    await wrapper.get('[data-testid="mobile-leave-filter"] .mobile-filter-summary').trigger('click')
    await wrapper.get('[data-testid="mobile-leave-employee-emp-1"]').setValue(true)
    await wrapper.get('[data-testid="mobile-leave-status"]').setValue('REJECTED')
    await wrapper.get('[data-testid="mobile-leave-start-date"]').setValue(rejected.startDate)
    await wrapper.get('[data-testid="mobile-leave-end-date"]').setValue(rejected.endDate)

    expect(request).toHaveBeenCalledTimes(initialCalls)
    expect(store.leaveEmployeeIds).toEqual([])
    expect(store.leaveStatus).toBe('')
    expect(wrapper.findAll('[data-testid="mobile-leave-card"]')).toHaveLength(2)

    await wrapper.get('[data-testid="mobile-leave-filter"]').findAll('.mobile-filter-drawer__actions button')[1]!.trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledTimes(initialCalls + 1)
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
      employeeIds: ['emp-1'], status: 'REJECTED', startDate: rejected.startDate, endDate: rejected.endDate, month: undefined
    }))
    expect(store.leaveEmployeeIds).toEqual(['emp-1'])
    expect(store.leaveStatus).toBe('REJECTED')
    expect(wrapper.findAll('[data-testid="mobile-leave-card"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="mobile-leave-filter"] .mobile-filter-summary__value').text()).toContain('已驳回')
    expect(wrapper.get('[data-testid="mobile-leave-filter"] .mobile-filter-summary__value').text()).toContain(rejected.startDate)
    wrapper.unmount(); request.mockRestore()
  })

  it('keeps only the latest mobile leave filter response and retries the exact applied filter after failure', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const store = useEmployeeAttendanceStore(pinia)
    const firstRows = [store.leaves[0]!], secondRows = [store.leaves[1]!]
    let resolveFirst!: (rows: typeof firstRows) => void
    let resolveSecond!: (rows: typeof secondRows) => void
    const request = vi.spyOn(attendanceApi, 'getLeaves')
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))
    const list = wrapper.getComponent({ name: 'MobileLeaveList' })

    list.vm.$emit('applyFilters', { employeeIds: ['emp-2'], status: 'PENDING', startDate: '2026-08-01', endDate: '2026-08-10' })
    await nextTick()
    list.vm.$emit('applyFilters', { employeeIds: ['emp-1'], status: 'REJECTED', startDate: '2026-08-11', endDate: '2026-08-20' })
    await nextTick()
    resolveSecond(secondRows)
    await flushPromises()
    resolveFirst(firstRows)
    await flushPromises()
    expect(store.leaves.map((row) => row.id)).toEqual(['leave-2'])
    expect(store.error).toBe('')

    request.mockRejectedValueOnce(new Error('最新请假筛选失败'))
    list.vm.$emit('applyFilters', { employeeIds: ['emp-2'], status: 'APPROVED', startDate: '2026-08-21', endDate: '2026-08-25' })
    await flushPromises()
    expect(store.error).toBe('最新请假筛选失败')

    request.mockResolvedValueOnce(firstRows)
    await wrapper.findAll('button').find((node) => node.text() === '重试')!.trigger('click')
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ employeeIds: ['emp-2'], status: 'APPROVED', startDate: '2026-08-21', endDate: '2026-08-25' }))
    expect(store.leaves.map((row) => row.id)).toEqual(['leave-1'])
    expect(store.error).toBe('')
    wrapper.unmount(); request.mockRestore()
  })

  it('replaces an aborted initial leave load exactly once after a layout transition', async () => {
    const baselineRows = await attendanceApi.getLeaves({})
    const baselineTypes = await attendanceApi.getLeaveTypes()
    const initialRows = deferred<typeof baselineRows>(), initialTypes = deferred<typeof baselineTypes>()
    const successorRows = deferred<typeof baselineRows>(), successorTypes = deferred<typeof baselineTypes>()
    const requestRows = vi.spyOn(attendanceApi, 'getLeaves')
      .mockReturnValueOnce(initialRows.promise)
      .mockReturnValueOnce(successorRows.promise)
    const requestTypes = vi.spyOn(attendanceApi, 'getLeaveTypes')
      .mockReturnValueOnce(initialTypes.promise)
      .mockReturnValueOnce(successorTypes.promise)
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    try {
      await nextTick()
      expect(requestRows).toHaveBeenCalledTimes(1)
      attendanceLayout.mobile.value = true
      await nextTick()

      expect(requestRows).toHaveBeenCalledTimes(2)
      expect(requestTypes).toHaveBeenCalledTimes(2)
      expect(requestRows).toHaveBeenLastCalledWith({
        employeeId: undefined, employeeIds: [], month: store.month, startDate: undefined, endDate: undefined, status: undefined
      })
      const nextRows = [{ ...baselineRows[0]!, id: 'layout-successor-leave' }]
      const nextTypes = [{ ...baselineTypes[0]!, id: 'layout-successor-type', name: '布局继任类型' }]
      successorTypes.resolve(nextTypes)
      successorRows.resolve(nextRows)
      await flushPromises()
      expect(store.leaves).toEqual(nextRows)
      expect(store.leaveTypes).toEqual(nextTypes)
      expect(store.loading).toBe(false)
      expect(store.error).toBe('')

      initialTypes.resolve([{ ...baselineTypes[0]!, id: 'aborted-initial-type' }])
      initialRows.resolve([{ ...baselineRows[0]!, id: 'aborted-initial-leave' }])
      await flushPromises()
      expect(store.leaves).toEqual(nextRows)
      expect(store.leaveTypes).toEqual(nextTypes)
      expect(store.error).toBe('')
    } finally {
      initialTypes.resolve(baselineTypes); initialRows.resolve(baselineRows)
      successorTypes.resolve(baselineTypes); successorRows.resolve(baselineRows)
      wrapper.unmount(); requestRows.mockRestore(); requestTypes.mockRestore()
    }
  })

  it('reloads the exact applied leave filters after rapid layout flips and only the latest successor commits', async () => {
    attendanceLayout.mobile.value = true
    const baselineRows = await attendanceApi.getLeaves({}), baselineTypes = await attendanceApi.getLeaveTypes()
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const store = useEmployeeAttendanceStore(pinia)
    const firstRows = deferred<typeof baselineRows>(), firstTypes = deferred<typeof baselineTypes>()
    const middleRows = deferred<typeof baselineRows>(), middleTypes = deferred<typeof baselineTypes>()
    const latestRows = deferred<typeof baselineRows>(), latestTypes = deferred<typeof baselineTypes>()
    const requestRows = vi.spyOn(attendanceApi, 'getLeaves')
      .mockReturnValueOnce(firstRows.promise)
      .mockReturnValueOnce(middleRows.promise)
      .mockReturnValueOnce(latestRows.promise)
    const requestTypes = vi.spyOn(attendanceApi, 'getLeaveTypes')
      .mockReturnValueOnce(firstTypes.promise)
      .mockReturnValueOnce(middleTypes.promise)
      .mockReturnValueOnce(latestTypes.promise)
    const filters = { employeeIds: ['emp-2'], status: 'PENDING' as const, startDate: '2026-08-04', endDate: '2026-08-19' }
    try {
      wrapper.getComponent({ name: 'MobileLeaveList' }).vm.$emit('applyFilters', filters)
      await nextTick()
      attendanceLayout.mobile.value = false
      await nextTick()
      attendanceLayout.mobile.value = true
      await nextTick()

      expect(requestRows).toHaveBeenCalledTimes(3)
      expect(requestTypes).toHaveBeenCalledTimes(3)
      expect(requestRows.mock.calls).toEqual(Array.from({ length: 3 }, () => [{
        employeeId: undefined, employeeIds: ['emp-2'], month: undefined,
        startDate: '2026-08-04', endDate: '2026-08-19', status: 'PENDING'
      }]))
      const currentRows = [{ ...baselineRows[0]!, id: 'latest-layout-leave', employeeId: 'emp-2', status: 'PENDING' as const }]
      const currentTypes = [{ ...baselineTypes[0]!, id: 'latest-layout-type', name: '最新布局类型' }]
      latestTypes.resolve(currentTypes)
      latestRows.resolve(currentRows)
      await flushPromises()
      expect(store.leaves).toEqual(currentRows)
      expect(store.leaveTypes).toEqual(currentTypes)
      expect(store.loading).toBe(false)

      firstTypes.resolve([{ ...baselineTypes[0]!, id: 'obsolete-first-type' }])
      firstRows.resolve([{ ...baselineRows[0]!, id: 'obsolete-first-leave' }])
      middleTypes.resolve([{ ...baselineTypes[0]!, id: 'obsolete-middle-type' }])
      middleRows.reject(new Error('旧布局刷新失败'))
      await flushPromises()
      expect(store.leaves).toEqual(currentRows)
      expect(store.leaveTypes).toEqual(currentTypes)
      expect(store.error).toBe('')
      expect(store.loading).toBe(false)
    } finally {
      firstTypes.resolve(baselineTypes); firstRows.resolve(baselineRows)
      middleTypes.resolve(baselineTypes); middleRows.resolve(baselineRows)
      latestTypes.resolve(baselineTypes); latestRows.resolve(baselineRows)
      wrapper.unmount(); requestRows.mockRestore(); requestTypes.mockRestore()
    }
  })

  it('cancels an initial leave load on unmount without starting a replacement', async () => {
    const baselineRows = await attendanceApi.getLeaves({}), baselineTypes = await attendanceApi.getLeaveTypes()
    const pinia = createPinia()
    const store = useEmployeeAttendanceStore(pinia)
    await store.loadEmployees()
    const rows = deferred<typeof baselineRows>(), types = deferred<typeof baselineTypes>()
    const requestRows = vi.spyOn(attendanceApi, 'getLeaves').mockReturnValue(rows.promise)
    const requestTypes = vi.spyOn(attendanceApi, 'getLeaveTypes').mockReturnValue(types.promise)
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await nextTick()
    expect(requestRows).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    await nextTick()
    expect(requestRows).toHaveBeenCalledTimes(1)
    expect(requestTypes).toHaveBeenCalledTimes(1)
    expect(store.loading).toBe(false)
    types.resolve([{ ...baselineTypes[0]!, id: 'late-unmounted-type' }])
    rows.reject(new Error('卸载后的初始加载失败'))
    await flushPromises()
    expect(store.leaves).toEqual([])
    expect(store.leaveTypes).toEqual([])
    expect(store.error).toBe('')
    expect(requestRows).toHaveBeenCalledTimes(1)
    requestRows.mockRestore(); requestTypes.mockRestore()
  })

  it('uses full-screen mobile leave editing and disables actions for processed or payroll-locked records', async () => {
    attendanceLayout.mobile.value = true
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const store = useEmployeeAttendanceStore(pinia)
    store.leaves[0]!.lockedAt = '2026-08-31T12:00:00+08:00'
    await nextTick()

    const locked = wrapper.get('[data-testid="mobile-leave-card-leave-1"]')
    expect(locked.text()).toContain('工资已锁定')
    for (const action of ['edit', 'approve', 'reject', 'remove']) expect(locked.get(`[data-testid="mobile-${action}-leave-leave-1"]`).attributes('disabled')).toBeDefined()
    const processed = wrapper.get('[data-testid="mobile-leave-card-leave-2"]')
    expect(processed.text()).toContain('已处理')
    for (const action of ['edit', 'approve', 'reject', 'remove']) expect(processed.get(`[data-testid="mobile-${action}-leave-leave-2"]`).attributes('disabled')).toBeDefined()

    store.leaves[0]!.lockedAt = null
    await nextTick()
    await wrapper.get('[data-testid="mobile-edit-leave-leave-1"]').trigger('click')
    const editor = wrapper.getComponent({ name: 'MobileFullscreenDialog' })
    expect(editor.props('fullscreen')).toBe(true)
    expect(wrapper.get('[data-testid="mobile-leave-editor"]').classes()).toContain('mobile-fullscreen-dialog--active')
    expect(wrapper.get('[data-testid="mobile-leave-editor"]').attributes('style')).toContain('100dvh')
    expect((wrapper.get('[data-testid="leave-reason"]').element as HTMLTextAreaElement).value).toBe('个人事务')
    wrapper.unmount()
  })

  it('confirms approval and deletion exactly, prompts for rejection reason, and blocks duplicate reviews', async () => {
    attendanceLayout.mobile.value = true
    let resolveReview!: (leave: Awaited<ReturnType<typeof attendanceApi.reviewLeave>>) => void
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const prompt = vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '材料不足' } as any)
    const review = vi.spyOn(attendanceApi, 'reviewLeave').mockReturnValue(new Promise((resolve) => { resolveReview = resolve }))
    const remove = vi.spyOn(attendanceApi, 'deleteLeave').mockResolvedValue(undefined as any)
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const row = useEmployeeAttendanceStore(pinia).leaves[0]!

    await wrapper.get('[data-testid="mobile-approve-leave-leave-1"]').trigger('click')
    await wrapper.get('[data-testid="mobile-approve-leave-leave-1"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('批准后将按现有服务端规则计入排班与工资，是否继续？', '确认批准请假', { type: 'warning' })
    expect(review).toHaveBeenCalledTimes(1)
    expect(review).toHaveBeenCalledWith('leave-1', 'approve', '')
    resolveReview({ ...row, status: 'APPROVED' })
    await flushPromises()

    review.mockResolvedValue({ ...row, status: 'REJECTED', reviewRemark: '材料不足' })
    await wrapper.get('[data-testid="mobile-reject-leave-leave-1"]').trigger('click')
    await flushPromises()
    expect(prompt).toHaveBeenCalledWith('请填写驳回原因', '驳回请假', { inputPattern: /\S+/, inputErrorMessage: '请填写驳回原因' })
    expect(review).toHaveBeenLastCalledWith('leave-1', 'reject', '材料不足')

    await wrapper.get('[data-testid="mobile-remove-leave-leave-1"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenLastCalledWith('删除后无法恢复，是否继续？', '确认删除请假', { type: 'warning' })
    expect(remove).toHaveBeenCalledWith('leave-1')
    wrapper.unmount(); confirm.mockRestore(); prompt.mockRestore(); review.mockRestore(); remove.mockRestore()
  })

  it('keeps the legacy desktop blank rejection remark while mobile requires a nonblank reason', async () => {
    const prompt = vi.spyOn(ElMessageBox, 'prompt').mockResolvedValue({ value: '' } as any)
    const review = vi.spyOn(attendanceApi, 'reviewLeave').mockImplementation(async (id, action, reviewRemark) => ({
      ...(await attendanceApi.getLeaves({})).find((row) => row.id === id)!, status: action === 'approve' ? 'APPROVED' as const : 'REJECTED' as const, reviewRemark: reviewRemark ?? ''
    }))
    const desktop = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await desktop.findAll('button').find((node) => node.text() === '驳回')!.trigger('click')
    await flushPromises()
    expect(prompt).toHaveBeenNthCalledWith(1, '请填写驳回原因', '驳回请假')
    expect(review).toHaveBeenCalledWith('leave-1', 'reject', '')
    desktop.unmount()

    attendanceLayout.mobile.value = true
    prompt.mockResolvedValue({ value: '   ' } as any)
    review.mockClear()
    const mobile = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await mobile.get('[data-testid="mobile-reject-leave-leave-1"]').trigger('click')
    await flushPromises()
    expect(prompt).toHaveBeenLastCalledWith('请填写驳回原因', '驳回请假', { inputPattern: /\S+/, inputErrorMessage: '请填写驳回原因' })
    expect(review).not.toHaveBeenCalled()
    mobile.unmount(); prompt.mockRestore(); review.mockRestore()
  })

  it('confirms mobile leave-type deletion or deactivation exactly and never edits a referenced type', async () => {
    attendanceLayout.mobile.value = true
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const remove = vi.spyOn(attendanceApi, 'deleteLeaveType').mockResolvedValue(undefined as any)
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')

    const edit = wrapper.get('[data-testid="mobile-edit-leave-type-leave-type-rest"]')
    expect(edit.attributes('disabled')).toBeDefined()
    await edit.trigger('click')
    expect(wrapper.find('[data-testid="mobile-leave-type-editor"]').exists()).toBe(false)

    await wrapper.get('[data-testid="mobile-remove-leave-type-leave-type-rest"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('删除或停用后需重新编辑才能恢复，是否继续？', '确认删除或停用请假类型', { type: 'warning' })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('leave-type-rest')
    wrapper.unmount(); confirm.mockRestore(); remove.mockRestore()
  })

  it('retains every leave field and exposes an active same-revision save failure', async () => {
    attendanceLayout.mobile.value = true
    const pending = deferred<Awaited<ReturnType<typeof attendanceApi.saveLeave>>>()
    const save = vi.spyOn(attendanceApi, 'saveLeave').mockReturnValue(pending.promise)
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-create-leave"]').trigger('click')
    const editor = wrapper.get('[data-testid="mobile-leave-editor"]')
    const selects = editor.findAllComponents({ name: 'ElSelect' })
    selects[0]!.vm.$emit('update:modelValue', 'emp-1')
    selects[1]!.vm.$emit('update:modelValue', 'leave-type-sick')
    selects[2]!.vm.$emit('update:modelValue', 'HOUR')
    await nextTick()
    const dates = editor.findAllComponents({ name: 'ElDatePicker' })
    dates[0]!.vm.$emit('update:modelValue', '2026-08-18')
    dates[1]!.vm.$emit('update:modelValue', '2026-08-18')
    const hours = editor.getComponent({ name: 'ElInputNumber' })
    hours.vm.$emit('update:modelValue', 3.5)
    await wrapper.get('[data-testid="leave-reason"]').setValue('同版本失败草稿')
    await wrapper.get('[data-testid="leave-save"]').trigger('click')
    pending.reject(new Error('请假保存冲突'))
    await flushPromises()

    expect(selects.map((node: any) => node.props('modelValue'))).toEqual(['emp-1', 'leave-type-sick', 'HOUR'])
    expect(dates.map((node: any) => node.props('modelValue'))).toEqual(['2026-08-18', '2026-08-18'])
    expect(hours.props('modelValue')).toBe(3.5)
    expect((wrapper.get('[data-testid="leave-reason"]').element as HTMLTextAreaElement).value).toBe('同版本失败草稿')
    expect(wrapper.text()).toContain('请假保存冲突')
    wrapper.unmount(); save.mockRestore()
  })

  it('retains every leave-type field and exposes an active same-revision save failure', async () => {
    attendanceLayout.mobile.value = true
    const pending = deferred<Awaited<ReturnType<typeof attendanceApi.saveLeaveType>>>()
    const save = vi.spyOn(attendanceApi, 'saveLeaveType').mockReturnValue(pending.promise)
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
    await wrapper.get('[data-testid="mobile-create-leave-type"]').trigger('click')
    await wrapper.get('[data-testid="leave-type-name"]').setValue('同版本类型草稿')
    const switches = wrapper.get('[data-testid="mobile-leave-type-editor"]').findAllComponents({ name: 'ElSwitch' })
    switches[0]!.vm.$emit('update:modelValue', false)
    switches[1]!.vm.$emit('update:modelValue', false)
    await nextTick()
    await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
    pending.reject(new Error('类型保存冲突'))
    await flushPromises()

    expect((wrapper.get('[data-testid="leave-type-name"]').element as HTMLInputElement).value).toBe('同版本类型草稿')
    expect(switches.map((node: any) => node.props('modelValue'))).toEqual([false, false])
    expect(wrapper.text()).toContain('类型保存冲突')
    wrapper.unmount(); save.mockRestore()
  })

  it('retains a newer leave draft after an older failure and adopts a successful create id for the next save', async () => {
    attendanceLayout.mobile.value = true
    let rejectFirst!: (error: Error) => void
    const pinia = createPinia()
    const save = vi.spyOn(attendanceApi, 'saveLeave').mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject }))
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-leave"]').trigger('click')
    await wrapper.get('[data-testid="leave-reason"]').setValue('提交版本')
    await wrapper.get('[data-testid="leave-save"]').trigger('click')
    await wrapper.get('[data-testid="leave-reason"]').setValue('保存期间的新原因')
    await wrapper.get('[data-testid="leave-save"]').trigger('click')
    expect(save).toHaveBeenCalledTimes(1)
    rejectFirst(new Error('旧请假保存失败'))
    await flushPromises()
    expect((wrapper.get('[data-testid="leave-reason"]').element as HTMLTextAreaElement).value).toBe('保存期间的新原因')
    expect(wrapper.text()).not.toContain('旧请假保存失败')

    let resolveCreate!: (leave: Awaited<ReturnType<typeof attendanceApi.saveLeave>>) => void
    const existing = useEmployeeAttendanceStore(pinia).leaves[0]!
    const created = { ...existing, id: 'leave-created-during-edit', reason: '服务端版本', status: 'PENDING' as const }
    save.mockRestore()
    const createThenUpdate = vi.spyOn(attendanceApi, 'saveLeave')
      .mockReturnValueOnce(new Promise((resolve) => { resolveCreate = resolve }))
      .mockResolvedValueOnce(created)
    wrapper.getComponent({ name: 'MobileFullscreenDialog' }).vm.$emit('update:modelValue', false)
    await nextTick()
    await wrapper.get('[data-testid="mobile-create-leave"]').trigger('click')
    await wrapper.get('[data-testid="leave-reason"]').setValue('创建提交版本')
    await wrapper.get('[data-testid="leave-save"]').trigger('click')
    await wrapper.get('[data-testid="leave-reason"]').setValue('创建期间的新原因')
    resolveCreate(created)
    await flushPromises()
    expect(wrapper.get('[data-testid="mobile-leave-editor"]').text()).toContain('编辑请假')
    expect((wrapper.get('[data-testid="leave-reason"]').element as HTMLTextAreaElement).value).toBe('创建期间的新原因')
    await wrapper.get('[data-testid="leave-save"]').trigger('click')
    await flushPromises()
    expect(createThenUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({ reason: '创建期间的新原因' }), 'leave-created-during-edit')
    expect(wrapper.getComponent({ name: 'MobileFullscreenDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount(); createThenUpdate.mockRestore()
  })

  it('uses a full-screen leave-type editor and retains newer type input after a failed save', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveLeaveType').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
    await wrapper.get('[data-testid="mobile-create-leave-type"]').trigger('click')

    const dialogs = wrapper.findAllComponents({ name: 'MobileFullscreenDialog' })
    const typeEditor = dialogs.find((node) => node.props('title') === '新增请假类型')!
    expect(typeEditor.props('fullscreen')).toBe(true)
    expect(wrapper.get('[data-testid="mobile-leave-type-editor"]').attributes('style')).toContain('100dvh')
    await wrapper.get('[data-testid="leave-type-name"]').setValue('陪护假')
    await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
    await wrapper.get('[data-testid="leave-type-name"]').setValue('陪护假新草稿')
    await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
    expect(save).toHaveBeenCalledTimes(1)
    rejectSave(new Error('旧类型保存失败'))
    await flushPromises()

    expect((wrapper.get('[data-testid="leave-type-name"]').element as HTMLInputElement).value).toBe('陪护假新草稿')
    expect(wrapper.text()).not.toContain('旧类型保存失败')
    wrapper.unmount(); save.mockRestore()
  })

  it('adopts a created leave-type id for a newer edit and uses it on the next save', async () => {
    attendanceLayout.mobile.value = true
    const pending = deferred<Awaited<ReturnType<typeof attendanceApi.saveLeaveType>>>()
    const created = { id: 'leave-type-created-during-edit', name: '服务端名称', active: true, countsTowardRestQuota: true, referenced: false }
    const save = vi.spyOn(attendanceApi, 'saveLeaveType')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(created)
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
    await wrapper.get('[data-testid="mobile-create-leave-type"]').trigger('click')
    await wrapper.get('[data-testid="leave-type-name"]').setValue('类型提交版本')
    await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
    await wrapper.get('[data-testid="leave-type-name"]').setValue('类型保存期间的新草稿')
    pending.resolve(created)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-leave-type-editor"]').text()).toContain('编辑请假类型')
    expect((wrapper.get('[data-testid="leave-type-name"]').element as HTMLInputElement).value).toBe('类型保存期间的新草稿')
    await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: '类型保存期间的新草稿' }), 'leave-type-created-during-edit')
    wrapper.unmount(); save.mockRestore()
  })

  it('never adopts a created leave-type id after that editor session is closed', async () => {
    attendanceLayout.mobile.value = true
    const pending = deferred<Awaited<ReturnType<typeof attendanceApi.saveLeaveType>>>()
    const created = { id: 'stale-created-type', name: '旧会话服务端名称', active: true, countsTowardRestQuota: true, referenced: false }
    const save = vi.spyOn(attendanceApi, 'saveLeaveType')
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(created)
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
    await wrapper.get('[data-testid="mobile-create-leave-type"]').trigger('click')
    await wrapper.get('[data-testid="leave-type-name"]').setValue('将关闭的类型会话')
    await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
    wrapper.getComponent({ name: 'MobileFullscreenDialog' }).vm.$emit('update:modelValue', false)
    await nextTick()
    pending.resolve(created)
    await flushPromises()

    await wrapper.get('[data-testid="mobile-create-leave-type"]').trigger('click')
    await wrapper.get('[data-testid="leave-type-name"]').setValue('全新类型会话')
    await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: '全新类型会话' }), undefined)
    wrapper.unmount(); save.mockRestore()
  })

  it('serializes desktop leave-type saves against delete or deactivate operations in both directions', async () => {
    const firstSave = deferred<Awaited<ReturnType<typeof attendanceApi.saveLeaveType>>>()
    const save = vi.spyOn(attendanceApi, 'saveLeaveType').mockReturnValue(firstSave.promise)
    const remove = vi.spyOn(attendanceApi, 'deleteLeaveType').mockResolvedValue(undefined as any)
    const first = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    const name = first.get('input[placeholder="类型名称"]')
    await name.setValue('串行保存类型')
    await first.findAll('button').find((node) => node.text() === '新增类型')!.trigger('click')
    await first.findAll('button').find((node) => node.text() === '删除/停用')!.trigger('click')
    expect(save).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
    firstSave.resolve({ id: 'serialized-type', name: '串行保存类型', active: true, countsTowardRestQuota: true, referenced: false })
    await flushPromises()
    first.unmount()

    save.mockReset()
    const pendingRemove = deferred<void>()
    remove.mockReturnValue(pendingRemove.promise)
    const second = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await second.findAll('button').find((node) => node.text() === '删除/停用')!.trigger('click')
    await second.get('input[placeholder="类型名称"]').setValue('删除期间不可保存')
    await second.findAll('button').find((node) => node.text() === '新增类型')!.trigger('click')
    await second.findAll('button').find((node) => node.text() === '删除/停用')!.trigger('click')
    expect(remove).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    pendingRemove.resolve()
    await flushPromises()
    second.unmount(); save.mockRestore(); remove.mockRestore()
  })

  it('serializes mobile leave-type delete confirmation against create and save actions', async () => {
    attendanceLayout.mobile.value = true
    const confirmation = deferred<any>()
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockReturnValue(confirmation.promise)
    const remove = vi.spyOn(attendanceApi, 'deleteLeaveType').mockResolvedValue(undefined as any)
    const save = vi.spyOn(attendanceApi, 'saveLeaveType')
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [createPinia(), ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
    await wrapper.get('[data-testid="mobile-remove-leave-type-leave-type-rest"]').trigger('click')
    await wrapper.get('[data-testid="mobile-remove-leave-type-leave-type-rest"]').trigger('click')
    expect(wrapper.get('[data-testid="mobile-create-leave-type"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="mobile-create-leave-type"]').trigger('click')
    expect(wrapper.find('[data-testid="mobile-leave-type-editor"]').exists()).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    confirmation.resolve('confirm')
    await flushPromises()
    expect(remove).toHaveBeenCalledTimes(1)
    wrapper.unmount(); confirm.mockRestore(); remove.mockRestore(); save.mockRestore()
  })

  it.each([
    ['leave save', 'resolve'], ['leave save', 'reject'],
    ['leave review', 'resolve'], ['leave review', 'reject'],
    ['leave delete', 'resolve'], ['leave delete', 'reject'],
    ['type save', 'resolve'], ['type save', 'reject'],
    ['type delete', 'resolve'], ['type delete', 'reject']
  ] as const)('silences a post-%s refresh after actual unmount and late %s', async (mutation, settlement) => {
    attendanceLayout.mobile.value = true
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    const store = useEmployeeAttendanceStore(pinia)
    const originalIds = store.leaves.map((row) => row.id)
    const refresh = deferred<Awaited<ReturnType<typeof attendanceApi.getLeaves>>>()
    const request = vi.spyOn(attendanceApi, 'getLeaves').mockReturnValue(refresh.promise)
    const leave = store.leaves.find((row) => row.status === 'PENDING')!
    const type = store.leaveTypes[0]!
    const saveLeave = vi.spyOn(attendanceApi, 'saveLeave').mockResolvedValue({ ...leave, reason: '已保存' })
    const reviewLeave = vi.spyOn(attendanceApi, 'reviewLeave').mockResolvedValue({ ...leave, status: 'APPROVED' })
    const deleteLeave = vi.spyOn(attendanceApi, 'deleteLeave').mockResolvedValue(undefined as any)
    const saveType = vi.spyOn(attendanceApi, 'saveLeaveType').mockResolvedValue({ id: 'created-type', name: '卸载刷新类型', active: true, countsTowardRestQuota: true, referenced: false })
    const deleteType = vi.spyOn(attendanceApi, 'deleteLeaveType').mockResolvedValue(undefined as any)
    let settled = false
    try {
      if (mutation === 'leave save') {
        await wrapper.get(`[data-testid="mobile-edit-leave-${leave.id}"]`).trigger('click')
        await wrapper.get('[data-testid="leave-save"]').trigger('click')
      } else if (mutation === 'leave review') {
        await wrapper.get(`[data-testid="mobile-approve-leave-${leave.id}"]`).trigger('click')
      } else if (mutation === 'leave delete') {
        await wrapper.get(`[data-testid="mobile-remove-leave-${leave.id}"]`).trigger('click')
      } else if (mutation === 'type save') {
        await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
        await wrapper.get('[data-testid="mobile-create-leave-type"]').trigger('click')
        await wrapper.get('[data-testid="leave-type-name"]').setValue('卸载刷新类型')
        await wrapper.get('[data-testid="leave-type-save"]').trigger('click')
      } else {
        await wrapper.get('[data-testid="mobile-leave-tab-types"]').trigger('click')
        await wrapper.get(`[data-testid="mobile-remove-leave-type-${type.id}"]`).trigger('click')
      }
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
      expect(store.loading).toBe(true)
      wrapper.unmount()
      expect(store.loading).toBe(false)
      if (settlement === 'resolve') refresh.resolve([{ ...leave, id: `late-${mutation}` }])
      else refresh.reject(new Error(`late ${mutation} refresh failure`))
      settled = true
      await flushPromises()
      expect(store.leaves.map((row) => row.id)).toEqual(originalIds)
      expect(store.error).toBe('')
      expect(store.loading).toBe(false)
    } finally {
      if (!settled) refresh.resolve([])
      if (wrapper.exists()) wrapper.unmount()
      confirm.mockRestore(); request.mockRestore(); saveLeave.mockRestore(); reviewLeave.mockRestore(); deleteLeave.mockRestore(); saveType.mockRestore(); deleteType.mockRestore()
    }
  })

  it('ignores leave save settlement after layout change or unmount', async () => {
    attendanceLayout.mobile.value = true
    let rejectSave!: (error: Error) => void
    const save = vi.spyOn(attendanceApi, 'saveLeave').mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject }))
    const pinia = createPinia()
    const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-create-leave"]').trigger('click')
    await wrapper.get('[data-testid="leave-reason"]').setValue('将失效的草稿')
    await wrapper.get('[data-testid="leave-save"]').trigger('click')
    attendanceLayout.mobile.value = false
    await nextTick()
    rejectSave(new Error('布局变更后的旧失败'))
    await flushPromises()

    expect(useEmployeeAttendanceStore(pinia).error).toBe('')
    expect(wrapper.text()).not.toContain('布局变更后的旧失败')
    wrapper.unmount(); save.mockRestore()
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
