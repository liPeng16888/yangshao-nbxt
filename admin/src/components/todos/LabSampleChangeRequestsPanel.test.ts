import { defineComponent, h, nextTick, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LabSampleChangeRequestsPanel from './LabSampleChangeRequestsPanel.vue'

const api = vi.hoisted(() => ({
  getFrontendOptions: vi.fn(),
  getAdminLabSampleChangeRequests: vi.fn(),
  getAdminLabSampleChangeRequest: vi.fn(),
  approveAdminLabSampleChangeRequest: vi.fn(),
  rejectAdminLabSampleChangeRequest: vi.fn()
}))
const element = vi.hoisted(() => ({
  message: { success: vi.fn(), warning: vi.fn() },
  messageBox: { prompt: vi.fn() }
}))

vi.mock('../../api', () => api)
vi.mock('element-plus', () => ({ ElMessage: element.message, ElMessageBox: element.messageBox }))

const frontendOptions = [
  { id: 'front-1', account: 'kaili001', name: '凯里化验室', disabled: false },
  { id: 'front-2', account: 'yangshao002', name: '仰韶客户二', disabled: false }
]

const pendingSummary = {
  id: 'request-1', frontendUserId: 'front-1', blockId: 'block-1', date: '2026-08-19', blockIndex: 1,
  sampleName: '旧样品', changedFieldLabels: ['样品编号', '价格', '铁'], reason: '客户要求更正', status: 'PENDING',
  review: null, withdrawnAt: null, createdAt: '2026-08-20T01:00:00.000Z', updatedAt: '2026-08-20T01:00:00.000Z'
}

const pendingDetail = {
  ...pendingSummary,
  sourceSnapshot: {
    inputs: { sampleNumber: '旧样品', customerText: '旧客户', price: 80, paymentStatus: '月结款', ironRaw: 1 },
    results: { iron: 25, total: 60 },
    parameterSnapshot: { ironBlank: 0, ironFactor: 25 },
    updatedAt: '2026-08-19T08:00:00.000Z'
  },
  requestedChanges: { sampleNumber: '新样品', price: 100, ironRaw: 2 },
  previewResults: { iron: 50, total: 85 },
  settlementEffects: []
}

let activeRows: Record<string, unknown>[] = []
const TableStub = defineComponent({
  name: 'ElTable',
  props: { data: { type: Array as PropType<Record<string, unknown>[]>, default: () => [] } },
  setup(props, { slots }) {
    return () => {
      activeRows = props.data
      return h('div', { class: 'table-stub' }, [JSON.stringify(props.data), slots.default?.()])
    }
  }
})
const TableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: { label: String },
  setup(props, { slots }) {
    return () => h('div', [props.label, ...(activeRows[0] ? slots.default?.({ row: activeRows[0] }) || [] : [])])
  }
})
const SelectStub = defineComponent({
  name: 'ElSelect',
  props: { modelValue: { type: [Array, String] as PropType<string[] | string>, default: '' } },
  emits: ['update:modelValue', 'change'],
  template: '<div class="select-stub"><slot /></div>'
})
const DatePickerStub = defineComponent({
  name: 'ElDatePicker',
  props: { modelValue: String },
  emits: ['update:modelValue', 'change'],
  template: '<div class="date-picker-stub" />'
})
const ButtonStub = defineComponent({
  name: 'ElButton',
  inheritAttrs: false,
  emits: ['click'],
  template: '<button type="button" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>'
})
const DialogStub = defineComponent({
  name: 'ElDialog',
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" class="dialog-stub"><h3>{{ title }}</h3><slot /></section>'
})

const stubs = {
  ElSelect: SelectStub,
  ElOption: defineComponent({ name: 'ElOption', template: '<span />' }),
  ElDatePicker: DatePickerStub,
  ElButton: ButtonStub,
  ElTable: TableStub,
  ElTableColumn: TableColumnStub,
  ElTag: defineComponent({ name: 'ElTag', template: '<span><slot /></span>' }),
  ElDialog: DialogStub,
  ElDescriptions: defineComponent({ name: 'ElDescriptions', template: '<dl><slot /></dl>' }),
  ElDescriptionsItem: defineComponent({ name: 'ElDescriptionsItem', props: ['label'], template: '<div>{{ label }}<slot /></div>' }),
  ElAlert: defineComponent({ name: 'ElAlert', props: ['title'], template: '<div><strong>{{ title }}</strong><slot /></div>' }),
  ElEmpty: defineComponent({ name: 'ElEmpty', props: ['description'], template: '<div>{{ description }}</div>' })
}

