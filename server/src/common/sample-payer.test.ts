import { describe, expect, it } from 'vitest'
import { samplePayerName } from './sample-payer'

describe('samplePayerName', () => {
  it('uses stored text before snapshots and has a stable empty fallback', () => {
    expect(samplePayerName({ customerText: ' 李总 ', customers: [{ name: '王总' }] })).toBe('李总')
    expect(samplePayerName({ customers: [{ name: '王总' }, { name: '赵总' }] })).toBe('王总、赵总')
    expect(samplePayerName({})).toBe('无信息')
  })
})
