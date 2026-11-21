import { describe, expect, it } from 'vitest'
import { SAMPLE_TRANSACTIONS } from '../../data/sampleData'
import { tx } from '../../test/factories'
import { buildMonthlyReport } from './monthlyReport'

const data = [
  tx({ date: '2026-09-01', amount: 400000, category: 'Income' }),
  tx({ date: '2026-09-05', amount: -10000, category: 'Restaurants' }),
  tx({ date: '2026-09-06', amount: -30000, category: 'Groceries' }),
  tx({ date: '2026-10-01', amount: 400000, category: 'Income' }),
  tx({ date: '2026-10-05', amount: -18000, category: 'Restaurants' }), // +80%, +$80
  tx({ date: '2026-10-06', amount: -20000, category: 'Groceries' }), // -33%, -$100
  tx({ date: '2026-10-07', amount: -150000, category: 'Housing', description: 'RENT' }),
  tx({ date: '2026-10-08', amount: -50000, category: 'Transfers' }),
]

describe('buildMonthlyReport', () => {
  const report = buildMonthlyReport(data, '2026-10', '2026-10-31')

  it('summarises the month against the previous one', () => {
    expect(report.periodLabel).toBe('October 2026')
    expect(report.previousLabel).toBe('September 2026')
    expect(report.summary).toMatchObject({ income: 400000, expenses: 188000, net: 212000 })
    expect(report.previous).toMatchObject({ expenses: 40000 })
  })

  it('lists the biggest expenses, excluding transfers', () => {
    expect(report.biggestExpenses.map((t) => t.amount)).toEqual([-150000, -20000, -18000])
  })

  it('includes up to three months of history, never before the data starts', () => {
    expect(report.history.map((h) => h.month)).toEqual(['2026-09', '2026-10'])
  })

  it('writes observations only from the numbers', () => {
    expect(report.observations).toEqual([
      { tone: 'good', text: 'You saved $2,120.00, 53.0% of your income.' },
      { tone: 'bad', text: 'Total spending was 370% higher than September 2026 ($1,880.00 vs $400.00).' },
      { tone: 'neutral', text: 'Housing was your largest expense: $1,500.00, 80% of spending.' },
      { tone: 'bad', text: 'Restaurants spending rose 80% (+$80.00) compared with September 2026.' },
      { tone: 'good', text: 'Groceries spending fell 33% (-$100.00) compared with September 2026.' },
      { tone: 'neutral', text: 'Your largest single payment was RENT ($1,500.00) on Oct 7.' },
    ])
  })

  it('does not mention small category changes', () => {
    const small = [
      tx({ date: '2026-09-05', amount: -10000, category: 'Restaurants' }),
      tx({ date: '2026-10-05', amount: -11000, category: 'Restaurants' }), // +10%: below the threshold
    ]
    const r = buildMonthlyReport(small, '2026-10', '2026-10-31')
    expect(r.observations.some((o) => o.text.includes('rose'))).toBe(false)
  })

  it('says "no spending" rather than "fell 100%"', () => {
    const stopped = [
      tx({ date: '2026-09-05', amount: -45000, category: 'Education' }),
      tx({ date: '2026-10-05', amount: -1000, category: 'Groceries' }),
    ]
    const r = buildMonthlyReport(stopped, '2026-10', '2026-10-31')
    expect(r.observations).toContainEqual({ tone: 'good', text: 'No spending in the Education category, down from $450.00 in September 2026.' })
  })

  it('reports overspending honestly', () => {
    const over = [tx({ date: '2026-10-01', amount: 100000, category: 'Income' }), tx({ date: '2026-10-02', amount: -150000, category: 'Housing' })]
    expect(buildMonthlyReport(over, '2026-10', '2026-10-31').observations[0]).toEqual({
      tone: 'bad',
      text: 'You spent $500.00 more than you earned.',
    })
  })

  it('labels a partial month by its dates and compares the same days', () => {
    const r = buildMonthlyReport(SAMPLE_TRANSACTIONS, '2026-11', '2026-11-20')
    expect(r.periodLabel).toBe('Nov 1–20')
    expect(r.previousLabel).toBe('Oct 1–20')
    expect(r.recurring.length).toBeGreaterThan(3)
  })
})
