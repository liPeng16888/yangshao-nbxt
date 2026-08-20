import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus, { ElMessage } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import LabSheetGrid from './LabSheetGrid.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { calculateSampleResults } from '@/utils/formulaEngine'
import type { SampleBlock, SampleRetest } from '@/types/labSheet'

const customerEditorStub = {
  name: 'CustomerCellEditor',
  props: ['customerRole', 'selectionLimit', 'modelValue', 'selectedCustomers', 'placeholder'],
  emits: ['update', 'blacklistHit'],
  template: '<div class="customer-editor-stub" />'
}

const prepaidPickerStub = defineComponent({
  name: 'PrepaidMemberPickerDialog',
  props: {
    visible: Boolean,
    initialPhone: String,
    initialAmount: Number
  },
  emits: ['close', 'confirm'],
  template: `
    <section
      v-if="visible"
      class="prepaid-picker-stub"
      :data-initial-phone="initialPhone || ''"
      :data-initial-amount="initialAmount ?? ''"
    >
      <button
        class="prepaid-picker-confirm"
        @click="$emit('confirm', { memberId: 'member-1', phone: '13800000000', amount: 30.25, currentBalance: 100 })"
      >确认</button>
    </section>
  `
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}

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
    parameterSnapshot: defaultLabParameters,
    retests: []
  }
}

function makeRetest(sequence: number): SampleRetest {
  return {
    id: `retest-${sequence}`,
    sampleBlockId: 'block-1',
    sequence,
    status: 'ACTIVE',
    everFilled: false,
    readonly: false,
    sensitiveFieldsHidden: false,
    inputs: {},
    results: {
      iron: 0, silicon: 0, aluminum: 0, aluminumSiliconRatio: 0, total: 0,
      density: 0, calcium: 0, magnesium: 0, titanium: 0, bottleDensity: 0,
      moisture: 0, burnLoss: 0
    },
    parameterSnapshot: defaultLabParameters,
    voidReason: null,
    createdById: 'main-1',
    updatedById: 'main-1',
    voidedById: null,
    createdAt: '2026-08-20T09:15:00.000Z',
    updatedAt: '2026-08-20T09:15:00.000Z',
    voidedAt: null
  }
}

function makeBlockWithRetests(count: number) {
  const block = makeBlock({ elementNote: '铁' })
  block.retests = Array.from({ length: count }, (_, index) => makeRetest(index + 1))
  return block
}

