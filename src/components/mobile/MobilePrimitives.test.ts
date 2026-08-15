// @vitest-environment jsdom
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MobileActionBar from './MobileActionBar.vue'
import MobileFilterDrawer from './MobileFilterDrawer.vue'
import MobileFullscreenDialog from './MobileFullscreenDialog.vue'
import MobileRecordCard from './MobileRecordCard.vue'

const DrawerStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<aside v-if="modelValue" v-bind="$attrs"><h2>{{ title }}</h2><slot /><slot name="footer" /></aside>'
})

const DialogStub = defineComponent({
  inheritAttrs: false,
  props: { modelValue: Boolean, title: String },
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" v-bind="$attrs"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
})

const mobileStubs = {
  ElDrawer: DrawerStub,
  ElDialog: DialogStub
}

describe('mobile interaction primitives', () => {
  it('opens the filter drawer from its labelled summary trigger', async () => {
    const filter = mount(MobileFilterDrawer, {
      props: { modelValue: false, title: '筛选样品', summary: '本月，全部状态' },
      global: { stubs: mobileStubs }
    })

    const trigger = filter.get('button')
    expect(trigger.attributes('aria-label')).toContain('打开筛选')
    expect(trigger.classes()).toContain('mobile-touch-target')

    await trigger.trigger('click')
    expect(filter.emitted('update:modelValue')).toEqual([[true]])
  })

  it('keeps record details unmounted while collapsed and exposes selected state', async () => {
    const card = mount(MobileRecordCard, {
      props: {
        title: '样品 A-001',
        status: '待录入',
        selectable: true,
        selected: true,
        expanded: false
      },
      slots: { details: '<input aria-label="检测数据" />' }
    })

    expect(card.get('.mobile-record-card').attributes('aria-selected')).toBe('true')
    expect(card.get('.mobile-record-card__toggle').attributes('aria-expanded')).toBe('false')
    expect(card.get('.mobile-record-card__toggle').classes()).toContain('mobile-touch-target')
    expect(card.find('[aria-label="检测数据"]').exists()).toBe(false)

    await card.get('.mobile-record-card__toggle').trigger('click')
    expect(card.emitted('update:expanded')).toEqual([[true]])
  })

  it('keeps dialog footer inputs mounted after a parent rejects saving', async () => {
    const Parent = defineComponent({
      components: { MobileFullscreenDialog },
      methods: {
        async save() {
          try {
            await Promise.reject(new Error('save failed'))
          } catch {
            // The parent owns the failed save state and deliberately keeps the dialog open.
          }
        }
      },
      template: `
        <MobileFullscreenDialog :model-value="true" title="编辑样品" @confirm="save">
          <template #footer><input aria-label="备注" value="保留内容" /></template>
        </MobileFullscreenDialog>
      `
    })
    const dialog = mount(Parent, { global: { stubs: mobileStubs } })
    const defaultDialog = mount(MobileFullscreenDialog, {
      props: { modelValue: true, title: '编辑样品' },
      global: { stubs: mobileStubs }
    })

    expect(dialog.get('.mobile-fullscreen-dialog').attributes('role')).toBe('dialog')
    expect(defaultDialog.get('.mobile-fullscreen-dialog__confirm').classes()).toContain('mobile-touch-target')

    dialog.getComponent(MobileFullscreenDialog).vm.$emit('confirm')
    await nextTick()
    expect(dialog.get('[aria-label="备注"]').element).toBeInstanceOf(HTMLInputElement)
  })

  it('renders a fixed action-bar container for page-owned actions', () => {
    const actionBar = mount(MobileActionBar, { slots: { default: '<button>保存</button>' } })
    expect(actionBar.classes()).toContain('mobile-action-bar')
  })
})
