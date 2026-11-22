import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import type { Budget } from '../../types/budget'
import { budgetSummary } from './budgets'

const budget = (category: Budget['category'], amount: number): Budget => ({ category, amount, updatedAt: '' })

describe('budgetSummary', () => {
  const data = [
    tx({ date: '2026-10-02', amount: -30000, category: 'Groceries' }),
    tx({ date: '2026-10-09', amount: -25000, category: 'Groceries' }),
    tx({ date: '2026-10-10', amount: 5000, category: 'Groceries' }), // refund
    tx({ date: '2026-10-12', amount: -9000, category: 'Restaurants' }),
    tx({ date: '2026-10-15', amount: -20000, category: 'Shopping' }), // no budget
    tx({ date: '2026-10-20', amount: -100000, category: 'Transfers' }), // never spending
    tx({ date: '2026-10-25', amount: 300000, category: 'Income' }),
    tx({ date: '2026-09-30', amount: -99999, category: 'Groceries' }), // another month
  ]

  it('shows budget, spent (refunds subtracted), remaining and percentage used', () => {
    const s = budgetSummary(data, [budget('Groceries', 60000), budget('Restaurants', 10000)], '2026-10', '2026-10-31')
    expect(s.lines[0]).toEqual({ category: 'Restaurants', budget: 10000, spent: 9000, remaining: 1000, percentUsed: 90, status: 'near' })
    expect(s.lines[1]).toEqual({ category: 'Groceries', budget: 60000, spent: 50000, remaining: 10000, percentUsed: (50000 / 60000) * 100, status: 'near' })
    expect(s).toMatchObject({ totalBudget: 70000, totalSpent: 59000, totalRemaining: 11000, unbudgetedSpent: 20000, isPartial: false, monthElapsed: 1 })
  })

  it('lists spending without a budget separately; transfers and income are never in it', () => {
    const s = budgetSummary(data, [budget('Groceries', 60000)], '2026-10', '2026-10-31')
    expect(s.lines.map((l) => l.category)).toEqual(['Groceries', 'Shopping', 'Restaurants'])
    expect(s.lines.some((l) => l.category === 'Transfers' || l.category === 'Income')).toBe(false)
  })

  it('goes over budget, with a negative remaining amount', () => {
    const s = budgetSummary(data, [budget('Groceries', 40000)], '2026-10', '2026-10-31')
    expect(s.lines[0]).toMatchObject({ remaining: -10000, status: 'over', percentUsed: 125 })
  })

  it('updates when a transaction is added, edited or deleted', () => {
    const budgets = [budget('Restaurants', 10000)]
    const spent = (list: typeof data) => budgetSummary(list, budgets, '2026-10', '2026-10-31').lines[0]!.spent
    const extra = tx({ date: '2026-10-28', amount: -2000, category: 'Restaurants' })
    expect(spent(data)).toBe(9000)
    expect(spent([...data, extra])).toBe(11000) // added
    expect(spent([...data, { ...extra, amount: -500 }])).toBe(9500) // edited
    expect(spent(data.filter((t) => t.category !== 'Restaurants'))).toBe(0) // deleted
  })

  it('a refund larger than the purchases counts as zero spent, not negative', () => {
    const s = budgetSummary([tx({ date: '2026-10-05', amount: 4000, category: 'Shopping' })], [budget('Shopping', 10000)], '2026-10', '2026-10-31')
    expect(s.lines[0]).toMatchObject({ spent: 0, remaining: 10000, status: 'ok' })
  })

  it('knows how much of an unfinished month has gone', () => {
    const s = budgetSummary(data, [], '2026-10', '2026-10-15')
    expect(s.isPartial).toBe(true)
    expect(s.monthElapsed).toBeCloseTo(15 / 31)
  })
})
