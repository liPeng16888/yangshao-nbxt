import { defineComponent, h, nextTick, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FinanceDeletionRequestsPanel from '../components/todos/FinanceDeletionRequestsPanel.vue'
import TodoPage from './TodoPage.vue'

const api = vi.hoisted(() => ({ request: { get: vi.fn(), post: vi.fn() } }))
const element = vi.hoisted(() => ({
  message: { success: vi.fn() },
  messageBox: { confirm: vi.fn(), prompt: vi.fn() }
}))

vi.mock('../api', () => api)
vi.mock('element-plus', () => ({ ElMessage: element.message, ElMessageBox: element.messageBox }))

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
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue', 'change'],
  template: '<div class="select-stub"><slot /></div>'
})
const ButtonStub = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
})
const DialogStub = defineComponent({
  name: 'ElDialog',
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue"><h3>{{ title }}</h3><slot /></section>'
})

const stubs = {
  ElSelect: SelectStub,
  ElOption: defineComponent({ name: 'ElOption', template: '<span />' }),
  ElButton: ButtonStub,
  ElTable: TableStub,
  ElTableColumn: TableColumnStub,
  ElTag: defineComponent({ name: 'ElTag', template: '<span><slot /></span>' }),
  ElDialog: DialogStub,
  ElDescriptions: defineComponent({ name: 'ElDescriptions', template: '<dl><slot /></dl>' }),
  ElDescriptionsItem: defineComponent({ name: 'ElDescriptionsItem', props: ['label'], template: '<div>{{ label }}<slot /></div>' })
}

const deletionRow = {
  id: 'delete-1', name: '凯里化验室', sourceLabel: '支出账单', sourceSummary: '2026-06-25 试剂耗材采购 ¥368.00',
  sourceSnapshot: { paymentDate: '2026-06-25', item: '试剂耗材采购', amount: 368, paymentMethod: 'online' },
  reason: '录入重复，需要删除', status: 'PENDING', statusLabel: '待审核', reviewRemark: '', createdAt: '2026-06-25 12:00:00'
}

function mountDeletionPanel() {
  return mount(FinanceDeletionRequestsPanel, { global: { stubs, directives: { loading: () => undefined } } })
}

function button(wrapper: ReturnType<typeof mountDeletionPanel>, text: string) {
  const match = wrapper.findAll('button').find((item) => item.text() === text)
  if (!match) throw new Error(`未找到按钮: ${text}`)
  return match
}

beforeEach(() => {
  vi.clearAllMocks()
  api.request.get.mockResolvedValue([deletionRow])
  api.request.post.mockResolvedValue({ ok: true })
  element.messageBox.confirm.mockResolvedValue('confirm')
  element.messageBox.prompt.mockResolvedValue({ value: '  原记录可保留  ' })
})

describe('FinanceDeletionRequestsPanel extraction regression', () => {
  it('preserves the existing list URL, status filter, table content, and detail snapshot wording', async () => {
    const wrapper = mountDeletionPanel()
    await flushPromises()

    expect(api.request.get).toHaveBeenCalledWith('/admin/finance/delete-requests', { params: undefined })
    expect(wrapper.text()).toContain('删除申请集中在此处理；审批后会通知对应前端账号。')
    expect(wrapper.text()).toContain('2026-06-25 试剂耗材采购 ¥368.00')

    wrapper.getComponent(SelectStub).vm.$emit('update:modelValue', 'APPROVED')
    wrapper.getComponent(SelectStub).vm.$emit('change')
    await flushPromises()
    expect(api.request.get).toHaveBeenLastCalledWith('/admin/finance/delete-requests', { params: { status: 'APPROVED' } })

    await button(wrapper, '详情').trigger('click')
    expect(wrapper.text()).toContain('删除申请详情')
    expect(wrapper.text()).toContain('支付日期')
    expect(wrapper.text()).toContain('¥368.00')
  })

  it('preserves the existing approve and reject URLs, confirmation text, payload, notices, and reloads', async () => {
    const wrapper = mountDeletionPanel()
    await flushPromises()

    await button(wrapper, '同意').trigger('click')
    await flushPromises()
    expect(element.messageBox.confirm).toHaveBeenCalledWith(
      '确认同意删除「2026-06-25 试剂耗材采购 ¥368.00」？同意后原记录会被删除，并通知前端账号。',
      '同意删除申请',
      { confirmButtonText: '同意删除', cancelButtonText: '取消', type: 'warning' }
    )
    expect(api.request.post).toHaveBeenCalledWith('/admin/finance/delete-requests/delete-1/approve')
    expect(element.message.success).toHaveBeenCalledWith('已同意删除申请，并发送前端提醒')

    await button(wrapper, '拒绝').trigger('click')
    await flushPromises()
    expect(element.messageBox.prompt).toHaveBeenCalledWith(
      '确认拒绝「2026-06-25 试剂耗材采购 ¥368.00」的删除申请？可填写拒绝原因。',
      '拒绝删除申请',
      { confirmButtonText: '确认拒绝', cancelButtonText: '取消', inputType: 'textarea', inputPlaceholder: '可填写拒绝原因', type: 'warning' }
    )
    expect(api.request.post).toHaveBeenCalledWith('/admin/finance/delete-requests/delete-1/reject', { reviewRemark: '原记录可保留' })
    expect(element.message.success).toHaveBeenCalledWith('已拒绝删除申请，并发送前端提醒')
    expect(api.request.get).toHaveBeenCalledTimes(3)
  })
})

describe('TodoPage categories', () => {
  const TabsStub = defineComponent({
    name: 'ElTabs',
    props: { modelValue: { type: String, default: '' } },
    emits: ['update:modelValue'],
    template: '<div class="tabs-stub"><slot /></div>'
  })
  const TabPaneStub = defineComponent({
    name: 'ElTabPane',
    props: { label: String, name: String },
    template: '<section>{{ label }}<slot /></section>'
  })
  const SamplePanelStub = defineComponent({ name: 'LabSampleChangeRequestsPanel', template: '<div data-testid="sample-panel-stub">样品申请数据</div>' })
  const DeletionPanelStub = defineComponent({ name: 'FinanceDeletionRequestsPanel', template: '<div data-testid="deletion-panel-stub">删除申请数据</div>' })

  it('owns only two tab states and lazy-renders each child without mixing their data', async () => {
    const wrapper = mount(TodoPage, { global: { stubs: {
      ...stubs,
      ElTabs: TabsStub,
      ElTabPane: TabPaneStub,
      LabSampleChangeRequestsPanel: SamplePanelStub,
      FinanceDeletionRequestsPanel: DeletionPanelStub
    }, directives: { loading: () => undefined } } })

    expect(wrapper.text()).toContain('样品修改申请')
    expect(wrapper.text()).toContain('删除申请')
    expect(wrapper.find('[data-testid="sample-panel-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="deletion-panel-stub"]').exists()).toBe(false)
    expect(api.request.get).not.toHaveBeenCalled()

    wrapper.getComponent(TabsStub).vm.$emit('update:modelValue', 'deletions')
    await nextTick()
    expect(wrapper.find('[data-testid="sample-panel-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="deletion-panel-stub"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('样品申请数据')
  })
})
