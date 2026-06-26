import { describe, expect, it } from 'vitest'
import { isReportableSample } from './sampleReport'

describe('isReportableSample', () => {
  it('requires sample identity and numeric sample price before counting a sample in reports', () => {
    expect(isReportableSample({ sequence: '001', price: 20 })).toBe(false)
    expect(isReportableSample({ sampleNumber: 'A-001', price: null })).toBe(false)
    expect(isReportableSample({ customerText: '客户甲', price: undefined })).toBe(false)
    expect(isReportableSample({ sampleNumber: 'A-001', price: 20 })).toBe(true)
    expect(isReportableSample({ customerText: '客户甲', price: 20 })).toBe(true)
    expect(isReportableSample({ customerIds: ['c-1'], price: 0 })).toBe(true)
  })
})
