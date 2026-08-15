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
    let rejectSave!: (reason?: unknown) => void
    let markSaveStarted!: () => void
    let markSaveFinished!: () => void
    const rejectedSave = new Promise<void>((_resolve, reject) => {
      rejectSave = reject
    })
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve
    })
    const saveFinished = new Promise<void>((resolve) => {
      markSaveFinished = resolve
    })
    const Parent = defineComponent({
      components: { MobileFullscreenDialog },
      data: () => ({ open: true }),
      methods: {
        async save() {
          markSaveStarted()
          try {
            await rejectedSave
          } catch {
            // The parent owns the failed save state and deliberately keeps the dialog open.
          } finally {
            markSaveFinished()
          }
        }
      },
      template: `
        <MobileFullscreenDialog v-model="open" title="编辑样品" @confirm="save">
          <template #footer="{ confirm }">
            <input aria-label="备注" value="保留内容" />
            <button class="rejected-save-confirm" type="button" @click="confirm">保存</button>
          </template>
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

    await dialog.get('.rejected-save-confirm').trigger('click')
    await saveStarted
    rejectSave(new Error('save failed'))
    await saveFinished
    await nextTick()
    expect((dialog.vm as { open: boolean }).open).toBe(true)
    expect(dialog.get('[aria-label="备注"]').element).toBeInstanceOf(HTMLInputElement)
  })

  it('retains automatic fullscreen and safe-area geometry at a 390px narrow layout when the prop is omitted', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const dialog = mount(MobileFullscreenDialog, {
      props: { modelValue: true, title: '窄屏编辑' },
      global: { stubs: mobileStubs }
    })
    const root = dialog.get('.mobile-fullscreen-dialog')
    const styles = getComputedStyle(root.element)

    expect(root.classes()).toContain('mobile-fullscreen-dialog--active')
    expect(styles.width).toBe('100%')
    expect(styles.height).toBe('100dvh')
    expect(styles.paddingTop).toContain('safe-area-inset-top')
    expect(styles.paddingBottom).toContain('safe-area-inset-bottom')
  })

  it('forces fullscreen and safe-area geometry at an 844px coarse-layout consumer', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 })
    const dialog = mount(MobileFullscreenDialog, {
      props: { modelValue: true, title: '移动编辑', fullscreen: true },
      global: { stubs: mobileStubs }
    })
    const root = dialog.get('.mobile-fullscreen-dialog')
    const styles = getComputedStyle(root.element)

    expect(root.classes()).toContain('mobile-fullscreen-dialog--active')
    expect(styles.width).toBe('100%')
    expect(styles.height).toBe('100dvh')
    expect(styles.paddingTop).toContain('safe-area-inset-top')
    expect(styles.paddingBottom).toContain('safe-area-inset-bottom')
  })

  it('keeps an 844px nonmobile default consumer on normal dialog geometry', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 844 })
    const dialog = mount(MobileFullscreenDialog, {
      props: { modelValue: true, title: '桌面编辑' },
      global: { stubs: mobileStubs }
    })
    const root = dialog.get('.mobile-fullscreen-dialog')

    expect(root.classes()).not.toContain('mobile-fullscreen-dialog--active')
    expect(root.attributes('style')).toBeUndefined()
  })

  it('renders a fixed action-bar container for page-owned actions', () => {
    const actionBar = mount(MobileActionBar, { slots: { default: '<button>保存</button>' } })
    expect(actionBar.classes()).toContain('mobile-action-bar')
  })
})
