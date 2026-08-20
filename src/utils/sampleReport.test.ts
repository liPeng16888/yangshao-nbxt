import { describe, expect, it } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'
import type { LabReportElementSelection } from '@/types/labReport'
import type { SampleBlock } from '@/types/labSheet'
import {
  createLabReportSmsText,
  createReportDraft,
  defaultLabReportSmsTemplate,
  defaultLabReportTemplate,
  detectReportElementKeys
} from './labReport'
import { hasLabDetectionInput, isReportableSample } from './sampleReport'

describe('isReportableSample', () => {
  it('requires sample identity, numeric sample price, and entered detection data before counting a sample in reports', () => {
    expect(isReportableSample({ sequence: '001', price: 20 })).toBe(false)
    expect(isReportableSample({ sampleNumber: 'A-001', price: null })).toBe(false)
    expect(isReportableSample({ customerText: '客户甲', price: undefined })).toBe(false)
    expect(isReportableSample({ sampleNumber: 'A-001', price: 20 })).toBe(false)
    expect(isReportableSample({ sampleNumber: 'A-001', price: 20, ironRaw: 1 })).toBe(true)
    expect(isReportableSample({ customerText: '客户甲', price: 20, siliconRaw: 0 })).toBe(true)
    expect(isReportableSample({ customerIds: ['c-1'], price: 0, sulfur: 0 })).toBe(true)
  })

  it('detects entered element calculation inputs without counting identity or finance fields', () => {
    expect(hasLabDetectionInput({ sampleNumber: 'A-001', customerText: '客户甲', price: 20, paymentStatus: '未结款' })).toBe(false)
    expect(hasLabDetectionInput({ ironRaw: 0 })).toBe(true)
    expect(hasLabDetectionInput({ calciumRaw: '0.8' } as any)).toBe(true)
  })

  it('keeps active and void retests out of report and SMS samples and element values', () => {
    const block: SampleBlock = {
      id: 'block-1',
      index: 1,
      readonly: false,
      inputs: {
        sequence: '001',
        sampleNumber: 'A-001',
        customerText: '客户甲',
        price: 80,
        paymentStatus: '未结款',
        ironRaw: 1
      },
      results: {
        iron: 29.1,
        silicon: 0,
        aluminum: 0,
        aluminumSiliconRatio: 0,
        total: 29.1,
        density: 0,
        calcium: 0,
        magnesium: 0,
        titanium: 0,
        bottleDensity: 0,
        moisture: 0,
        burnLoss: 0
      },
      parameterSnapshot: defaultLabParameters,
      retests: [
        {
          id: 'retest-1',
          sampleBlockId: 'block-1',
          sequence: 1,
          status: 'ACTIVE',
          everFilled: true,
          readonly: false,
          sensitiveFieldsHidden: false,
          inputs: { ironRaw: 99 },
          results: {
            iron: 9999,
            silicon: null,
            aluminum: null,
            aluminumSiliconRatio: null,
            total: 9999,
            density: null,
            calcium: null,
            magnesium: null,
            titanium: null,
            bottleDensity: null,
            moisture: null,
            burnLoss: null
          },
          parameterSnapshot: defaultLabParameters,
          voidReason: null,
          createdById: 'front-1',
          updatedById: 'front-1',
          voidedById: null,
          createdAt: '2026-08-20T01:00:00.000Z',
          updatedAt: '2026-08-20T01:01:00.000Z',
          voidedAt: null
        },
        {
          id: 'retest-2',
          sampleBlockId: 'block-1',
          sequence: 2,
          status: 'VOID',
          everFilled: true,
          readonly: true,
          sensitiveFieldsHidden: false,
          inputs: { ironRaw: 88 },
          results: {
            iron: 8888,
            silicon: null,
            aluminum: null,
            aluminumSiliconRatio: null,
            total: 8888,
            density: null,
            calcium: null,
            magnesium: null,
            titanium: null,
            bottleDensity: null,
            moisture: null,
            burnLoss: null
          },
          parameterSnapshot: defaultLabParameters,
          voidReason: '复核作废',
          createdById: 'front-1',
          updatedById: 'front-1',
          voidedById: 'front-1',
          createdAt: '2026-08-20T02:00:00.000Z',
          updatedAt: '2026-08-20T02:02:00.000Z',
          voidedAt: '2026-08-20T02:02:00.000Z'
        }
      ]
    }
    const selections = [{ blockId: block.id, elementKeys: ['iron'] }] satisfies LabReportElementSelection[]

    expect(isReportableSample(block.inputs)).toBe(true)
    expect(detectReportElementKeys(block)).toEqual(['iron'])

    const draft = createReportDraft([block], selections, defaultLabReportTemplate, '2026-08-20')
    const sms = createLabReportSmsText([block], selections, defaultLabReportSmsTemplate)

    expect(draft.sampleCount).toBe('1')
    expect(draft.rows).toEqual([{ blockId: 'block-1', sampleName: 'A-001', values: expect.objectContaining({ iron: '29.1' }) }])
    expect(JSON.stringify(draft)).not.toMatch(/9999|8888/)
    expect(sms).toBe('A-001\n铁29.1')
    expect(sms).not.toMatch(/9999|8888/)
  })
})
