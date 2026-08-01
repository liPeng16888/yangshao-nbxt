import { describe, expect, it } from 'vitest'
import { businessDateInBeijing, millisecondsUntilNextBusinessDayInBeijing } from './date'

describe('Beijing lab business day', () => {
  it('keeps the previous date active before 04:00 Beijing time', () => {
    expect(businessDateInBeijing(new Date('2026-07-30T19:59:59.000Z'))).toBe('2026-07-30')
  })

  it('switches to the calendar date at 04:00 Beijing time', () => {
    expect(businessDateInBeijing(new Date('2026-07-30T20:00:00.000Z'))).toBe('2026-07-31')
  })

  it('calculates the next 04:00 Beijing boundary', () => {
    expect(millisecondsUntilNextBusinessDayInBeijing(new Date('2026-07-30T19:59:59.000Z'))).toBe(1_000)
    expect(millisecondsUntilNextBusinessDayInBeijing(new Date('2026-07-30T20:00:00.000Z'))).toBe(86_400_000)
  })
})
