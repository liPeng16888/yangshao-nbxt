import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  businessDateInBeijing,
  formatDateTime,
  millisecondsUntilNextBusinessDayInBeijing,
  todayInBeijing
} from './date'

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

describe('Beijing date utilities', () => {
  const originalTimeZone = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTimeZone
  })

  it('uses the Beijing calendar date regardless of the device time zone', () => {
    vi.setSystemTime(new Date('2026-08-02T16:30:00.000Z'))

    expect(todayInBeijing()).toBe('2026-08-03')
  })

  it('formats timestamps in Beijing time regardless of the device time zone', () => {
    expect(formatDateTime('2026-08-02T16:30:00.000Z')).toBe('2026-08-03 00:30')
  })
})