function mountPanel() {
  return mount(LabSampleChangeRequestsPanel, { global: { stubs, directives: { loading: () => undefined } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getFrontendOptions.mockResolvedValue(frontendOptions)
  api.getAdminLabSampleChangeRequests.mockResolvedValue([pendingSummary])
  api.getAdminLabSampleChangeRequest.mockResolvedValue(pendingDetail)
  api.approveAdminLabSampleChangeRequest.mockResolvedValue({ ...pendingDetail, status: 'APPROVED' })
  api.rejectAdminLabSampleChangeRequest.mockResolvedValue({ ...pendingDetail, status: 'REJECTED' })
  element.messageBox.prompt.mockResolvedValue({ value: '' })
})

describe('LabSampleChangeRequestsPanel', () => {
  it('loads every permitted account and sends account, status, and date filters', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    expect(api.getAdminLabSampleChangeRequests).toHaveBeenCalledWith({ frontendUserIds: ['front-1', 'front-2'] })
    const [accounts, status] = wrapper.findAllComponents(SelectStub)
    accounts.vm.$emit('update:modelValue', ['front-1'])
    status.vm.$emit('update:modelValue', 'PENDING')
    wrapper.getComponent(DatePickerStub).vm.$emit('update:modelValue', '2026-08-19')
    await wrapper.get('[data-testid="sample-change-search"]').trigger('click')
    await flushPromises()

    expect(api.getAdminLabSampleChangeRequests).toHaveBeenLastCalledWith({
      frontendUserIds: ['front-1'], status: 'PENDING', date: '2026-08-19'
    })
    expect(wrapper.text()).toContain('凯里化验室（kaili001）')
  })

  it('shows server detail old/new values and formula results read-only, then approves the whole request with an optional remark', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.get('[data-testid="view-sample-change-request-1"]').trigger('click')
    await flushPromises()
    expect(api.getAdminLabSampleChangeRequest).toHaveBeenCalledWith('request-1')
    expect(wrapper.text()).toContain('旧样品')
    expect(wrapper.text()).toContain('新样品')
    expect(wrapper.text()).toContain('公式结果预览')
    expect(wrapper.text()).toContain('25')
    expect(wrapper.text()).toContain('50')
    expect(wrapper.text()).toContain('审批通过后，受影响的已结款或部分结款月结记录将重置为未结款')
    expect(wrapper.find('input').exists()).toBe(false)

    element.messageBox.prompt.mockResolvedValueOnce({ value: '   ' })
    await wrapper.get('[data-testid="approve-sample-change-request-1"]').trigger('click')
    await flushPromises()
    expect(element.messageBox.prompt).toHaveBeenCalledWith(
      expect.stringContaining('整份申请'),
      '同意样品修改申请',
      expect.objectContaining({ inputPlaceholder: '可选：填写审批备注', type: 'warning' })
    )
    expect(api.approveAdminLabSampleChangeRequest).toHaveBeenCalledWith('request-1', '')
    expect(api.getAdminLabSampleChangeRequests).toHaveBeenCalledTimes(2)
  })

  it('requires a trimmed rejection reason and reloads the active filters only after success', async () => {
    const wrapper = mountPanel()
    await flushPromises()

    element.messageBox.prompt.mockResolvedValueOnce({ value: '  ' })
    await wrapper.get('[data-testid="reject-sample-change-request-1"]').trigger('click')
    await flushPromises()
    expect(element.message.warning).toHaveBeenCalledWith('请填写拒绝原因')
    expect(api.rejectAdminLabSampleChangeRequest).not.toHaveBeenCalled()

    const [accounts, status] = wrapper.findAllComponents(SelectStub)
    accounts.vm.$emit('update:modelValue', ['front-1'])
    status.vm.$emit('update:modelValue', 'PENDING')
    wrapper.getComponent(DatePickerStub).vm.$emit('update:modelValue', '2026-08-19')
    await nextTick()
    element.messageBox.prompt.mockResolvedValueOnce({ value: '  原始凭证不一致  ' })
    await wrapper.get('[data-testid="reject-sample-change-request-1"]').trigger('click')
    await flushPromises()
    expect(api.rejectAdminLabSampleChangeRequest).toHaveBeenCalledWith('request-1', '原始凭证不一致')
    expect(element.message.success).toHaveBeenCalledWith('已拒绝样品修改申请')
    expect(api.getAdminLabSampleChangeRequests).toHaveBeenCalledTimes(2)
    expect(api.getAdminLabSampleChangeRequests).toHaveBeenLastCalledWith({
      frontendUserIds: ['front-1'], status: 'PENDING', date: '2026-08-19'
    })
  })

  it('renders terminal rows without approve or reject actions', async () => {
    api.getAdminLabSampleChangeRequests.mockResolvedValueOnce([{ ...pendingSummary, status: 'APPROVED' }])
    const wrapper = mountPanel()
    await flushPromises()

    expect(wrapper.find('[data-testid="view-sample-change-request-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="approve-sample-change-request-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="reject-sample-change-request-1"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('已处理')
  })

  it('keeps an explicit loading state, exposes a failed load, and retries with the same filters', async () => {
    let rejectLoad!: (reason: Error) => void
    api.getAdminLabSampleChangeRequests.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectLoad = reject }))
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.get('[data-testid="sample-change-loading"]').text()).toContain('正在加载')

    rejectLoad(new Error('请求超时'))
    await flushPromises()
    expect(wrapper.get('[data-testid="sample-change-load-error"]').text()).toContain('请求超时')
    await wrapper.get('[data-testid="sample-change-retry"]').trigger('click')
    await flushPromises()

    expect(api.getAdminLabSampleChangeRequests).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="sample-change-load-error"]').exists()).toBe(false)
  })
})
