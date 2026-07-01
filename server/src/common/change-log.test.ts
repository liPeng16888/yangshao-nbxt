import { describe, expect, it } from 'vitest'
import { collapseConsecutiveFieldChanges } from './change-log'

describe('collapseConsecutiveFieldChanges', () => {
  it('keeps one record for continuous edits in the same field', () => {
    const rows = collapseConsecutiveFieldChanges([
      { field: 'ironRaw', oldValue: null, newValue: 1, changedAt: '2026-07-01 10:00:00' },
      { field: 'ironRaw', oldValue: 1, newValue: 12, changedAt: '2026-07-01 10:00:01' },
      { field: 'siliconRaw', oldValue: null, newValue: 2, changedAt: '2026-07-01 10:00:02' },
      { field: 'ironRaw', oldValue: 12, newValue: 13, changedAt: '2026-07-01 10:00:03' }
    ])

    expect(rows).toEqual([
      { field: 'ironRaw', oldValue: null, newValue: 12, changedAt: '2026-07-01 10:00:01' },
      { field: 'siliconRaw', oldValue: null, newValue: 2, changedAt: '2026-07-01 10:00:02' },
      { field: 'ironRaw', oldValue: 12, newValue: 13, changedAt: '2026-07-01 10:00:03' }
    ])
  })

  it('keeps separated edits when they are outside the merge window', () => {
    const rows = collapseConsecutiveFieldChanges(
      [
        { field: 'ironRaw', oldValue: null, newValue: 1, changedAt: '2026-07-01T10:00:00.000Z' },
        { field: 'ironRaw', oldValue: 1, newValue: 2, changedAt: '2026-07-01T10:00:05.000Z' }
      ],
      { windowMs: 2000 }
    )

    expect(rows).toHaveLength(2)
  })
})
