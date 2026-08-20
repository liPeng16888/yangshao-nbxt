import { computed, defineComponent, h, inject, provide, type InjectionKey, type PropType, type Ref, toRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminDataLabSheet, AdminDataSampleBlock } from '../types'
import DataStatisticsPage from './DataStatisticsPage.vue'

const routeState = vi.hoisted(() => ({
  fullPath: '/data?date=2026-08-20&frontendUserIds=front-1',
  query: { date: '2026-08-20', frontendUserIds: 'front-1' }
}))
vi.mock('vue-router', () => ({ useRoute: () => routeState }))

const api = vi.hoisted(() => ({
  getFrontendOptions: vi.fn(),
  buildFrontendIds: vi.fn((ids: string[]) => ids.join(',')),
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}))
vi.mock('../api', () => api)

type TableState = {
  rows: Ref<AdminDataSampleBlock[]>
  expanded: Ref<string[]>
}
const tableStateKey: InjectionKey<TableState> = Symbol('table-state')

const TableStub = defineComponent({
  name: 'ElTable',
  props: {
    data: { type: Array as PropType<AdminDataSampleBlock[]>, default: () => [] },
    expandRowKeys: { type: Array as PropType<string[]>, default: () => [] }
  },
  setup(props, { slots }) {
    provide(tableStateKey, {
      rows: toRef(props, 'data'),
      expanded: toRef(props, 'expandRowKeys')
    })
    return () => h('div', { class: 'table-stub' }, slots.default?.())
  }
})

const TableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: { label: String, type: String },
  setup(props, { slots }) {
    const state = inject(tableStateKey)!
    const row = computed(() => state.rows.value[0])
    return () => {
      if (!row.value) return h('div')
      if (props.type === 'expand' && !state.expanded.value.includes(row.value.id)) return h('div', { class: 'collapsed-row' })
      return h('div', { class: props.type === 'expand' ? 'expanded-row' : 'table-cell' }, [
        props.label,
        ...(slots.default?.({ row: row.value }) || [])
      ])
    }
  }
})

const ButtonStub = defineComponent({
  name: 'ElButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
})

const stubs = {
  ElTable: TableStub,
  ElTableColumn: TableColumnStub,
  ElButton: ButtonStub,
  ElSwitch: defineComponent({ name: 'ElSwitch', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="switch-stub" />' }),
  ElSelect: defineComponent({ name: 'ElSelect', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="select-stub"><slot /></div>' }),
  ElOption: defineComponent({ name: 'ElOption', template: '<span />' }),
  ElDatePicker: defineComponent({ name: 'ElDatePicker', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="date-stub" />' }),
  ElEmpty: defineComponent({ name: 'ElEmpty', props: ['description'], template: '<div>{{ description }}</div>' }),
  ElDialog: defineComponent({ name: 'ElDialog', props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<section v-if="modelValue"><slot /></section>' })
}

const sheetFixture: AdminDataLabSheet = {
  id: 'sheet-1', frontendUserId: 'front-1', name: '凯里化验室', date: '2026-08-20', readonly: true,
  parameters: { ironBlank: 0.04, ironFactor: 29.1 },
  sampleBlocks: [{
    id: 'block-1', index: 1, readonly: true,
    inputs: { sequence: '001', sampleNumber: '样品甲', price: 80, ironRaw: 1 },
    results: { iron: 27.94 }, parameterSnapshot: { ironFactor: 29.1 },
    retests: [{
      id: 'retest-1', sampleBlockId: 'block-1', sequence: 1, status: 'ACTIVE', everFilled: true,
      readonly: true, sensitiveFieldsHidden: false, inputs: { ironRaw: 1.2 }, results: { iron: 33.76 },
      parameterSnapshot: { ironBlank: 0.04, ironFactor: 29.1 }, voidReason: null,
      createdById: 'front-1', updatedById: 'front-1', voidedById: null,
      createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-20T08:30:00+08:00', voidedAt: null
    }, {
      id: 'retest-2', sampleBlockId: 'block-1', sequence: 2, status: 'VOID', everFilled: true,
      readonly: true, sensitiveFieldsHidden: false, inputs: { ironRaw: 1.3 }, results: { iron: 36.67 },
      parameterSnapshot: { ironBlank: 0.04, ironFactor: 29.1 }, voidReason: '复核无效',
      createdById: 'front-1', updatedById: 'front-1', voidedById: 'front-1',
      createdAt: '2026-08-20T09:00:00+08:00', updatedAt: '2026-08-20T09:30:00+08:00', voidedAt: '2026-08-20T10:00:00+08:00'
    }]
  }]
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getFrontendOptions.mockResolvedValue([{ id: 'front-1', account: 'front-one', name: '凯里化验室', disabled: false }])
  api.request.get.mockImplementation((url: string) => Promise.resolve(url === '/admin/data-statistics/lab-sheets' ? [sheetFixture] : []))
})

describe('DataStatisticsPage retest read-only expansion', () => {
  it('loads retests through the existing GET endpoint and never invokes a write method', async () => {
    const wrapper = mount(DataStatisticsPage, { global: { stubs } })
    await flushPromises()

    expect(api.request.get).toHaveBeenCalledWith('/admin/data-statistics/lab-sheets', {
      params: { date: '2026-08-20', frontendUserIds: 'front-1' }
    })
    expect(wrapper.text()).toContain('查看复样（2）')
    expect(api.request.post).not.toHaveBeenCalled()
    expect(api.request.put).not.toHaveBeenCalled()
    expect(api.request.patch).not.toHaveBeenCalled()
    expect(api.request.delete).not.toHaveBeenCalled()
  })

  it('expands inputs, results, frozen parameters, status and void reason without editable retest controls', async () => {
    const wrapper = mount(DataStatisticsPage, { global: { stubs } })
    await flushPromises()

    await wrapper.get('[data-testid="retest-toggle-block-1"]').trigger('click')
    await flushPromises()

    const panel = wrapper.get('.sample-retest-readonly-panel')
    expect(panel.text()).toContain('复样1')
    expect(panel.text()).toContain('有效')
    expect(panel.text()).toContain('复样2')
    expect(panel.text()).toContain('已作废')
    expect(panel.text()).toContain('铁原始值')
    expect(panel.text()).toContain('33.76')
    expect(panel.text()).toContain('参数快照')
    expect(panel.text()).toContain('复核无效')
    expect(panel.find('input, textarea, select, button').exists()).toBe(false)
    expect(api.request.get).toHaveBeenCalledTimes(1)
    expect(api.request.post).not.toHaveBeenCalled()
    expect(api.request.put).not.toHaveBeenCalled()
    expect(api.request.patch).not.toHaveBeenCalled()
    expect(api.request.delete).not.toHaveBeenCalled()
  })
})
