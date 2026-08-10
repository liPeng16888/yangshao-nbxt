import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import appRouter from '@/router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { accessGuardFeatures, featureForPath } from '@/router/guards'
import { resetEmployeeAttendanceMock } from '@/mocks/employeeAttendance'
import { mockCreateEmployee } from '@/mocks/employeeAttendance'
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

  it('loads an existing month setting and clears stale values for an employee without a setting', async () => {
    const pinia = createPinia()
    const wrapper = mount(EmployeeSchedulesPage, { global: { plugins: [pinia, ElementPlus] } })
    const store = useEmployeeAttendanceStore(pinia)
    await flushPromises()
    store.employeeId = 'emp-1'
    await flushPromises()
    expect((wrapper.get('[data-testid="month-scheduled-days"] input').element as HTMLInputElement).value).toBe('22')
    expect((wrapper.get('[data-testid="month-rest-quota"] input').element as HTMLInputElement).value).toBe('4')

    const employee = await mockCreateEmployee({ employeeNumber: 'YG777', name: '无月设置员工', status: 'ACTIVE', hireDate: '2026-08-01', restQuotaDays: 3 })
    await store.loadEmployees()
    store.employeeId = employee.id
    await flushPromises()
    expect((wrapper.get('[data-testid="month-scheduled-days"] input').element as HTMLInputElement).value).toBe('0')
    expect((wrapper.get('[data-testid="month-rest-quota"] input').element as HTMLInputElement).value).toBe('3')
    wrapper.unmount()
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
})
