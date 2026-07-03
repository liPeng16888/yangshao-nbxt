import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LabParameterPanel from './LabParameterPanel.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'

describe('LabParameterPanel', () => {
  it('hides panel heading, Excel coordinate labels, and displays parameter values with three decimals', () => {
    const wrapper = mount(LabParameterPanel, {
      props: {
        parameters: defaultLabParameters,
        saving: false
      },
      global: {
        stubs: {
          ElInputNumber: {
            props: ['modelValue', 'precision'],
            template: '<input class="input-number-stub" :data-precision="precision" :value="Number(modelValue).toFixed(precision)" @change="$emit(\'change\')" />'
          }
        }
      }
    })

    expect(wrapper.text()).not.toContain('固定参数面板')
    expect(wrapper.text()).not.toContain('刷新')
    expect(wrapper.text()).not.toContain('保存参数')
    expect(wrapper.text()).not.toContain('A3')
    expect(wrapper.text()).not.toContain('B3')
    expect(wrapper.text()).not.toContain('C3')
    expect(wrapper.find('.input-number-stub').attributes('data-precision')).toBe('3')
    expect(wrapper.find('.input-number-stub').attributes('value')).toBe('0.040')
  })

  it('autosaves parameters when a parameter input changes', async () => {
    const wrapper = mount(LabParameterPanel, {
      props: {
        parameters: defaultLabParameters,
        saving: false
      },
      global: {
        stubs: {
          ElInputNumber: {
            props: ['modelValue', 'precision'],
            template: '<input class="input-number-stub" :data-precision="precision" :value="Number(modelValue).toFixed(precision)" @change="$emit(\'change\')" />'
          }
        }
      }
    })

    await wrapper.find('.input-number-stub').trigger('change')

    expect(wrapper.emitted('save')).toContainEqual([{ ...defaultLabParameters }])
  })

  it('does not save parameter changes when readonly', async () => {
    const wrapper = mount(LabParameterPanel, {
      props: {
        parameters: defaultLabParameters,
        saving: false,
        readonly: true
      },
      global: {
        stubs: {
          ElInputNumber: {
            props: ['modelValue', 'precision'],
            template: '<input class="input-number-stub" :data-precision="precision" :value="Number(modelValue).toFixed(precision)" @change="$emit(\'change\')" />'
          }
        }
      }
    })

    await wrapper.find('.input-number-stub').trigger('change')

    expect(wrapper.emitted('save')).toBeUndefined()
  })
})
