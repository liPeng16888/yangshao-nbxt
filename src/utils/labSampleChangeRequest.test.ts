import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabSampleInput, SampleBlock } from '@/types/labSheet'
import {
  buildSampleChangePatch,
  createSampleChangeDraft,
  isHistoricalSampleChangeEligible,
  sampleChangeDiffRows
} from './labSampleChangeRequest'

function makeBlock(inputs: Partial<LabSampleInput> = {}, overrides: Partial<SampleBlock> = {}): SampleBlock {
  return {
    id: 'block-1', index: 1, readonly: true, updatedAt: '2026-08-19T01:00:00.000Z',
    inputs: { sequence: '001', completed: true, sampleNumber: '原样品', customerIds: [], customerText: '', price: null, paymentStatus: '', ...inputs },
    results: { iron: 1, silicon: 2, aluminum: 3, aluminumSiliconRatio: 4, total: 5, density: 6, calcium: 7, magnesium: 8, titanium: 9, bottleDensity: 10, moisture: 11, burnLoss: 12 },
    parameterSnapshot: { ...defaultLabParameters },
    ...overrides
  }
}

describe('lab sample change request draft utilities', () => {
  it('builds only allowed changed fields and treats payer customer as one change', () => {
    const block = makeBlock({ sampleNumber: '旧样品', customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1 })
    const draft = createSampleChangeDraft(block)
    draft.sampleNumber = '新样品'
    draft.customerIds = ['c-1']
    draft.customerText = '王总'
    draft.ironRaw = 2

    expect(buildSampleChangePatch(block, draft)).toEqual({
      sampleNumber: '新样品', payerCustomer: { customerIds: ['c-1'], customerText: '王总' }, ironRaw: 2
    })
  })

  it('copies the source immutably and excludes results and forbidden input fields from its patch', () => {
    const block = makeBlock({ recipientCustomerText: '收件客户', note: '原备注', elementNote: '元素备注', ironRaw: 1 })
    const draft = createSampleChangeDraft(block)
    draft.customerIds = [...(draft.customerIds || []), 'c-1']
    draft.recipientCustomerText = '不应提交'
    draft.note = '不应提交'
    draft.sequence = '999'
    draft.completed = false
    draft.elementNote = '新元素备注'

    expect(block.inputs.customerIds).toEqual([])
    expect(buildSampleChangePatch(block, draft)).toEqual({
      payerCustomer: { customerIds: ['c-1'], customerText: '' }, elementNote: '新元素备注'
    })
    expect(sampleChangeDiffRows(block, draft)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'payerCustomer', oldValue: { customerIds: [], customerText: '' }, newValue: { customerIds: ['c-1'], customerText: '' } }),
      expect.objectContaining({ field: 'elementNote', oldValue: '元素备注', newValue: '新元素备注' })
    ]))
  })

  it('requires a historical visible sample and never exposes sensitive-hidden data', () => {
    expect(isHistoricalSampleChangeEligible(makeBlock({ sampleNumber: '历史样品' }))).toBe(true)
    expect(isHistoricalSampleChangeEligible(makeBlock({}, { sensitiveFieldsHidden: true }))).toBe(false)
    expect(isHistoricalSampleChangeEligible(makeBlock({ sampleNumber: '' }, { sensitiveFieldsHidden: false }))).toBe(false)
    expect(isHistoricalSampleChangeEligible(makeBlock({ sampleNumber: '今日样品' }, { readonly: false }))).toBe(false)
  })
})
