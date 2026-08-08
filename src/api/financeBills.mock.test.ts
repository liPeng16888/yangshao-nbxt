import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { UnsettledSampleRow } from '@/types/financeBills'
import type { LabSheet, SampleBlock } from '@/types/labSheet'

const labSheetMocks = vi.hoisted(() => ({
  getLabSheetByDate: vi.fn(),
  getLabSheetHistory: vi.fn(),
  saveSampleBlock: vi.fn()
}))

vi.mock('@/utils/request', () => ({
  default: { put: vi.fn() },
  useMocks: true
}))
vi.mock('./labSheet', () => labSheetMocks)

import { markSamplesAsPaid } from './financeBills'

function makeBlock(id: string, paymentStatus: SampleBlock['inputs']['paymentStatus']): SampleBlock {
  return {
    id,
    index: id === 'block-1' ? 1 : 2,
    readonly: false,
    inputs: {
      sequence: id === 'block-1' ? '001' : '002',
      sampleNumber: id,
      customerText: '客户甲',
      price: 100,
      paymentStatus
    },
    results: {
      iron: 0,
      silicon: 0,
      aluminum: 0,
      aluminumSiliconRatio: 0,
      total: 0,
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

function makeRow(blockId: string): UnsettledSampleRow {
  return {
    date: '2026-08-08',
    sheetId: 'sheet-1',
    blockId,
    sequence: blockId === 'block-1' ? '001' : '002',
    sampleNumber: blockId,
    customer: '客户甲',
    amount: 100
  }
}

describe('finance bills batch payment mock API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates all targets before saving every selected sample', async () => {
    const sheet: LabSheet = {
      id: 'sheet-1',
      date: '2026-08-08',
      readonly: false,
      parameters: defaultLabParameters,
      sampleBlocks: [makeBlock('block-1', '未结款'), makeBlock('block-2', '未结款')]
    }
    labSheetMocks.getLabSheetByDate.mockResolvedValue(sheet)
    labSheetMocks.saveSampleBlock.mockImplementation(async (_sheetId: string, payload: { id: string }) => {
      const block = sheet.sampleBlocks.find((item) => item.id === payload.id)!
      return { ...block, inputs: { ...block.inputs, paymentStatus: '已结款' } }
    })

    const result = await markSamplesAsPaid([makeRow('block-1'), makeRow('block-2')])

    expect(labSheetMocks.saveSampleBlock).toHaveBeenCalledTimes(2)
    expect(result.map((block) => block.inputs.paymentStatus)).toEqual(['已结款', '已结款'])
  })

  it('does not save anything when any selected sample is no longer unsettled', async () => {
    const sheet: LabSheet = {
      id: 'sheet-1',
      date: '2026-08-08',
      readonly: false,
      parameters: defaultLabParameters,
      sampleBlocks: [makeBlock('block-1', '未结款'), makeBlock('block-2', '已结款')]
    }
    labSheetMocks.getLabSheetByDate.mockResolvedValue(sheet)

    await expect(markSamplesAsPaid([makeRow('block-1'), makeRow('block-2')])).rejects.toThrow('部分样品已不是未结款状态')

    expect(labSheetMocks.saveSampleBlock).not.toHaveBeenCalled()
  })
})
