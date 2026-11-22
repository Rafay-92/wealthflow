import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import type { Account } from '../../types/account'
import { accountBalances, sumBalances, totalBalance } from './balance'
import { buildDashboard } from './dashboard'
import { monthlyTotals } from './trends'

describe('monthlyTotals', () => {
  it('returns one row per month, including empty months', () => {
    const result = monthlyTotals(
      [
        tx({ date: '2026-09-10', amount: 300000, category: 'Income' }),
        tx({ date: '2026-09-12', amount: -100000, category: 'Housing' }),
      ],
      ['2026-08', '2026-09'],
    )
    expect(result).toEqual([
      { month: '2026-08', income: 0, expenses: 0, net: 0 },
      { month: '2026-09', income: 300000, expenses: 100000, net: 200000 },
    ])
  })
})

describe('totalBalance', () => {
  const checking: Account = { id: 'a', name: 'Checking', type: 'checking', balance: 150000, balanceAsOf: '2026-11-20' }
  const savings: Account = { id: 'b', name: 'Savings', type: 'savings', balance: 500000, balanceAsOf: '2026-11-18' }

  it('adds reported balances and uses the oldest as-of date', () => {
    expect(totalBalance([checking, savings])).toEqual({ total: 650000, accountCount: 2, asOf: '2026-11-18' })
  })

  it('skips accounts without a balance', () => {
    const noBalance: Account = { id: 'c', name: 'Card', type: 'credit' }
    expect(totalBalance([checking, noBalance])?.accountCount).toBe(1)
  })

  it('returns null rather than $0 when no balance was provided', () => {
    expect(totalBalance([{ id: 'c', name: 'Card', type: 'credit' }])).toBeNull()
    expect(totalBalance([])).toBeNull()
  })
})

describe('buildDashboard', () => {
  const transactions = [
    tx({ id: 'oct-pay', date: '2026-10-01', amount: 400000, category: 'Income' }),
    tx({ id: 'oct-food', date: '2026-10-10', amount: -20000, category: 'Restaurants' }),
    tx({ id: 'oct-late', date: '2026-10-25', amount: -90000, category: 'Shopping' }),
    tx({ id: 'nov-pay', date: '2026-11-01', amount: 400000, category: 'Income' }),
    tx({ id: 'nov-food', date: '2026-11-12', amount: -30000, category: 'Restaurants' }),
    tx({ id: 'nov-last', date: '2026-11-20', amount: -5000, category: 'Groceries' }),
  ]

  it('compares a partial month against the same days of last month', () => {
    const data = buildDashboard(transactions, [], '2026-11')
    expect(data.comparison.isPartial).toBe(true)
    expect(data.current.expenses).toBe(35000)
    // Oct 1–20 only: the $900 purchase on Oct 25 is excluded.
    expect(data.previous?.expenses).toBe(20000)
  })

  it('lists recent transactions from the selected period, newest first', () => {
    const data = buildDashboard(transactions, [], '2026-11')
    expect(data.recent.map((t) => t.id)).toEqual(['nov-last', 'nov-food', 'nov-pay'])
  })

  it('has no previous summary when the previous month has no data', () => {
    expect(buildDashboard(transactions, [], '2026-10').previous).toBeNull()
  })

  it('starts the trend at the first month with data', () => {
    const data = buildDashboard(transactions, [], '2026-11')
    expect(data.trend.map((m) => m.month)).toEqual(['2026-10', '2026-11'])
  })

  it('shows at most six months', () => {
    const longHistory = [...transactions, tx({ date: '2025-01-15', amount: 100, category: 'Income' })]
    const data = buildDashboard(longHistory, [], '2026-11')
    expect(data.trend.map((m) => m.month)).toEqual([
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ])
  })
})

describe('accountBalances (live)', () => {
  const chk: Account = { id: 'chk', name: 'Chequing', type: 'checking', balance: 150000, balanceAsOf: '2026-10-31' }

  it('adds transactions dated after the bank’s balance, and only those', () => {
    const list = [
      tx({ accountId: 'chk', date: '2026-10-31', amount: -2000 }), // already inside the bank's figure
      tx({ accountId: 'chk', date: '2026-11-02', amount: -4550 }), // added by hand afterwards
      tx({ accountId: 'chk', date: '2026-11-03', amount: 10000 }),
      tx({ accountId: 'sav', date: '2026-11-03', amount: -99999 }), // another account
    ]
    const [b] = accountBalances([chk], list)
    expect(b).toMatchObject({ balance: 150000 - 4550 + 10000, basis: 'bank', sinceCount: 2, asOf: '2026-11-03' })
  })

  it('moves immediately when a transaction is edited or deleted', () => {
    const t = tx({ accountId: 'chk', date: '2026-11-02', amount: -4550 })
    expect(accountBalances([chk], [t])[0]!.balance).toBe(145450)
    expect(accountBalances([chk], [{ ...t, amount: -5000 }])[0]!.balance).toBe(145000)
    expect(accountBalances([chk], [])[0]!.balance).toBe(150000)
  })

  it('uses an opening balance you entered when it is more recent than the bank’s', () => {
    const balances = [{ id: 'chk:2026-11-01', accountId: 'chk', date: '2026-11-01', amount: 200000, updatedAt: '' }]
    const [b] = accountBalances([chk], [tx({ accountId: 'chk', date: '2026-11-01', amount: -1000 })], balances)
    expect(b).toMatchObject({ balance: 199000, basis: 'user' })
  })

  it('leaves out accounts with no known balance instead of guessing', () => {
    expect(accountBalances([{ id: 'x', name: 'Card', type: 'credit' }], [tx({ accountId: 'x' })])).toEqual([])
    expect(sumBalances([])).toBeNull()
  })

  it('the opening balance is never counted as income', () => {
    const balances = [{ id: 'chk:2026-11-01', accountId: 'chk', date: '2026-11-01', amount: 200000, updatedAt: '' }]
    const list = [tx({ accountId: 'chk', date: '2026-11-05', amount: -1000, category: 'Shopping' })]
    const d = buildDashboard(list, [chk], '2026-11', balances)
    expect(d.current.income).toBe(0)
    expect(d.balance?.total).toBe(199000)
  })
})
