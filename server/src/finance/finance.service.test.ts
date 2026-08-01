import { describe, expect, it } from 'vitest'
import { FinanceService } from './finance.service'

function getElementCounts(elementNote: string) {
  const service = new FinanceService({} as never, {} as never, {} as never)
  return (service as unknown as {
    getMonthlyElementCounts(inputs: Record<string, unknown>): Array<{ key: string; label: string; count: number }>
  }).getMonthlyElementCounts({ elementNote })
}

describe('FinanceService monthly element counts', () => {
  it('collapses aluminum, silicon and their ratio into the ratio item', () => {
    expect(getElementCounts('铝、硅、铝硅比、硫')).toEqual([
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 },
      { key: 'sulfur', label: '硫', count: 1 }
    ])
  })

  it('keeps aluminum or silicon when they are selected separately', () => {
    expect(getElementCounts('铝')).toEqual([{ key: 'aluminum', label: '铝', count: 1 }])
    expect(getElementCounts('硅')).toEqual([{ key: 'silicon', label: '硅', count: 1 }])
  })

  it('counts a standalone aluminum-silicon ratio selection as the combined ratio item', () => {
    expect(getElementCounts('铝硅比')).toEqual([
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 }
    ])
  })
})
