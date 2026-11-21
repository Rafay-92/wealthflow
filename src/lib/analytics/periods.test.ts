import { describe, expect, it } from 'vitest'
import { comparisonPeriods, isInPeriod, monthPeriod } from './periods'

describe('monthPeriod', () => {
  it('covers the whole month by default', () => {
    expect(monthPeriod('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('isInPeriod', () => {
  const october = monthPeriod('2026-10')
  it('includes both ends', () => {
    expect(isInPeriod('2026-10-01', october)).toBe(true)
    expect(isInPeriod('2026-10-31', october)).toBe(true)
  })
  it('excludes dates outside', () => {
    expect(isInPeriod('2026-09-30', october)).toBe(false)
    expect(isInPeriod('2026-11-01', october)).toBe(false)
  })
})

describe('comparisonPeriods', () => {
  it('compares full months when the data covers the whole month', () => {
    const result = comparisonPeriods('2026-10', '2026-11-20')
    expect(result.isPartial).toBe(false)
    expect(result.current).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(result.previous).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('compares the same days of the previous month when the month is partial', () => {
    const result = comparisonPeriods('2026-11', '2026-11-20')
    expect(result.isPartial).toBe(true)
    expect(result.current).toEqual({ start: '2026-11-01', end: '2026-11-20' })
    expect(result.previous).toEqual({ start: '2026-10-01', end: '2026-10-20' })
  })

  it('caps the previous period at the end of a shorter month', () => {
    // Data up to Mar 30 -> compare Feb 1–28, not the impossible Feb 30.
    const result = comparisonPeriods('2026-03', '2026-03-30')
    expect(result.previous).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('treats a month whose data ends on its last day as complete', () => {
    expect(comparisonPeriods('2026-11', '2026-11-30').isPartial).toBe(false)
  })

  it('treats the month as complete when there is no data', () => {
    expect(comparisonPeriods('2026-11', null).isPartial).toBe(false)
  })
})
