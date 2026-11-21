import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import { monthsBetween } from '../dates'
import {
  analysisMonths,
  averageDailySpending,
  buildAnalytics,
  categoryByMonth,
  compareCategories,
  coveredPeriod,
  daysInPeriod,
  largestExpenses,
} from './analytics'
import { monthPeriod } from './periods'

describe('monthsBetween', () => {
  it('counts both ends, across years', () => {
    expect(monthsBetween('2026-10', '2026-12')).toBe(3)
    expect(monthsBetween('2025-11', '2026-02')).toBe(4)
    expect(monthsBetween('2026-05', '2026-05')).toBe(1)
  })
})

describe('analysisMonths', () => {
  it('takes the last N months of data', () => {
    expect(analysisMonths('2025-01-05', '2026-11-20', 3)).toEqual(['2026-09', '2026-10', '2026-11'])
  })

  it('never starts before the first transaction', () => {
    expect(analysisMonths('2026-10-15', '2026-11-20', 12)).toEqual(['2026-10', '2026-11'])
  })

  it('covers everything for "all"', () => {
    expect(analysisMonths('2026-08-01', '2026-11-20', 'all')).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
  })
})

describe('coveredPeriod and daily averages', () => {
  it('trims to the dates the data actually covers', () => {
    expect(coveredPeriod(['2026-10', '2026-11'], '2026-10-15', '2026-11-20')).toEqual({ start: '2026-10-15', end: '2026-11-20' })
    expect(coveredPeriod(['2026-10'], '2026-01-01', '2026-12-31')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  it('counts days inclusively', () => {
    expect(daysInPeriod({ start: '2026-10-01', end: '2026-10-31' })).toBe(31)
    expect(daysInPeriod({ start: '2026-11-20', end: '2026-11-20' })).toBe(1)
  })

  it('averages per covered day, rounded to whole cents', () => {
    // $100.00 over 3 days = $33.333… -> $33.33
    expect(averageDailySpending(10000, { start: '2026-11-01', end: '2026-11-03' })).toBe(3333)
  })
})

describe('largestExpenses', () => {
  const october = monthPeriod('2026-10')
  it('returns the biggest spending, skipping income, transfers and other periods', () => {
    const data = [
      tx({ id: 'small', amount: -500, category: 'Restaurants' }),
      tx({ id: 'big', amount: -90000, category: 'Shopping' }),
      tx({ id: 'mid', amount: -4000, category: 'Groceries' }),
      tx({ id: 'transfer', amount: -500000, category: 'Transfers' }),
      tx({ id: 'pay', amount: 400000, category: 'Income' }),
      tx({ id: 'refund', amount: 3000, category: 'Shopping' }),
      tx({ id: 'november', date: '2026-11-02', amount: -999999, category: 'Shopping' }),
    ]
    expect(largestExpenses(data, october, 2).map((t) => t.id)).toEqual(['big', 'mid'])
  })
})

describe('categoryByMonth', () => {
  it('nets refunds per month and fills empty months with zero', () => {
    const data = [
      tx({ date: '2026-09-10', amount: -5000, category: 'Shopping' }),
      tx({ date: '2026-10-03', amount: -8000, category: 'Shopping' }),
      tx({ date: '2026-10-09', amount: 2000, category: 'Shopping' }),
      tx({ date: '2026-10-09', amount: -7000, category: 'Groceries' }),
    ]
    expect(categoryByMonth(data, 'Shopping', ['2026-08', '2026-09', '2026-10'])).toEqual([
      { month: '2026-08', amount: 0 },
      { month: '2026-09', amount: 5000 },
      { month: '2026-10', amount: 6000 },
    ])
  })
})

describe('compareCategories', () => {
  it('lines categories up side by side, biggest movers first', () => {
    const data = [
      tx({ date: '2026-09-05', amount: -10000, category: 'Restaurants' }),
      tx({ date: '2026-10-05', amount: -18000, category: 'Restaurants' }),
      tx({ date: '2026-09-07', amount: -20000, category: 'Groceries' }),
      tx({ date: '2026-10-07', amount: -19000, category: 'Groceries' }),
      tx({ date: '2026-10-08', amount: -3000, category: 'Education' }),
    ]
    expect(compareCategories(data, monthPeriod('2026-10'), monthPeriod('2026-09'))).toEqual([
      { category: 'Restaurants', current: 18000, previous: 10000, difference: 8000, percent: 80 },
      { category: 'Education', current: 3000, previous: 0, difference: 3000, percent: null },
      { category: 'Groceries', current: 19000, previous: 20000, difference: -1000, percent: -5 },
    ])
  })
})

describe('buildAnalytics', () => {
  it('returns null without data', () => {
    expect(buildAnalytics([], 6)).toBeNull()
  })

  it('summarises the covered period and computes monthly savings rates', () => {
    const data = [
      tx({ date: '2026-10-01', amount: 400000, category: 'Income' }),
      tx({ date: '2026-10-10', amount: -100000, category: 'Housing' }),
      tx({ date: '2026-11-01', amount: 400000, category: 'Income' }),
      tx({ date: '2026-11-10', amount: -300000, category: 'Housing' }),
      tx({ date: '2026-11-10', amount: -50000, category: 'Transfers' }),
    ]
    const result = buildAnalytics(data, 'all')!
    expect(result.period).toEqual({ start: '2026-10-01', end: '2026-11-10' })
    expect(result.summary).toMatchObject({ income: 800000, expenses: 400000 })
    expect(result.averageDaily).toBe(Math.round(400000 / 41))
    expect(result.monthly.map((m) => m.savingsRate)).toEqual([75, 25])
    expect(result.comparison.isPartial).toBe(true) // November data stops on the 10th
  })
})
