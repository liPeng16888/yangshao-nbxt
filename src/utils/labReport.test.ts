import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { SampleBlock } from '@/types/labSheet'
import {
  createLabReportFilename,
  createLabReportSmsText,
  createReportCanvasLayout,
  createReportDraft,
  defaultLabReportSmsTemplate,
  defaultLabReportTemplate,
  detectReportElementKeys,
  downloadLabReportElementAsPng,
  loadLabReportSmsTemplate,
  loadLabReportTemplate,
  parseLabElementKeys,
} from './labReport'

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value))
  }
}

function makeBlock(): SampleBlock {
  return {
    id: 'block-1',
    index: 1,
    readonly: false,
    inputs: {
      sequence: '001',
      sampleNumber: '6.23 桂MB5823',
      customerText: '王总',
      aluminumRaw: 1,
      siliconRaw: 1,
      ironRaw: 1,
      sulfur: null,
      carbon: null
    },
    results: {
      aluminum: 68,
      silicon: 10,
      iron: 2,
      aluminumSiliconRatio: 6.8,
      total: 80,
      density: 0,
      calcium: 0,
      magnesium: 0,
      titanium: 0,
      bottleDensity: 0,
      moisture: 0,
      burnLoss: 0
    },
    parameterSnapshot: defaultLabParameters
  }
}

