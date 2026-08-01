import { describe, expect, it } from 'vitest'
import { businessDateInBeijing } from './date'

describe('businessDateInBeijing', () => {
  it('uses the previous date before 04:00 Beijing time', () => {
    expect(businessDateInBeijing(new Date('2026-07-30T19:59:59.000Z'))).toBe('2026-07-30')
  })

  it('uses the calendar date from 04:00 Beijing time', () => {
    expect(businessDateInBeijing(new Date('2026-07-30T20:00:00.000Z'))).toBe('2026-07-31')
  })
})
