import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineComponent, type PropType } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataStatisticsPage from './DataStatisticsPage.vue'

const api = vi.hoisted(() => ({
  getFrontendOptions: vi.fn(),
  buildFrontendIds: vi.fn((ids: string[]) => ids.join(',')),
  request: { get: vi.fn() }
}))

vi.mock('../api', () => api)
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, fullPath: '/data-statistics' }) }))

const stubs = {
  ElSwitch: defineComponent({ name: 'ElSwitch', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="switch-stub" />' }),
  ElSelect: defineComponent({
    name: 'ElSelect',
    props: { modelValue: { type: Array as PropType<string[]>, default: () => [] } },
    emits: ['update:modelValue'],
    template: '<div class="select-stub"><slot /></div>'
  }),
  ElOption: defineComponent({ name: 'ElOption', template: '<span />' }),
  ElDatePicker: defineComponent({ name: 'ElDatePicker', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="date-stub" />' }),
  ElButton: defineComponent({ name: 'ElButton', emits: ['click'], template: '<button type="button" @click="$emit(\'click\')"><slot /></button>' }),
  ElTable: defineComponent({ name: 'ElTable', props: ['data'], template: '<div><slot /></div>' }),
  ElTableColumn: defineComponent({ name: 'ElTableColumn', template: '<div />' }),
  ElEmpty: defineComponent({ name: 'ElEmpty', props: ['description'], template: '<div>{{ description }}</div>' }),
  ElDialog: defineComponent({ name: 'ElDialog', props: ['modelValue'], template: '<section v-if="modelValue"><slot /></section>' })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getFrontendOptions.mockResolvedValue([{ id: 'front-1', account: 'kaili001', name: '凯里化验室', disabled: false }])
  api.request.get.mockResolvedValue([])
})

describe('DataStatisticsPage strict readonly boundary', () => {
  it('keeps the source GET-only with no direct sample mutation endpoint or control', () => {
    const source = readFileSync(resolve(process.cwd(), 'admin/src/views/DataStatisticsPage.vue'), 'utf8')

    expect(source).toContain("request.get('/admin/data-statistics/lab-sheets'")
    expect(source).toContain('只读数据')
    expect(source).not.toMatch(/request\.(post|put|patch|delete)\(/)
    expect(source).not.toMatch(/申请值|保存修改|直接修改/)
  })

  it('loads lab sheets only through the admin GET endpoint and renders no direct mutation interaction', async () => {
    const wrapper = mount(DataStatisticsPage, { global: { stubs } })
    await flushPromises()

    expect(api.request.get).toHaveBeenCalledOnce()
    expect(api.request.get).toHaveBeenCalledWith('/admin/data-statistics/lab-sheets', {
      params: { date: expect.any(String), frontendUserIds: 'front-1' }
    })
    expect(wrapper.text()).toContain('数据统计')
    expect(wrapper.findAll('button').map((item) => item.text())).toEqual(['查询'])
    expect(wrapper.text()).not.toMatch(/申请值|保存修改|直接修改|同意|拒绝/)
  })
})