describe('lab report generation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: createMemoryStorage(), configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('detects only filled report elements and removes blank columns', () => {
    const block = makeBlock()

    expect(detectReportElementKeys(block)).toEqual(['aluminum', 'silicon', 'iron', 'aluminumSiliconRatio'])
  })

  it('parses aluminum-silicon ratio as an independent selection', () => {
    expect(parseLabElementKeys('铝硅比')).toEqual(['aluminumSiliconRatio'])
    expect(parseLabElementKeys('A/S')).toEqual(['aluminumSiliconRatio'])
    expect(parseLabElementKeys('铝、硅、铝硅比')).toEqual(['aluminum', 'silicon', 'aluminumSiliconRatio'])
  })

  it('creates an editable draft from selected samples and selected elements', () => {
    const block = makeBlock()
    const draft = createReportDraft(
      [block],
      [{ blockId: 'block-1', elementKeys: ['aluminum', 'silicon', 'iron', 'aluminumSiliconRatio'] }],
      defaultLabReportTemplate,
      '2026-06-25'
    )

    expect(draft.sampleCount).toBe('1')
    expect(draft.sampleUnit).toBe('王总')
    expect(draft.elements.map((element) => element.symbol)).toEqual(['Al₂O₃', 'SiO₂', 'Fe₂O₃', 'A/S'])
    expect(draft.rows[0]).toMatchObject({
      sampleName: '6.23 桂MB5823',
      values: {
        aluminum: '68',
        silicon: '10',
        iron: '2',
        aluminumSiliconRatio: '6.8'
      }
    })
  })

  it('uses the data recipient as the report sample unit and falls back to the payer', () => {
    const recipientBlock = makeBlock()
    recipientBlock.inputs.recipientCustomerText = '李总'
    const fallbackBlock = makeBlock()
    fallbackBlock.inputs.recipientCustomerText = ''

    const recipientDraft = createReportDraft(
      [recipientBlock],
      [{ blockId: recipientBlock.id, elementKeys: ['aluminum'] }],
      defaultLabReportTemplate,
      '2026-06-25'
    )
    const fallbackDraft = createReportDraft(
      [fallbackBlock],
      [{ blockId: fallbackBlock.id, elementKeys: ['aluminum'] }],
      defaultLabReportTemplate,
      '2026-06-25'
    )

    expect(recipientDraft.sampleUnit).toBe('李总')
    expect(fallbackDraft.sampleUnit).toBe('王总')
  })

  it('names the downloaded report from the payer and dotted report date', () => {
    const firstBlock = makeBlock()
    firstBlock.inputs.recipientCustomerText = '数据接收人'
    const secondBlock = makeBlock()
    secondBlock.id = 'block-2'
    secondBlock.inputs.customerText = '李总'

    expect(createLabReportFilename([firstBlock], '2026-08-02')).toBe('王总-2026.8.2.png')
    expect(createLabReportFilename([firstBlock, secondBlock], '2026-08-02')).toBe('王总、李总-2026.8.2.png')
  })

  it('expands the exported report result grid beyond five sample rows', () => {
    const blocks = Array.from({ length: 6 }, (_, index) => {
      const block = makeBlock()
      block.id = `block-${index + 1}`
      block.index = index + 1
      block.inputs.sequence = String(index + 1).padStart(3, '0')
      return block
    })
    const draft = createReportDraft(
      blocks,
      blocks.map((block) => ({ blockId: block.id, elementKeys: ['aluminum'] })),
      defaultLabReportTemplate,
      '2026-06-25'
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    const layout = createReportCanvasLayout(draft)
    const fiveSampleLayout = createReportCanvasLayout({ ...draft, rows: draft.rows.slice(0, 5) })

    expect(layout.resultRows).toBe(8)
    expect(layout.inspectorTop - layout.resultTop).toBe(layout.resultRowHeight * 8)
    expect(layout.height - fiveSampleLayout.height).toBe(layout.resultRowHeight)
  })

  it('reads only known legacy template fields and drops migration metadata', () => {
    window.localStorage.setItem('yangshao-lab-report-template', JSON.stringify({
      ...defaultLabReportTemplate,
      title: '旧报告',
      updatedAt: '2026-08-13T00:00:00.000Z',
      unexpected: 'drop-me'
    }))
    window.localStorage.setItem('yangshao-lab-report-sms-template', JSON.stringify({
      prefix: '旧前缀',
      suffix: '',
      updatedAt: '2026-08-13T00:00:00.000Z',
      unexpected: 'drop-me'
    }))

    expect(loadLabReportTemplate()).toEqual({ ...defaultLabReportTemplate, title: '旧报告' })
    expect(loadLabReportSmsTemplate()).toEqual({ prefix: '旧前缀', suffix: '' })
  })

  it('creates SMS content with prefix, suffix, sample line, and blank lines between samples', () => {
    const firstBlock = makeBlock()
    firstBlock.inputs.sampleNumber = '粉矿'
    firstBlock.results.aluminum = 59.75
    firstBlock.results.silicon = 13.3
    firstBlock.results.iron = 8.64
    firstBlock.results.aluminumSiliconRatio = 4.49
    const secondBlock = makeBlock()
    secondBlock.id = 'block-2'
    secondBlock.index = 2
    secondBlock.inputs.sampleNumber = '6.25桂AAw802'
    secondBlock.results.aluminum = 51.83
    secondBlock.results.silicon = 3.59
    secondBlock.results.iron = 29.86
    secondBlock.results.aluminumSiliconRatio = 14.43

    const text = createLabReportSmsText(
      [firstBlock, secondBlock],
      [
        { blockId: 'block-1', elementKeys: ['aluminum', 'silicon', 'iron', 'aluminumSiliconRatio'] },
        { blockId: 'block-2', elementKeys: ['aluminum', 'silicon', 'iron', 'aluminumSiliconRatio'] }
      ],
      {
        ...defaultLabReportSmsTemplate,
        prefix: '您好：',
        suffix: '（炉山镇仰韶化验室  电话：130447）'
      }
    )

    expect(text).toBe(
      [
        '您好：',
        '粉矿',
        '铝59.75硅13.3铁8.64铝硅比4.49',
        '',
        '6.25桂AAw802',
        '铝51.83硅3.59铁29.86铝硅比14.43',
        '（炉山镇仰韶化验室  电话：130447）'
      ].join('\n')
    )
  })

  it('returns false instead of hanging when canvas blob export never resolves', async () => {
    vi.useFakeTimers()
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:report'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {})

    class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        window.setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal('Image', MockImage)

    const element = document.createElement('div')
    element.textContent = '化验报告'
    Object.defineProperty(element, 'scrollWidth', { value: 320, configurable: true })
    Object.defineProperty(element, 'scrollHeight', { value: 180, configurable: true })

    const result = downloadLabReportElementAsPng(element, 'report.png')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(5000)

    await expect(result).resolves.toBe(false)
  })
})
