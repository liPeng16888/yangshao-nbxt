// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import LabSmsDialog from './LabSmsDialog.vue'
import { defaultLabReportSmsTemplate } from '@/utils/labReport'

const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    width: { type: String, default: '' },
    fullscreen: { type: Boolean, default: false },
    title: { type: String, default: '' }
  },
  setup(_props, { slots }) {
    return () => h('div', { class: 'dialog-stub' }, [slots.default?.(), slots.footer?.()])
  }
})

function mountSmsDialog(mobile = false) {
  return mount(LabSmsDialog, {
    props: {
      visible: true,
      mobile,
      blocks: [],
      selectedBlockIds: [],
      template: defaultLabReportSmsTemplate
    },
    global: {
      stubs: {
        ElDialog: ElDialogStub,
        ElAlert: true,
        ElButton: { template: '<button type="button"><slot /></button>' },
        ElCheckboxGroup: { template: '<div><slot /></div>' },
        ElCheckbox: { template: '<label><slot /></label>' },
        ElInput: true
      }
    }
  })
}

describe('LabSmsDialog responsive shell', () => {
  it.each(['844px mouse desktop', '1440px mouse desktop'])(
    'preserves the exact 960px non-fullscreen dialog on a %s',
    () => {
      const wrapper = mountSmsDialog(false)
      const dialog = wrapper.getComponent(ElDialogStub)

      expect(dialog.props('width')).toBe('960px')
      expect(dialog.props('fullscreen')).toBe(false)
      expect(wrapper.find('.element-step--mobile').exists()).toBe(false)
    }
  )

  it.each(['390px narrow phone', '844px coarse landscape phone'])(
    'uses the same fullscreen one-column mobile shell for a %s',
    () => {
      const wrapper = mountSmsDialog(true)
      const dialog = wrapper.getComponent(ElDialogStub)

      expect(dialog.props('width')).toBe('960px')
      expect(dialog.props('fullscreen')).toBe(true)
      expect(wrapper.find('.element-step--mobile').exists()).toBe(true)
      expect(wrapper.find('.lab-sms-dialog-content--mobile').exists()).toBe(true)
    }
  )
})
