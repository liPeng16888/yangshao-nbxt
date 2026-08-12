import { defineComponent, h, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SharedPrepaidReadOnlyPage from './SharedPrepaidReadOnlyPage.vue'

const routeState = vi.hoisted(() => ({
  path: '/shared-prepaid/recharges',
  meta: { sharedPrepaidPage: 'recharges' }
}))
vi.mock('vue-router', () => ({ useRoute: () => routeState }))

const api = vi.hoisted(() => ({
  getAdminSharedPrepaidPage: vi.fn(),
  getAdminSharedPrepaidDetail: vi.fn()
}))
const adminApi = vi.hoisted(() => ({ getFrontendOptions: vi.fn() }))
vi.mock('../api/sharedPrepaid', () => api)
vi.mock('../api', () => adminApi)

let activeRows: Array<Record<string, unknown>> = []
const TableStub = defineComponent({
  name: 'ElTable',
  props: { data: { type: Array as PropType<Array<Record<string, unknown>>>, default: () => [] } },
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
    return () => h('div', [
      props.label,
      ...(activeRows[0] ? slots.default?.({ row: activeRows[0] }) || [] : [])
    ])
  }
})
const ButtonStub = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
})
const DrawerStub = defineComponent({
  name: 'ElDrawer',
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<aside v-if="modelValue"><h3>{{ title }}</h3><slot /></aside>'
})

const stubs = {
  ElTable: TableStub,
  ElTableColumn: TableColumnStub,
  ElButton: ButtonStub,
  ElDrawer: DrawerStub,
  ElSelect: defineComponent({
    name: 'ElSelect',
    props: { modelValue: { type: [Array, String], default: '' } },
    emits: ['update:modelValue'],
    template: '<div class="select-stub"><slot /></div>'
  }),
  ElOption: defineComponent({ name: 'ElOption', template: '<span />' }),
  ElDatePicker: defineComponent({
    name: 'ElDatePicker',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="date-stub" />'
  }),
  ElInput: defineComponent({
    name: 'ElInput',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }),
  ElTag: defineComponent({ name: 'ElTag', template: '<span><slot /></span>' }),
  ElAlert: defineComponent({
    name: 'ElAlert',
    props: ['title'],
    template: '<div><span>{{ title }}</span><slot /></div>'
  }),
  ElEmpty: defineComponent({ name: 'ElEmpty', props: ['description'], template: '<div>{{ description }}</div>' }),
  ElPagination: defineComponent({
    name: 'ElPagination',
    props: ['total', 'pageSize', 'currentPage'],
    emits: ['current-change'],
    template: '<div class="pagination-stub" />'
  }),
  ElDescriptions: defineComponent({ name: 'ElDescriptions', template: '<dl><slot /></dl>' }),
  ElDescriptionsItem: defineComponent({
    name: 'ElDescriptionsItem',
    props: ['label'],
    template: '<div><dt>{{ label }}</dt><dd><slot /></dd></div>'
  }),
  ElImage: defineComponent({ name: 'ElImage', props: ['src'], template: '<img :src="src" />' })
}

const accounts = [
  { id: 'front-1', account: 'owner-a', name: '主账号 A', disabled: false },
  { id: 'front-2', account: 'owner-b', name: '主账号 B', disabled: false }
]

const rowsByResource: Record<string, Array<Record<string, unknown>>> = {
  recharges: [{
    id: 'recharge-1', phone: '13800000000', ownerAccount: 'owner-a', ownerUsername: '主账号 A',
    actorAccount: 'operator-a', actorUsername: '操作员 A', rechargeDate: '2026-08-01', paidAmount: 100,
    giftAmount: 10, totalAmount: 110, remainingAmount: 80, isOpeningBalance: false, reversedAt: null,
    createdAt: '2026-08-01T01:00:00Z'
  }],
  members: [{
    id: 'member-1', phone: '13800000000', paidTotal: 100, giftTotal: 10, consumedTotal: 30, balance: 80,
    ownerComposition: [{ ownerFrontendUserId: 'front-1', ownerAccount: 'owner-a', ownerDisplayName: '主账号 A', balance: 80 }]
  }],
  consumptions: [{
    id: 'consumption-1', phoneSnapshot: '13800000000', sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 2,
    elementsSnapshot: ['Au', 'Ag'], amount: 30, kind: 'CONSUMPTION', active: true,
    consumingFrontendUser: { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null },
    allocations: [{ sourceOwner: { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: null } }],
    payables: [{ status: 'PENDING', amount: 27.3 }], sheetDate: '2026-08-02', createdAt: '2026-08-02T01:00:00Z'
  }],
  settlements: [{
    id: 'settlement-1', accountA: { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: null },
    accountB: { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null },
    aToBAmount: 90.9, bToAAmount: 40.4, grossAmount: 131.3, netAmount: 50.5, status: 'AWAITING_RECEIPT',
    createdAt: '2026-08-03T01:00:00Z'
  }]
}

