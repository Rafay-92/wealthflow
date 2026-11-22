// The custom-period scenario: 24 fictional transactions from Nov 22 to Dec 22, 2026
// (e2e/data/period-nov22-dec22.csv), run through the real categoriser and the
// same calculations the Dashboard and Reports use.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Account } from '../../types/account'
import type { BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import { reconcileAccount } from '../balances/reconcile'
import { categorizeAll } from '../categorize/categorize'
import { parseAmountToCents } from '../money'
import { buildReport } from '../report/monthlyReport'
import { latestDate } from '../transactions'
import { buildDashboard } from './dashboard'
import { formatRange, resolvePeriod, selectionFromParams } from './reportPeriod'

const account: Account = { id: 'chk', name: 'Test Chequing', type: 'checking' }
const rows = readFileSync(join(process.cwd(), 'e2e', 'data', 'period-nov22-dec22.csv'), 'utf8').trim().split(/\r?\n/).slice(1)
const transactions: Transaction[] = categorizeAll(
  rows.map((line, i) => {
    const [date, description, amount] = line.split(',') as [string, string, string]
    return { id: `r${i}`, date, description, amount: parseAmountToCents(amount)!, category: 'Other', accountId: 'chk' }
  }),
  [],
  [account],
)
const opening: BalancePoint[] = [{ id: 'chk:2026-11-22', accountId: 'chk', date: '2026-11-22', amount: 500000, updatedAt: '' }]
const custom = { kind: 'custom', start: '2026-11-22', end: '2026-12-22' } as const

describe('custom period Nov 22 – Dec 22, 2026', () => {
  const d = buildDashboard(transactions, [account], custom, opening)
  const check = reconcileAccount(transactions, account, d.period, opening)

  it('every row is categorised as expected: no transfers, the refund is not income', () => {
    expect(transactions.filter((t) => t.category === 'Transfers')).toEqual([])
    expect(transactions.find((t) => t.description === 'REFUND AMAZON.CA')?.category).toBe('Shopping')
  })

  it('24 transactions, $4,500 income, $1,639.40 expenses, $2,860.60 net cash flow', () => {
    expect(d.transactionCount).toBe(24)
    expect(d.current).toMatchObject({ income: 450000, expenses: 163940, net: 286060 })
  })

  it('63.57% savings rate', () => {
    expect(d.current.savingsRate!.toFixed(2)).toBe('63.57')
  })

  it('$5,000 opening (user-provided) and $7,860.60 expected closing', () => {
    expect(check).toMatchObject({ opening: 500000, openingSource: 'user', totalAvailable: 950000, expectedClosing: 786060, transactionCount: 24 })
  })

  it('the opening balance is not income', () => {
    expect(buildDashboard(transactions, [account], custom, []).current.income).toBe(450000)
  })

  it('without a typed opening balance, it is Unknown, not assumed', () => {
    expect(reconcileAccount(transactions, account, d.period, [])).toMatchObject({ opening: null, openingSource: null, expectedClosing: null })
  })

  it('is labelled as a custom period, compared with the 31 days before', () => {
    expect(d.period).toMatchObject({ kind: 'custom', days: 31, isPartial: false, label: 'Nov 22 – Dec 22, 2026', previous: { start: '2026-10-22', end: '2026-11-21' } })
  })

  it('the chart splits the period into the parts of each month inside it', () => {
    expect(d.trend.map((m) => [m.month, m.income, m.expenses])).toEqual([
      ['2026-11', 350000, 49866],
      ['2026-12', 100000, 114074],
    ])
  })

  it('the report shows the same numbers', () => {
    const r = buildReport(transactions, custom, latestDate(transactions), [account], opening)
    expect(r).toMatchObject({ kind: 'custom', title: 'Custom period report', transactionCount: 24, summary: { income: 450000, expenses: 163940, net: 286060 } })
    expect(r.balanceChecks[0]).toMatchObject({ opening: 500000, expectedClosing: 786060 })
    expect(r.recurringAvailable).toBe(false)
  })
})

describe('the monthly dashboard is unchanged', () => {
  it('December: 15 transactions, $1,000 income, $1,140.74 expenses, −$140.74 net', () => {
    const dec = buildDashboard(transactions, [account], '2026-12')
    expect(dec.period).toMatchObject({ kind: 'month', month: '2026-12', isPartial: true }) // data stops Dec 22
    expect(dec.transactionCount).toBe(15)
    expect(dec.current).toMatchObject({ income: 100000, expenses: 114074, net: -14074 })
  })
})

describe('period selection', () => {
  it('reads a custom range or a month from the web address', () => {
    expect(selectionFromParams(new URLSearchParams('from=2026-11-22&to=2026-12-22'), ['2026-12'])).toEqual(custom)
    expect(selectionFromParams(new URLSearchParams('month=2026-11'), ['2026-12', '2026-11'])).toEqual({ kind: 'month', month: '2026-11' })
    expect(selectionFromParams(new URLSearchParams(''), ['2026-12', '2026-11'])).toEqual({ kind: 'month', month: '2026-12' })
  })

  it('a range past the end of your data is cut where the data stops, and says so', () => {
    const p = resolvePeriod({ kind: 'custom', start: '2026-11-22', end: '2026-12-31' }, '2026-12-22')
    expect(p).toMatchObject({ isPartial: true, current: { end: '2026-12-22' }, requested: { end: '2026-12-31' } })
  })

  it('a reversed range is put the right way round', () => {
    expect(resolvePeriod({ kind: 'custom', start: '2026-12-22', end: '2026-11-22' }, null).current).toEqual({ start: '2026-11-22', end: '2026-12-22' })
  })

  it('formats ranges, repeating the year only when it changes', () => {
    expect(formatRange({ start: '2025-12-15', end: '2026-01-10' })).toBe('Dec 15, 2025 – Jan 10, 2026')
  })
})
