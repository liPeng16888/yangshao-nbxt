import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MonthlyBillDraft } from '@/types/monthlySettlementBill'
import { recalculateMonthlyBillDraft } from './monthlySettlementBill'
import {
  createMonthlyBillCanvasLayout,
  createMonthlyBillPngBlob,
  downloadMonthlyBillAsPng
} from './monthlySettlementBillPng'

function makeReadyDraft(elementCount: number, quantity = 1): MonthlyBillDraft {
  return recalculateMonthlyBillDraft({
    title: '客户甲化验账单',
    month: '2026-08',
    customer: '客户甲',
    customerDisplay: '客户甲',
    entries: Array.from({ length: elementCount }, (_, index) => ({
      id: `entry-${index + 1}`,
      sourceElementKey: `element-${index + 1}`,
      date: '2026-08-01',
      elementLabel: `元素${index + 1}`,
      quantity,
      unitPrice: 10,
      subtotal: quantity * 10
    })),
    elementTotals: [],
    totalAmount: 0
  })
}

function mockCanvasContext() {
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 12 }))
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  return context
}

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function mockObjectUrl() {
  const create = vi.fn(() => 'blob:monthly-settlement')
  const revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  return { create, revoke }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectURL
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectURL
  })
})

describe('monthly settlement bill PNG export', () => {
  it('returns the same generated PNG blob for mobile preview and sharing', async () => {
    mockCanvasContext()
    const png = new Blob(['png-content'], { type: 'image/png' })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
      expect(type).toBe('image/png')
      callback(png)
    })

    await expect(createMonthlyBillPngBlob(makeReadyDraft(2))).resolves.toBe(png)
  })

  it('uses five stable columns and grows height for continuation rows', () => {
    const twoGroup = createMonthlyBillCanvasLayout(makeReadyDraft(2))
    const sevenGroup = createMonthlyBillCanvasLayout(makeReadyDraft(7))

    expect(twoGroup.groupCount).toBe(5)
    expect(sevenGroup.groupCount).toBe(5)
    expect(sevenGroup.width).toBe(twoGroup.width)
    expect(sevenGroup.height).toBeGreaterThan(twoGroup.height)
  })

  it('returns false when canvas context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await expect(downloadMonthlyBillAsPng(makeReadyDraft(2))).resolves.toBe(false)
  })

  it('rejects a tiny negative unit price before creating a canvas', async () => {
    const draft = makeReadyDraft(1)
    draft.entries[0].unitPrice = -0.004
    const invalidDraft = recalculateMonthlyBillDraft(draft)
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    await expect(downloadMonthlyBillAsPng(invalidDraft)).resolves.toBe(false)

    expect(invalidDraft.entries[0].unitPrice).toBe(-0.004)
    expect(getContext).not.toHaveBeenCalled()
  })

  it('draws the shared Chinese date, billing month and currency-formatted subtotal', async () => {
    const context = mockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))

    await expect(downloadMonthlyBillAsPng(makeReadyDraft(1, 2))).resolves.toBe(false)

    const drawnTexts = vi.mocked(context.fillText).mock.calls.map(([text]) => text)
    expect(drawnTexts).toContain('账期：2026年8月')
    expect(drawnTexts).toContain('8月1日')
    expect(drawnTexts).toContain('价格')
    expect(drawnTexts).toContain('¥20.00')
    expect(drawnTexts).not.toContain('¥10.00')
  })

  it('truncates long title, date and element labels within their cell width', async () => {
    const context = mockCanvasContext()
    let draft = makeReadyDraft(1)
    draft.title = '超长客户完整信息'.repeat(30)
    draft.entries[0].date = '这是一个非常长的手动日期文本'
    draft.entries[0].elementLabel = '这是一个非常长的检测元素名称'
    draft = recalculateMonthlyBillDraft(draft)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))

    await downloadMonthlyBillAsPng(draft)

    const calls = vi.mocked(context.fillText).mock.calls
    const texts = calls.map(([text]) => text)
    expect(texts).not.toContain(draft.title)
    expect(texts).not.toContain(draft.entries[0].date)
    expect(texts).not.toContain(draft.entries[0].elementLabel)
    expect(texts.filter((text) => String(text).endsWith('…')).length).toBeGreaterThanOrEqual(3)
    expect(calls.every((call) => typeof call[3] === 'number' && call[3] > 0)).toBe(true)
  })

  it('draws one vertically merged summary label cell across continuation rows', async () => {
    const context = mockCanvasContext()
    const draft = makeReadyDraft(7)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null))

    await downloadMonthlyBillAsPng(draft)

    const summaryTextCalls = vi.mocked(context.fillText).mock.calls.filter(([text]) => text === '元素合计')
    expect(summaryTextCalls).toHaveLength(1)
    expect(vi.mocked(context.strokeRect).mock.calls).toContainEqual([
      0,
      expect.any(Number),
      110,
      76
    ])
  })

  it('returns false when canvas blob callback does not resolve before timeout', async () => {
    vi.useFakeTimers()
    mockCanvasContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {})

    const result = downloadMonthlyBillAsPng(makeReadyDraft(2))
    await vi.advanceTimersByTimeAsync(5000)
    await expect(result).resolves.toBe(false)
  })

  it('does not download when a blob callback arrives after the timeout', async () => {
    vi.useFakeTimers()
    mockCanvasContext()
    const objectUrl = mockObjectUrl()
    const appendChild = vi.spyOn(document.body, 'appendChild')
    let blobCallback: ((blob: Blob | null) => void) | undefined
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      blobCallback = callback
    })

    const result = downloadMonthlyBillAsPng(makeReadyDraft(2))
    await vi.advanceTimersByTimeAsync(5000)
    await expect(result).resolves.toBe(false)

    blobCallback?.(new Blob(['late'], { type: 'image/png' }))

    expect(objectUrl.create).not.toHaveBeenCalled()
    expect(appendChild).not.toHaveBeenCalled()
  })

  it('returns false when creating the blob URL throws', async () => {
    mockCanvasContext()
    const objectUrl = mockObjectUrl()
    objectUrl.create.mockImplementation(() => {
      throw new Error('create failed')
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png'], { type: 'image/png' }))
    })

    await expect(downloadMonthlyBillAsPng(makeReadyDraft(2))).resolves.toBe(false)

    expect(objectUrl.revoke).not.toHaveBeenCalled()
  })

  it('cleans up the URL when appending the download link throws', async () => {
    mockCanvasContext()
    const objectUrl = mockObjectUrl()
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {
      throw new Error('append failed')
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png'], { type: 'image/png' }))
    })

    await expect(downloadMonthlyBillAsPng(makeReadyDraft(2))).resolves.toBe(false)

    expect(objectUrl.revoke).toHaveBeenCalledWith('blob:monthly-settlement')
  })

  it('removes the link and revokes the URL when clicking the download link throws', async () => {
    mockCanvasContext()
    const objectUrl = mockObjectUrl()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click failed')
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png'], { type: 'image/png' }))
    })

    await expect(downloadMonthlyBillAsPng(makeReadyDraft(2))).resolves.toBe(false)

    expect(objectUrl.revoke).toHaveBeenCalledWith('blob:monthly-settlement')
    expect(document.body.querySelector('a')).toBeNull()
  })
})
