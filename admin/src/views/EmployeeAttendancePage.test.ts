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
  setup(_, { slots }) {
    return () => h('div', slots.default?.({ row: activeTableRows[0] }) || [])
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
  api.getAdminAttendanceSchedules.mockResolvedValue({ weekly: [], overrides: [], monthly: [] })
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

  it('loads both commissions and bonuses for the compensation route', async () => {
    Object.assign(routeState, { path: '/employee-attendance/compensation', meta: { employeeAttendancePage: 'compensation' } })
    mountPage()
    await flushPromises()
    expect(api.getAdminAttendanceCommissions).toHaveBeenCalledOnce()
    expect(api.getAdminAttendanceBonuses).toHaveBeenCalledOnce()
  })
})