describe('LabSheetGrid', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() })
    setActivePinia(createPinia())
  })

  it('hides only completed sample detection, amount, and payment values without the completed-data grant', () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ completed: true, ironRaw: 1.2, price: 88, paymentStatus: '已结款' })],
        canViewCompletedSensitiveData: false
      },
      global: { plugins: [ElementPlus], stubs: { CustomerCellEditor: customerEditorStub } }
    })

    expect(wrapper.find('[data-field="completedSensitiveData"]').text()).toContain('已完成样品数据已加密')
    expect(wrapper.find('[data-field="ironRaw"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="price"]').text()).toBe('🔒')
    expect(wrapper.find('[data-field="paymentStatus"]').text()).toBe('🔒')
    expect(wrapper.text()).toContain('样品名称')
  })

  it('shows completed sample values after the completed-data grant is available', () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ completed: true, ironRaw: 1.2, price: 88, paymentStatus: '已结款' })],
        canViewCompletedSensitiveData: true
      },
      global: { plugins: [ElementPlus], stubs: { CustomerCellEditor: customerEditorStub } }
    })

    expect(wrapper.find('[data-field="completedSensitiveData"]').exists()).toBe(false)
    expect(wrapper.find('[data-field="ironRaw"]').exists()).toBe(true)
    expect(wrapper.find('[data-field="price"]').text()).not.toBe('🔒')
    expect(wrapper.find('[data-field="paymentStatus"]').text()).not.toBe('🔒')
  })

  it('renders payer and recipient customer rows and forwards recipient updates', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({
          customerText: '王总',
          customers: [{ id: 'customer-wang', name: '王总' }],
          recipientCustomerText: '李总、张总',
          recipientCustomers: [
            { id: 'customer-li', name: '李总' },
            { id: 'customer-zhang', name: '张总' }
          ]
        })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: { CustomerCellEditor: customerEditorStub }
      }
    })

    const editors = wrapper.findAllComponents({ name: 'CustomerCellEditor' })
    expect(editors).toHaveLength(2)
    expect(editors[0].props()).toMatchObject({
      customerRole: 'payer',
      selectionLimit: 1,
      modelValue: '王总',
      placeholder: '付款客户'
    })
    expect(editors[1].props()).toMatchObject({
      customerRole: 'recipient',
      selectionLimit: 0,
      modelValue: '李总、张总',
      placeholder: '数据发送'
    })
    expect(wrapper.find('[data-field="customerText"]').exists()).toBe(true)
    expect(wrapper.find('[data-field="recipientCustomerText"]').exists()).toBe(true)

    const recipientPatch = {
      recipientCustomerIds: ['customer-li'],
      recipientCustomers: [{ id: 'customer-li', name: '李总' }],
      recipientCustomerText: '李总'
    }
    editors[1].vm.$emit('update', recipientPatch)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update')).toContainEqual(['block-1', recipientPatch])
  })

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

  it('allows moisture to be entered directly', async () => {
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

    const moistureInput = wrapper.find('[data-field="moisture"] input')
    await moistureInput.setValue('4.2689')

    expect(wrapper.emitted('update')).toContainEqual(['block-1', { moisture: 4.268 }])
  })

  it('shows bottle density rather than direct moisture in the three-column formula result', () => {
    const block = makeBlock({ moisture: 4.268 })
    Object.assign(block.results, { bottleDensity: 1.9965 })
    const wrapper = mount(LabSheetGrid, {
      props: { blocks: [block] },
      global: { plugins: [ElementPlus], stubs: { CustomerCellEditor: customerEditorStub } }
    })

    const groupedFormulaCells = wrapper.findAll('.cell--formula.cell--span-3')
    expect(groupedFormulaCells).toHaveLength(2)
    expect(groupedFormulaCells[0].text()).toBe('2.00')
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

  it('warns when a locked calculation input is clicked before sample amount, payment status, and lab elements are filled', async () => {
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
    expect(blockedLayer.attributes('aria-label')).toBe('请先输入样品金额、选择费用状态并选择化验元素')
    expect(wrapper.find('.blocked-warning-indicator').text()).toBe('!')

    await blockedLayer.trigger('click')

    expect(warningSpy).toHaveBeenCalledWith('请先输入样品金额、选择费用状态并选择化验元素')
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
    expect(wrapper.find('.blocked-click-layer').attributes('aria-label')).toBe('请先选择费用状态并选择化验元素')
    expect(inputs[2].attributes('disabled')).toBeDefined()
  })

  it('locks calculation inputs and marks lab elements required when only lab elements are missing', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: 20, paymentStatus: '已结款', elementNote: '' })]
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

    expect(wrapper.find('[data-field="elementNote"]').classes()).toContain('cell--required')
    expect(wrapper.find('[data-field="ironRaw"]').classes()).toContain('cell--blocked')
    expect(wrapper.find('.blocked-click-layer').attributes('aria-label')).toBe('请先选择化验元素')
    expect(wrapper.find('[data-field="ironRaw"] input').attributes('disabled')).toBeDefined()
  })

  it('unlocks calculation inputs when customer, amount, payment status, and lab elements are complete', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ customerText: '客户甲', price: 20, paymentStatus: '已结款', elementNote: '三氧化二铁' })]
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

    expect(wrapper.find('[data-field="elementNote"]').classes()).toContain('cell--required')
    expect(wrapper.find('[data-field="ironRaw"]').classes()).not.toContain('cell--blocked')
    expect(wrapper.find('[data-field="ironRaw"] input').attributes('disabled')).toBeUndefined()
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

  it('uses normal text styling only when a payment status is selected', () => {
    const selectedBlock = makeBlock({ paymentStatus: '已结款' })
    const emptyBlock = makeBlock({ paymentStatus: '' })
    emptyBlock.id = 'block-2'
    emptyBlock.index = 2

    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [selectedBlock, emptyBlock]
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

    const selects = wrapper.findAll('.cell--payment-status .el-select')
    expect(selects).toHaveLength(2)
    expect(selects[0].classes()).toContain('payment-status-select--selected')
    expect(selects[1].classes()).not.toContain('payment-status-select--selected')
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

  it('opens the member picker and emits one complete prepaid tuple only after confirmation', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ sampleNumber: 'A-001', price: null, paymentStatus: '' })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: customerEditorStub,
          PrepaidMemberPickerDialog: prepaidPickerStub
        }
      }
    })

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '预存款')
    await nextTick()

    expect(wrapper.emitted('update')).toBeUndefined()
    expect(wrapper.find('.prepaid-picker-stub').exists()).toBe(true)

    await wrapper.get('.prepaid-picker-confirm').trigger('click')

    expect(wrapper.emitted('update')).toEqual([[
      'block-1',
      {
        paymentStatus: '预存款',
        price: 30.25,
        prepaidMemberId: 'member-1',
        prepaidMemberPhone: '13800000000'
      }
    ]])
  })

  it('renders an existing prepaid amount to two decimals and reopens the picker with its member tuple', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({
          sampleNumber: 'A-001',
          price: 3.9,
          paymentStatus: '预存款',
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '13800000000'
        })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: customerEditorStub,
          PrepaidMemberPickerDialog: prepaidPickerStub
        }
      }
    })

    expect(wrapper.text()).toContain('扣除金额')
    expect(wrapper.text()).toContain('3.90')
    expect(wrapper.text()).not.toContain('扣除次数')

    await wrapper.get('[data-testid="prepaid-picker-trigger-block-1"]').trigger('click')

    expect(wrapper.get('.prepaid-picker-stub').attributes('data-initial-phone')).toBe('13800000000')
    expect(wrapper.get('.prepaid-picker-stub').attributes('data-initial-amount')).toBe('3.9')
  })

  it('keeps historical prepaid samples readable without treating them as linked ledger members', async () => {
    const block = makeBlock({
      sampleNumber: 'A-001',
      price: 8,
      paymentStatus: '预存款'
    })
    block.readonly = true
    const wrapper = mount(LabSheetGrid, {
      props: { blocks: [block] },
      global: {
        plugins: [ElementPlus],
        stubs: { CustomerCellEditor: customerEditorStub }
      }
    })

    expect(wrapper.text()).toContain('8.00')
    expect(wrapper.text()).toContain('历史预存款记录（未关联新台账）')
    expect(wrapper.get('[data-testid="prepaid-picker-trigger-block-1"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="prepaid-picker-trigger-block-1"]').trigger('click')
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('clears prepaid-only fields in the same patch when switching away from prepaid', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({
          price: 30.25,
          paymentStatus: '预存款',
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '13800000000'
        })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: customerEditorStub,
          PrepaidMemberPickerDialog: prepaidPickerStub
        }
      }
    })

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '已结款')
    await nextTick()

    expect(wrapper.emitted('update')).toEqual([[
      'block-1',
      { paymentStatus: '已结款', prepaidMemberId: undefined, prepaidMemberPhone: undefined }
    ]])
  })

  it('does not resurrect a cleared prepaid member when prepaid is selected again', async () => {
    const block = makeBlock({
      price: 30.25,
      paymentStatus: '预存款',
      prepaidMemberId: 'member-1',
      prepaidMemberPhone: '13800000000'
    })
    const wrapper = mount(LabSheetGrid, {
      props: { blocks: [block] },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: customerEditorStub,
          PrepaidMemberPickerDialog: prepaidPickerStub
        }
      }
    })

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '已结款')
    await wrapper.setProps({ blocks: [makeBlock({ price: 30.25, paymentStatus: '已结款' })] })
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '预存款')
    await nextTick()

    expect(wrapper.get('.prepaid-picker-stub').attributes('data-initial-phone')).toBe('')
    expect(wrapper.get('.prepaid-picker-stub').attributes('data-initial-amount')).toBe('30.25')
  })

  it('does not seed stale member fields when switching a non-prepaid block back to prepaid', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({
          price: 30.25,
          paymentStatus: '月结款',
          prepaidMemberId: 'stale-member',
          prepaidMemberPhone: '13800000000'
        })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: {
          CustomerCellEditor: customerEditorStub,
          PrepaidMemberPickerDialog: prepaidPickerStub
        }
      }
    })

    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', '预存款')
    await nextTick()

    expect(wrapper.get('.prepaid-picker-stub').attributes('data-initial-phone')).toBe('')
    expect(wrapper.get('.prepaid-picker-stub').attributes('data-initial-amount')).toBe('30.25')
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('treats a non-positive prepaid deduction amount as incomplete', () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({
          sampleNumber: 'A-001',
          price: 0,
          paymentStatus: '预存款',
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '13800000000',
          elementNote: '铁'
        })]
      },
      global: {
        plugins: [ElementPlus],
        stubs: { CustomerCellEditor: { template: '<div class="customer-editor-stub" />' } }
      }
    })

    expect(wrapper.find('.blocked-click-layer').attributes('aria-label')).toBe('请先输入大于 0 的扣除金额')
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

  it('emits selection changes from the sequence checkbox in selection mode', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()],
        selectionMode: true,
        selectedBlockIds: []
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

    const checkbox = wrapper.findComponent({ name: 'ElCheckbox' })
    checkbox.vm.$emit('change', true)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('selectionChange')).toContainEqual(['block-1', true])
  })

  it('toggles selection when the whole sequence cell is clicked in selection mode', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock()],
        selectionMode: true,
        selectedBlockIds: []
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

    await wrapper.find('[data-block-id="block-1"].cell--green').trigger('click')
    expect(wrapper.emitted('selectionChange')).toContainEqual(['block-1', true])

    await wrapper.setProps({ selectedBlockIds: ['block-1'] })
    await wrapper.find('[data-block-id="block-1"].cell--green').trigger('click')
    expect(wrapper.emitted('selectionChange')).toContainEqual(['block-1', false])
  })

  it('uses the completed color on the sequence area for completed samples', () => {
    const wrapper = mount(LabSheetGrid, {
      props: {
        blocks: [makeBlock({ completed: true })]
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

    expect(wrapper.find('.cell--green').classes()).toContain('cell--completed')
  })

  it('fills completed sequence areas with the approved peach color', () => {
    const componentSource = readFileSync('src/components/lab-sheet/LabSheetGrid.vue', 'utf8')

    expect(componentSource).toMatch(/\.cell--green\.cell--completed\s*\{\s*background:\s*#fff3eb;/)
  })

  it('renders every retest after original calculation cells and before the amount row', () => {
    const wrapper = mount(LabSheetGrid, {
      props: { blocks: [makeBlockWithRetests(2)] },
      global: { plugins: [ElementPlus], stubs: { CustomerCellEditor: customerEditorStub } }
    })

    const sequenceCell = wrapper.get('[data-block-id="block-1"]')
    const order = Array.from(sequenceCell.element.parentElement!.children).map((node) => {
      const element = node as HTMLElement
      return element.dataset.retestId || element.dataset.field || ''
    })

    expect(wrapper.findAll('[data-retest-id]')).toHaveLength(2)
    expect(order.indexOf('retest-1')).toBeLessThan(order.indexOf('retest-2'))
    expect(order.indexOf('retest-2')).toBeLessThan(order.indexOf('price'))
  })

  it.each([
    [0, 3],
    [1, 4],
    [2, 5]
  ])('reserves exact C-W rows for %i retests while A-B keep the amount row aligned', (retestCount, expectedParentSpan) => {
    const wrapper = mount(LabSheetGrid, {
      props: { blocks: [makeBlockWithRetests(retestCount)] },
      global: { plugins: [ElementPlus], stubs: { CustomerCellEditor: customerEditorStub } }
    })
    const sequenceCell = wrapper.get('[data-block-id="block-1"][data-field="sequence"]')
      .element.parentElement as HTMLElement
    const customerCell = wrapper.get('.cell--customer')
    const customerStack = wrapper.get('.sample-customer-stack')
    const recipientRow = wrapper.get('[data-field="recipientCustomerText"]')
    const bands = wrapper.findAll('[data-retest-id]')

    expect(sequenceCell.style.gridRow).toBe(`span ${expectedParentSpan}`)
    expect((customerCell.element as HTMLElement).style.gridRow).toBe(`span ${expectedParentSpan}`)
    expect((customerStack.element as HTMLElement).style.gridTemplateRows.split(' ')).toHaveLength(expectedParentSpan)
    expect((recipientRow.element as HTMLElement).style.gridRow).toBe('-2 / -1')
    expect(bands).toHaveLength(retestCount)
    bands.forEach((band) => {
      expect((band.element as HTMLElement).style.gridColumn).toBe('3 / -1')
      expect((band.element as HTMLElement).style.gridTemplateColumns.split(' ')).toHaveLength(21)
    })
    expect(wrapper.find('[data-field="price"]').exists()).toBe(true)
  })

  it('passes the highlight and forwards exact retest event signatures', async () => {
    const wrapper = mount(LabSheetGrid, {
      props: { blocks: [makeBlockWithRetests(1)], highlightRetestId: 'retest-1' },
      global: { plugins: [ElementPlus], stubs: { CustomerCellEditor: customerEditorStub } }
    })
    const band = wrapper.findComponent({ name: 'SampleRetestBand' })

    expect(band.props('highlighted')).toBe(true)
    band.vm.$emit('update', 'retest-1', { ironRaw: 1 })
    band.vm.$emit('fieldCommit', 'retest-1', 'ironRaw', null, 1)
    band.vm.$emit('delete', 'retest-1')
    band.vm.$emit('void', 'retest-1')
    await nextTick()

    expect(wrapper.emitted('retestUpdate')).toContainEqual(['block-1', 'retest-1', { ironRaw: 1 }])
    expect(wrapper.emitted('retestFieldCommit')).toContainEqual(['block-1', 'retest-1', 'ironRaw', null, 1])
    expect(wrapper.emitted('retestDelete')).toContainEqual(['block-1', 'retest-1'])
    expect(wrapper.emitted('retestVoid')).toContainEqual(['block-1', 'retest-1'])
  })

  it('locks retests with the completed parent when completed data access is unavailable', () => {
    const block = makeBlockWithRetests(1)
    block.inputs.completed = true
    block.retests[0].inputs.ironRaw = 1
    block.retests[0].results.iron = 27.94
    const wrapper = mount(LabSheetGrid, {
      props: { blocks: [block], canViewCompletedSensitiveData: false },
      global: { plugins: [ElementPlus], stubs: { CustomerCellEditor: customerEditorStub } }
    })

    const retestBand = wrapper.get('[data-retest-id="retest-1"]')
    expect(retestBand.get('input').attributes('disabled')).toBeDefined()
    expect((retestBand.get('input').element as HTMLInputElement).value).toBe('')
    expect(retestBand.text()).not.toContain('27.94')
    expect(retestBand.text()).toContain('数据已加密')
    expect(wrapper.find('[data-testid="delete-retest-retest-1"]').exists()).toBe(false)
  })
})
