import { describe, expect, it } from 'vitest'
import { buildFinanceReportRange } from './financeReportRange'

describe('buildFinanceReportRange', () => {
  it.each([
    ['daily', '2026-08-03', '', '', { startDate: '2026-08-03', endDate: '2026-08-03' }],
    ['weekly', '2026-08-03', '', '', { startDate: '2026-08-02', endDate: '2026-08-08' }],
    ['monthly', '2026-08-03', '', '', { startDate: '2026-08-01', endDate: '2026-08-31' }],
    ['custom', '2026-08-03', '2026-07-10', '2026-07-20', { startDate: '2026-07-10', endDate: '2026-07-20' }]
  ] as const)('uses the frontend report range for %s mode', (mode, date, startDate, endDate, expected) => {
    expect(buildFinanceReportRange(mode, date, startDate, endDate)).toEqual(expected)
  })

  it('falls back to the selected date when a custom endpoint is empty', () => {
    expect(buildFinanceReportRange('custom', '2026-08-03', '', '')).toEqual({
      startDate: '2026-08-03',
      endDate: '2026-08-03'
    })
  })
})
