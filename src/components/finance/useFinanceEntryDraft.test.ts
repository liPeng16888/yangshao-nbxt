// @vitest-environment jsdom
import type { UploadRawFile, UploadUserFile } from 'element-plus'
import ElementPlus from 'element-plus'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinancePayload } from '@/types/finance'
import FinanceEntryForm from './FinanceEntryForm.vue'
import MobileFinanceEntryForm from './MobileFinanceEntryForm.vue'
import { buildPayloads, createRow, validateRows } from './useFinanceEntryDraft'
import type { ExpenseDraftRow } from './useFinanceEntryDraft'

const mocks = vi.hoisted(() => ({ uploadImages: vi.fn() }))

vi.mock('@/api/upload', () => ({ uploadImages: mocks.uploadImages }))

function localUpload(file: File, uid: number): UploadUserFile {
  return { name: file.name, uid, raw: file as UploadRawFile }
}

describe('finance entry draft helpers', () => {
  beforeEach(() => {
    mocks.uploadImages.mockReset().mockImplementation(async (files: File[]) => files.map((file) => `/uploads/${file.name}`))
  })

  it('creates independent blank rows and validates every required positive expense field', () => {
    const first = createRow()
    const second = createRow()
    expect(first).toMatchObject({ item: '', amount: 0, paymentMethod: '', files: [], remark: '' })
    expect(second.id).not.toBe(first.id)

    expect(validateRows('', [first])).toBe('请选择支付日期')
    expect(validateRows('2026-08-15', [first])).toBe('第 1 行：开支项目必填')
    first.item = '试剂'
    expect(validateRows('2026-08-15', [first])).toBe('第 1 行：开支金额必须大于 0')
    first.amount = 0.01
    expect(validateRows('2026-08-15', [first])).toBe('第 1 行：支付方式必填')
    first.paymentMethod = 'online'
    expect(validateRows('2026-08-15', [first])).toBe('')
  })

  it('builds the same payloads for desktop and mobile drafts and uploads the same local files', async () => {
    const receipt = new File(['receipt'], 'receipt.png', { type: 'image/png', lastModified: 1 })
    const desktopRow = createRow()
    Object.assign(desktopRow, {
      item: ' 标准物质 ',
      amount: 12.34,
      paymentMethod: 'cash',
      remark: ' 当日领用 ',
      files: [
        { name: 'stored.png', uid: 1, url: 'https://example.com/stored.png' },
        localUpload(receipt, 2),
        localUpload(receipt, 3)
      ]
    })
    const mobileRow = createRow()
    Object.assign(mobileRow, {
      item: '标准物质',
      amount: 12.34,
      paymentMethod: 'cash',
      remark: '当日领用',
      files: [
        { name: 'stored.png', uid: 4, url: 'https://example.com/stored.png' },
        localUpload(receipt, 5)
      ]
    })
    const expected: FinancePayload[] = [{
      paymentDate: '2026-08-15',
      item: '标准物质',
      amount: 12.34,
      paymentMethod: 'cash',
      screenshotUrl: 'https://example.com/stored.png',
      screenshotUrls: ['https://example.com/stored.png', '/uploads/receipt.png'],
      remark: '当日领用'
    }]

    await expect(buildPayloads('2026-08-15', [desktopRow])).resolves.toEqual(expected)
    await expect(buildPayloads('2026-08-15', [mobileRow])).resolves.toEqual(expected)
    expect(mocks.uploadImages.mock.calls).toEqual([[[receipt]], [[receipt]]])
  })

  it('reuses uploaded URLs across a rejected-save retry without uploading duplicate local files', async () => {
    const receipt = new File(['receipt'], 'retry.png', { type: 'image/png' })
    const row = createRow()
    Object.assign(row, { item: '办公用品', amount: 8.5, paymentMethod: 'online', files: [localUpload(receipt, 1)] })
    const uploadCache = new WeakMap<File, string>()

    const first = await buildPayloads('2026-08-15', [row], uploadCache)
    const second = await buildPayloads('2026-08-15', [row], uploadCache)

    expect(second).toEqual(first)
    expect(mocks.uploadImages).toHaveBeenCalledTimes(1)
    expect(mocks.uploadImages).toHaveBeenCalledWith([receipt])
  })

  it('makes the desktop event and awaited mobile save produce identical payloads from the same local file', async () => {
    const receipt = new File(['same'], 'same.png', { type: 'image/png' })
    const save = vi.fn(async (_payloads: FinancePayload[]) => undefined)
    const desktop = mount(FinanceEntryForm, { global: { plugins: [ElementPlus] } })
    const mobile = mount(MobileFinanceEntryForm, { props: { save }, global: { plugins: [ElementPlus] } })
    const desktopDraft = (desktop.vm as unknown as { rows: ExpenseDraftRow[] }).rows[0]
    const mobileDraft = (mobile.vm as unknown as { rows: ExpenseDraftRow[] }).rows[0]
    for (const [index, row] of [desktopDraft, mobileDraft].entries()) {
      Object.assign(row, {
        item: '同一开支',
        amount: 6.78,
        paymentMethod: 'online',
        remark: '同一备注',
        files: [localUpload(receipt, index + 1)]
      })
    }

    await desktop.get('.finance-form__actions button').trigger('click')
    await mobile.get('[data-testid="mobile-finance-save"]').trigger('click')
    await flushPromises()

    const desktopPayloads = desktop.emitted('submit')?.[0]?.[0]
    expect(save).toHaveBeenCalledWith(desktopPayloads)
    expect(mocks.uploadImages.mock.calls).toEqual([[[receipt]], [[receipt]]])
    desktop.unmount()
    mobile.unmount()
  })
})
