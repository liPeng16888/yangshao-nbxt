import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MonthlySettlementBillExportDialog from './MonthlySettlementBillExportDialog.vue'
import dialogSource from './MonthlySettlementBillExportDialog.vue?raw'
import type { MonthlySettlementDailyRow } from '@/types/financeBills'
import { downloadMonthlyBillAsPng } from '@/utils/monthlySettlementBillPng'

vi.mock('@/utils/monthlySettlementBillPng', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/monthlySettlementBillPng')>(),
  downloadMonthlyBillAsPng: vi.fn()
}))

const DialogStub = defineComponent({
  name: 'ElDialog',
  props: { modelValue: Boolean, width: String },
  template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>'
})

function makeRowsForTwoCustomers(): MonthlySettlementDailyRow[] {
  return [
    {
      id: 'row-a',
      date: '2026-08-01',
      customer: '客户甲',
      customerDisplay: '客户甲',
      sampleCount: 2,
      amount: 120,
      elementCounts: [
        { key: 'aluminumSiliconRatio', label: '铝硅比', count: 2 },
        { key: 'sulfur', label: '硫', count: 1 }
      ]
    },
    {
      id: 'row-b',
      date: '2026-08-01',
      customer: '客户乙',
      customerDisplay: '客户乙',
      sampleCount: 1,
      amount: 50,
      elementCounts: [{ key: 'calcium', label: '钙', count: 1 }]
    }
  ]
}

function mountDialog(overrides: Partial<{
  visible: boolean
  month: string
  rows: MonthlySettlementDailyRow[]
}> = {}) {
  return mount(MonthlySettlementBillExportDialog, {
    props: {
      visible: true,
      month: '2026-08',
      rows: makeRowsForTwoCustomers(),
      ...overrides
    },
    global: {
      plugins: [ElementPlus],
      stubs: { ElDialog: DialogStub }
    }
  })
}

async function selectCustomer(wrapper: ReturnType<typeof mountDialog>, customer: string) {
  wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', customer)
  await nextTick()
}

async function setElementPrice(wrapper: ReturnType<typeof mountDialog>, elementKey: string, value: number) {
  wrapper.get(`[data-element-key="${elementKey}"]`).findComponent({ name: 'ElInputNumber' }).vm.$emit('update:modelValue', value)
  await nextTick()
}

