import { describe, expect, it } from 'vitest'
import { SAMPLE_TRANSACTIONS } from '../../data/sampleData'
import { tx } from '../../test/factories'
import type { Category } from '../../types/transaction'
import { detectRecurring } from './detectRecurring'

/** One charge per month, from August onwards. */
const monthly = (description: string, amounts: number[], category: Category = 'Subscriptions') =>
  amounts.map((amount, i) => tx({ description, amount: -amount, category, date: `2026-${String(8 + i).padStart(2, '0')}-05` }))

describe('detectRecurring', () => {
  it('finds a charge made once a month at a steady amount', () => {
    const result = detectRecurring(monthly('NETFLIX.COM', [1549, 1549, 1549, 1549]), '2026-11')
    expect(result).toEqual([
      { key: 'NETFLIX', name: 'NETFLIX.COM', category: 'Subscriptions', amount: 1549, date: '2026-11-05', monthsSeen: 4 },
    ])
  })

  it('needs at least two earlier months', () => {
    expect(detectRecurring(monthly('NEW SERVICE', [999, 999]).map((t, i) => ({ ...t, date: `2026-${10 + i}-05` })), '2026-11')).toEqual([])
  })

  it('allows a bill that varies a little, but not a lot', () => {
    expect(detectRecurring(monthly('CITY POWER', [9000, 11000, 10500, 9600], 'Utilities'), '2026-11')).toHaveLength(1)
    expect(detectRecurring(monthly('ODD SHOP', [2000, 2000, 2000, 9000], 'Shopping'), '2026-11')).toEqual([])
  })

  it('ignores shops visited several times a month', () => {
    const visits = ['2026-09-03', '2026-09-17', '2026-10-02', '2026-10-20', '2026-11-04', '2026-11-18']
    const groceries = visits.map((date) => tx({ date, description: 'WHOLE FOODS', amount: -6000, category: 'Groceries' }))
    expect(detectRecurring(groceries, '2026-11')).toEqual([])
  })

  it('only lists payments actually charged in the month asked about', () => {
    expect(detectRecurring(monthly('NETFLIX.COM', [1549, 1549, 1549]), '2026-11')).toEqual([])
  })

  it('ignores transfers and income', () => {
    const transfers = monthly('TRANSFER TO SAVINGS', [50000, 50000, 50000, 50000], 'Transfers')
    expect(detectRecurring(transfers, '2026-11')).toEqual([])
  })

  it('finds the bills and subscriptions in the sample data', () => {
    const names = detectRecurring(SAMPLE_TRANSACTIONS, '2026-10').map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining(['MAPLE COURT APARTMENTS RENT', 'NETFLIX.COM', 'SPOTIFY', 'GOODLIFE FITNESS', 'ROGERS INTERNET', 'FIDO MOBILE']),
    )
    expect(names).not.toContain('LOBLAWS')
    expect(names).not.toContain('STARBUCKS')
  })
})
