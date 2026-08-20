import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HistoricalSampleChangeDialog from './HistoricalSampleChangeDialog.vue'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { LAB_SAMPLE_CHANGE_RAW_FIELDS, labSampleChangeFieldLabels } from '@/constants/labSampleChangeRequest'
import { calculateSampleResults } from '@/utils/formulaEngine'
import type { LabSampleInput, SampleBlock } from '@/types/labSheet'
import type { CreateLabSampleChangeRequestPayload } from '@/types/labSampleChangeRequest'

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue', 'close'],
  template: '<section v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></section>'
})

const InputStub = defineComponent({
  props: { modelValue: [String, Number], disabled: Boolean },
  emits: ['update:modelValue', 'blur'],
  template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\')" />'
})

const SelectStub = defineComponent({
  props: { modelValue: String, disabled: Boolean },
  emits: ['update:modelValue'],
  template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
})

const OptionStub = defineComponent({
  props: { label: String, value: String },
  template: '<option :value="value">{{ label }}</option>'
})

const AlertStub = defineComponent({
  template: '<div class="alert-stub" />'
})

const ButtonStub = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
})

const CustomerEditorStub = defineComponent({
  emits: ['update'],
  template: '<button type="button" data-testid="set-payer-customer" @click="$emit(\'update\', { customerId: \'customer-new\', customerIds: [\'customer-new\'], customers: [{ id: \'customer-new\', name: \'新客户\' }], customerText: \'新客户\' })">付款客户</button>'
})

const ElementSelectorStub = defineComponent({
  emits: ['update:modelValue'],
  template: '<button type="button" data-testid="set-element-note" @click="$emit(\'update:modelValue\', \'铁、硅\')">化验元素</button>'
})

function makeBlock(inputs: Partial<LabSampleInput> = {}, overrides: Partial<SampleBlock> = {}): SampleBlock {
  const mergedInputs: LabSampleInput = {
    sequence: '001',
    completed: true,
    sampleNumber: '旧样品',
    customerId: 'customer-old',
    customerIds: ['customer-old'],
    customers: [{ id: 'customer-old', name: '旧客户' }],
    customerText: '旧客户',
    price: 80,
    paymentStatus: '未结款',
    elementNote: '铁',
    ...inputs
  }
  return {
    id: 'block-1',
    index: 1,
    readonly: true,
    updatedAt: '2026-08-19T01:00:00.000Z',
    inputs: mergedInputs,
    results: calculateSampleResults(mergedInputs, defaultLabParameters),
    parameterSnapshot: { ...defaultLabParameters },
    ...overrides
  }
}

function mountDialog(block = makeBlock(), props: Partial<InstanceType<typeof HistoricalSampleChangeDialog>['$props']> = {}) {
  return mount(HistoricalSampleChangeDialog, {
    props: {
      modelValue: true,
      block,
      submitting: false,
      ...props
    },
    global: {
      stubs: {
        ElDialog: DialogStub,
        ElAlert: AlertStub,
        ElButton: ButtonStub,
        ElInput: InputStub,
        ElSelect: SelectStub,
        ElOption: OptionStub,
        CustomerCellEditor: CustomerEditorStub,
        LabElementSelector: ElementSelectorStub
      }
    }
  })
}

async function submitWithReason(wrapper: ReturnType<typeof mount>, reason = '复核原始化验记录') {
  await wrapper.get('[data-testid="sample-change-reason"]').setValue(reason)
  await wrapper.get('[data-testid="submit-sample-change"]').trigger('click')
}

