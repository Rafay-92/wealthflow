import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import { spendingByCategory } from './byCategory'
import { monthPeriod } from './periods'

const october = monthPeriod('2026-10')

describe('spendingByCategory', () => {
  it('totals each category, largest first, with shares', () => {
    const result = spendingByCategory(
      [
        tx({ amount: -6000, category: 'Groceries' }),
        tx({ amount: -2000, category: 'Groceries' }),
        tx({ amount: -2000, category: 'Restaurants' }),
      ],
      october,
    )
    expect(result).toEqual([
      { category: 'Groceries', amount: 8000, share: 0.8 },
      { category: 'Restaurants', amount: 2000, share: 0.2 },
    ])
  })

  it('excludes income and transfers', () => {
    const result = spendingByCategory(
      [
        tx({ amount: 500000, category: 'Income' }),
        tx({ amount: -50000, category: 'Transfers' }),
        tx({ amount: -1000, category: 'Shopping' }),
      ],
      october,
    )
    expect(result.map((r) => r.category)).toEqual(['Shopping'])
  })

  it('nets refunds and drops categories with no net spending', () => {
    const result = spendingByCategory(
      [
        tx({ amount: -5000, category: 'Shopping' }),
        tx({ amount: 1000, category: 'Shopping' }), // partial refund
        tx({ amount: -2000, category: 'Entertainment' }),
        tx({ amount: 2000, category: 'Entertainment' }), // full refund
      ],
      october,
    )
    expect(result).toEqual([{ category: 'Shopping', amount: 4000, share: 1 }])
  })

  it('returns an empty list when nothing was spent', () => {
    expect(spendingByCategory([], october)).toEqual([])
  })
})
