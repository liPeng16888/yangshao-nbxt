import { describe, expect, it } from 'vitest'
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
})