function mockMessages() {
  return {
    warning: vi.spyOn(ElMessage, 'warning').mockReturnValue({ close: vi.fn() } as never),
    error: vi.spyOn(ElMessage, 'error').mockReturnValue({ close: vi.fn() } as never),
    success: vi.spyOn(ElMessage, 'success').mockReturnValue({ close: vi.fn() } as never)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MonthlySettlementBillExportDialog', () => {
  it('builds a draft only after selecting one customer', async () => {
    const wrapper = mountDialog()
    await selectCustomer(wrapper, '客户甲')

    expect((wrapper.get('[data-testid="bill-preview-title-input"]').element as HTMLInputElement).value).toBe('客户甲化验账单')
    expect(wrapper.findAll('[data-testid="bill-price-input"]')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('客户乙')
    expect(wrapper.text()).toContain('账期：2026年8月')
  })

  it('bounds the dialog width to the viewport', () => {
    const wrapper = mountDialog()

    expect(wrapper.findComponent(DialogStub).props('width')).toBe('min(1180px, calc(100vw - 32px))')
  })

  it('applies a temporary element price without mutating source rows', async () => {
    const rows = makeRowsForTwoCustomers()
    const snapshot = structuredClone(rows)
    const wrapper = mountDialog({ rows })
    await selectCustomer(wrapper, '客户甲')
    await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)

    expect(wrapper.text()).toContain('¥120.00')
    expect(rows).toEqual(snapshot)
  })

  it('resets customer and prices whenever the dialog is reopened', async () => {
    const wrapper = mountDialog({ visible: true })
    await selectCustomer(wrapper, '客户甲')
    await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })

    expect(wrapper.find('[data-testid="bill-preview-title-input"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="bill-price-input"]')).toHaveLength(0)
  })

  it('updates the draft subtotal after editing an entry quantity', async () => {
    const wrapper = mountDialog()
    await selectCustomer(wrapper, '客户甲')
    await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)
    await setElementPrice(wrapper, 'sulfur', 10)

    wrapper.get('[data-testid="bill-preview-quantity-input"]').findComponent({ name: 'ElInputNumber' }).vm.$emit('update:modelValue', 3)
    await nextTick()

    expect(wrapper.text()).toContain('¥180.00')
    expect(wrapper.text()).toContain('合计：¥190.00')
  })

  it('removes the middle editor and edits title, date, element and quantity directly in the compact bill', async () => {
    const wrapper = mountDialog()
    await selectCustomer(wrapper, '客户甲')
    await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)
    await setElementPrice(wrapper, 'sulfur', 10)

    expect(wrapper.find('.bill-entry-editor').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="bill-preview-unit-price-input"]')).toHaveLength(0)

    await wrapper.get('[data-testid="bill-preview-title-input"]').setValue('修改后的化验账单')
    await wrapper.get('[data-testid="bill-preview-date-input"]').setValue('2026-08-09')
    await wrapper.get('[data-testid="bill-preview-element-input"]').setValue('铝硅检测')
    wrapper.get('[data-testid="bill-preview-quantity-input"]').findComponent({ name: 'ElInputNumber' }).vm.$emit('update:modelValue', 3)
    await nextTick()

    const preview = wrapper.get('.monthly-bill-preview')
    expect((wrapper.get('[data-testid="bill-preview-title-input"]').element as HTMLInputElement).value).toBe('修改后的化验账单')
    expect((wrapper.get('[data-testid="bill-preview-date-input"]').element as HTMLInputElement).value).toBe('8月9日')
    expect((wrapper.get('[data-testid="bill-preview-element-input"]').element as HTMLInputElement).value).toBe('铝硅检测')
    expect(preview.text()).toContain('¥180.00')
    expect(preview.text()).toContain('合计：¥190.00')
  })

  it('warns instead of exporting an incomplete draft', async () => {
    const messages = mockMessages()
    const download = vi.mocked(downloadMonthlyBillAsPng)
    const wrapper = mountDialog()
    await selectCustomer(wrapper, '客户甲')

    await wrapper.get('button.el-button--primary').trigger('click')

    expect(messages.warning).toHaveBeenCalledWith('请填写有效的元素单价')
    expect(download).not.toHaveBeenCalled()
  })

  it('warns when exporting before selecting a customer', async () => {
    const messages = mockMessages()
    const download = vi.mocked(downloadMonthlyBillAsPng)
    const wrapper = mountDialog()

    await wrapper.get('button.el-button--primary').trigger('click')

    expect(messages.warning).toHaveBeenCalledWith('请选择需要导出的客户')
    expect(download).not.toHaveBeenCalled()
  })

  it('shows clear empty-detail and missing-price states', async () => {
    const rows = makeRowsForTwoCustomers()
    rows.push({
      id: 'row-empty',
      date: '2026-08-02',
      customer: '客户空',
      customerDisplay: '客户空',
      sampleCount: 1,
      amount: 0,
      elementCounts: [{ key: 'sulfur', label: '硫', count: 0 }]
    })
    const wrapper = mountDialog({ rows })

    expect(wrapper.text()).toContain('请选择需要导出的客户')
    await selectCustomer(wrapper, '客户空')
    expect(wrapper.text()).toContain('该客户本月暂无可导出的检测明细')

    await selectCustomer(wrapper, '客户甲')
    expect(wrapper.text()).toContain('请填写有效的元素单价')
  })

  it('uses the same Chinese date and currency formats in the preview', async () => {
    const wrapper = mountDialog()
    await selectCustomer(wrapper, '客户甲')
    await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)
    await setElementPrice(wrapper, 'sulfur', 10)

    const preview = wrapper.get('.monthly-bill-preview')
    expect(preview.text()).toContain('账期：2026年8月')
    expect((wrapper.get('[data-testid="bill-preview-date-input"]').element as HTMLInputElement).value).toBe('8月1日')
    expect(preview.text()).toContain('¥120.00')
    expect(preview.text()).toContain('合计：¥130.00')
  })

  it('uses one-line truncation with full-value titles in preview while editors keep complete text', async () => {
    const customerDisplay = '这是一个非常长的客户完整信息'.repeat(4)
    const longDate = '这是一个非常长的手动日期文本'
    const longElement = '这是一个非常长的检测元素名称'
    const rows: MonthlySettlementDailyRow[] = [{
      id: 'row-long',
      date: longDate,
      customer: '客户长文本',
      customerDisplay,
      sampleCount: 1,
      amount: 0,
      elementCounts: [{ key: 'long-element', label: longElement, count: 1 }]
    }]
    const wrapper = mountDialog({ rows })
    await selectCustomer(wrapper, '客户长文本')

    const fullTitle = `${customerDisplay}化验账单`
    const previewTitle = wrapper.get('[data-testid="bill-preview-title-input"]')
    expect((previewTitle.element as HTMLInputElement).value).toBe(fullTitle)
    expect(previewTitle.attributes('title')).toBe(fullTitle)
    expect(wrapper.get('[data-testid="bill-preview-date-input"]').attributes('title')).toBe(longDate)
    expect(wrapper.get('[data-testid="bill-preview-element-input"]').attributes('title')).toBe(longElement)

    const editableValues = wrapper.findAllComponents({ name: 'ElInput' }).map((input) => input.props('modelValue'))
    expect(editableValues).toEqual(expect.arrayContaining([fullTitle, longDate, longElement]))

    const styleBlock = dialogSource.match(/\.monthly-bill-preview__truncate\s*\{[^}]+\}/)?.[0] || ''
    expect(styleBlock).toContain('overflow: hidden')
    expect(styleBlock).toContain('text-overflow: ellipsis')
    expect(styleBlock).toContain('white-space: nowrap')
  })

  it('reports a failed PNG download and prevents duplicate export requests', async () => {
    const messages = mockMessages()
    const download = vi.mocked(downloadMonthlyBillAsPng)
    let finishExport: (result: boolean) => void = () => undefined
    download.mockImplementation(() => new Promise((resolve) => { finishExport = resolve }))
    const wrapper = mountDialog()
    await selectCustomer(wrapper, '客户甲')
    await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)
    await setElementPrice(wrapper, 'sulfur', 10)

    const button = wrapper.get('button.el-button--primary')
    await button.trigger('click')
    await button.trigger('click')
    expect(download).toHaveBeenCalledTimes(1)

    finishExport(false)
    await flushPromises()

    expect(messages.error).toHaveBeenCalledWith('账单图片生成失败，请重试')
  })

  it('recovers from a rejected PNG export so it can be retried', async () => {
    const messages = mockMessages()
    const download = vi.mocked(downloadMonthlyBillAsPng)
    download.mockRejectedValueOnce(new Error('browser export failed')).mockResolvedValueOnce(false)
    const wrapper = mountDialog()
    await selectCustomer(wrapper, '客户甲')
    await setElementPrice(wrapper, 'aluminumSiliconRatio', 60)
    await setElementPrice(wrapper, 'sulfur', 10)

    const button = wrapper.get('button.el-button--primary')
    await button.trigger('click')
    await flushPromises()

    expect(messages.error).toHaveBeenCalledWith('账单图片生成失败，请重试')
    expect(button.classes()).not.toContain('is-loading')

    await button.trigger('click')
    await flushPromises()

    expect(download).toHaveBeenCalledTimes(2)
  })
})
