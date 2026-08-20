import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import { businessDateInBeijing } from './date'
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
    const businessDate = businessDateInBeijing()
    const futureDate = new Date(`${businessDate}T00:00:00.000Z`)
    futureDate.setUTCDate(futureDate.getUTCDate() + 1)
    expect(isHistoricalSampleChangeEligible(makeBlock({ sampleNumber: '历史样品' }), '2000-01-01')).toBe(true)
    expect(isHistoricalSampleChangeEligible(makeBlock({}, { sensitiveFieldsHidden: true }), '2000-01-01')).toBe(false)
    expect(isHistoricalSampleChangeEligible(makeBlock({ sampleNumber: '' }, { sensitiveFieldsHidden: false }), '2000-01-01')).toBe(false)
    expect(isHistoricalSampleChangeEligible(makeBlock({ sampleNumber: '未来样品' }), futureDate.toISOString().slice(0, 10))).toBe(false)
  })

  it('normalizes strings and payer identities so blank-only edits are no-ops', () => {
    const block = makeBlock({ sampleNumber: '', elementNote: '', paymentStatus: '', customerIds: [], customerText: '' })
    const blankDraft = createSampleChangeDraft(block)
    blankDraft.sampleNumber = '  '
    blankDraft.elementNote = '  '
    blankDraft.paymentStatus = '  ' as never
    blankDraft.customerIds = [' ', '']
    blankDraft.customerText = '  '
    expect(buildSampleChangePatch(block, blankDraft)).toEqual({})

    const draft = createSampleChangeDraft(block)
    draft.sampleNumber = '  新样品  '
    draft.elementNote = '  元素备注  '
    draft.paymentStatus = ' 月结款 ' as never
    draft.customerIds = [' c-1 ', '', 'c-1', 'c-2 ']
    draft.customerText = '  伪造名称  '
    expect(buildSampleChangePatch(block, draft)).toEqual({
      sampleNumber: '新样品', elementNote: '元素备注', paymentStatus: '月结款',
      payerCustomer: { customerIds: ['c-1', 'c-2'], customerText: '伪造名称' }
    })
  })

  it('rejects non-finite numeric drafts instead of creating an invalid payload', () => {
    const draft = createSampleChangeDraft(makeBlock({ ironRaw: 1 }))
    draft.ironRaw = Number.POSITIVE_INFINITY
    expect(() => buildSampleChangePatch(makeBlock({ ironRaw: 1 }), draft)).toThrow('必须是有限数字或空值')
  })
})
