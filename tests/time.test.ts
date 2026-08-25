import { describe, expect, it } from 'vitest'
import { isWeeklyDigestDue, localDateKey, nextMondayNoon, previousFullWeek, startOfLocalWeek } from '../electron/time'

describe('local weekly scheduling', () => {
  it('uses Monday as the start of a local week across month and year boundaries', () => {
    const range = previousFullWeek(new Date(2026, 0, 1, 10))
    expect(localDateKey(range.start)).toBe('2025-12-22')
    expect(localDateKey(range.end)).toBe('2025-12-29')
  })

  it('does not replace an existing digest before Monday noon', () => {
    const mondayMorning = new Date(2026, 7, 24, 11, 59)
    expect(isWeeklyDigestDue(mondayMorning, new Date(2026, 7, 10).toISOString())).toBe(false)
    expect(isWeeklyDigestDue(mondayMorning, null)).toBe(true)
  })

  it('becomes due at Monday noon and only once for the current target week', () => {
    const mondayNoon = new Date(2026, 7, 24, 12, 0)
    expect(isWeeklyDigestDue(mondayNoon, new Date(2026, 7, 10).toISOString())).toBe(true)
    expect(isWeeklyDigestDue(mondayNoon, new Date(2026, 7, 17).toISOString())).toBe(false)
  })

  it('calculates the next Monday noon without relying on a fixed UTC offset', () => {
    const sunday = new Date(2026, 7, 23, 20, 0)
    const next = nextMondayNoon(sunday)
    expect(next.getDay()).toBe(1)
    expect(next.getHours()).toBe(12)
    expect(startOfLocalWeek(next).getDay()).toBe(1)
  })
})
