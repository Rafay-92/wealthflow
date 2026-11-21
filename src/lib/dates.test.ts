import { describe, expect, it } from 'vitest'
import {
  addMonths,
  daysInMonth,
  formatDay,
  formatMonth,
  isISODate,
  monthsEndingAt,
  todayISO,
  toMonthKey,
} from './dates'

describe('isISODate', () => {
  it('accepts real dates', () => {
    expect(isISODate('2026-11-03')).toBe(true)
    expect(isISODate('2024-02-29')).toBe(true) // leap year
  })

  it('rejects impossible or malformed dates', () => {
    expect(isISODate('2026-02-29')).toBe(false) // not a leap year
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('11/03/2026')).toBe(false)
    expect(isISODate('2026-1-3')).toBe(false)
  })
})

describe('month arithmetic', () => {
  it('extracts the month key', () => {
    expect(toMonthKey('2026-11-03')).toBe('2026-11')
  })

  it('crosses year boundaries', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2025-12', 1)).toBe('2026-01')
    expect(addMonths('2026-06', -18)).toBe('2024-12')
  })

  it('knows month lengths, including February in leap years', () => {
    expect(daysInMonth('2026-11')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2024-02')).toBe(29)
  })

  it('lists months ending at a given month, oldest first', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('todayISO', () => {
  it('uses the local calendar date', () => {
    // 11pm local time on Nov 21: in UTC (for timezones west of UTC) it's already Nov 22.
    expect(todayISO(new Date(2026, 10, 21, 23, 30))).toBe('2026-11-21')
    expect(todayISO(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05')
  })
})

describe('formatting', () => {
  it('formats months and days without timezone drift', () => {
    expect(formatMonth('2026-11')).toBe('November 2026')
    expect(formatMonth('2026-11', 'short')).toBe('Nov')
    // The 1st of a month must never display as the last day of the previous one.
    expect(formatDay('2026-11-01')).toBe('Nov 1')
  })
})
