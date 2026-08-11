import { defineComponent, h, nextTick, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EmployeeAttendancePage from './EmployeeAttendancePage.vue'

const routeState = vi.hoisted(() => ({ path: '/employee-attendance/employees', meta: { employeeAttendancePage: 'employees' } }))
vi.mock('vue-router', () => ({ useRoute: () => routeState }))

const api = vi.hoisted(() => ({
  getFrontendOptions: vi.fn(),
  getAdminAttendanceOverview: vi.fn(),
  getAdminAttendanceEmployees: vi.fn(),
  getAdminAttendanceSchedules: vi.fn(),
  getAdminAttendanceRecords: vi.fn(),
  getAdminAttendanceLeaves: vi.fn(),
  getAdminAttendanceCommissions: vi.fn(),
  getAdminAttendanceBonuses: vi.fn(),
  getAdminAttendancePayroll: vi.fn(),
  getAdminAttendanceAudit: vi.fn(),
  revealAdminAttendanceEmployee: vi.fn()
}))
vi.mock('../api', () => api)

const SelectStub = defineComponent({
  name: 'ElSelect',
  props: { modelValue: { type: [Array, String] as PropType<string[] | string>, default: '' } },
  emits: ['update:modelValue', 'change'],
  template: '<div class="select-stub"><slot /></div>'
})
let activeTableRows: Record<string, unknown>[] = []
const TableStub = defineComponent({
  name: 'ElTable',
  props: { data: { type: Array as PropType<Record<string, unknown>[]>, default: () => [] } },
  setup(props, { slots }) {
    return () => {
      activeTableRows = props.data
      return h('div', { class: 'table-stub' }, [JSON.stringify(props.data), slots.default?.()])
    }
  }
})
const TableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: { label: String },
  setup(props, { slots }) {
    return () => h('div', [props.label, ...(slots.default?.({ row: activeTableRows[0] }) || [])])
  }
})
const ButtonStub = defineComponent({ name: 'ElButton', emits: ['click'], template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' })
const DialogStub = defineComponent({
  name: 'ElDialog',
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="dialog-stub"><h3>{{ title }}</h3><slot/><slot name="footer"/></section>'
})

const stubs = {
  ElSelect: SelectStub,
  ElOption: defineComponent({ name: 'ElOption', template: '<span />' }),
  ElTable: TableStub,
  ElTableColumn: TableColumnStub,
  ElButton: ButtonStub,
  ElDialog: DialogStub,
  ElForm: defineComponent({ name: 'ElForm', template: '<form><slot /></form>' }),
  ElFormItem: defineComponent({ name: 'ElFormItem', template: '<label><slot /></label>' }),
  ElInput: defineComponent({ name: 'ElInput', props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' }),
  ElDatePicker: defineComponent({ name: 'ElDatePicker', props: ['modelValue'], emits: ['update:modelValue', 'change'], template: '<div class="date-picker-stub" />' }),
  ElTag: defineComponent({ name: 'ElTag', template: '<span><slot /></span>' }),
  ElDescriptions: defineComponent({ name: 'ElDescriptions', template: '<dl><slot /></dl>' }),
  ElDescriptionsItem: defineComponent({ name: 'ElDescriptionsItem', props: ['label'], template: '<div>{{ label }}<slot /></div>' }),
  ElAlert: defineComponent({ name: 'ElAlert', props: ['title'], template: '<div>{{ title }}</div>' }),
  ElCard: defineComponent({ name: 'ElCard', template: '<article><slot /></article>' }),
  ElEmpty: defineComponent({ name: 'ElEmpty', props: ['description'], template: '<div>{{ description }}</div>' })
}

const employees = [{
  id: 'emp-1', frontendUserId: 'front-1', employeeNumber: 'YG001', name: '张三', status: 'ACTIVE', phone: '138****0001',
  idCardMasked: '410***********1234', bankCardMasked: '622*********7890', addressMasked: '洛阳市***',
  emergencyContactMasked: '张父***', hireDate: '2026-01-01', terminationDate: '', baseSalary: 6000,
  attendanceBonus: 300, overtimeHourlyRate: 30, restQuotaDays: 4, hasPhoto: false
}]

function mountPage() {
  return mount(EmployeeAttendancePage, { global: { stubs, directives: { loading: () => undefined } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(routeState, { path: '/employee-attendance/employees', meta: { employeeAttendancePage: 'employees' } })
  api.getFrontendOptions.mockResolvedValue([
    { id: 'front-1', account: 'kaili001', name: '凯里化验室', disabled: false },
    { id: 'front-2', account: 'yangshao002', name: '仰韶客户二', disabled: false }
  ])
  api.getAdminAttendanceEmployees.mockResolvedValue(employees)
  api.getAdminAttendanceOverview.mockResolvedValue({ month: '2026-08', workforce: 2, attendanceRecords: 20, pendingLeave: 1, payrollRuns: 1, readonly: true })
  api.getAdminAttendanceSchedules.mockResolvedValue([])
  api.getAdminAttendanceRecords.mockResolvedValue([])
  api.getAdminAttendanceLeaves.mockResolvedValue([])
  api.getAdminAttendanceCommissions.mockResolvedValue([])
  api.getAdminAttendanceBonuses.mockResolvedValue([])
  api.getAdminAttendancePayroll.mockResolvedValue([])
  api.getAdminAttendanceAudit.mockResolvedValue([])
  api.revealAdminAttendanceEmployee.mockResolvedValue({ ...employees[0], idCard: '410000199001011234', bankCard: '6222021234567890', address: '洛阳市涧西区', emergencyContact: '张父 13800001001' })
})

describe('EmployeeAttendancePage', () => {
  it('loads permitted accounts and forwards account, employee, month, date and status filters', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(api.getAdminAttendanceEmployees).toHaveBeenCalledWith(expect.objectContaining({ frontendUserIds: ['front-1', 'front-2'] }))

    const [account, employee, status] = wrapper.findAllComponents(SelectStub)
    account.vm.$emit('update:modelValue', ['front-1'])
    employee.vm.$emit('update:modelValue', 'emp-1')
    status.vm.$emit('update:modelValue', 'ACTIVE')
    await nextTick()
    await wrapper.get('[data-testid="employee-attendance-search"]').trigger('click')
    await flushPromises()

    expect(api.getAdminAttendanceEmployees).toHaveBeenLastCalledWith(expect.objectContaining({
      frontendUserIds: ['front-1'], employeeId: 'emp-1', status: 'ACTIVE'
    }))
  })

  it('renders only read-only controls and no business mutation or export action', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('仅查看')
    expect(wrapper.text()).toContain('查看完整信息')
    expect(wrapper.text()).not.toMatch(/新增|编辑|删除|审批|批准|拒绝|确认工资|撤销确认|导出/)
  })

  it('does not recognize the removed TERMINATED employee status', async () => {
    api.getAdminAttendanceEmployees.mockResolvedValueOnce([{ ...employees[0], status: 'TERMINATED' }])
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('TERMINATED')
    expect(wrapper.text()).not.toContain('离职')
  })

  it('reveals one employee only after password submission and refreshes the audit list', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('[data-testid="reveal-employee-emp-1"]').trigger('click')
    const password = wrapper.getComponent({ name: 'ElInput' })
    password.vm.$emit('update:modelValue', 'admin123456')
    await wrapper.get('[data-testid="confirm-employee-reveal"]').trigger('click')
    await flushPromises()

    expect(api.revealAdminAttendanceEmployee).toHaveBeenCalledWith('emp-1', 'admin123456', ['front-1', 'front-2'])
    expect(api.getAdminAttendanceAudit).toHaveBeenCalled()
    expect(wrapper.text()).toContain('410000199001011234')
  })

  it('keeps a failed password reveal in the dialog and allows a retry', async () => {
    api.revealAdminAttendanceEmployee.mockRejectedValueOnce(new Error('当前后台账号密码错误'))
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('[data-testid="reveal-employee-emp-1"]').trigger('click')
    const password = wrapper.getComponent({ name: 'ElInput' })
    password.vm.$emit('update:modelValue', 'wrong-password')
    await wrapper.get('[data-testid="confirm-employee-reveal"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('当前后台账号密码错误')
    expect(wrapper.find('[data-testid="confirm-employee-reveal"]').exists()).toBe(true)

    password.vm.$emit('update:modelValue', 'admin123456')
    await wrapper.get('[data-testid="confirm-employee-reveal"]').trigger('click')
    await flushPromises()
    expect(api.revealAdminAttendanceEmployee).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('410000199001011234')
  })

  it('loads both commissions and bonuses for the compensation route', async () => {
    Object.assign(routeState, { path: '/employee-attendance/compensation', meta: { employeeAttendancePage: 'compensation' } })
    api.getAdminAttendanceCommissions.mockResolvedValueOnce([{
      id: 'commission-1', frontendUserId: 'front-2', employeeId: 'emp-1', date: '2026-08-08', quantity: 2,
      unitPriceSnapshot: 18, amount: 36, commissionType: { id: 'type-1', name: '送样提成' }, employee: { employeeNumber: 'YG001', name: '张三' }
    }])
    const wrapper = mountPage()
    await flushPromises()
    expect(api.getAdminAttendanceCommissions).toHaveBeenCalledOnce()
    expect(api.getAdminAttendanceBonuses).toHaveBeenCalledOnce()
    expect((wrapper.getComponent(TableStub).props('data')!).at(0)!).toMatchObject({ accountName: '仰韶客户二（yangshao002）', unitPrice: 18 })
  })

  it('shows frontend account identity and formatted check-in/check-out values on attendance records', async () => {
    Object.assign(routeState, { path: '/employee-attendance/records', meta: { employeeAttendancePage: 'records' } })
    api.getAdminAttendanceRecords.mockResolvedValueOnce([{
      id: 'attendance-1', frontendUserId: 'front-2', employeeId: 'emp-1', date: '2026-08-08',
      checkInAt: '2026-08-08T00:05:00Z', checkOutAt: null, scheduledMinutes: 480,
      workedMinutes: 0, lateMinutes: 5, earlyLeaveMinutes: 0, explicitAbsenceMinutes: 0, absenceMinutes: 0, overtimeMinutes: 0,
      actualSegments: [{ sequence: 0, checkInAt: '2026-08-08T00:05:00Z', checkOutAt: '2026-08-08T04:00:00Z' }],
      employee: { employeeNumber: 'YG001', name: '张三' }
    }])
    const wrapper = mountPage()
    await flushPromises()

    expect((wrapper.getComponent(TableStub).props('data')!).at(0)!).toMatchObject({
      accountName: '仰韶客户二（yangshao002）', checkInText: '08:05', checkOutText: '12:00', actualIntervalsText: '08:05—12:00'
    })
  })

  it('renders monthly plan intervals and rest minutes without mutation controls', async () => {
    Object.assign(routeState, { path: '/employee-attendance/schedules', meta: { employeeAttendancePage: 'schedules' } })
    api.getAdminAttendanceSchedules.mockResolvedValueOnce([{
      id: 'day-1', frontendUserId: 'front-1', employeeId: 'emp-1', date: '2026-08-11', isWorkday: true,
      scheduledMinutes: 510, breakMinutes: 60, remark: '常规班',
      segments: [{ sequence: 0, startTime: '08:00', endTime: '12:00' }, { sequence: 1, startTime: '13:00', endTime: '17:30' }],
      employee: { employeeNumber: 'YG001', name: '张三' }
    }])
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('工作时段')
    expect(wrapper.text()).toContain('08:00—12:00')
    expect(wrapper.text()).toContain('13:00—17:30')
    expect(wrapper.text()).toContain('休息 60 分钟')
    expect(wrapper.text()).not.toMatch(/保存|复制上月|批量覆盖|编辑|删除/)
  })

  it('labels and renders a generic attendance audit with account, action and entity details', async () => {
    api.getAdminAttendanceAudit.mockResolvedValueOnce([{
      id: 'audit-1', frontendUserId: 'front-1', action: 'UPDATE', entityType: 'EmployeeAttendanceRecord',
      entityId: 'attendance-1', reason: '修正时间', createdAt: '2026-08-08T09:00:00+08:00', actorUser: { account: 'admin', username: '主账号', role: 'ROOT_ADMIN' }
    }])
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('员工考勤审计')
    expect(wrapper.text()).not.toContain('敏感信息查看审计')
    const auditTable = wrapper.findAllComponents(TableStub).at(-1)!
    expect((auditTable.props('data')!).at(0)!).toMatchObject({ accountName: '凯里化验室（kaili001）', actionLabel: '修改', entityLabel: '考勤记录' })
  })
})
