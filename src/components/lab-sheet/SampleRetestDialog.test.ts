import { computed, defineComponent, h, inject, provide, type InjectionKey } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { SampleBlock } from '@/types/labSheet'
import SampleRetestDialog from './SampleRetestDialog.vue'

type CheckboxGroupContext = {
  selected: Readonly<{ value: string[] }>
  toggle: (value: string, checked: boolean) => void
}

const checkboxGroupKey: InjectionKey<CheckboxGroupContext> = Symbol('checkbox-group')

const ElDialogStub = defineComponent({
  name: 'ElDialog',
  inheritAttrs: false,
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' }
  },
  setup(props, { attrs, slots }) {
    return () => props.modelValue
      ? h('section', { class: attrs.class }, [
          h('h2', props.title),
          slots.default?.(),
          slots.footer?.()
        ])
      : null
  }
})

const ElCheckboxGroupStub = defineComponent({
  name: 'ElCheckboxGroup',
  props: {
    modelValue: { type: Array, default: () => [] }
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    provide(checkboxGroupKey, {
      selected: computed(() => props.modelValue as string[]),
      toggle(value, checked) {
        const selected = props.modelValue as string[]
        emit('update:modelValue', checked
          ? Array.from(new Set([...selected, value]))
          : selected.filter((item) => item !== value))
      }
    })
    return () => h('div', slots.default?.())
  }
})

const ElCheckboxStub = defineComponent({
  name: 'ElCheckbox',
  props: {
    value: { type: String, required: true },
    disabled: { type: Boolean, default: false }
  },
  setup(props, { slots }) {
    const group = inject(checkboxGroupKey)
    return () => h('label', { class: ['checkbox-stub', { 'is-disabled': props.disabled }] }, [
      h('input', {
        type: 'checkbox',
        value: props.value,
        disabled: props.disabled,
        checked: group?.selected.value.includes(props.value),
        onChange: (event: Event) => group?.toggle(props.value, (event.target as HTMLInputElement).checked)
      }),
      slots.default?.()
    ])
  }
})

const ElButtonStub = defineComponent({
  name: 'ElButton',
  props: {
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false }
  },
  emits: ['click'],
  setup(props, { emit, slots, attrs }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      disabled: props.disabled || props.loading,
      onClick: () => emit('click')
    }, slots.default?.())
  }
})

function makeBlock(overrides: {
  id: string
  index: number
  sequence?: string
  sampleNumber?: string
  completed?: boolean
  sensitiveFieldsHidden?: boolean
  retestCount?: number
}): SampleBlock {
  return {
    id: overrides.id,
    index: overrides.index,
    readonly: false,
    sensitiveFieldsHidden: overrides.sensitiveFieldsHidden,
    inputs: {
      sequence: overrides.sequence,
      sampleNumber: overrides.sampleNumber,
      completed: overrides.completed
    },
    results: {} as SampleBlock['results'],
    parameterSnapshot: {} as SampleBlock['parameterSnapshot'],
    retests: Array.from({ length: overrides.retestCount || 0 }, (_, index) => ({ id: `${overrides.id}-retest-${index + 1}` })) as SampleBlock['retests']
  }
}

const blocks = [
  makeBlock({ id: 'block-1', index: 1, sequence: '001', sampleNumber: '甲样', retestCount: 2 }),
  makeBlock({ id: 'block-2', index: 2, completed: true }),
  makeBlock({ id: 'block-3', index: 3, sampleNumber: '密样', completed: true, sensitiveFieldsHidden: true, retestCount: 1 })
]

function mountDialog(options: { visible?: boolean; saving?: boolean } = {}) {
  return mount(SampleRetestDialog, {
    props: {
      visible: options.visible ?? true,
      blocks,
      saving: options.saving ?? false
    },
    global: {
      stubs: {
        ElDialog: ElDialogStub,
        ElAlert: { template: '<div class="alert-stub"><slot /></div>' },
        ElCheckboxGroup: ElCheckboxGroupStub,
        ElCheckbox: ElCheckboxStub,
        ElTag: { template: '<span class="tag-stub"><slot /></span>' },
        ElButton: ElButtonStub
      }
    }
  })
}

describe('SampleRetestDialog', () => {
  it('shows parent identity, sample name, completion state and existing retest count', () => {
    const wrapper = mountDialog()

    expect(wrapper.text()).toContain('001')
    expect(wrapper.text()).toContain('甲样')
    expect(wrapper.text()).toContain('未完成')
    expect(wrapper.text()).toContain('复样 2 组')
    expect(wrapper.text()).toContain('002')
    expect(wrapper.text()).toContain('未填写样品名称')
    expect(wrapper.text()).toContain('已完成')
  })

  it('keeps completed parents selectable unless their sensitive fields are hidden', () => {
    const wrapper = mountDialog()
    const inputs = wrapper.findAll('input[type="checkbox"]')

    expect(inputs[1].attributes('disabled')).toBeUndefined()
    expect(inputs[2].attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('验证后可复样')
  })

  it('creates one retest for each selected parent', async () => {
    const wrapper = mountDialog()
    const inputs = wrapper.findAll('input[type="checkbox"]')

    await inputs[0].setValue(true)
    await inputs[1].setValue(true)
    await wrapper.get('.retest-submit').trigger('click')

    expect(wrapper.emitted('create')).toEqual([[{ sampleBlockIds: ['block-1', 'block-2'] }]])
  })

  it('clears an old selection each time the dialog opens', async () => {
    const wrapper = mountDialog()
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    expect(wrapper.text()).toContain('已选择 1 个样品')

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })

    expect(wrapper.text()).toContain('已选择 0 个样品')
    expect(wrapper.get('.retest-submit').attributes('disabled')).toBeDefined()
  })

  it('disables empty submission and locks selection and submission while saving', async () => {
    const wrapper = mountDialog()
    expect(wrapper.get('.retest-submit').attributes('disabled')).toBeDefined()

    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    await wrapper.setProps({ saving: true })

    expect(wrapper.findAll('input[type="checkbox"]').every((input) => input.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.get('.retest-submit').attributes('disabled')).toBeDefined()
    await wrapper.get('.retest-submit').trigger('click')
    expect(wrapper.emitted('create')).toBeUndefined()
  })

  it('exposes the mobile-ready dialog class', () => {
    const wrapper = mountDialog()

    expect(wrapper.get('section').classes()).toContain('sample-retest-dialog--mobile-ready')
  })
})
