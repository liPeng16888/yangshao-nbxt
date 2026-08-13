import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import LabElementSelector from './LabElementSelector.vue'

const STORAGE_KEY = 'ys_lab_element_groups'

const PopoverStub = defineComponent({
  name: 'ElPopover',
  props: { visible: Boolean },
  emits: ['update:visible'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'div',
        { onClick: () => emit('update:visible', true) },
        [slots.reference?.(), props.visible ? slots.default?.() : null]
      )
  }
})

function createLocalStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}

describe('LabElementSelector common groups', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createLocalStorage()
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.localStorage.clear()
  })

  it('reloads combinations saved by another sample when its selector opens', async () => {
    const wrapper = mount(LabElementSelector, {
      attachTo: document.body,
      props: { modelValue: '' },
      global: {
        plugins: [ElementPlus],
        stubs: {
          ElPopover: PopoverStub,
          ElCheckboxGroup: { template: '<div><slot /></div>' },
          ElCheckbox: { template: '<label><slot /></label>' }
        }
      }
    })

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'group-1',
          name: '铝硅铁',
          elementKeys: ['aluminum', 'silicon', 'iron']
        }
      ])
    )

    await wrapper.find('.lab-element-selector__trigger').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('铝硅铁')
    expect(document.body.textContent).toContain('铝、硅、铁')

    const groupButton = wrapper.findAll('button').find((button) => button.text() === '铝硅铁')
    expect(groupButton).toBeDefined()
    await groupButton!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toContainEqual(['铝、硅、铁'])
  })
})
