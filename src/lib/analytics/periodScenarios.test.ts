// The date-range and reconciliation scenarios A–L, plus comparisons and presets.
// Everything runs through the same functions the Dashboard, Analytics and Reports use.
import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import type { Account } from '../../types/account'
import type { BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import { statementCheckpoints } from '../balances/checkpoints'
import { reconcileAccount } from '../balances/reconcile'
import { shiftMonths } from '../dates'
import { formatPercent } from '../money'
import { buildReport } from '../report/monthlyReport'
import { moneyChange, pointsChange } from './change'
import { buildDashboard } from './dashboard'
import { matchingPreset, presetAnchor, presetRange, presetSelection, resolvePeriod } from './reportPeriod'

const chk: Account = { id: 'chk', name: 'Chequing', type: 'checking' }
const sav: Account = { id: 'sav', name: 'Savings', type: 'savings' }
const point = (accountId: string, date: string, amount: number): BalancePoint => ({ id: `${accountId}:${date}`, accountId, date, amount, updatedAt: '' })
const custom = (start: string, end: string) => ({ kind: 'custom' as const, start, end })

// The verified statement: Dec 23, 2026 – Jan 22, 2027.
const statement: Transaction[] = [
  tx({ accountId: 'chk', date: '2026-12-23', amount: -4520, category: 'Groceries' }),
  tx({ accountId: 'chk', date: '2026-12-24', amount: 320000, category: 'Income' }),
  tx({ accountId: 'chk', date: '2026-12-27', amount: -16844, category: 'Shopping' }),
  tx({ accountId: 'chk', date: '2026-12-31', amount: -12000, category: 'Restaurants' }), // Dec: 3,200.00 in, 333.64 out
  tx({ accountId: 'chk', date: '2027-01-01', amount: -65000, category: 'Housing' }),
  tx({ accountId: 'chk', date: '2027-01-09', amount: 60000, category: 'Income' }),
  tx({ accountId: 'chk', date: '2027-01-15', amount: -51513, category: 'Utilities' }),
  tx({ accountId: 'chk', date: '2027-01-22', amount: -25000, category: 'Shopping' }), // Jan: 600.00 in, 1,415.13 out
]
const opening = [point('chk', '2026-12-23', 786060)]

describe('TEST A — same-month period (Jan 1 – Jan 31)', () => {
  const d = buildDashboard(statement, [chk], custom('2027-01-01', '2027-01-31'), opening)
  it('covers 31 days, includes Jan 1 and Jan 22, and excludes December', () => {
    expect(d.period).toMatchObject({ days: 22, current: { start: '2027-01-01', end: '2027-01-22' }, isPartial: true }) // data stops Jan 22
    expect(resolvePeriod(custom('2027-01-01', '2027-01-31'), null).days).toBe(31)
    expect(d.current).toMatchObject({ income: 60000, expenses: 141513, net: -81513 })
    expect(d.transactionCount).toBe(4)
  })
})

describe('TEST B — cross-month period (Jan 23 – Feb 22)', () => {
  const p = resolvePeriod(custom('2027-01-23', '2027-02-22'), null)
  it('is 31 days, and the previous equivalent period is Dec 23 – Jan 22 (also 31 days)', () => {
    expect(p.days).toBe(31)
    expect(p.previous).toEqual({ start: '2026-12-23', end: '2027-01-22' })
  })
  it('compares with the statement period: all of it falls in the previous period', () => {
    const d = buildDashboard(statement, [chk], custom('2027-01-23', '2027-02-22'))
    expect(d.current.transactionCount).toBe(0)
    expect(d.previous).toMatchObject({ income: 380000, expenses: 174877 })
  })
})

describe('TEST C — cross-year period (Dec 23 – Jan 22): the verified figures', () => {
  const d = buildDashboard(statement, [chk], custom('2026-12-23', '2027-01-22'), opening)
  const r = reconcileAccount(statement, chk, d.period, opening)
  it('labels the range with both years', () => {
    expect(d.period.label).toBe('Dec 23, 2026 – Jan 22, 2027')
  })
  it('splits into December ($3,200.00 / $333.64) and January ($600.00 / $1,415.13)', () => {
    expect(d.trend.map((m) => [m.month, m.income, m.expenses])).toEqual([
      ['2026-12', 320000, 33364],
      ['2027-01', 60000, 141513],
    ])
  })
  it('opening $7,860.60 + income − expenses = $9,911.83 expected closing', () => {
    expect(r).toMatchObject({ opening: 786060, openingSource: 'user', income: 380000, expenses: 174877, expectedClosing: 991183 })
  })
  it('the January calendar month still gives the January figures', () => {
    expect(buildDashboard(statement, [chk], '2027-01').current).toMatchObject({ income: 60000, expenses: 141513 })
  })
})

describe('TEST D — leap year (Feb 1 – Feb 29, 2028)', () => {
  const leap = [
    tx({ date: '2028-02-01', amount: -2900, category: 'Groceries' }),
    tx({ date: '2028-02-29', amount: -2900, category: 'Groceries' }),
    tx({ date: '2028-03-01', amount: -99900, category: 'Groceries' }),
  ]
  it('has 29 days and includes Feb 29', () => {
    const d = buildDashboard(leap, [], custom('2028-02-01', '2028-02-29'))
    expect(d.period.days).toBe(29)
    expect(d.current.expenses).toBe(5800)
    expect(d.averageDailySpending).toBe(200) // $58.00 / 29 days
    expect(buildDashboard(leap, [], '2028-02').period.requested).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })
  it('shifts months and years safely around Feb 29', () => {
    expect(shiftMonths('2028-03-31', -1)).toBe('2028-02-29')
    expect(resolvePeriod(custom('2028-02-29', '2028-02-29'), null, 'previous-year').previous).toEqual({ start: '2027-02-28', end: '2027-02-28' })
  })
})

describe('TEST E — inclusive date boundaries', () => {
  it('includes the start and end dates, excludes the days around them', () => {
    const list = [
      tx({ date: '2027-01-09', amount: -100, category: 'Other' }),
      tx({ date: '2027-01-10', amount: -200, category: 'Other' }),
      tx({ date: '2027-01-20', amount: -400, category: 'Other' }),
      tx({ date: '2027-01-21', amount: -800, category: 'Other' }),
    ]
    expect(buildDashboard(list, [], custom('2027-01-10', '2027-01-20')).current.expenses).toBe(600)
    expect(buildDashboard(list, [], custom('2027-01-10', '2027-01-10')).current.expenses).toBe(200) // a one-day range
  })
})

describe('TEST F — opening balances come from earlier history', () => {
  it('carries a balance you typed for an earlier date through the transactions in between (Estimated)', () => {
    const r = reconcileAccount(statement, chk, resolvePeriod(custom('2027-01-01', '2027-01-22'), null), opening)
    // $7,860.60 + Dec's +$2,866.36 = $10,726.96 at the start of Jan 1
    expect(r).toMatchObject({ opening: 1072696, openingSource: 'estimated', expectedClosing: 991183, verified: false })
  })
})

describe('TEST G — running balances are checkpoints, never income or expenses', () => {
  // The statement's rows with the bank's running balance after each one.
  let running = 786060
  const drafts = statement.map((t, i) => ({ rowNumber: i + 2, date: t.date, description: t.description, amount: t.amount, balance: (running += t.amount) }))
  const checkpoints = statementCheckpoints(drafts, 'chk', 'imp1')
  const period = resolvePeriod(custom('2026-12-23', '2027-01-22'), null)

  it('reads the opening and each day’s closing from the running balance', () => {
    expect(checkpoints[0]).toMatchObject({ date: '2026-12-23', amount: 786060 })
    expect(checkpoints.at(-1)).toMatchObject({ date: '2027-01-23', amount: 991183 })
  })
  it('does not change income or expenses', () => {
    const d = buildDashboard(statement, [chk], custom('2026-12-23', '2027-01-22'), [], { checkpoints })
    expect(d.current).toMatchObject({ income: 380000, expenses: 174877 })
  })
  it('gives a Bank-reported opening and closing that reconcile, checking every day', () => {
    const r = reconcileAccount(statement, chk, period, [], checkpoints)
    expect(r).toMatchObject({ opening: 786060, openingSource: 'reported', actualClosing: 991183, closingSource: 'reported', difference: 0, verified: true, mismatches: [] })
    expect(r.checkpointsChecked).toBe(8)
  })
  it('flags the exact day when a transaction is missing', () => {
    const missing = statement.filter((t) => t.date !== '2027-01-09')
    const r = reconcileAccount(missing, chk, period, [], checkpoints)
    expect(r.difference).toBe(60000) // the bank has $600 more
    expect(r.mismatches[0]).toMatchObject({ date: '2027-01-09', reported: expect.any(Number) })
  })
  it('never overwrites a balance you typed: yours wins', () => {
    const r = reconcileAccount(statement, chk, period, [point('chk', '2026-12-23', 700000)], checkpoints)
    expect(r).toMatchObject({ opening: 700000, openingSource: 'user', difference: 86060 })
  })
  it('handles newest-first files and same-day rows in any order', () => {
    const reversed = statementCheckpoints([...drafts].reverse(), 'chk', 'imp1')
    expect(reversed.map((c) => [c.date, c.amount])).toEqual(checkpoints.map((c) => [c.date, c.amount]))
  })
})

describe('TEST H — multiple accounts', () => {
  const list = [...statement, tx({ accountId: 'sav', date: '2027-01-05', amount: 10000, category: 'Income' })]
  const points = [...opening, point('sav', '2026-12-23', 500000)]
  it('keeps each account’s balance separate and adds them up for the total', () => {
    const d = buildDashboard(list, [chk, sav], custom('2026-12-23', '2027-01-22'), points)
    const byId = Object.fromEntries(d.accountBalances.map((b) => [b.accountId, b.balance]))
    expect(byId).toEqual({ chk: 991183, sav: 510000 })
    expect(d.balance?.total).toBe(991183 + 510000)
  })
  it('filters everything to one account', () => {
    const d = buildDashboard(list, [chk, sav], custom('2026-12-23', '2027-01-22'), points, { accountId: 'sav' })
    expect(d.current).toMatchObject({ income: 10000, expenses: 0 })
    expect(d.balance?.total).toBe(510000)
    expect(d.transactionCount).toBe(1)
  })
})

describe('TEST I — transfers', () => {
  const list = [
    tx({ accountId: 'chk', date: '2027-01-05', amount: -50000, category: 'Transfers' }),
    tx({ accountId: 'sav', date: '2027-01-05', amount: 50000, category: 'Transfers' }),
  ]
  const points = [point('chk', '2027-01-01', 100000), point('sav', '2027-01-01', 0)]
  it('are not income or expenses, move both balances, and leave the total unchanged', () => {
    const d = buildDashboard(list, [chk, sav], custom('2027-01-01', '2027-01-31'), points)
    expect(d.current).toMatchObject({ income: 0, expenses: 0, net: 0 })
    expect(d.transferCount).toBe(2)
    expect(Object.fromEntries(d.accountBalances.map((b) => [b.accountId, b.balance]))).toEqual({ chk: 50000, sav: 50000 })
    expect(d.balance?.total).toBe(100000)
    expect(reconcileAccount(list, chk, d.period, points)).toMatchObject({ transfersOut: 50000, expectedClosing: 50000 })
  })
})

describe('TEST J — empty ranges', () => {
  it('shows zeros and dashes, never NaN, and no balance history it can’t support', () => {
    const d = buildDashboard(statement, [chk], custom('2030-01-01', '2030-01-31'))
    expect(d.transactionCount).toBe(0)
    expect(d.current).toMatchObject({ income: 0, expenses: 0, net: 0, savingsRate: null })
    expect(d.averageDailySpending).toBe(0)
    expect(d.largestExpense).toBeNull()
    expect(d.categories).toEqual([])
    expect(d.cashFlow.rows.every((r) => r.income === 0 && r.expenses === 0)).toBe(true)
    expect(JSON.stringify(d)).not.toMatch(/NaN|Infinity/)
    expect(buildDashboard([], [chk], custom('2027-01-01', '2027-01-31')).balanceHistory).toEqual([]) // no known balance: no line
  })
})

describe('TEST K — zero income', () => {
  it('has no savings rate (shown as —), never NaN or Infinity', () => {
    const d = buildDashboard([tx({ date: '2027-01-05', amount: -5000, category: 'Shopping' })], [], custom('2027-01-01', '2027-01-31'))
    expect(d.current.savingsRate).toBeNull()
    expect(formatPercent(d.current.savingsRate)).toBe('—')
  })
  it('shows a negative savings rate correctly', () => {
    const d = buildDashboard([tx({ date: '2027-01-05', amount: 10000, category: 'Income' }), tx({ date: '2027-01-06', amount: -30000, category: 'Shopping' })], [], custom('2027-01-01', '2027-01-31'))
    expect(d.current).toMatchObject({ net: -20000, savingsRate: -200 })
    expect(formatPercent(d.current.savingsRate, 2)).toBe('-200.00%')
  })
  it('compares money in percent and rates in percentage points, safely from zero', () => {
    expect(moneyChange(150, 100, true).amount).toBe(50)
    expect(moneyChange(100, 0, true)).toMatchObject({ amount: null, direction: 'up' }) // no % from zero
    expect(pointsChange(25, 20, true)?.amount).toBe(5) // +5 pts, not +25%
    expect(pointsChange(25, null, true)).toBeNull() // no previous rate: no change shown
  })
})

describe('TEST L — historical periods don’t change the current balance', () => {
  it('the current balance is the same whichever period is selected', () => {
    const totals = ['2026-12', '2027-01', custom('2026-12-23', '2026-12-31'), custom('2020-01-01', '2020-01-31')].map(
      (s) => buildDashboard(statement, [chk], s as never, opening).balance?.total,
    )
    expect(new Set(totals)).toEqual(new Set([991183]))
  })
  it('while the historical period’s own closing is shown separately', () => {
    const dec = buildDashboard(statement, [chk], custom('2026-12-23', '2026-12-31'), opening)
    expect(reconcileAccount(statement, chk, dec.period, opening).expectedClosing).toBe(786060 + 320000 - 33364)
    expect(dec.balance?.total).toBe(991183)
  })
})

describe('comparison modes', () => {
  const sel = custom('2027-01-23', '2027-02-22')
  it.each([
    ['previous-period', { start: '2026-12-23', end: '2027-01-22' }],
    ['previous-month', { start: '2026-12-23', end: '2027-01-22' }],
    ['previous-year', { start: '2026-01-23', end: '2026-02-22' }],
    ['none', null],
  ] as const)('%s', (mode, expected) => {
    expect(resolvePeriod(sel, null, mode).previous).toEqual(expected)
  })
  it('the report says what it compares with, and has no comparison when asked', () => {
    const r = buildReport(statement, custom('2027-01-01', '2027-01-22'), '2027-01-22', [chk], [], { comparison: 'none' })
    expect(r).toMatchObject({ previous: null, categoryChanges: [], comparisonName: 'No comparison', dateRange: 'Jan 1 – Jan 22, 2027', days: 22 })
  })
})

describe('presets', () => {
  it('count back from today, or from your latest transaction when your data runs past today', () => {
    expect(presetAnchor('2026-11-22', '2026-11-15')).toBe('2026-11-22')
    expect(presetAnchor('2026-11-22', '2027-01-22')).toBe('2027-01-22')
  })
  it.each([
    ['today', '2027-01-22', '2027-01-22'],
    ['last-7', '2027-01-16', '2027-01-22'],
    ['last-30', '2026-12-24', '2027-01-22'],
    ['last-90', '2026-10-25', '2027-01-22'],
    ['this-month', '2027-01-01', '2027-01-31'],
    ['last-month', '2026-12-01', '2026-12-31'],
    ['month-to-date', '2027-01-01', '2027-01-22'],
    ['year-to-date', '2027-01-01', '2027-01-22'],
  ] as const)('%s', (id, start, end) => {
    expect(presetRange(id, '2027-01-22')).toEqual({ start, end })
  })
  it('a whole month you have data for becomes a calendar month, and is recognised', () => {
    expect(presetSelection('last-month', '2027-01-22', ['2027-01', '2026-12'])).toEqual({ kind: 'month', month: '2026-12' })
    expect(matchingPreset({ kind: 'custom', start: '2026-12-24', end: '2027-01-22' }, '2027-01-22', [])).toBe('last-30')
  })
})
