import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import { buildAnalytics, categoryByBucket } from './analytics'
import { bucketKey, bucketPeriod, bucketsBetween, compareWithPrevious, formatBucket, previousBucket } from './granularity'

describe('periods by month, quarter and year', () => {
  it('works out the key and the exact dates', () => {
    expect(bucketKey('2026-11-20', 'quarter')).toBe('2026-Q4')
    expect(bucketKey('2026-03-31', 'quarter')).toBe('2026-Q1')
    expect(bucketKey('2026-11-20', 'year')).toBe('2026')
    expect(bucketPeriod('2026-Q1', 'quarter')).toEqual({ start: '2026-01-01', end: '2026-03-31' })
    expect(bucketPeriod('2024-02', 'month')).toEqual({ start: '2024-02-01', end: '2024-02-29' }) // leap year
    expect(bucketPeriod('2026', 'year')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('steps back across a year boundary', () => {
    expect(previousBucket('2026-Q1', 'quarter')).toBe('2025-Q4')
    expect(previousBucket('2026-01', 'month')).toBe('2025-12')
    expect(bucketsBetween('2025-Q3', '2026-Q1', 'quarter')).toEqual(['2025-Q3', '2025-Q4', '2026-Q1'])
    expect(formatBucket('2026-Q4', 'quarter')).toBe('Q4 2026')
  })

  it('compares an unfinished quarter with the same number of days of the previous one', () => {
    // Q4 data runs to Nov 20: that's 51 days in, so Q3 is cut to Jul 1 – Aug 20.
    expect(compareWithPrevious('2026-Q4', 'quarter', '2026-11-20')).toEqual({
      month: '2026-Q4',
      current: { start: '2026-10-01', end: '2026-11-20' },
      previous: { start: '2026-07-01', end: '2026-08-20' },
      isPartial: true,
    })
    expect(compareWithPrevious('2026-Q3', 'quarter', '2026-11-20').isPartial).toBe(false)
  })
})

describe('buildAnalytics by quarter and year', () => {
  const data = [
    tx({ date: '2025-12-15', amount: 300000, category: 'Income' }),
    tx({ date: '2025-12-20', amount: -100000, category: 'Housing' }),
    tx({ date: '2026-02-15', amount: 300000, category: 'Income' }),
    tx({ date: '2026-02-20', amount: -50000, category: 'Groceries' }),
    tx({ date: '2026-02-21', amount: 5000, category: 'Groceries' }), // refund
    tx({ date: '2026-02-22', amount: -70000, category: 'Transfers' }), // ignored
  ]

  it('groups totals by quarter, transfers excluded and refunds netted', () => {
    const a = buildAnalytics(data, 'all', 'quarter')!
    expect(a.monthly.map((m) => [m.month, m.income, m.expenses, m.net])).toEqual([
      ['2025-Q4', 300000, 100000, 200000],
      ['2026-Q1', 300000, 45000, 255000],
    ])
    expect(a.summary).toMatchObject({ income: 600000, expenses: 145000 })
  })

  it('groups totals by year, and totals match the monthly view', () => {
    const yearly = buildAnalytics(data, 'all', 'year')!
    const monthly = buildAnalytics(data, 'all', 'month')!
    expect(yearly.monthly.map((m) => m.month)).toEqual(['2025', '2026'])
    expect(yearly.summary).toEqual(monthly.summary)
    expect(yearly.monthly.reduce((s, m) => s + m.expenses, 0)).toBe(monthly.monthly.reduce((s, m) => s + m.expenses, 0))
  })

  it('a category’s trend by quarter', () => {
    const a = buildAnalytics(data, 'all', 'quarter')!
    expect(categoryByBucket(data, 'Groceries', a.buckets)).toEqual([
      { month: '2025-Q4', amount: 0 },
      { month: '2026-Q1', amount: 45000 },
    ])
  })
})