describe('HistoricalSampleChangeDialog', () => {
  it('does not mutate the source block and emits only changed allowed fields with a required reason', async () => {
    const block = makeBlock({ ironRaw: 1 })
    const original = JSON.parse(JSON.stringify(block))
    const wrapper = mountDialog(block)

    await wrapper.get('[data-testid="sample-change-sample-number"]').setValue('新样品')
    await wrapper.get('[data-testid="sample-change-ironRaw"]').setValue('2')
    expect(wrapper.get('[data-testid="submit-sample-change"]').attributes('disabled')).toBeDefined()
    await submitWithReason(wrapper)

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      blockId: block.id,
      baseUpdatedAt: block.updatedAt,
      changes: { sampleNumber: '新样品', ironRaw: 2 },
      reason: '复核原始化验记录'
    })
    expect(block).toEqual(original)
  })

  it('previews recalculated results from the block parameter snapshot and never renders result override inputs', async () => {
    const block = makeBlock({ ironRaw: 1 }, { parameterSnapshot: { ...defaultLabParameters, ironFactor: 2 } })
    const wrapper = mountDialog(block)

    await wrapper.get('[data-testid="sample-change-ironRaw"]').setValue('2')

    expect(wrapper.get('[data-testid="sample-change-preview-iron"]').text()).toContain('预览 3.92')
    expect(wrapper.text()).toContain('仅预览，以审批后服务端计算为准')
    expect(wrapper.find('[data-testid="sample-change-result-input-iron"]').exists()).toBe(false)
  })

  it('treats payer customer as one logical change and submits price, payment, and element fields at existing precision', async () => {
    const block = makeBlock({ ironRaw: 1 })
    const wrapper = mountDialog(block)

    await wrapper.get('[data-testid="set-payer-customer"]').trigger('click')
    await wrapper.get('[data-testid="sample-change-price"]').setValue('19.87')
    await wrapper.get('[data-testid="sample-change-payment-status"]').setValue('月结款')
    await wrapper.get('[data-testid="set-element-note"]').trigger('click')
    await submitWithReason(wrapper)

    const payload = wrapper.emitted('submit')?.[0]?.[0] as CreateLabSampleChangeRequestPayload
    expect(payload).toMatchObject({
      changes: {
        payerCustomer: { customerIds: ['customer-new'], customerText: '新客户' },
        price: 19.87,
        paymentStatus: '月结款',
        elementNote: '铁、硅'
      }
    })
    expect(payload.changes).not.toHaveProperty('customers')
    expect(payload.changes).not.toHaveProperty('customerText')
  })

  it('renders every raw detection input with its allowed label and no forbidden direct-edit controls', () => {
    const wrapper = mountDialog(makeBlock())

    for (const field of LAB_SAMPLE_CHANGE_RAW_FIELDS) {
      expect(wrapper.find(`[data-testid="sample-change-${field}"]`).exists()).toBe(true)
      expect(wrapper.text()).toContain(labSampleChangeFieldLabels[field])
    }
    expect(wrapper.find('[data-testid="sample-change-sequence"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sample-change-completed"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sample-change-recipient-customer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sample-change-note"]').exists()).toBe(false)
  })

  it('disables no-op submission, trims the reason, and shows only actual diff rows', async () => {
    const wrapper = mountDialog(makeBlock())
    expect(wrapper.get('[data-testid="submit-sample-change"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="sample-change-sample-number"]').setValue('新样品')
    expect(wrapper.findAll('[data-testid^="sample-change-diff-"]')).toHaveLength(1)
    await submitWithReason(wrapper, '  需要复核  ')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ reason: '需要复核' })
  })

  it('recreates the isolated draft when a different block opens', async () => {
    const wrapper = mountDialog(makeBlock({ sampleNumber: '样品一' }))
    await wrapper.get('[data-testid="sample-change-sample-number"]').setValue('未提交草稿')
    const nextBlock = makeBlock({ sampleNumber: '样品二' }, { id: 'block-2', updatedAt: '2026-08-19T02:00:00.000Z' })

    await wrapper.setProps({ block: nextBlock })
    await nextTick()

    expect((wrapper.get('[data-testid="sample-change-sample-number"]').element as HTMLInputElement).value).toBe('样品二')
    expect(wrapper.findAll('[data-testid^="sample-change-diff-"]')).toHaveLength(0)
  })

  it('retains the draft while the parent submission fails and prevents duplicate submission', async () => {
    const wrapper = mountDialog(makeBlock())
    await wrapper.get('[data-testid="sample-change-sample-number"]').setValue('保留草稿')
    await wrapper.get('[data-testid="sample-change-reason"]').setValue('网络失败后重试')
    await wrapper.get('[data-testid="submit-sample-change"]').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)

    await wrapper.setProps({ submitting: true })
    expect(wrapper.get('[data-testid="submit-sample-change"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="submit-sample-change"]').trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    await wrapper.setProps({ submitting: false })

    expect((wrapper.get('[data-testid="sample-change-sample-number"]').element as HTMLInputElement).value).toBe('保留草稿')
    expect((wrapper.get('[data-testid="sample-change-reason"]').element as HTMLInputElement).value).toBe('网络失败后重试')
  })
})
