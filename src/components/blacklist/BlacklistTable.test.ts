import { mount } from '@vue/test-utils'
import { defineComponent, h, inject, provide } from 'vue'
import { describe, expect, it } from 'vitest'
import BlacklistTable from './BlacklistTable.vue'
import type { BlacklistRecord } from '@/types/blacklist'

const records: BlacklistRecord[] = [
  {
    id: 'b-own',
    uploadedAt: '2026-06-24T08:00:00.000Z',
    uploadedBy: '管理员',
    phone: '13800000000',
    images: [],
    note: '自己的记录'
  },
  {
    id: 'b-other',
    uploadedAt: '2026-06-24T09:00:00.000Z',
    uploadedBy: '其他账号',
    wechat: 'other-client',
    images: [],
    note: '其他人的记录'
  }
]

function mountTable() {
  const ElTableStub = defineComponent({
    props: {
      data: { type: Array, default: () => [] }
    },
    setup(props, { slots }) {
      provide('tableRows', props.data)
      return () => h('div', { class: 'el-table-stub' }, slots.default?.())
    }
  })
  const ElTableColumnStub = defineComponent({
    props: ['label', 'prop'],
    setup(props, { slots }) {
      const rows = inject<BlacklistRecord[]>('tableRows', [])
      return () =>
        h('div', { class: 'el-table-column-stub' }, [
          h('strong', props.label),
          ...rows.map((row) => h('div', { class: 'table-cell-stub' }, slots.default ? slots.default({ row }) : String(row[props.prop as keyof BlacklistRecord] || '')))
        ])
    }
  })

  return mount(BlacklistTable, {
    props: {
      records,
      keyword: '',
      currentUsername: '管理员',
      deletingId: ''
    },
    global: {
      directives: {
        loading: {}
      },
      stubs: {
        BlacklistImagePreview: true,
        ElTable: ElTableStub,
        ElTableColumn: ElTableColumnStub,
        ElInput: {
          template: '<input />'
        },
        ElButton: {
          template: '<button type="button" :class="`el-button--${type}`" @click="$emit(\'click\')"><slot /></button>',
          props: ['type', 'text', 'icon', 'loading']
        }
      }
    }
  })
}

describe('BlacklistTable', () => {
  it('retains the desktop table root and exact search payload contract', async () => {
    const wrapper = mountTable()

    expect(wrapper.classes()).toContain('blacklist-table')
    await wrapper.find('.table-search button').trigger('click')
    expect(wrapper.emitted('search')).toContainEqual([''])
  })

  it('allows deleting only records uploaded by the current user', async () => {
    const wrapper = mountTable()

    expect(wrapper.text()).toContain('删除')
    expect(wrapper.text()).toContain('仅查看')

    await wrapper.find('button.el-button--danger').trigger('click')

    expect(wrapper.emitted('delete')).toContainEqual(['b-own'])
  })

  it('opens supplement for records uploaded by the current user', async () => {
    const wrapper = mountTable()

    expect(wrapper.text()).toContain('补充信息')

    await wrapper.find('button.el-button--primary').trigger('click')

    expect(wrapper.emitted('supplement')).toContainEqual([records[0]])
  })
})
