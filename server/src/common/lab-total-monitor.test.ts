import { describe, expect, it } from 'vitest'
import { appendLabTotalRules, assessLabTotal, validateLabTotalBulkRequest, validateLabTotalRules, type LabTotalMonitorRule, type TotalMonitorSample } from './lab-total-monitor'

const rule: LabTotalMonitorRule = { id: 'r1', name: '低铁', ironMin: 5, ironMax: 10, totalMin: 80.5, totalMax: 82.5, enabled: true }
const sample = (iron = 7, total = 81): TotalMonitorSample => ({ inputs: { ironRaw: 0.3, siliconRaw: 1.2, aluminumRaw: 10 }, results: { iron, silicon: 14, aluminum: 60, total } })

describe('iron-dependent total monitoring', () => {
  it.each([5, 10])('includes iron boundary %s', (iron) => { expect(assessLabTotal(sample(iron), [rule]).status).toBe('normal') })
  it.each([80.5, 82.5])('includes total boundary %s', (total) => { expect(assessLabTotal(sample(7, total), [rule]).status).toBe('normal') })
  it.each([80.4999, 82.5001])('flags an out-of-range total %s', (total) => { expect(assessLabTotal(sample(7, total), [rule])).toMatchObject({ status: 'outside-range', abnormal: true }) })
  it.each(['ironRaw', 'siliconRaw', 'aluminumRaw'] as const)('waits until %s is filled', (key) => {
    for (const value of [null, undefined, '', NaN]) {
      const block = sample(7, 100); block.inputs[key] = value
      expect(assessLabTotal(block, [rule])).toEqual({ status: 'incomplete', abnormal: false })
    }
  })
  it('treats zero as a filled raw input and uses calculated iron, not the raw reading', () => {
    const block = sample(7, 100); block.inputs.ironRaw = 0
    expect(assessLabTotal(block, [rule])).toMatchObject({ status: 'outside-range', iron: 7 })
  })
  it('does not flag hidden sample data or incomplete/invalid computed results', () => {
    expect(assessLabTotal({ ...sample(7, 100), sensitiveFieldsHidden: true }, [rule]).abnormal).toBe(false)
    for (const key of ['iron', 'silicon', 'aluminum', 'total'] as const) {
      const block = sample(7, 100); block.results[key] = Infinity
      expect(assessLabTotal(block, [rule]).status).toBe('incomplete')
    }
  })
  it('matches multiple enabled indicators and flags unmatched iron', () => {
    const next = { ...rule, id: 'r2', name: '高铁', ironMin: 10.0001, ironMax: 20, totalMin: 85, totalMax: 90 }
    expect(assessLabTotal(sample(15, 87), [rule, next])).toMatchObject({ status: 'normal', rule: next })
    expect(assessLabTotal(sample(15, 81), [rule, next]).status).toBe('outside-range')
    expect(assessLabTotal(sample(21), [rule, next])).toMatchObject({ status: 'unmatched', abnormal: true })
  })
  it('disables monitoring when nothing is configured or all rules are disabled', () => {
    expect(assessLabTotal(sample(), []).status).toBe('disabled')
    expect(assessLabTotal(sample(99), [{ ...rule, enabled: false }]).status).toBe('disabled')
  })
})

describe('total monitoring validation', () => {
  it('accepts empty configuration and multiple independent ranges', () => {
    expect(validateLabTotalRules([])).toEqual([])
    expect(validateLabTotalRules([rule, { ...rule, id: 'r2', ironMin: 11, ironMax: 20 }])).toHaveLength(2)
  })
  it.each([{ ironMin: 11 }, { totalMin: 83 }, { ironMax: null }, { totalMax: NaN }, { name: '' }, { id: '' }, { enabled: 'true' }])('rejects invalid range data %j', (patch) => {
    expect(() => validateLabTotalRules([{ ...rule, ...patch }])).toThrow()
  })
  it('rejects duplicate identities and overlapping inclusive iron ranges', () => {
    expect(() => validateLabTotalRules([rule, rule])).toThrow('唯一')
    expect(() => validateLabTotalRules([rule, { ...rule, id: 'r2', ironMin: 10, ironMax: 15 }])).toThrow('重叠')
    expect(validateLabTotalRules([rule, { ...rule, id: 'r2', enabled: false }])).toHaveLength(2)
  })
})

describe('bulk rule append', () => {
  it('preserves existing rules and allocates new target-local identities', () => {
    const existing = [{ ...rule, id: 'existing', ironMin: 20, ironMax: 30 }]
    const merged = appendLabTotalRules(existing, [rule], () => 'new-id')
    expect(merged).toMatchObject({ addedCount: 1, duplicateCount: 0 })
    expect(merged.rules[0]).toEqual(existing[0]); expect(merged.rules[1]).toEqual({ ...rule, id: 'new-id' })
    expect(existing).toHaveLength(1)
  })
  it('deduplicates identical criteria independently of names and IDs', () => {
    const existing = [{ ...rule, id: 'local-id', name: '本地名称' }]
    const merged = appendLabTotalRules(existing, [rule], () => 'unused')
    expect(merged).toEqual({ rules: existing, addedCount: 0, duplicateCount: 1 })
  })
  it('rejects an entire target merge when any new enabled iron interval overlaps', () => {
    const existing = [{ ...rule, id: 'target', ironMin: 7, ironMax: 12 }]
    expect(() => appendLabTotalRules(existing, [rule], () => 'new')).toThrow('重叠')
    expect(existing).toHaveLength(1)
  })
  it('preserves disabled state and rejects exceeding the target rule limit', () => {
    expect(appendLabTotalRules([], [{ ...rule, enabled: false }], () => 'new').rules[0].enabled).toBe(false)
    const existing = Array.from({ length: 100 }, (_, index) => ({ ...rule, id: `r-${index}`, ironMin: 20 + index * 2, ironMax: 21 + index * 2 }))
    expect(() => appendLabTotalRules(existing, [rule], () => 'new')).toThrow('最多')
  })
  it('validates and deduplicates target accounts while excluding the source', () => {
    const value = { sourceFrontendUserId: 'source', sourceVersion: 1, ruleIds: ['r1', 'r1'], frontendUserIds: ['t1', 't1', 't2'] }
    expect(validateLabTotalBulkRequest(value)).toMatchObject({ ruleIds: ['r1'], frontendUserIds: ['t1', 't2'] })
    expect(() => validateLabTotalBulkRequest({ ...value, frontendUserIds: ['source'] })).toThrow('来源')
    expect(() => validateLabTotalBulkRequest({ ...value, sourceVersion: 0 })).toThrow('先保存')
    expect(() => validateLabTotalBulkRequest({ ...value, ruleIds: [] })).toThrow('规则')
    expect(() => validateLabTotalBulkRequest({ ...value, frontendUserIds: [] })).toThrow('目标')
  })
})