function mountPage(resource: 'recharges' | 'members' | 'consumptions' | 'settlements' = 'recharges') {
  Object.assign(routeState, {
    path: `/shared-prepaid/${resource === 'members' ? 'customers' : resource}`,
    meta: { sharedPrepaidPage: resource }
  })
  return mount(SharedPrepaidReadOnlyPage, {
    global: { stubs, directives: { loading: () => undefined } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApi.getFrontendOptions.mockResolvedValue(accounts)
  api.getAdminSharedPrepaidPage.mockImplementation((resource: string) => Promise.resolve({
    items: rowsByResource[resource], total: 1, page: 1, pageSize: 20
  }))
  api.getAdminSharedPrepaidDetail.mockImplementation((resource: string) => Promise.resolve({
    ...rowsByResource[resource][0],
    reversal: resource === 'recharges' ? { reason: '重复充值', actorUser: { account: 'operator-a', username: '操作员 A' } } : null,
    proofUrls: resource === 'settlements' ? ['/uploads/proof.jpg'] : [],
    rejectionReason: resource === 'settlements' ? '金额有误' : null,
    actions: resource === 'settlements' ? [{ operation: 'SUBMIT_PAYMENT', createdAt: '2026-08-03T02:00:00Z' }] : []
  }))
})

describe('SharedPrepaidReadOnlyPage', () => {
  it.each([
    ['recharges', '预存款充值'],
    ['members', '预存款客户'],
    ['consumptions', '消费明细'],
    ['settlements', '转账结算']
  ] as const)('loads the %s read model with every permitted account', async (resource, label) => {
    const wrapper = mountPage(resource)
    await flushPromises()

    expect(wrapper.text()).toContain(label)
    expect(wrapper.text()).toContain('后台只读')
    expect(api.getAdminSharedPrepaidPage).toHaveBeenCalledWith(
      resource,
      expect.objectContaining({ frontendUserIds: ['front-1', 'front-2'], page: 1, pageSize: 20 })
    )
  })

  it('renders filters, pagination, export and detail without any mutation-looking controls', async () => {
    const wrapper = mountPage('recharges')
    await flushPromises()

    expect(wrapper.find('[data-testid="shared-prepaid-export"]').exists()).toBe(true)
    expect(wrapper.find('.pagination-stub').exists()).toBe(true)
    expect(wrapper.findAll('button').map((button) => button.text())).not.toEqual(
      expect.arrayContaining(['新增', '编辑', '删除', '冲正', '提交已支付', '确认到账', '期初余额', '充值', '调整'])
    )

    await wrapper.get('[data-testid="shared-prepaid-detail-recharge-1"]').trigger('click')
    await flushPromises()
    expect(api.getAdminSharedPrepaidDetail).toHaveBeenCalledWith('recharges', 'recharge-1', ['front-1', 'front-2'])
    expect(wrapper.text()).toContain('重复充值')
    expect(wrapper.text()).toContain('操作员 A')
  })

  it('passes the recharge status filter to the paged GET query', async () => {
    const wrapper = mountPage('recharges')
    await flushPromises()

    ;(wrapper.vm as unknown as { filters: { status: string } }).filters.status = 'REVERSED'
    await wrapper.findAll('button').find((button) => button.text() === '查询')!.trigger('click')
    await flushPromises()

    expect(api.getAdminSharedPrepaidPage).toHaveBeenLastCalledWith(
      'recharges',
      expect.objectContaining({ status: 'REVERSED' })
    )
  })

  it('previews settlement proof and preserves audit status, reason and actions in detail', async () => {
    const wrapper = mountPage('settlements')
    await flushPromises()
    await wrapper.get('[data-testid="shared-prepaid-detail-settlement-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('img[src="/uploads/proof.jpg"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('双向总额')
    expect(wrapper.text()).toContain('131.30')
    expect(wrapper.text()).toContain('金额有误')
    expect(wrapper.text()).toContain('SUBMIT_PAYMENT')
  })

  it('keeps its own load error visible and retries the active query', async () => {
    api.getAdminSharedPrepaidPage.mockRejectedValueOnce(new Error('请求超时'))
    const wrapper = mountPage('consumptions')
    await flushPromises()

    expect(wrapper.get('[data-testid="shared-prepaid-load-error"]').text()).toContain('请求超时')
    await wrapper.get('[data-testid="shared-prepaid-retry"]').trigger('click')
    await flushPromises()
    expect(api.getAdminSharedPrepaidPage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="shared-prepaid-load-error"]').exists()).toBe(false)
  })
})
