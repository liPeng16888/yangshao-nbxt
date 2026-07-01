import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ElementPlus, { ElMessage } from 'element-plus'
import LabSheetGrid from './LabSheetGrid.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { calculateSampleResults } from '@/utils/formulaEngine'
import type { SampleBlock } from '@/types/labSheet'

function makeBlock(overrides: Partial<SampleBlock['inputs']> = {}): SampleBlock {
  const inputs: SampleBlock['inputs'] = {
    sequence: '001',
    sampleNumber: '',
    customerText: '',
    customerIds: [],
    customers: [],
    paymentStatus: '',
    ...overrides
  }

  return {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs,
    results: calculateSampleResults(inputs, defaultLabParameters),
    parameterSnapshot: defaultLabParameters
  }
}

describe('LabSheetGrid', () => {
  it('emits numeric input updates from blank sample cells', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const inputs = wrapper.findAll('input')
    await inputs[2].setValue('0.08')

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { ironRaw: 0.08 }])
  })

  it('limits sample data input to three decimal places', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const inputs = wrapper.findAll('input')
    await inputs[2].setValue('1.2345')

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { ironRaw: 1.234 }])
  })

  it('supports negative sample data input and keeps three decimal places', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const inputs = wrapper.findAll('input')
    await inputs[2].setValue('-11.5678')

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { ironRaw: -11.567 }])
  })

  it('keeps blank sample data inputs empty when focused and blurred without typing', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const input = wrapper.findAll('input')[2]
    await input.trigger('focus')
    await input.trigger('blur')

    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('update')).toContainEqual(['block-1', { ironRaw: null }])
    expect(wrapper.emitted('update')).not.toContainEqual(['block-1', { ironRaw: 0 }])
  })

  it('locks calculation inputs when a sample number exists but sample amount is missing', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: null })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const inputs = wrapper.findAll('input')

    expect(wrapper.findAll('.cell--blocked').length).toBeGreaterThan(0)
    expect(inputs[2].attributes('disabled')).toBeDefined()
  })

  it('requires sample amount when customer information exists without a sample number', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ customerText: '客户甲', price: null })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const inputs = wrapper.findAll('input')

    expect(wrapper.find('.cell--required').exists()).toBe(true)
    expect(wrapper.findAll('.cell--blocked').length).toBeGreaterThan(0)
    expect(inputs[2].attributes('disabled')).toBeDefined()
  })

  it('exposes horizontal scroll controls for the external table scrollbar', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })
    const scrollElement = wrapper.find('.lab-grid-scroll').element as HTMLElement
    Object.defineProperty(scrollElement, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(scrollElement, 'scrollWidth', { value: 900, configurable: true })

    ;(wrapper.vm as unknown as { setHorizontalScroll: (value: number) => void }).setHorizontalScroll(420)

    expect(scrollElement.scrollLeft).toBe(420)
    expect(wrapper.emitted('scrollStateChange')).toContainEqual([{ left: 420, max: 600, width: 300, scrollWidth: 900 }])
  })

  it('clamps table zoom so the scaled grid does not shrink past the viewport edge', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })
    const scrollElement = wrapper.find('.lab-grid-scroll').element as HTMLElement
    const gridElement = wrapper.find('.lab-grid').element as HTMLElement
    Object.defineProperty(scrollElement, 'clientWidth', { value: 600, configurable: true })
    Object.defineProperty(gridElement, 'offsetWidth', { value: 1000, configurable: true })
    Object.defineProperty(gridElement, 'offsetHeight', { value: 400, configurable: true })

    await (wrapper.vm as unknown as { refreshScrollState: () => Promise<void> }).refreshScrollState()
    ;(wrapper.vm as unknown as { setZoomPercent: (value: number) => void }).setZoomPercent(30)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.lab-grid-zoom-stage').attributes('style')).toContain('width: 600px')
    expect(wrapper.find('.lab-grid').attributes('style')).toContain('transform: scale(0.6)')
  })

  it('warns when a locked calculation input is clicked before sample amount and payment status are filled', async () => {
    const warningSpy = vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as any)
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: null })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const blockedLayer = wrapper.find('.blocked-click-layer')
    expect(blockedLayer.attributes('aria-label')).toBe('请先输入样品金额并选择费用状态')
    expect(wrapper.find('.blocked-warning-indicator').text()).toBe('!')

    await blockedLayer.trigger('click')

    expect(warningSpy).toHaveBeenCalledWith('请先输入样品金额并选择费用状态')
    warningSpy.mockRestore()
  })

  it('locks calculation inputs when sample amount exists but payment status is missing', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: 20, paymentStatus: '' })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const inputs = wrapper.findAll('input')

    expect(wrapper.findAll('.cell--blocked').length).toBeGreaterThan(0)
    expect(wrapper.find('.blocked-click-layer').attributes('aria-label')).toBe('请先选择费用状态')
    expect(inputs[2].attributes('disabled')).toBeDefined()
  })

  it('emits payment status updates from the fee status selector', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: 20, paymentStatus: '' })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const select = wrapper.findComponent({ name: 'ElSelect' })
    select.vm.$emit('update:modelValue', '已结款')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { paymentStatus: '已结款' }])
  })

  it('limits sample amount input to two decimal places', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: null })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const amountInput = wrapper.find('.cell--required input')
    await amountInput.setValue('12.345')

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { price: 12.34 }])
  })

  it('uses deduction times without decimals for prepaid samples', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: null, paymentStatus: '预存款' })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const amountInput = wrapper.find('.cell--required input')
    await amountInput.setValue('3.9')

    expect(wrapper.text()).toContain('扣除次数')
    expect(wrapper.text()).not.toContain('样品金额')
    expect(wrapper.emitted('update')).toContainEqual(['block-1', { price: 3 }])
  })

  it('supports negative sample amount input and keeps two decimal places', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: null })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const amountInput = wrapper.find('.cell--required input')
    await amountInput.setValue('-11.567')

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { price: -11.56 }])
  })

  it('keeps blank sample amount input empty when focused and blurred without typing', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: null })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: {
            template: '<div class="customer-editor-stub" />'
          }
        }
      }
    })

    const amountInput = wrapper.find('.cell--required input')
    await amountInput.trigger('focus')
    await amountInput.trigger('blur')

    expect((amountInput.element as HTMLInputElement).value).toBe('')
    expect(wrapper.emitted('update')).toContainEqual(['block-1', { price: null }])
    expect(wrapper.emitted('update')).not.toContainEqual(['block-1', { price: 0 }])
  })
})
