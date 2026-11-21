import { describe, expect, it } from 'vitest'
import { SAMPLE_DATA_END, SAMPLE_TRANSACTIONS } from '../../data/sampleData'
import { tx } from '../../test/factories'
import type { Category } from '../../types/transaction'
import { addDays } from '../dates'
import { findSubscriptions, groupSubscriptions } from './subscriptions'

/** Charges on the given dates, all at `amount` unless a list of amounts is given. */
const charges = (description: string, dates: string[], amount: number | number[], category: Category = 'Subscriptions') =>
  dates.map((date, i) => tx({ date, description, category, amount: -(Array.isArray(amount) ? amount[i]! : amount) }))

const MONTHLY = ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-11-28', 5)).toBe('2026-12-03')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('findSubscriptions', () => {
  it('finds a steady monthly charge and estimates its cost', () => {
    const [netflix] = findSubscriptions(charges('NETFLIX.COM', MONTHLY, 1549), '2026-11-20')
    expect(netflix).toMatchObject({
      key: 'NETFLIX',
      monthlyCost: 1549,
      annualCost: 18588,
      firstDate: '2026-07-05',
      lastDate: '2026-11-05',
      charges: 5,
      previousAmount: null,
      active: true,
      likely: true,
    })
    expect(netflix!.nextExpected).toBe('2026-12-05')
  })

  it('predicts the next charge on the same day of the month, clamped for short months', () => {
    const [s] = findSubscriptions(charges('APP', ['2026-10-31', '2026-11-30', '2026-12-31'], 500), '2027-01-05')
    expect(s!.nextExpected).toBe('2027-01-31')
    const [feb] = findSubscriptions(charges('APP', ['2026-11-30', '2026-12-31', '2027-01-31'], 500), '2027-02-05')
    expect(feb!.nextExpected).toBe('2027-02-28')
  })

  it('needs at least three charges', () => {
    expect(findSubscriptions(charges('NEW', MONTHLY.slice(0, 2), 999), '2026-11-20')).toEqual([])
  })

  it('ignores merchants charged more often than monthly', () => {
    const weekly = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']
    expect(findSubscriptions(charges('STARBUCKS', weekly, 550, 'Restaurants'), '2026-11-20')).toEqual([])
  })

  it('tolerates one skipped month but not more', () => {
    const oneSkip = ['2026-06-05', '2026-07-05', '2026-09-05', '2026-10-05']
    const twoSkips = ['2026-04-05', '2026-06-05', '2026-08-05', '2026-09-05']
    expect(findSubscriptions(charges('GYM', oneSkip, 2499), '2026-10-20')).toHaveLength(1)
    expect(findSubscriptions(charges('GYM', twoSkips, 2499), '2026-09-20')).toEqual([])
  })

  it('spots a price change', () => {
    const [s] = findSubscriptions(charges('SPOTIFY', MONTHLY, [1099, 1099, 1099, 1199, 1199]), '2026-11-20')
    expect(s).toMatchObject({ previousAmount: null, lastAmount: 1199, monthlyCost: 1199 })
    const [changedNow] = findSubscriptions(charges('SPOTIFY', MONTHLY, [1099, 1099, 1099, 1099, 1199]), '2026-11-20')
    // Costs going forward are the new price, not an average of old ones.
    expect(changedNow).toMatchObject({ previousAmount: 1099, lastAmount: 1199, monthlyCost: 1199, annualCost: 14388 })
  })

  it('uses a typical recent amount for bills that vary every month', () => {
    const [power] = findSubscriptions(charges('CITY POWER', MONTHLY, [9000, 11000, 10500, 9600, 12000], 'Utilities'), '2026-11-20')
    expect(power!.monthlyCost).toBe(10500) // median of the last three: 10500, 9600, 12000
    expect(power!.previousAmount).toBeNull() // varying bills don't get a "price went up" flag
  })

  it('marks a subscription with no recent charge as inactive', () => {
    const [s] = findSubscriptions(charges('OLD APP', ['2026-05-05', '2026-06-05', '2026-07-05'], 499), '2026-11-20')
    expect(s!.active).toBe(false)
  })

  it('finds the sample subscriptions and bills, but not groceries', () => {
    const names = findSubscriptions(SAMPLE_TRANSACTIONS, SAMPLE_DATA_END).map((s) => s.name)
    expect(names).toEqual(expect.arrayContaining(['NETFLIX.COM', 'SPOTIFY USA', 'PLANET FITNESS', 'APPLE.COM/BILL ICLOUD', 'MAPLE COURT APARTMENTS RENT']))
    expect(names).not.toContain('WHOLE FOODS MARKET')
  })
})

describe('groupSubscriptions', () => {
  const found = [
    ...findSubscriptions(charges('NETFLIX.COM', MONTHLY, 1549), '2026-11-20'),
    ...findSubscriptions(charges('RENT', MONTHLY, 165000, 'Housing'), '2026-11-20'),
    ...findSubscriptions(charges('OLD APP', ['2026-05-05', '2026-06-05', '2026-07-05'], 499), '2026-11-20'),
  ]

  it('sorts by your decisions and totals only active confirmed subscriptions', () => {
    const result = groupSubscriptions(found, [
      { key: 'NETFLIX', status: 'confirmed', decidedAt: '' },
      { key: 'OLD APP', status: 'confirmed', decidedAt: '' }, // inactive: not counted
      { key: 'RENT', status: 'dismissed', decidedAt: '' },
    ])
    expect(result.confirmed.map((c) => c.key)).toEqual(['NETFLIX', 'OLD APP'])
    expect(result.dismissed.map((c) => c.key)).toEqual(['RENT'])
    expect(result.toReview).toEqual([])
    expect(result.monthlyTotal).toBe(1549)
    expect(result.annualTotal).toBe(18588)
  })

  it('puts likely subscriptions first in the review list', () => {
    expect(groupSubscriptions(found, []).toReview.map((c) => c.key)).toEqual(['NETFLIX', 'OLD APP', 'RENT'])
  })
})
