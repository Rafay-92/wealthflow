import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import { monthPeriod } from './periods'
import { summarize } from './summary'

const october = monthPeriod('2026-10')

describe('summarize', () => {
  it('computes income, expenses, net and savings rate', () => {
    const result = summarize(
      [
        tx({ amount: 400000, category: 'Income' }), // +$4,000 salary
        tx({ amount: -165000, category: 'Housing' }), // -$1,650 rent
        tx({ amount: -35000, category: 'Groceries' }), // -$350 groceries
      ],
      october,
    )
    expect(result.income).toBe(400000)
    expect(result.expenses).toBe(200000)
    expect(result.net).toBe(200000)
    expect(result.savingsRate).toBe(50)
    expect(result.transactionCount).toBe(3)
  })

  it('ignores transfers between your own accounts', () => {
    const result = summarize(
      [
        tx({ amount: 400000, category: 'Income' }),
        tx({ amount: -50000, category: 'Transfers' }), // out of checking
        tx({ amount: 50000, category: 'Transfers' }), // into savings
      ],
      october,
    )
    expect(result.income).toBe(400000)
    expect(result.expenses).toBe(0)
    expect(result.transactionCount).toBe(1)
  })

  it('treats a refund as reducing spending, not as income', () => {
    const result = summarize(
      [
        tx({ amount: -10000, category: 'Shopping' }),
        tx({ amount: 2500, category: 'Shopping' }), // refund
      ],
      october,
    )
    expect(result.income).toBe(0)
    expect(result.expenses).toBe(7500)
  })

  it('only counts transactions inside the period', () => {
    const result = summarize(
      [
        tx({ date: '2026-09-30', amount: -9999, category: 'Shopping' }),
        tx({ date: '2026-10-01', amount: -1000, category: 'Shopping' }),
        tx({ date: '2026-10-31', amount: -2000, category: 'Shopping' }),
        tx({ date: '2026-11-01', amount: -9999, category: 'Shopping' }),
      ],
      october,
    )
    expect(result.expenses).toBe(3000)
  })

  it('reports a negative net and savings rate when overspending', () => {
    const result = summarize(
      [tx({ amount: 200000, category: 'Income' }), tx({ amount: -250000, category: 'Housing' })],
      october,
    )
    expect(result.net).toBe(-50000)
    expect(result.savingsRate).toBe(-25)
  })

  it('has no savings rate when there was no income', () => {
    expect(summarize([tx({ amount: -1000 })], october).savingsRate).toBeNull()
  })

  it('returns zeros for an empty period', () => {
    const result = summarize([], october)
    expect(result).toEqual({ income: 0, expenses: 0, net: 0, savingsRate: null, transactionCount: 0 })
    expect(Object.is(result.expenses, -0)).toBe(false)
  })
})
